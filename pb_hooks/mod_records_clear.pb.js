// 清空本机记录（维护者手动触发，只动本机表）。
//
// 干什么：审核流水、下架留档、审核决定、仓库巡检这四张表都是**本机的暂存**。
//   真正生效的审核结果住在索引仓库的 moderation.json 里（只读），本路由碰不到它。
//   维护者导出并重建索引之后，本机这些暂存记录就该清掉 —— 否则时间线会一直堆着
//   已经生效的东西，看不出哪些还没应用。
//
// 为什么要有这个路由：前端逐条 DELETE 上百条既慢、又会中途失败留下半清状态。
//   这里一次删干净，并把删掉的条数如实回报，前端照实显示。
//
// 只删本机表，绝不写任何仓库。仓库里已生效的审核结果清不掉 —— 要改就去仓库里改。
//
// 注意：Goja 顶层不能定义 helper 函数（会让整个文件加载失败），逻辑一律写在回调内部。

routerAdd("POST", "/api/mod-records/clear", function (e) {
  try {
    var info = e.requestInfo()
    var body = info.body || {}

    // 身份门禁：这是四条路由里唯一会**成批删数据**的入口，所以 fail closed ——
    // 平台把当前登录用户的身份注入到 X-Rh-User-Id，拿不到就说明这个请求不是登录用户发的。
    // 宁可维护者多点一次，也不能让匿名请求把库清空。
    // 其余三条只读路由暂时只观测不拦截：先确认身份确实传得到，再一起开，
    // 免得把正常访问也挡在门外（见 mod_sync / mod_inspect 里的 [identity] 观测行）。
    // ⚠️ 取身份必须做键名归一化：PocketBase 把请求头规范化成 `x_rh_user_id`（下划线），
    // 按 `x-rh-user-id`（连字符）去取永远是 undefined —— 那样这道门会永久锁死，
    // 维护者明明登录着也会被拒。这里统一「转小写 + 连字符换下划线」后再比对，
    // 将来键名形态再变也不会把清空入口锁死。
    var rhUserId = ""
    var proxySecret = ""
    try {
      var idHeaders = info.headers || {}
      for (var hk in idHeaders) {
        var normKey = String(hk).toLowerCase().replace(/-/g, "_")
        if (normKey === "x_rh_user_id" && idHeaders[hk]) rhUserId = String(idHeaders[hk])
        if (normKey === "x_proxy_secret" && idHeaders[hk]) proxySecret = String(idHeaders[hk])
      }
    } catch (_) {}

    // 代理二次确认: 只要 PocketBase 侧配了 PB_PROXY_SECRET, 就只认经 Pages 代理转发来的
    // 请求 —— 否则任何人都可以绕过 Pages 直连 PocketBase, 自己伪造一个 X-Rh-User-Id 把库清空。
    // 没配这个变量时保持原行为(只认身份头), 老部署不受影响。
    var expectedProxySecret = ""
    try {
      if (typeof $os.getenv === "function") expectedProxySecret = String($os.getenv("PB_PROXY_SECRET") || "")
    } catch (_) {
      expectedProxySecret = ""
    }
    if (expectedProxySecret && proxySecret !== expectedProxySecret) {
      try {
        $app.logger().info("[identity] clear DENIED (proxy secret mismatch)")
      } catch (_) {}
      return e.json(401, {
        error: "proxy_secret_required",
        message: "请从审核后台发起清空操作",
        fingerprint: "proxy_secret_required",
      })
    }

    if (!rhUserId) {
      try {
        $app.logger().info("[identity] clear DENIED (no rh user id)")
      } catch (_) {}
      return e.json(401, {
        error: "rh_login_required",
        message: "请先用管理员账号登录后再清空记录",
        fingerprint: "rh_login_required",
      })
    }

    var scopes = body.scopes
    if (!scopes || !scopes.length) {
      return e.json(400, {
        error: "scopes_required",
        message: "没有指定要清空的范围",
        fingerprint: "scopes_required",
      })
    }

    // 只认这两个范围，绝不拿请求里的任意字符串当表名去删
    var wantLocal = false
    var wantChecks = false
    for (var i = 0; i < scopes.length; i++) {
      var s = String(scopes[i] || "")
      if (s === "local") wantLocal = true
      if (s === "checks") wantChecks = true
    }
    if (!wantLocal && !wantChecks) {
      return e.json(400, {
        error: "scopes_invalid",
        message: "清空范围不合法",
        fingerprint: "scopes_invalid",
      })
    }

    // 一次删 200 条，删完再从 0 开始查，直到查不到为止。
    // 外层 guard 是防呆上限：万一删不掉就会原地打转，宁可少删也不能把请求挂死。
    function clearCollection(name) {
      var removed = 0
      for (var guard = 0; guard < 100; guard++) {
        var rows = null
        try {
          rows = $app.findRecordsByFilter(name, "", "created", 200, 0)
        } catch (_) {
          return removed
        }
        if (!rows || rows.length === 0) return removed
        for (var r = 0; r < rows.length; r++) {
          try {
            $app.delete(rows[r])
            removed++
          } catch (_) {}
        }
        if (rows.length < 200) return removed
      }
      return removed
    }

    var targets = []
    if (wantLocal) targets.push("review_records", "delete_records", "mod_decisions")
    if (wantChecks) targets.push("repo_checks")

    var local = 0
    var checks = 0
    for (var t = 0; t < targets.length; t++) {
      var name = targets[t]
      var exists = true
      try {
        $app.findCollectionByNameOrId(name)
      } catch (_) {
        exists = false
      }
      if (!exists) continue
      var removed = clearCollection(name)
      if (name === "repo_checks") checks += removed
      else local += removed
    }

    try {
      $app.logger().info(
        "mod-records clear: local=" + local + " checks=" + checks,
      )
    } catch (_) {}

    return e.json(200, { ok: true, removed: { local: local, checks: checks } })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("mod-records clear: " + msg)
    } catch (_) {}
    return e.json(500, { error: "clear_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
