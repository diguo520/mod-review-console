// Cloudflare Pages Function: 审核控制台后端（D1 版）。
//
// 原先这套接口跑在维护者本机的 PocketBase 上（pb_hooks/*.pb.js），因此站点必须
// 依赖一台常开的电脑。这一版把全部逻辑搬进 Pages Functions：
//   · 队列数据仍然**只读**自维护者的索引仓库（diguo520/EVEjs-mods 的
//     sources.json 与 docs/mod-index.json）—— 仓库才是唯一事实来源；
//   · 审核流水 / 处置留档 / 仓库巡检结果改存 Cloudflare D1；
//   · 于是不再需要常开机器，也不需要 Cloudflare Tunnel。
//
// 路由（与前端 useHome.ts / useRecords.ts 的 apiGet / apiSend 一一对应）：
//   GET    /api/pb/api/mod-sync/state        索引仓库同步（只读）
//   POST   /api/pb/api/mod-source/inspect    来源仓库体检（只读）
//   POST   /api/pb/api/mod-inspect/tick      仓库巡检（确定的结果写 repo_checks）
//   POST   /api/pb/api/mod-records/clear     清空本地留档
//   GET|POST         /api/pb/api/{collection}
//   GET|PATCH|DELETE /api/pb/api/{collection}/{id}
//
// 环境变量与绑定：
//   DB              D1 绑定（wrangler.toml / Pages 项目设置）
//   SESSION_SECRET  与 functions/api/session.ts 同一把会话签名密钥（必填）
//   GITHUB_TOKEN    可选。带上后 GitHub 接口额度从 60 次/小时提到 5000 次/小时
//
// 区别说明（相对 pb_hooks 版）：
//   · 不再需要 PB_PROXY_SECRET / x-rh-user-id：Worker 只认自己的会话 Cookie，
//     天然 fail closed，绕不过去；
//   · 不再有「网关单次请求 6 秒」的硬限制，但各处仍保留时间预算，避免一次请求
//     把 GitHub 额度或用户等待时间拖爆；
//   · 时间戳统一用 ISO 8601（前端对 created / decided_at 做的是字符串比较排序，
//     ISO 与 PB 的 "YYYY-MM-DD HH:mm:ss.SSSZ" 相比更规范，排序仍然单调）。

type Env = {
  DB?: D1DatabaseLike
  SESSION_SECRET?: string
  GITHUB_TOKEN?: string
  INDEX_SYNC_TOKEN?: string
}

type FunctionContext = {
  request: Request
  env: Env
  params: { path?: string | string[] }
}

// —— D1 的最小结构类型 ——
// 故意不用 @cloudflare/workers-types 的全局声明：这里只声明真正用到的部分，
// 既能让 tsc 检查，又不给仓库引入新的类型依赖。
type D1Result = { results?: Array<Record<string, unknown>> }
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared
  all: () => Promise<D1Result>
  run: () => Promise<{ meta?: { changes?: number } }>
}
type D1DatabaseLike = { prepare: (sql: string) => D1Prepared }

type CollectionDef = {
  fields: string[]
  /** list 接口支持的等值过滤字段（与 pb_hooks 里写的 filter 字段一致） */
  filters: string[]
  defaultSort: string
}

const COOKIE_NAME = "mrc_admin"
const USER_AGENT = "mod-review-console"
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const BOOL_FIELDS = ["alive", "applied"]

// 四张本地留档表。字段名与 pb_hooks 里的 collection schema 完全一致，
// 前端读取代码因此不需要任何改动。
const COLLECTIONS: Record<string, CollectionDef> = {
  review_records: {
    fields: ["mod_id", "mod_name", "action", "reason", "mode", "operator", "acted_at"],
    filters: ["mod_id", "action"],
    defaultSort: "-created",
  },
  delete_records: {
    fields: ["mod_id", "mod_name", "reason", "operator", "deleted_at", "action_kind"],
    filters: ["mod_id"],
    defaultSort: "-created",
  },
  repo_checks: {
    fields: ["mod_id", "mod_name", "repo_url", "alive", "detail", "checked_at"],
    filters: ["mod_id"],
    defaultSort: "-checked_at",
  },
  mod_decisions: {
    fields: ["target", "kind", "action", "reason_zh", "reason_en", "operator", "decided_at", "applied"],
    filters: ["target", "action", "kind"],
    defaultSort: "-decided_at",
  },
}

const SYNC_OWNER = "diguo520"
const SYNC_REPO = "EVEjs-mods"
const SYNC_BRANCH = "main"
const SYNC_FILES = ["sources.json", "docs/mod-index.json"]

// 出站时间预算。原版受 PocketBase 网关「单次请求 6 秒」限制，这里放宽一些，
// 但仍然设上限：宁可少查几条留到下一轮，也不让维护者对着转圈等半分钟。
const INSPECT_BUDGET_MS = 8000
const SYNC_TIMEOUT_MS = 8000

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}

function methodNotAllowed(method: string): Response {
  return jsonResponse(405, { error: "method_not_allowed", message: "不支持 " + method })
}

// —— 会话（与 functions/api/session.ts 同一套算法，改一边必须同步改另一边）——

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
  const expected = await signPayload(secret, "v1." + parts[1] + "." + parts[2])
  if (!constantTimeEqual(parts[3], expected)) return ""
  const expiresAt = Number(parts[2])
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return ""
  const bytes = b64urlDecode(parts[1])
  return bytes ? new TextDecoder().decode(bytes) : ""
}

