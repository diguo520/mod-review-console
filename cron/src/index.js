// 无人值守同步器：Cloudflare 定时任务（Cron Trigger）定期调用站点的
// POST /api/pb/api/index/sync，把 D1 里待同步的审核决定推送到索引仓库。
//
// 为什么单独做一个 Worker：Pages Functions 不支持 Cron Trigger。
// 密钥走 Worker secret（INDEX_SYNC_TOKEN），不进仓库，也不依赖任何常开机器。

const SYNC_PATH = "/api/pb/api/index/sync"

/** 调一次站点同步接口；结果结构化返回，日志里能直接看出卡在哪 */
async function triggerSync(env) {
  const token = String(env.INDEX_SYNC_TOKEN || "")
  if (!token) return { ok: false, error: "index_sync_token_missing" }
  const base = String(env.SYNC_URL || "").replace(/\/+$/, "")
  if (!base) return { ok: false, error: "sync_url_missing" }

  const res = await fetch(base + SYNC_PATH, {
    method: "POST",
    headers: { "content-type": "application/json", "x-index-sync-token": token },
    body: "{}",
  })
  const text = await res.text()
  let body = text.slice(0, 500)
  try {
    body = JSON.parse(text)
  } catch {
    // 保留原文：被 Cloudflare 错误页顶掉时，这里能直接看出来
  }
  return { ok: res.ok, status: res.status, body: body }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })
}

export default {
  // 到点自动跑。审核结论的发布从此与「谁在什么时候打开了页面」无关
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      triggerSync(env).then(function (r) {
        console.log("index sync " + JSON.stringify(r))
      }),
    )
  },

  // 手动触发（排查用）：带上与站点同一把共享令牌，避免变成公开接口
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname !== SYNC_PATH) return json(404, { error: "not_found" })
    const token = String(env.INDEX_SYNC_TOKEN || "")
    const given = request.headers.get("x-index-sync-token") || url.searchParams.get("token") || ""
    if (!token || given !== token) return json(401, { error: "unauthorized" })
    const result = await triggerSync(env)
    return json(result.ok ? 200 : 424, result)
  },
}