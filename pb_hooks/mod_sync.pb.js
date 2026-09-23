// MOD 注册表同步（服务端执行，只读）。
//
// 干什么：把审核后台跟维护者的 EVEjs-mods 索引仓库打通 —— 服务端出站拉取
//   sources.json          收录来源清单（owner/repo）
//   docs/mod-index.json   已签名发布的模组索引（含每个模组的 delisted 标记与审核结果 map）
// 前端拿到后直接把真实 MOD 显示在队列里，不再依赖示例数据。
//
// 为什么放服务端：
//   1) 预览环境的前端不能直连第三方域名；
//   2) 出口 IP 固定，便于控速与缓存；
//   3) 主源与回退源的取舍逻辑集中在一处。
//
// 为什么用 contents API 而不是 raw.githubusercontent.com：后者在本网络下时通时不通
// （实测多次直接连不上），而 contents API 带 Accept: application/vnd.github.raw 可直接拿到
// 原始文件内容，不需要解 base64。未认证限流 60 次/小时，所以前端要控制刷新频率。
//
// 只读：本路由绝不写仓库。审核结果由前端导出成文件，维护者在本机签名重建索引后提交 ——
// 索引签名私钥必须留在维护者本机，不能进这里。
//
// 注意：Goja 顶层不能定义 helper 函数（会让整个文件加载失败），逻辑一律写在回调内部。