// —— 小工具 ——

function newId(): string {
  const bytes = new Uint8Array(15)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < bytes.length; i += 1) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  return out
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

function collectionDef(name: string): CollectionDef | null {
  return hasOwn(COLLECTIONS, name) ? COLLECTIONS[name] : null
}

function normalizeValue(field: string, raw: unknown): string | number {
  if (BOOL_FIELDS.indexOf(field) >= 0) return raw ? 1 : 0
  if (raw === undefined || raw === null) return ""
  return String(raw)
}

function rowToRecord(collection: string, def: CollectionDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.id, collectionName: collection }
  for (let i = 0; i < def.fields.length; i += 1) {
    const field = def.fields[i]
    const value = row[field]
    if (BOOL_FIELDS.indexOf(field) >= 0) out[field] = value === 1 || value === true || value === "1"
    else out[field] = value === null || value === undefined ? "" : value
  }
  out.created = row.created || ""
  out.updated = row.updated || out.created
  return out
}

function buildOrderBy(sort: string, def: CollectionDef): string {
  const allowed = def.fields.concat(["id", "created", "updated"])
  const terms: string[] = []
  const raw = String(sort || "").split(",")
  for (let i = 0; i < raw.length; i += 1) {
    const term = raw[i].trim()
    if (!term) continue
    const desc = term.charAt(0) === "-"
    const name = desc ? term.slice(1) : term
    // 白名单校验：sort 直接来自查询串，绝不能拼进 SQL
    if (allowed.indexOf(name) === -1) continue
    terms.push('"' + name + '" ' + (desc ? "DESC" : "ASC"))
  }
  if (terms.length === 0) terms.push('"created" ASC')
  return " ORDER BY " + terms.join(", ")
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "manual" })
  } finally {
    clearTimeout(timer)
  }
}

function githubHeaders(env: Env, accept: string): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: accept }
  const token = String(env.GITHUB_TOKEN || "")
  if (token) headers.Authorization = "Bearer " + token
  return headers
}

// —— 集合 CRUD（对应 pb_hooks 里自动生成的那五条路由）——

async function listRecords(env: Env, db: D1DatabaseLike, collection: string, def: CollectionDef, url: URL): Promise<Response> {
  let page = parseInt(url.searchParams.get("page") || "1", 10)
  if (!Number.isFinite(page) || page < 1) page = 1
  let perPage = parseInt(url.searchParams.get("perPage") || "50", 10)
  if (!Number.isFinite(perPage) || perPage < 1) perPage = 50
  if (perPage > 200) perPage = 200

  const where: string[] = []
  const binds: unknown[] = []
  for (let i = 0; i < def.filters.length; i += 1) {
    const field = def.filters[i]
    const value = url.searchParams.get(field)
    if (value !== null && value !== "") {
      where.push('"' + field + '" = ?')
      binds.push(value)
    }
  }

  // totalItems 与 pb_hooks 版保持一致：只报本页条数（前端只用 items）。
  const sql =
    'SELECT * FROM "' + collection + '"' +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    buildOrderBy(url.searchParams.get("sort") || def.defaultSort, def) +
    " LIMIT ? OFFSET ?"
  const result = await db.prepare(sql).bind(...binds, perPage, (page - 1) * perPage).all()
  const rows = Array.isArray(result.results) ? result.results : []
  const items: Array<Record<string, unknown>> = []
  for (let i = 0; i < rows.length; i += 1) items.push(rowToRecord(collection, def, rows[i]))
  return jsonResponse(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
}

async function getRecord(db: D1DatabaseLike, collection: string, def: CollectionDef, id: string): Promise<Response> {
  const row = await db.prepare('SELECT * FROM "' + collection + '" WHERE "id" = ?').bind(id).all()
  const rows = Array.isArray(row.results) ? row.results : []
  if (rows.length === 0) return jsonResponse(404, { error: "not_found" })
  return jsonResponse(200, rowToRecord(collection, def, rows[0]))
}

async function createRecord(env: Env, db: D1DatabaseLike, collection: string, def: CollectionDef, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const now = new Date().toISOString()
  const id = newId()
  const columns = ["id"].concat(def.fields, ["created", "updated"])
  const values: Array<string | number> = [id]
  for (let i = 0; i < def.fields.length; i += 1) values.push(normalizeValue(def.fields[i], body[def.fields[i]]))
  values.push(now, now)
  const quoted = columns.map((c) => '"' + c + '"').join(", ")
  const marks = columns.map(() => "?").join(", ")
  await db.prepare('INSERT INTO "' + collection + '" (' + quoted + ") VALUES (" + marks + ")").bind(...values).run()
  const saved = await db.prepare('SELECT * FROM "' + collection + '" WHERE "id" = ?').bind(id).all()
  const rows = Array.isArray(saved.results) ? saved.results : []
  if (rows.length === 0) return jsonResponse(500, { error: "create_failed", message: "写入后读不回记录" })
  return jsonResponse(200, rowToRecord(collection, def, rows[0]))
}

async function updateRecord(db: D1DatabaseLike, collection: string, def: CollectionDef, id: string, request: Request): Promise<Response> {
  const existing = await db.prepare('SELECT "id" FROM "' + collection + '" WHERE "id" = ?').bind(id).all()
  if (!Array.isArray(existing.results) || existing.results.length === 0) return jsonResponse(404, { error: "not_found" })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const sets: string[] = []
  const binds: Array<string | number> = []
  for (let i = 0; i < def.fields.length; i += 1) {
    const field = def.fields[i]
    if (!hasOwn(body, field)) continue
    sets.push('"' + field + '" = ?')
    binds.push(normalizeValue(field, body[field]))
  }
  sets.push('"updated" = ?')
  binds.push(new Date().toISOString())
  await db.prepare('UPDATE "' + collection + '" SET ' + sets.join(", ") + ' WHERE "id" = ?').bind(...binds, id).run()
  const saved = await db.prepare('SELECT * FROM "' + collection + '" WHERE "id" = ?').bind(id).all()
  const rows = Array.isArray(saved.results) ? saved.results : []
  if (rows.length === 0) return jsonResponse(404, { error: "not_found" })
  return jsonResponse(200, rowToRecord(collection, def, rows[0]))
}

async function deleteRecord(db: D1DatabaseLike, collection: string, id: string): Promise<Response> {
  const existing = await db.prepare('SELECT "id" FROM "' + collection + '" WHERE "id" = ?').bind(id).all()
  if (!Array.isArray(existing.results) || existing.results.length === 0) return jsonResponse(404, { error: "not_found" })
  await db.prepare('DELETE FROM "' + collection + '" WHERE "id" = ?').bind(id).run()
  return jsonResponse(200, { ok: true })
}

// —— 只读：索引仓库同步 ——

async function readIndexFile(env: Env, path: string, warnings: string[]): Promise<string> {
  const apiUrl =
    "https://api.github.com/repos/" + SYNC_OWNER + "/" + SYNC_REPO + "/contents/" + path + "?ref=" + SYNC_BRANCH
  try {
    const res = await fetchWithTimeout(apiUrl, { headers: githubHeaders(env, "application/vnd.github.raw") }, SYNC_TIMEOUT_MS)
    if (res.status === 200) return await res.text()
    if (res.status === 403 || res.status === 429) {
      warnings.push(path + "：官方接口本小时调用次数已用完，本次已改从镜像源读取（内容一致，可能有几分钟延迟）")
    }
  } catch {
    // 落到回退源
  }

  const cdnUrl = "https://cdn.jsdelivr.net/gh/" + SYNC_OWNER + "/" + SYNC_REPO + "@" + SYNC_BRANCH + "/" + path
  try {
    const res = await fetchWithTimeout(cdnUrl, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } }, SYNC_TIMEOUT_MS)
    if (res.status === 200) return await res.text()
  } catch {
    // 两个源都没取到，下面统一记 warning
  }

  warnings.push(path + "：两个数据源都没取到")
  return ""
}

