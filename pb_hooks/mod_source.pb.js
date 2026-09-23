// 来源仓库体检（服务端执行，只读）。
//
// 干什么：索引仓库的 mods[] 只包含「已经构建进索引」的模组，还没进索引的来源
//   （收录名单里有、但索引里没有）在页面上只剩一个 owner/repo，没法做任何检查。
//   本路由替页面去这些来源仓库里把清单文件 evejs-mod.json 拉回来，
//   页面拿它跑和已发布模组完全相同的六项检查 —— 这样「无人值守」才有判定依据。
//
// 为什么不放前端：预览环境的前端不能直连第三方域名（会被运行时探针判成错误刷屏），
//   而且出口 IP 固定才好控速。
//
// 只读：绝不写任何仓库，也不写本地表。结果只是体检报告。
//
// 额度：GitHub 未认证请求按出口 IP 限流（约 60 次/小时）。所以一次只处理少量来源，
//   且单次请求 10 秒硬预算 + 单次探测 6 秒超时，超预算立刻收工（剩下的留给下一轮）。
//   正常路径下每个来源只花 1 次请求（清单拉到了就说明仓库在）；
//   只有清单 404 时才补一次仓库探测，用来区分「仓库没了」和「仓库在但没放清单」。
//
// 注意：Goja 顶层不能定义 helper 函数（会让整个文件加载失败），逻辑一律写在回调内部。

routerAdd("POST", "/api/mod-source/inspect", function (e) {
  try {
    var body = e.requestInfo().body || {}
    var raw = body.sources
    if (!raw || !raw.length) {
      return e.json(200, { ok: true, results: [], warnings: [] })
    }

    // 只接受 owner/repo 形态，绝不拿请求里的任意字符串去出站（否则就成了任意地址探测代理）
    var SOURCE_RE = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/
    var MAX_PER_CALL = 6
    var targets = []
    for (var t = 0; t < raw.length && targets.length < MAX_PER_CALL; t++) {
      var src = String(raw[t] || "").trim()
      if (!SOURCE_RE.test(src)) continue
      targets.push(src)
    }
    if (targets.length === 0) {
      return e.json(200, { ok: true, results: [], warnings: ["没有合法的来源仓库地址"] })
    }

    var startedAt = new Date().getTime()
    // 时间预算压到 6 秒：本路由是同步阻塞的，网关对单次请求有容忍上限，超了浏览器侧
    // 看到的就是 500（哪怕服务端最后把活干完了）。单次出站的超时也从预算里扣（见下），
    // 所以整条路由的耗时不会比预算多多少。
    var TIME_BUDGET_MS = 6000
    var API = "https://api.github.com/repos/"

    // 只读令牌：明文只存在本机密钥文件里，绝不写进代码、也不进前端。
    // 带上它，GitHub 的接口额度从每小时 60 次提到 5000 次，体检就不用抠着排期。
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
    var META_HEADERS = {
      "User-Agent": "vibex-mod-registry",
      "Accept": "application/vnd.github+json",
    }
    if (ghToken) {
      HEADERS["Authorization"] = "Bearer " + ghToken
      META_HEADERS["Authorization"] = "Bearer " + ghToken
    }

    var results = []
    var warnings = []
    var budgetExhausted = false

    for (var i = 0; i < targets.length; i++) {
      // 每进一条先看预算：宁可少查几条，也不能把网关连接拖到超时
      if (new Date().getTime() - startedAt > TIME_BUDGET_MS) {
        budgetExhausted = true
        break
      }

      var source = targets[i]
      var manifest = null
      var repoAlive = null
      var status = 0
      var note = ""

      // 主路径：直接拉清单。清单拿到了就说明仓库在，省掉一次探测。
      var refs = ["main", "master"]
      for (var r = 0; r < refs.length && manifest === null; r++) {
        // 单次出站的超时从剩余预算里扣：只在每个来源开头查预算，挡不住最后一次出站
        // 把整条请求拖过网关的容忍上限（浏览器侧表现就是 500）。
        var leftMs = TIME_BUDGET_MS - (new Date().getTime() - startedAt)
        if (leftMs < 500) {
          budgetExhausted = true
          break
        }
        try {
          var res = $http.send({
            url: API + source + "/contents/evejs-mod.json?ref=" + refs[r],
            method: "GET",
            headers: HEADERS,
            timeout: Math.max(1, Math.min(5, Math.floor(leftMs / 1000))),
          })
          status = res.statusCode
          if (res.statusCode === 200) {
            // Goja 里 $http.send 的 body 是 UTF-8 字节数组，必须过一遍 Buffer 才是文本
            var text = require("buffer").Buffer.from(res.body).toString("utf8")
            try {
              manifest = JSON.parse(text)
              repoAlive = true
            } catch (parseErr) {
              note = "清单文件内容无法解析（不是合法 JSON）"
              repoAlive = true
            }
          } else if (res.statusCode === 403 || res.statusCode === 429) {
            note = "官方接口本小时调用次数已用完，稍后会自动重试"
            r = refs.length
          }
        } catch (httpErr) {
          status = 0
          note = "网络未取到结果，稍后会自动重试"
        }
      }

      // 清单没拿到时，补一次仓库探测：区分「仓库没了」和「仓库在但没放清单文件」
      // 预算已经用完就不再出站（上面的 `break` 只跳出了 refs 循环，这里必须再判一次）
      var metaLeftMs = TIME_BUDGET_MS - (new Date().getTime() - startedAt)
      if (!budgetExhausted && metaLeftMs < 500) budgetExhausted = true
      if (
        !budgetExhausted &&
        manifest === null &&
        repoAlive === null &&
        status !== 403 &&
        status !== 429
      ) {
        try {
          var meta = $http.send({
            url: API + source,
            method: "GET",
            headers: META_HEADERS,
            timeout: Math.max(1, Math.min(5, Math.floor(metaLeftMs / 1000))),
          })
          if (meta.statusCode === 200) {
            repoAlive = true
            if (!note) note = "仓库可访问，但没有找到 evejs-mod.json 清单文件"
          } else if (meta.statusCode === 404) {
            repoAlive = false
            note = "仓库返回 404，来源已失联"
          } else {
            note = "仓库探测未取得确定结果（HTTP " + meta.statusCode + "），保持原状态"
          }
        } catch (metaErr) {
          if (!note) note = "仓库探测未取得确定结果，保持原状态"
        }
      }

      results.push({
        source: source,
        manifest: manifest,
        repoAlive: repoAlive,
        note: note,
      })
    }

    if (budgetExhausted) {
      warnings.push("本次体检超出时间预算，剩下的来源留给下一轮")
    }

    return e.json(200, {
      ok: true,
      results: results,
      warnings: warnings,
      budgetExhausted: budgetExhausted,
    })
  } catch (err) {
    var msg = String(err && err.message || err)
    try {
      $app.logger().error("mod-source inspect: " + msg)
    } catch (_) {}
    return e.json(500, { error: "inspect_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
