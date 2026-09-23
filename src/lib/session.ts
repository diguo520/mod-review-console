// 自建部署(Cloudflare Pages)的管理员登录态: 账号 + 密码, 由 Pages Functions 校验。
//
// 与平台版(rhLogin.ts)的关系: 两者都只服务同一份稳定契约(见 ./auth.ts)——
//   getAuthHeaders(): Record<string, string>  请求鉴权头
//   redirectToLogin(): void                   触发登录流程
//
// 会话令牌是 HttpOnly Cookie, 前端读不到。localStorage 里只镜像一份「谁登录了」,
// 好让首屏不必等一次网络往返就知道要不要弹登录门; 判定权始终在 GET /api/session。
export type SessionUser = {
  userId: string
  displayName: string
}

const MIRROR_KEY = "mrc-admin-session"
const SESSION_ENDPOINT = "/api/session"
const USERNAME_INPUT_ID = "admin-username"

let cached: SessionUser | null | undefined

// 登录态变化的订阅点。登录门靠它做到「工作台里点了退出 → 立刻回到登录表单」,
// 而不是留在一个所有请求都 401 的空壳页面上。
const listeners = new Set<() => void>()

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readMirror(): SessionUser | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionUser
    return parsed && parsed.userId ? parsed : null
  } catch {
    return null
  }
}

function writeMirror(user: SessionUser | null): void {
  try {
    if (user) localStorage.setItem(MIRROR_KEY, JSON.stringify(user))
    else localStorage.removeItem(MIRROR_KEY)
  } catch {
    // 存储被禁用时只退化成「每次加载都问一次服务端」, 不影响正确性
  }
}

function setSessionUser(user: SessionUser | null): void {
  cached = user
  writeMirror(user)
  listeners.forEach((listener) => listener())
}

/** 同步读登录态(可能是镜像缓存); 未登录返回 null。 */
export function getSessionUser(): SessionUser | null {
  if (cached === undefined) cached = readMirror()
  return cached
}

/** 向服务端确认登录态; 未登录返回 null。网络不可达时保留当前镜像。 */
export async function refreshSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(SESSION_ENDPOINT, { method: "GET", credentials: "same-origin" })
    if (!res.ok) {
      setSessionUser(null)
      return null
    }
    const data = (await res.json().catch(() => ({}))) as { user?: SessionUser }
    const user = data.user && data.user.userId ? data.user : null
    setSessionUser(user)
    return user
  } catch {
    return getSessionUser()
  }
}

/** 首屏静默确认: 有会话返回 true, 否则 false。 */
export async function ensureSessionSilent(): Promise<boolean> {
  return (await refreshSession()) !== null
}

export type LoginResult = { ok: true } | { ok: false; error: string }

export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(SESSION_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      user?: SessionUser
      error?: string
      message?: string
    }
    if (!res.ok || !data.user) {
      return { ok: false, error: data.message || data.error || `登录失败（HTTP ${res.status}）` }
    }
    setSessionUser(data.user)
    return { ok: true }
  } catch {
    return { ok: false, error: "无法连接登录接口，请检查网络后重试" }
  }
}

export async function logoutSession(): Promise<void> {
  setSessionUser(null)
  try {
    await fetch(SESSION_ENDPOINT, { method: "DELETE", credentials: "same-origin" })
  } catch {
    // 前端已登出; 服务端 Cookie 到期即失效
  }
}

/**
 * 触发登录流程。本站的登录门就在当前页(见 LoginGate), 不需要跳转,
 * 所以这里只清掉本地态并把焦点送到账号输入框。
 */
export function redirectToLogin(): void {
  setSessionUser(null)
  if (typeof document === "undefined") return
  const input = document.getElementById(USERNAME_INPUT_ID)
  if (input instanceof HTMLInputElement) input.focus()
}

/** 登录门渲染输入框时用的 id, 与 redirectToLogin() 的聚焦目标保持一致。 */
export const ADMIN_USERNAME_INPUT_ID = USERNAME_INPUT_ID

/**
 * 请求鉴权头。会话走 HttpOnly Cookie, 同源请求浏览器自动携带, 因此这里是空的
 * ——业务代码的调用点不用改, 也不会有人把令牌写进 JS 变量里。
 */
export function sessionAuthHeaders(): Record<string, string> {
  return {}
}