async function syncState(env: Env): Promise<Response> {
  const warnings: string[] = []
  // 两个文件并行取：原先 PocketBase 版是串行的，这里没有网关 6 秒限制，并行更快。
  const texts = await Promise.all(SYNC_FILES.map((path) => readIndexFile(env, path, warnings)))

  let sources: unknown = []
  let mods: unknown = []
  let moderation: unknown = {}
  let publishedAt = ""

  const sourcesText = texts[0]
  if (sourcesText) {
    try {
      const parsed = JSON.parse(sourcesText) as { sources?: unknown }
      if (parsed && Array.isArray(parsed.sources) && parsed.sources.length) sources = parsed.sources
    } catch {
      warnings.push("sources.json 内容无法解析")
    }
  }

  const indexText = texts[1]
  if (indexText) {
    try {
      const parsed = JSON.parse(indexText) as { mods?: unknown; moderation?: unknown; publishedAt?: unknown }
      if (parsed && Array.isArray(parsed.mods) && parsed.mods.length) mods = parsed.mods
      if (parsed && parsed.moderation && typeof parsed.moderation === "object") moderation = parsed.moderation
      if (parsed && typeof parsed.publishedAt === "string") publishedAt = parsed.publishedAt
    } catch {
      warnings.push("mod-index.json 内容无法解析")
    }
  }

  return jsonResponse(200, {
    ok: true,
    repo: SYNC_OWNER + "/" + SYNC_REPO,
    branch: SYNC_BRANCH,
    budgetExhausted: false,
    sources: sources,
    mods: mods,
    moderation: moderation,
    publishedAt: publishedAt,
    warnings: warnings,
    fetchedAt: new Date().toISOString(),
  })
}

// —— 只读：来源仓库体检 ——

const SOURCE_RE = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/
const SLUG_RE = /^[A-Za-z0-9._-]{1,100}$/

