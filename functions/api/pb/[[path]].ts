// Cloudflare Pages Function: /api/pb/* → 自建 PocketBase 的同源反向代理。
//
// 为什么需要它(而不是让前端直连 PB):
//   1) 前端所有请求都打到同源 /api/pb/... — 没有跨域, 也不用把 PB 暴露到公网;
//   2) pb_hooks 里 mod-records/clear 的身份门读的是 x-rh-user-id 请求头。
//      平台版由 RunningHub 网关注入; 自建后改由这里在会话校验通过后注入,
//      顺便把管理员 Cookie 剥掉(后端不需要, 也避免外泄)。
//
// 环境变量:
//   PB_ORIGIN         PocketBase 地址, 如 https://pb.example.com (必填)
//   SESSION_SECRET    与 functions/api/session.ts 同一把会话签名密钥(必填)
//   PB_PROXY_SECRET   可选。设置后随请求带上 X-Proxy-Secret, 供 pb_hooks 二次确认
//                     "这个请求确实来自代理", 防止有人绕过 Pages 直连 PB 伪造身份。
//   CF_ACCESS_CLIENT_ID /
//   CF_ACCESS_CLIENT_SECRET
//                     可选。PB 前面挂了 Cloudflare Access 时用服务令牌过闸, 这样 PB
//                     可以不暴露给任何匿名请求。两个变量要一起配。
//
// 注意: 会话令牌的格式与签名算法必须与 functions/api/session.ts 完全一致,
// 改一边就要同步改另一边。

type Env = {
  PB_ORIGIN?: string
  SESSION_SECRET?: string
  PB_PROXY_SECRET?: string
  CF_ACCESS_CLIENT_ID?: string
  CF_ACCESS_CLIENT_SECRET?: string
}

type FunctionContext = {
  request: Request
  env: Env
  params: { path?: string | string[] }
}

const COOKIE_NAME = "mrc_admin"
const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
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

function b64urlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
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

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)
  for (let i = 0; i < max; i += 1) diff |= (left[i] || 0) ^ (right[i] || 0)
  return diff === 0
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

async function sessionUserId(env: Env, token: string): Promise<string> {
  const secret = String(env.SESSION_SECRET || "")
  if (!secret || !token) return ""
  const parts = token.split(".")
  if (parts.length !== 4 || parts[0] !== "v1") return ""
  const expected = await signPayload(secret, `v1.${parts[1]}.${parts[2]}`)
  if (!constantTimeEqual(parts[3], expected)) return ""
  const expiresAt = Number(parts[2])
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return ""
  const bytes = b64urlDecode(parts[1])
  return bytes ? new TextDecoder().decode(bytes) : ""
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  const { request, env, params } = context

  const origin = String(env.PB_ORIGIN || "").trim().replace(/\/+$/, "")
  if (!origin) {
    return jsonResponse(500, {
      error: "pb_origin_missing",
      message: "部署缺少 PB_ORIGIN 环境变量（PocketBase 地址）",
    })
  }
  if (!/^https?:\/\//i.test(origin)) {
    return jsonResponse(500, {
      error: "pb_origin_invalid",
      message: "PB_ORIGIN 必须以 http:// 或 https:// 开头",
    })
  }

  const userId = await sessionUserId(env, readCookie(request, COOKIE_NAME))
  if (!userId) {
    return jsonResponse(401, { error: "admin_login_required", message: "请先登录管理员账号" })
  }

  const segments = params.path
  const suffix = Array.isArray(segments) ? segments.join("/") : segments || ""
  const incoming = new URL(request.url)
  const target = new URL(`${origin}/${suffix}`)
  target.search = incoming.search

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("cookie")
  for (let i = 0; i < HOP_BY_HOP_HEADERS.length; i += 1) headers.delete(HOP_BY_HOP_HEADERS[i])
  headers.set("x-rh-user-id", userId)
  if (String(env.PB_PROXY_SECRET || "")) {
    headers.set("x-proxy-secret", String(env.PB_PROXY_SECRET))
  }
  const accessId = String(env.CF_ACCESS_CLIENT_ID || "")
  const accessSecret = String(env.CF_ACCESS_CLIENT_SECRET || "")
  if (accessId && accessSecret) {
    headers.set("CF-Access-Client-Id", accessId)
    headers.set("CF-Access-Client-Secret", accessSecret)
  }

  const method = request.method.toUpperCase()
  const sendBody = method !== "GET" && method !== "HEAD"

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      method,
      headers,
      body: sendBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    })
  } catch (error) {
    return jsonResponse(502, {
      error: "pb_unreachable",
      message: `无法连接 PocketBase：${String((error && (error as Error).message) || error)}`,
    })
  }

  const responseHeaders = new Headers(upstream.headers)
  for (let i = 0; i < HOP_BY_HOP_HEADERS.length; i += 1) responseHeaders.delete(HOP_BY_HOP_HEADERS[i])
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}
