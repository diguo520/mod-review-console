// Cloudflare Pages Function(中间件): SPA 深链回退。
//
// 站点是 BrowserRouter 的单页应用, /records 这类路由只存在于浏览器里。
// 直接访问或刷新 /records 时 Pages 找不到同名静态文件, 会直接回 404。
// 这里在静态资源之后兜一层: 只有"没命中任何静态资源 + 浏览器在要 HTML"的
// GET/HEAD 才交回 index.html, 其余(API、代理、缺失的 js/css)一律原样放行,
// 避免把 404 掩盖成 200 —— 那会让真实故障变得极难排查。
//
// 放在中间件里而不是 public/_redirects, 是为了不依赖 _redirects 与
// Functions 的匹配优先级: 这里对 /api、/__pb 的判断是确定性的。

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

type FunctionContext = {
  request: Request
  env: Env
  next: () => Promise<Response>
}

const BYPASS_PREFIXES = ["/api/", "/__pb"]

export async function onRequest(context: FunctionContext): Promise<Response> {
  const { request, env, next } = context
  const url = new URL(request.url)
  const path = url.pathname

  for (let i = 0; i < BYPASS_PREFIXES.length; i += 1) {
    if (path === BYPASS_PREFIXES[i] || path.startsWith(`${BYPASS_PREFIXES[i]}/`)) return next()
  }

  const response = await next()
  if (response.status !== 404) return response
  if (request.method !== "GET" && request.method !== "HEAD") return response

  // 只有浏览器导航(Accept 含 text/html)才回退; 缺图片/脚本时保持 404 真相。
  const accept = request.headers.get("Accept") || ""
  if (!accept.includes("text/html")) return response

  const indexUrl = new URL("/index.html", url)
  return env.ASSETS.fetch(new Request(indexUrl.toString(), { headers: request.headers }))
}