async function inspectSources(env: Env, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { sources?: unknown }
  const raw = Array.isArray(body.sources) ? body.sources : []
  if (raw.length === 0) return jsonResponse(200, { ok: true, results: [], warnings: [] })

  const MAX_PER_CALL = 6
  const targets: string[] = []
  for (let i = 0; i < raw.length && targets.length < MAX_PER_CALL; i += 1) {
    const source = String(raw[i] || "").trim()
    if (!SOURCE_RE.test(source)) continue
    targets.push(source)
  }
  if (targets.length === 0) {
    return jsonResponse(200, { ok: true, results: [], warnings: ["没有合法的来源仓库地址"] })
  }

  const startedAt = Date.now()
  const rawHeaders = githubHeaders(env, "application/vnd.github.raw")
  const metaHeaders = githubHeaders(env, "application/vnd.github+json")
  const results: Array<Record<string, unknown>> = []
  const warnings: string[] = []
  let budgetExhausted = false

  for (let i = 0; i < targets.length; i += 1) {
    if (Date.now() - startedAt > INSPECT_BUDGET_MS) {
      budgetExhausted = true
      break
    }

    const source = targets[i]
    let manifest: unknown = null
    let repoAlive: boolean | null = null
    let status = 0
    let note = ""

    // 主路径：直接拉清单。清单拿到了就说明仓库在，省掉一次探测。
    const refs = ["main", "master"]
    for (let r = 0; r < refs.length && manifest === null; r += 1) {
      const leftMs = INSPECT_BUDGET_MS - (Date.now() - startedAt)
      if (leftMs < 500) {
        budgetExhausted = true
        break
      }
      try {
        const res = await fetchWithTimeout(
          "https://api.github.com/repos/" + source + "/contents/evejs-mod.json?ref=" + refs[r],
          { headers: rawHeaders },
          Math.max(1, Math.min(5, Math.floor(leftMs / 1000)) * 1000),
        )
        status = res.status
        if (res.status === 200) {
          const text = await res.text()
          try {
            manifest = JSON.parse(text)
            repoAlive = true
          } catch {
            note = "清单文件内容无法解析（不是合法 JSON）"
            repoAlive = true
          }
        } else if (res.status === 403 || res.status === 429) {
          note = "官方接口本小时调用次数已用完，稍后会自动重试"
          r = refs.length
        }
      } catch {
        status = 0
        note = "网络未取到结果，稍后会自动重试"
      }
    }

    // 清单没拿到时补一次仓库探测：区分「仓库没了」和「仓库在但没放清单文件」
    let metaLeftMs = INSPECT_BUDGET_MS - (Date.now() - startedAt)
    if (!budgetExhausted && metaLeftMs < 500) {
      budgetExhausted = true
      metaLeftMs = 500
    }
    if (!budgetExhausted && manifest === null && repoAlive === null && status !== 403 && status !== 429) {
      try {
        const meta = await fetchWithTimeout(
          "https://api.github.com/repos/" + source,
          { headers: metaHeaders },
          Math.max(1, Math.min(5, Math.floor(metaLeftMs / 1000)) * 1000),
        )
        if (meta.status === 200) {
          repoAlive = true
          if (!note) note = "仓库可访问，但没有找到 evejs-mod.json 清单文件"
        } else if (meta.status === 404) {
          repoAlive = false
          note = "仓库返回 404，来源已失联"
        } else {
          note = "仓库探测未取得确定结果（HTTP " + meta.status + "），保持原状态"
        }
      } catch {
        if (!note) note = "仓库探测未取得确定结果，保持原状态"
      }
    }

    results.push({ source: source, manifest: manifest, repoAlive: repoAlive, note: note })
  }

  if (budgetExhausted) warnings.push("本次体检超出时间预算，剩下的来源留给下一轮")
  return jsonResponse(200, { ok: true, results: results, warnings: warnings, budgetExhausted: budgetExhausted })
}

// —— 仓库巡检（唯一会写 repo_checks 的只读外部探测）——

async function inspectTick(env: Env, db: D1DatabaseLike, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown; targets?: unknown }
  let batch = parseInt(String(body.limit === undefined ? "" : body.limit), 10)
  if (!Number.isFinite(batch) || batch < 1) batch = 3
  if (batch > 8) batch = 8

  const startedAt = Date.now()
  const raw = Array.isArray(body.targets) ? body.targets : []
  const targets: Array<{ modId: string; modName: string; owner: string; name: string }> = []
  for (let i = 0; i < raw.length && targets.length < batch; i += 1) {
    const item = (raw[i] || {}) as Record<string, unknown>
    const owner = String(item.owner || "")
    const name = String(item.name || "")
    if (!SLUG_RE.test(owner) || !SLUG_RE.test(name)) continue
    targets.push({ modId: String(item.modId || ""), modName: String(item.modName || ""), owner: owner, name: name })
  }

  if (targets.length === 0) {
    return jsonResponse(200, { ok: true, checked: 0, offline: 0, undetermined: 0, rateLimited: false, budgetExhausted: false })
  }

  const probeHeaders = githubHeaders(env, "application/vnd.github+json")
  const stamp = new Date().toISOString()
  let checked = 0
  let offline = 0
  let undetermined = 0
  let rateLimited = false
  let budgetExhausted = false

  for (let i = 0; i < targets.length; i += 1) {
    if (Date.now() - startedAt > INSPECT_BUDGET_MS) {
      budgetExhausted = true
      break
    }

    const target = targets[i]
    let alive: boolean | null = null
    let detail = ""

    const remainingMs = INSPECT_BUDGET_MS - (Date.now() - startedAt)
    if (remainingMs < 500) {
      budgetExhausted = true
      break
    }

    try {
      const res = await fetchWithTimeout(
        "https://api.github.com/repos/" + target.owner + "/" + target.name,
        { headers: probeHeaders },
        Math.max(1, Math.min(5, Math.floor(remainingMs / 1000)) * 1000),
      )
      if (res.status === 200) {
        alive = true
        detail = "仓库可访问，Release 与包体仍在"
      } else if (res.status === 404) {
        alive = false
        detail = "仓库返回 404，已标记为失联"
      } else {
        if (res.status === 403 || res.status === 429) rateLimited = true
        detail = "巡检未取得确定结果（HTTP " + res.status + "），保持原状态"
      }
    } catch {
      detail = "巡检未取得确定结果，保持原状态"
    }

    if (alive === false) offline += 1

    // 只有「确定」的结果才写流水。若把限流 / 网络失败落成 alive=false，
    // 队列就会把好仓库标成「仓库失联」—— 不写行 = 保持上一次已知状态。
    if (alive === null) {
      undetermined += 1
      if (rateLimited) break
      continue
    }

    const now = new Date().toISOString()
    try {
      await db
        .prepare(
          'INSERT INTO "repo_checks" ("id", "mod_id", "mod_name", "repo_url", "alive", "detail", "checked_at", "created", "updated") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          newId(),
          target.modId,
          target.modName,
          "https://github.com/" + target.owner + "/" + target.name,
          alive === true ? 1 : 0,
          detail,
          stamp,
          now,
          now,
        )
        .run()
      checked += 1
    } catch {
      // 写失败不该让整轮巡检崩掉，如实少报一条
    }

    if (rateLimited) break
  }

  return jsonResponse(200, {
    ok: true,
    checked: checked,
    offline: offline,
    undetermined: undetermined,
    rateLimited: rateLimited,
    budgetExhausted: budgetExhausted,
  })
}

