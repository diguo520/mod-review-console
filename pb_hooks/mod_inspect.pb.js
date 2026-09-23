// MOD 仓库巡检（服务端执行，前端按周期驱动）。
//
// 为什么探测放在服务端而不是前端：
//   1) 前端 fetch 探测仓库时会拿到 404（「仓库不存在」的正常结果），运行时探针会把任何
//      非 2xx 响应当错误上报，导致巡检一次刷一屏红字；
//   2) 上千个 MOD 时前端全量并发探测跑不动，这里按「最久没查过的优先」分批轮转；
//   3) 出口 IP 固定，便于控制对目标站的请求速率。
//
// 为什么不用 cronAdd：本平台 pb_hooks 的 cron 在热重载后会叠加注册，跟同一 Goja VM 上的
// 其它任务抢线程，制造看似不可复现的 500。所以改由前端按周期调用本路由（前端 poll），
// 服务端只负责真正干活。
//
// 速率：GitHub 对未登录请求按出口 IP 限流（约 60 次/小时）。所以每次只查一小批，
// 撞到限流（403/429）立刻收工、保持原状态 —— 绝不把限流误判成「仓库失联」。
//
// 时间预算（重要）：本路由是同步阻塞的，跑太久会把网关请求拖到超时，表现为
// 「POST /api/mod-inspect/tick 500」，并连带把同一时刻的其它请求一起拖挂。
// 所以单次请求设 10 秒硬预算 + 单次探测 6 秒超时，一超预算立刻收工，
// 剩下的条目留给下一轮 —— 轮转总会走完，但绝不拖垮同一条连接。
//
// 待检清单从哪来：模组清单住在维护者的索引仓库里（由 mod_sync.pb.js 只读拉取），
// 服务端不持有它，所以前端把排好序的 owner / name 放进 body.targets 传进来。
// 只接受 github 仓库名形态的片段（严格正则校验），不做任意地址探测。
//
// 注意：Goja 顶层不能定义 helper 函数（会让整个文件加载失败），逻辑一律写在回调内部。

routerAdd("POST", "/api/mod-inspect/tick", function (e) {
  try {
    var body = e.requestInfo().body || {}
    var batch = parseInt(body.limit, 10)
    if (!batch || batch < 1) batch = 3
    if (batch > 8) batch = 8

    var startedAt = new Date().getTime()
    // 时间预算压到 6 秒：本路由是同步阻塞的，网关对单次请求有容忍上限，
    // 超了浏览器侧看到的就是 500（哪怕服务端最后把活干完了）。预算是硬上限，
    // 单次探测的超时也从预算里扣（见下），所以整条路由的耗时不会超过预算多少。
    var TIME_BUDGET_MS = 6000

    // 待检清单由前端传进来：模组清单现在住在维护者的索引仓库里（只读），服务端不持有它，
    // 所以由前端按「最久没查过的优先」排好序，把 owner / name 片段交过来。
    // 严格校验形态，绝不拿请求里的任意字符串去出站 —— 否则这个路由就成了任意地址的探测代理。
    var SLUG_RE = /^[A-Za-z0-9._-]{1,100}$/
    var raw = body.targets
    var targets = []
    if (raw && raw.length) {
      for (var t = 0; t < raw.length && targets.length < batch; t++) {
        var it = raw[t] || {}
        var owner = String(it.owner || "")
        var name = String(it.name || "")
        if (!SLUG_RE.test(owner) || !SLUG_RE.test(name)) continue
        targets.push({
          modId: String(it.modId || ""),
          modName: String(it.modName || ""),
          owner: owner,
          name: name,
        })
      }
    }

    if (targets.length === 0) {
      return e.json(200, {
        ok: true,
        checked: 0,
        offline: 0,
        undetermined: 0,
        rateLimited: false,
        budgetExhausted: false,
      })
    }

    // 只读令牌：明文只存在本机密钥文件里，绝不写进代码、也不进前端。
    // 带上它，GitHub 的接口额度从每小时 60 次提到 5000 次，巡检就不用抠着排期。
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
    var probeHeaders = {
      "User-Agent": "vibex-mod-registry",
      "Accept": "application/vnd.github+json",
    }
    if (ghToken) probeHeaders["Authorization"] = "Bearer " + ghToken

    var checksColl = $app.findCollectionByNameOrId("repo_checks")
    var stamp = new Date().toISOString()
    var checked = 0
    var offline = 0
    var undetermined = 0
    var rateLimited = false
    var budgetExhausted = false

    for (var i = 0; i < targets.length; i++) {
      // 每进一条先看预算：宁可少查几条，也不能把网关连接拖到超时
      if (new Date().getTime() - startedAt > TIME_BUDGET_MS) {
        budgetExhausted = true
        break
      }

      var target = targets[i]
      var owner = target.owner
      var name = target.name
      var alive = null
      var detail = ""

      // 单次探测的超时必须从剩余预算里扣。只在每条开头查预算是不够的：
      // 最后一条仍然可以再吃掉一整个超时，把整条请求拖过网关的容忍上限。
      var remainingMs = TIME_BUDGET_MS - (new Date().getTime() - startedAt)
      if (remainingMs < 500) {
        budgetExhausted = true
        break
      }
      var probeTimeoutS = Math.max(1, Math.min(5, Math.floor(remainingMs / 1000)))

      try {
        var res = $http.send({
          url: "https://api.github.com/repos/" + owner + "/" + name,
          method: "GET",
          headers: probeHeaders,
          timeout: probeTimeoutS,
        })
        if (res.statusCode === 200) {
          alive = true
          detail = "仓库可访问，Release 与包体仍在"
        } else if (res.statusCode === 404) {
          alive = false
          detail = "仓库返回 404，已标记为失联"
        } else {
          if (res.statusCode === 403 || res.statusCode === 429) rateLimited = true
          detail = "巡检未取得确定结果（HTTP " + res.statusCode + "），保持原状态"
        }
      } catch (httpErr) {
        detail = "巡检未取得确定结果，保持原状态"
      }

      if (alive === false) offline++

      // 只有「确定」的结果才写流水。repo_checks.alive 是非空布尔，若把未确定
      // （限流 / 网络失败）也落成 false，队列读这张表时就会把好仓库标成「仓库失联」——
      // 正是本路由从头到尾强调不能犯的错。不写行 = 保持上一次的已知状态，与文案一致。
      if (alive === null) {
        undetermined++
        if (rateLimited) break
        continue
      }

      try {
        // 只写巡检流水：队列的「仓库失联」标记由前端读这张表派生，
        // 上架申请表已经不参与任何展示，不必再回写它。
        var check = new Record(checksColl)
        check.set("mod_id", target.modId)
        check.set("mod_name", target.modName)
        check.set("repo_url", "https://github.com/" + owner + "/" + name)
        check.set("alive", alive === true)
        check.set("detail", detail)
        check.set("checked_at", stamp)
        $app.save(check)
        checked++
      } catch (saveErr) {
        try {
          $app.logger().error("mod-inspect tick save: " + String(saveErr && saveErr.message || saveErr))
        } catch (_) {}
      }

      // 撞上限流就收工，把配额留给下一轮
      if (rateLimited) break
    }

    return e.json(200, {
      ok: true,
      checked: checked,
      offline: offline,
      undetermined: undetermined,
      rateLimited: rateLimited,
      budgetExhausted: budgetExhausted,
    })
  } catch (err) {
    var msg = String(err && err.message || err)
    try {
      $app.logger().error("mod-inspect tick: " + msg)
    } catch (_) {}
    return e.json(500, { error: "tick_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