routerAdd("GET", "/api/mod-sync/state", function (e) {
  try {
    var OWNER = "diguo520"
    var REPO = "EVEjs-mods"
    var BRANCH = "main"
    // 限流对策：本版本的服务端没有 cache 能力（实测报 "Object has no member 'cache'"），
    // 所以这里不做缓存，改由前端控制刷新频率（同一标签页 2 分钟内不重复拉）。
    // 万一还是撞上 60 次/小时的接口额度，下面会自动回退到 jsDelivr 镜像源。

    var FILES = ["sources.json", "docs/mod-index.json"]
    var API_BASE = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/"
    var CDN_BASE = "https://cdn.jsdelivr.net/gh/" + OWNER + "/" + REPO + "@" + BRANCH + "/"
    // 只读令牌：明文只存在本机密钥文件里，绝不写进代码、也不进前端。
    // 带上它，GitHub 的接口额度从每小时 60 次提到 5000 次，体检与巡检就不用抠着排期。
    // 没配 / 读不到就退回匿名请求 —— 功能照常，只是额度低、更容易撞限流。
    var ghToken = ""
    // 自建 PocketBase 用环境变量 GITHUB_TOKEN; VibeX 沙箱没有这个变量, 回落到下面的密钥文件。
    try {
      if (typeof $os.getenv === "function") ghToken = String($os.getenv("GITHUB_TOKEN") || "")
    } catch (_) {
      ghToken = ""
    }
    if (!ghToken) try {
      // $os.readFile 返回的是 UTF-8 字节数组（和 $http.send 的 body 一样），
      // 必须过一遍 Buffer 才是文本；直接 String() 会得到字节值串，JSON.parse 必然失败。
      var keysRaw = $os.readFile("/workspace/app/project/vibex-capability-keys.json")
      var keysText = require("buffer").Buffer.from(keysRaw).toString("utf8")
      var keysObj = JSON.parse(keysText)
      var tokenEntry = keysObj && keysObj.keys ? keysObj.keys["github-token"] : null
      if (tokenEntry && tokenEntry.key) ghToken = String(tokenEntry.key)
    } catch (_) {
      ghToken = ""
    }

    var HEADERS = {
      "User-Agent": "vibex-mod-registry",
      "Accept": "application/vnd.github.raw",
    }
    if (ghToken) HEADERS["Authorization"] = "Bearer " + ghToken

    // 时间预算：本路由是同步阻塞的，网关对单次请求有容忍上限，超了浏览器侧看到的就是 500。
    // 两个文件最多 4 次出站（每个文件主源 + 回退源各一次），不设上限最坏能拖到半分钟以上。
    var startedAt = new Date().getTime()
    var TIME_BUDGET_MS = 6000
    var budgetExhausted = false

    var texts = {}
    var warnings = []

    for (var i = 0; i < FILES.length; i++) {
      var path = FILES[i]
      var got = ""

      // 主源：contents API（内容最新）
      // 单次超时从剩余预算里扣 —— 只在循环开头查预算挡不住最后一次出站把请求拖过网关上限。
      var leftMs = TIME_BUDGET_MS - (new Date().getTime() - startedAt)
      if (leftMs < 500) {
        budgetExhausted = true
        warnings.push("本次拉取超出时间预算，稍后会自动重试")
        break
      }
      var fetchTimeoutS = Math.max(1, Math.min(5, Math.floor(leftMs / 1000)))

      try {
        var r1 = $http.send({
          url: API_BASE + path + "?ref=" + BRANCH,
          method: "GET",
          headers: HEADERS,
          timeout: fetchTimeoutS,
        })
        if (r1.statusCode === 200) {
          // Goja 里 $http.send 的 body 是 UTF-8 字节数组（不是字符串），
          // 直接 String() 会得到 "123,10,32,..." 这种字节值串，JSON.parse 必然失败。
          // 必须过一遍 Buffer 才能还原成文本（中文才不会乱码）。
          got = require("buffer").Buffer.from(r1.body).toString("utf8")
        } else if (r1.statusCode === 403 || r1.statusCode === 429) {
          warnings.push(path + "：官方接口本小时调用次数已用完，本次已改从镜像源读取（内容一致，可能有几分钟延迟）")
        }
      } catch (err1) {
        // 落到回退源
      }

      // 回退源：jsDelivr（可达性好，但可能有缓存延迟）
      var cdnLeftMs = TIME_BUDGET_MS - (new Date().getTime() - startedAt)
      if (!got && !budgetExhausted && cdnLeftMs < 500) {
        budgetExhausted = true
        warnings.push("本次拉取超出时间预算，稍后会自动重试")
      }
      if (!got && !budgetExhausted) {
        try {
          var r2 = $http.send({
            url: CDN_BASE + path,
            method: "GET",
            headers: { "User-Agent": "vibex-mod-registry", "Accept": "*/*" },
            timeout: Math.max(1, Math.min(5, Math.floor(cdnLeftMs / 1000))),
          })
          if (r2.statusCode === 200) {
            got = require("buffer").Buffer.from(r2.body).toString("utf8")
          }
        } catch (err2) {
          // 两个源都没取到，下面统一记 warning
        }
      }

      if (got) texts[path] = got
      else warnings.push(path + "：两个数据源都没取到")
    }

    var sources = []
    var mods = []
    var moderation = {}
    var publishedAt = ""

    if (texts["sources.json"]) {
      try {
        var s = JSON.parse(texts["sources.json"])
        if (s && s.sources && s.sources.length) sources = s.sources
      } catch (pe1) {
        warnings.push("sources.json 内容无法解析")
      }
    }

    if (texts["docs/mod-index.json"]) {
      try {
        var idx = JSON.parse(texts["docs/mod-index.json"])
        if (idx && idx.mods && idx.mods.length) mods = idx.mods
        if (idx && idx.moderation) moderation = idx.moderation
        if (idx && idx.publishedAt) publishedAt = idx.publishedAt
      } catch (pe2) {
        warnings.push("mod-index.json 内容无法解析")
      }
    }

    var payload = {
      ok: true,
      repo: OWNER + "/" + REPO,
      branch: BRANCH,
      budgetExhausted: budgetExhausted,
      sources: sources,
      mods: mods,
      moderation: moderation,
      publishedAt: publishedAt,
      warnings: warnings,
      fetchedAt: new Date().toISOString(),
    }

    return e.json(200, payload)
  } catch (err) {
    var msg = String(err && err.message || err)
    try {
      $app.logger().error("mod-sync state: " + msg)
    } catch (_) {}
    return e.json(500, { error: "sync_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