// —— 清空本地留档 ——

async function clearRecords(db: D1DatabaseLike, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { scopes?: unknown }
  const scopes = Array.isArray(body.scopes) ? body.scopes : []
  if (scopes.length === 0) {
    return jsonResponse(400, { error: "scopes_required", message: "没有指定要清空的范围", fingerprint: "scopes_required" })
  }

  // 只认这两个范围，绝不拿请求里的任意字符串当表名去删
  let wantLocal = false
  let wantChecks = false
  for (let i = 0; i < scopes.length; i += 1) {
    const scope = String(scopes[i] || "")
    if (scope === "local") wantLocal = true
    if (scope === "checks") wantChecks = true
  }
  if (!wantLocal && !wantChecks) {
    return jsonResponse(400, { error: "scopes_invalid", message: "清空范围不合法", fingerprint: "scopes_invalid" })
  }

  const localTables = ["review_records", "delete_records", "mod_decisions"]
  let local = 0
  let checks = 0

  if (wantLocal) {
    for (let i = 0; i < localTables.length; i += 1) {
      const table = localTables[i]
      if (!collectionDef(table)) continue
      const res = await db.prepare('DELETE FROM "' + table + '"').run()
      local += Number(res.meta && res.meta.changes ? res.meta.changes : 0)
    }
  }
  if (wantChecks) {
    const res = await db.prepare('DELETE FROM "repo_checks"').run()
    checks += Number(res.meta && res.meta.changes ? res.meta.changes : 0)
  }

  return jsonResponse(200, { ok: true, removed: { local: local, checks: checks } })
}

/**
 * 外部调度（GitHub Actions 定时任务等）用的共享令牌校验。
 * 没配 INDEX_SYNC_TOKEN 时恒为 false —— 「没配就等于关着」，不会意外放开写权限。
 */
async function indexSyncTokenOk(env: Env, request: Request): Promise<boolean> {
  const expected = String(env.INDEX_SYNC_TOKEN || "")
  if (!expected) return false
  const provided = String(request.headers.get("x-index-sync-token") || "")
  if (!provided) return false
  return constantTimeEqual(provided, expected)
}
// —— 审核结论同步进索引仓库 ——
//
// 零机器依赖的最后一环：以前「把审核结论写回索引仓库」要维护者在本机跑
// scripts/moderate.mjs + scripts/build-index.mjs 再 push。现在前半段（改写数据文件）
// 搬到这里，后半段（重建 + Ed25519 签名）由索引仓库自己的 GitHub Actions 完成，
// 私钥存在 Actions Secret 里 —— 维护者电脑全程不用开机。
//
// 语义与 scripts/moderate.mjs 严格对齐：
//   approve 收录通过 → 加进 sources.json，并撤销该来源的审核记录
//   reject  拒绝收录 → 写 moderation.json；来源级拒绝同时从 sources.json 移除
//   delist  下架     → 只写 moderation.json（条目留在索引里并标记 delisted）
//   restore 撤销     → 从 moderation.json 删掉该条记录
//
// 只重放「还没同步过」的决定（applied = 0）。不做整体重放：sources.json 是外部事实，
// 作者的提交本来就是以 PR 形式直接改进来的，整体重放会把没有 approve 决定的来源整片删掉。

const GITHUB_API = "https://api.github.com"
const INDEX_SOURCES_FILE = "sources.json"
const INDEX_MODERATION_FILE = "moderation.json"

type DecisionRow = {
  id?: unknown
  target?: unknown
  kind?: unknown
  action?: unknown
  reason_zh?: unknown
  reason_en?: unknown
  operator?: unknown
  decided_at?: unknown
}

type ModerationEntry = {
  target: string
  kind: string
  action: string
  reason: { zh: string; en: string }
  at: string
  by: string
}

