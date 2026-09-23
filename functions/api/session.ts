// Cloudflare Pages Function: 管理员会话。
//
//   GET    /api/session   当前会话(未登录 401)
//   POST   /api/session   账号密码登录 { username, password }
//   DELETE /api/session   登出
//
// 需要的环境变量(Cloudflare 控制台 → Pages 项目 → Settings → Variables and secrets):
//   ADMIN_USER           管理员账号(必填)
//   ADMIN_PASSWORD       管理员密码明文(与 ADMIN_PASSWORD_HASH 二选一)
//   ADMIN_PASSWORD_HASH  管理员密码的 SHA-256 十六进制(推荐: 控制台里不落明文)
//   SESSION_SECRET       会话签名密钥, 随机 32 字节以上(必填, 加密类型)
//   SESSION_TTL_HOURS    会话有效期小时数, 默认 12
//
// 令牌形如 v1.<b64url(账号)>.<过期毫秒>.<HMAC-SHA256 签名>, 只放在 HttpOnly Cookie 里,
// 前端 JS 读不到, 因此不存在"令牌泄漏在 bundle / localStorage"的问题。

type Env = {
  ADMIN_USER?: string
  ADMIN_PASSWORD?: string
  ADMIN_PASSWORD_HASH?: string
  SESSION_SECRET?: string
  SESSION_TTL_HOURS?: string
}

type SessionUser = {
  userId: string
  displayName: string
}

type FunctionContext = {
  request: Request
  env: Env
}

export const COOKIE_NAME = "mrc_admin"
const DEFAULT_TTL_HOURS = 12
const MAX_TTL_HOURS = 24 * 30

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extraHeaders || {}),
    },
  })
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
    const binary = atob(normalized + pad)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return b64urlEncode(new Uint8Array(signature))
}

// 定长比较: 不因为提前 return 泄漏"前几位对了"这种时序信息。
function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)
  for (let i = 0; i < max; i += 1) diff |= (left[i] || 0) ^ (right[i] || 0)
  return diff === 0
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  let out = ""
  const bytes = new Uint8Array(digest)
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0")
  return out
}

async function passwordMatches(env: Env, input: string): Promise<boolean> {
  const hash = String(env.ADMIN_PASSWORD_HASH || "").trim().toLowerCase()
  if (hash) return constantTimeEqual(await sha256Hex(input), hash)
  const plain = String(env.ADMIN_PASSWORD || "")
  if (!plain) return false
  return constantTimeEqual(input, plain)
}

function sessionTtlHours(env: Env): number {
  const raw = Number(env.SESSION_TTL_HOURS || "")
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_HOURS
  return Math.min(raw, MAX_TTL_HOURS)
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("Cookie") || ""
  const parts = header.split(";")
  for (let i = 0; i < parts.length; i += 1) {
    const index = parts[i].indexOf("=")
    if (index === -1) continue
    if (parts[i].slice(0, index).trim() === name) return parts[i].slice(index + 1).trim()
  }
  return ""
}

function buildSetCookie(request: Request, value: string, maxAge: number): string {
  // 本地 wrangler pages dev 走 http, 带 Secure 会导致浏览器直接丢弃 Cookie。
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : ""
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

async function issueToken(env: Env, user: SessionUser, ttlHours: number): Promise<string> {
  const maxAge = Math.round(ttlHours * 3600)
  const expiresAt = Date.now() + maxAge * 1000
  const encodedUser = b64urlEncode(new TextEncoder().encode(user.userId))
  const payload = `v1.${encodedUser}.${expiresAt}`
  const signature = await signPayload(String(env.SESSION_SECRET || ""), payload)
  return `${payload}.${signature}`
}

async function verifyToken(env: Env, token: string): Promise<SessionUser | null> {
  const secret = String(env.SESSION_SECRET || "")
  if (!secret || !token) return null
  const parts = token.split(".")
  if (parts.length !== 4 || parts[0] !== "v1") return null
  const expected = await signPayload(secret, `v1.${parts[1]}.${parts[2]}`)
  if (!constantTimeEqual(parts[3], expected)) return null
  const expiresAt = Number(parts[2])
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null
  const bytes = b64urlDecode(parts[1])
  if (!bytes) return null
  const userId = new TextDecoder().decode(bytes)
  if (!userId) return null
  return { userId, displayName: userId }
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  const { request, env } = context
  const method = request.method.toUpperCase()

  if (!String(env.SESSION_SECRET || "")) {
    return jsonResponse(500, {
      error: "session_secret_missing",
      message: "部署缺少 SESSION_SECRET 环境变量，无法签发管理员会话",
    })
  }

  if (method === "GET") {
    const user = await verifyToken(env, readCookie(request, COOKIE_NAME))
    if (!user) {
      return jsonResponse(401, { error: "admin_login_required", message: "尚未登录管理员账号" })
    }
    return jsonResponse(200, { ok: true, user })
  }

  if (method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      username?: string
      password?: string
    }
    const username = String(body.username || "").trim()
    const password = String(body.password || "")
    if (!username || !password) {
      return jsonResponse(400, { error: "credentials_required", message: "请填写管理员账号与密码" })
    }

    const expectedUser = String(env.ADMIN_USER || "").trim()
    if (!expectedUser) {
      return jsonResponse(500, {
        error: "admin_user_missing",
        message: "部署缺少 ADMIN_USER 环境变量",
      })
    }

    const userOk = constantTimeEqual(username, expectedUser)
    const passwordOk = await passwordMatches(env, password)
    if (!userOk || !passwordOk) {
      return jsonResponse(401, { error: "bad_credentials", message: "账号或密码不正确" })
    }

    const user: SessionUser = { userId: expectedUser, displayName: expectedUser }
    const ttlHours = sessionTtlHours(env)
    const token = await issueToken(env, user, ttlHours)
    return jsonResponse(200, { ok: true, user }, {
      "Set-Cookie": buildSetCookie(request, token, Math.round(ttlHours * 3600)),
    })
  }

  if (method === "DELETE") {
    return jsonResponse(200, { ok: true }, { "Set-Cookie": buildSetCookie(request, "", 0) })
  }

  return jsonResponse(405, { error: "method_not_allowed", message: `不支持 ${method}` })
}