type RepoFile = { ok: boolean; status: number; sha: string; json: Record<string, unknown> | null }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 索引仓库文件都是 UTF-8（moderation.json 里有中文），atob 出来是二进制串，必须再过一遍 TextDecoder */
function b64ToText(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** (target, kind) 唯一决定一条审核记录，大小写不敏感 —— 与 moderate.mjs 的去重口径一致 */
function entryKey(target: string, kind: string): string {
  return target.trim().toLowerCase() + "|" + kind
}

async function githubCall(
  env: Env,
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = { ...githubHeaders(env, "application/vnd.github+json") }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      SYNC_TIMEOUT_MS,
    )
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    return { ok: res.ok, status: res.status, data: data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

async function readIndexRepoFile(env: Env, file: string): Promise<RepoFile> {
  const url = GITHUB_API + "/repos/" + SYNC_OWNER + "/" + SYNC_REPO + "/contents/" + file + "?ref=" + SYNC_BRANCH
  const res = await githubCall(env, url, "GET")
  if (!res.ok || !isPlainObject(res.data)) return { ok: false, status: res.status, sha: "", json: null }
  const content = typeof res.data.content === "string" ? res.data.content : ""
  let json: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(b64ToText(content))
    if (isPlainObject(parsed)) json = parsed
  } catch {
    json = null
  }
  return { ok: json !== null, status: res.status, sha: String(res.data.sha || ""), json: json }
}

/** GitHub 报错时 body 里的 message 是最有用的线索（403 会直接说明缺哪个权限） */
function githubErrorText(data: unknown): string {
  if (isPlainObject(data) && typeof data.message === "string") return data.message
  return ""
}

type CommitResult = { ok: boolean; status: number; commit: string; stage: string; message: string }

/**
 * 一次提交写多个文件（Git Data API）：blob → tree → commit → 移分支。
 * 为什么不用 contents PUT 逐个文件写：拒绝收录要「同时」删来源 + 写审核理由，
 * 分两次提交会出现「来源没了但理由还没发布」的中间态。原子提交不给这个窗口。
 * trace 逐步记录 HTTP 结果：线上某一步出问题时，响应里就能看出卡在哪。
 */
async function commitIndexFilesOnce(
  env: Env,
  base: string,
  files: Array<{ path: string; text: string }>,
  message: string,
  trace: string[],
): Promise<CommitResult> {
  const fail = (stage: string, status: number, data?: unknown): CommitResult => {
    const detail = githubErrorText(data)
    trace.push(stage + " → HTTP " + status + (detail ? " " + detail : ""))
    return { ok: false, status: status, commit: "", stage: stage, message: detail }
  }

  const refRes = await githubCall(env, base + "/git/ref/heads/" + SYNC_BRANCH, "GET")
  if (!refRes.ok || !isPlainObject(refRes.data) || !isPlainObject(refRes.data.object)) {
    return fail("ref-read", refRes.status, refRes.data)
  }
  const headSha = String(refRes.data.object.sha || "")

  const headRes = await githubCall(env, base + "/git/commits/" + headSha, "GET")
  if (!headRes.ok || !isPlainObject(headRes.data)) return fail("head-read", headRes.status, headRes.data)
  const headTree = isPlainObject(headRes.data.tree) ? String(headRes.data.tree.sha || "") : ""

  const tree: Array<{ path: string; mode: string; type: string; sha: string }> = []
  for (let i = 0; i < files.length; i += 1) {
    const blob = await githubCall(env, base + "/git/blobs", "POST", {
      content: files[i].text,
      encoding: "utf-8",
    })
    if (!blob.ok || !isPlainObject(blob.data)) return fail("blob:" + files[i].path, blob.status, blob.data)
    tree.push({ path: files[i].path, mode: "100644", type: "blob", sha: String(blob.data.sha || "") })
  }

  const treeRes = await githubCall(env, base + "/git/trees", "POST", { base_tree: headTree, tree: tree })
  if (!treeRes.ok || !isPlainObject(treeRes.data)) return fail("tree", treeRes.status, treeRes.data)
  const newTree = String(treeRes.data.sha || "")

  const commitRes = await githubCall(env, base + "/git/commits", "POST", {
    message: message,
    tree: newTree,
    parents: [headSha],
  })
  if (!commitRes.ok || !isPlainObject(commitRes.data)) return fail("commit", commitRes.status, commitRes.data)
  const newCommit = String(commitRes.data.sha || "")

  const refUpdate = await githubCall(env, base + "/git/refs/heads/" + SYNC_BRANCH, "PATCH", {
    sha: newCommit,
    force: false,
  })
  if (!refUpdate.ok) return fail("ref-update", refUpdate.status, refUpdate.data)
  trace.push("ok → " + newCommit.slice(0, 10))
  return { ok: true, status: 200, commit: newCommit, stage: "done", message: "" }
}

/**
 * 抢分支头失败（409/422）说明有别的提交先落地了：重读一次 head 再推一遍。
 * 要写的内容没变，所以整体重试是安全的。
 */
async function commitIndexFiles(
  env: Env,
  files: Array<{ path: string; text: string }>,
  message: string,
  trace: string[],
): Promise<CommitResult> {
  const base = GITHUB_API + "/repos/" + SYNC_OWNER + "/" + SYNC_REPO
  let last: CommitResult = { ok: false, status: 0, commit: "", stage: "init", message: "" }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await commitIndexFilesOnce(env, base, files, message, trace)
    if (last.ok) return last
    if (last.stage !== "ref-update" || (last.status !== 409 && last.status !== 422)) return last
  }
  return last
}

async function indexSync(env: Env, db: D1DatabaseLike, request: Request): Promise<Response> {
  // 未捕获异常在 Cloudflare 上只会变成一张没有线索的 502 报错页。
  // 这个端点只有管理员会话或共享令牌进得来，所以直接把原因回给调用方。
  try {
    return await indexSyncInner(env, db, request)
  } catch (err) {
    const e = err as { message?: string; stack?: string }
    return jsonResponse(500, {
      error: "index_sync_crashed",
      message: String((e && e.message) || err),
      detail: String((e && e.stack) || ""),
    })
  }
}

async function indexSyncInner(env: Env, db: D1DatabaseLike, request: Request): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as { dryRun?: unknown }
  const dryRun = raw.dryRun === true

  if (!String(env.GITHUB_TOKEN || "")) {
    return jsonResponse(500, {
      error: "github_token_missing",
      message: "部署缺少 GITHUB_TOKEN，无法写入索引仓库",
    })
  }

  const rows = await db
    .prepare('SELECT * FROM "mod_decisions" WHERE COALESCE(applied, 0) = 0 ORDER BY decided_at ASC, id ASC')
    .all()
  const decisions = (rows.results || []) as DecisionRow[]
  if (decisions.length === 0) {
    return jsonResponse(200, { ok: true, pending: 0, applied: 0, changed: [], notes: ["没有待同步的审核决定"] })
  }

  const sourcesFile = await readIndexRepoFile(env, INDEX_SOURCES_FILE)
  const moderationFile = await readIndexRepoFile(env, INDEX_MODERATION_FILE)
  if (!sourcesFile.ok || !moderationFile.ok) {
    return jsonResponse(502, {
      error: "index_file_unreadable",
      message: "读不到索引仓库的 sources.json / moderation.json",
      detail: { sources: sourcesFile.status, moderation: moderationFile.status },
    })
  }

  const sourcesData = sourcesFile.json as Record<string, unknown>
  const moderationData = moderationFile.json as Record<string, unknown>

  let list: string[] = Array.isArray(sourcesData.sources)
    ? sourcesData.sources
        .filter((x: unknown): x is string => typeof x === "string")
        .map((x: string) => x.trim())
        .filter((x: string) => x.length > 0)
    : []

  let entries: ModerationEntry[] = []
  if (Array.isArray(moderationData.entries)) {
    for (const item of moderationData.entries) {
      if (!isPlainObject(item) || typeof item.target !== "string") continue
      const reason = isPlainObject(item.reason) ? item.reason : {}
      entries.push({
        target: item.target,
        kind: typeof item.kind === "string" && item.kind ? item.kind : "id",
        action: typeof item.action === "string" ? item.action : "",
        reason: {
          zh: typeof reason.zh === "string" ? reason.zh : "",
          en: typeof reason.en === "string" ? reason.en : "",
        },
        at: typeof item.at === "string" ? item.at : "",
        by: typeof item.by === "string" ? item.by : "",
      })
    }
  }

  const notes: string[] = []
  const appliedIds: string[] = []
  const trace: string[] = []
  let lastAt = ""
  // 重放前先留一份快照：只有 entries 真的变了才允许动 updatedAt，
  // 否则「当前时间 ≠ 仓库里的时间」会让每次同步都凭空多出一次提交
  const entriesBefore = JSON.stringify(entries)

  for (let i = 0; i < decisions.length; i += 1) {
    const d = decisions[i]
    const target = String(d.target === undefined ? "" : d.target).trim()
    const action = String(d.action === undefined ? "" : d.action).trim()
    if (!target || !action) {
      notes.push("跳过无效决定 id=" + String(d.id === undefined ? "?" : d.id))
      continue
    }
    const rawKind = String(d.kind === undefined ? "" : d.kind)
    const kind = rawKind === "source" || rawKind === "id" ? rawKind : target.includes("/") ? "source" : "id"
    const at = String(d.decided_at === undefined ? "" : d.decided_at) || new Date().toISOString()
    const by = String(d.operator === undefined ? "" : d.operator) || "diguo520"
    const key = entryKey(target, kind)

    if (action === "approve") {
      if (!list.some((x) => x.toLowerCase() === target.toLowerCase())) list.push(target)
      entries = entries.filter((e) => entryKey(e.target, e.kind) !== key)
    } else if (action === "reject" || action === "delist") {
      const zh =
        String(d.reason_zh === undefined ? "" : d.reason_zh).trim() ||
        (action === "reject" ? "不符合收录要求" : "已下架")
      const en = String(d.reason_en === undefined ? "" : d.reason_en).trim() || zh
      entries = entries.filter((e) => entryKey(e.target, e.kind) !== key)
      entries.push({ target: target, kind: kind, action: action, reason: { zh: zh, en: en }, at: at, by: by })
      if (action === "reject" && kind === "source") {
        const before = list.length
        list = list.filter((x) => x.toLowerCase() !== target.toLowerCase())
        if (list.length !== before) notes.push("已从 sources.json 移除被拒绝的来源 " + target)
      }
    } else if (action === "restore") {
      entries = entries.filter((e) => entryKey(e.target, e.kind) !== key)
    } else {
      notes.push("未知动作「" + action + "」（target=" + target + "），已跳过")
      continue
    }

    if (at > lastAt) lastAt = at
    appliedIds.push(String(d.id === undefined ? "" : d.id))
  }

  // 序列化口径与 scripts/moderate.mjs 一致：2 空格缩进 + 结尾换行，diff 才不会整片翻红
  const newSources: Record<string, unknown> = { ...sourcesData, schemaVersion: 1, sources: list }
  const newModeration: Record<string, unknown> = { ...moderationData, schemaVersion: 1, entries: entries }
  // 与 scripts/moderate.mjs 同口径：只有审核记录真的变了才刷新 updatedAt
  if (JSON.stringify(entries) !== entriesBefore) {
    newModeration.updatedAt = lastAt || new Date().toISOString()
  }

  const changed: string[] = []
  if (JSON.stringify(newSources) !== JSON.stringify(sourcesData)) changed.push(INDEX_SOURCES_FILE)
  if (JSON.stringify(newModeration) !== JSON.stringify(moderationData)) changed.push(INDEX_MODERATION_FILE)

  if (dryRun) {
    return jsonResponse(200, {
      ok: true,
      dryRun: true,
      pending: decisions.length,
      wouldApply: appliedIds.length,
      changed: changed,
      notes: notes,
    })
  }

  let commit = ""
  if (changed.length > 0) {
    const files: Array<{ path: string; text: string }> = []
    for (const name of changed) {
      const value = name === INDEX_SOURCES_FILE ? newSources : newModeration
      files.push({ path: name, text: JSON.stringify(value, null, 2) + "\n" })
    }
    const written = await commitIndexFiles(
      env,
      files,
      "chore(index): 审核结论同步（" + appliedIds.length + " 条决定：" + changed.join("、") + "）",
      trace,
    )
    if (!written.ok) {
      return jsonResponse(502, {
        error: "index_commit_failed",
        message: "写入索引仓库失败（HTTP " + written.status + "），决定保持未同步，下次会重试",
        stage: written.stage,
        detail: written.message,
        trace: trace,
        changed: changed,
      })
    }
    commit = written.commit
  } else {
    notes.push("索引仓库数据与决定一致，无需提交")
  }

  // 先提交再标记：中途失败时决定仍是 applied=0，下次重放一遍即可（重放幂等）。
  // 提交已经落地，所以这一步出错不能报成「提交失败」，只能如实分开说
  const stamp = new Date().toISOString()
  let stampError = ""
  for (const id of appliedIds) {
    if (!id) continue
    try {
      await db.prepare('UPDATE "mod_decisions" SET applied = 1, updated = ? WHERE id = ?').bind(stamp, id).run()
    } catch (err) {
      stampError = String((err as Error).message || err)
      break
    }
  }
  if (stampError) notes.push("索引已提交，但标记决定状态失败：" + stampError)

  return jsonResponse(200, {
    ok: true,
    pending: decisions.length,
    applied: appliedIds.length,
    changed: changed,
    commit: commit,
    notes: notes,
    stampError: stampError,
  })
}

// —— 路由 ——

export async function onRequest(context: FunctionContext): Promise<Response> {
  const { request, env, params } = context

  // 鉴权先于一切：Worker 只认自己的管理员会话 Cookie（定时/外部调度可用共享令牌，
  // 且只对 api/index/sync 生效），其余情况一律 401 —— 顺带也不会泄漏
  // 「有没有配 DB / GITHUB_TOKEN」这类部署状态。
  const earlyPath = (Array.isArray(params.path) ? params.path : params.path ? [params.path] : [])
    .join("/")
    .replace(/^\/+|\/+$/g, "")

  const userId = await sessionUserId(env, readCookie(request, COOKIE_NAME))
  const schedulerOk = earlyPath === "api/index/sync" && (await indexSyncTokenOk(env, request))
  if (!userId && !schedulerOk) {
    return jsonResponse(401, { error: "admin_login_required", message: "请先登录管理员账号" })
  }

  const db = env.DB
  if (!db || typeof db.prepare !== "function") {
    return jsonResponse(500, {
      error: "d1_missing",
      message: "部署缺少 DB 绑定（D1），请在 Pages 项目设置里绑定数据库",
    })
  }

  const method = request.method.toUpperCase()
  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
  const path = segments.join("/").replace(/^\/+|\/+$/g, "")
  const url = new URL(request.url)

  if (path === "api/mod-sync/state") {
    if (method !== "GET") return methodNotAllowed(method)
    return syncState(env)
  }
  if (path === "api/mod-source/inspect") {
    if (method !== "POST") return methodNotAllowed(method)
    return inspectSources(env, request)
  }
  if (path === "api/mod-inspect/tick") {
    if (method !== "POST") return methodNotAllowed(method)
    return inspectTick(env, db, request)
  }
  if (path === "api/index/sync") {
    if (method !== "POST") return methodNotAllowed(method)
    return indexSync(env, db, request)
  }
  if (path === "api/mod-records/clear") {
    if (method !== "POST") return methodNotAllowed(method)
    return clearRecords(db, request)
  }

  const parts = path.split("/").filter((s) => s.length > 0)
  if (parts[0] === "api" && parts.length >= 2) {
    const def = collectionDef(parts[1])
    if (!def) return jsonResponse(404, { error: "not_found" })
    const collection = parts[1]
    const id = parts.length >= 3 ? decodeURIComponent(parts.slice(2).join("/")) : ""

    if (!id) {
      if (method === "GET") return listRecords(env, db, collection, def, url)
      if (method === "POST") return createRecord(env, db, collection, def, request)
      return methodNotAllowed(method)
    }
    if (method === "GET") return getRecord(db, collection, def, id)
    if (method === "PATCH") return updateRecord(db, collection, def, id, request)
    if (method === "DELETE") return deleteRecord(db, collection, id)
    return methodNotAllowed(method)
  }

  return jsonResponse(404, { error: "not_found" })
}