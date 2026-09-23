import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { getAuthHeaders } from "@/lib/auth"
import { getSessionUser } from "@/lib/session"

/* ------------------------------------------------------------------ *
 * 类型（服务端 / PocketBase 字段名 100% 跟后端一致，snake_case）
 * ------------------------------------------------------------------ */

export type CheckStatus = "pass" | "warn" | "fail"
export type ReviewMode = "auto" | "manual"
/** 队列状态：待收录 / 已上架 / 未通过 / 已下架 */
export type QueueStatus = "pending" | "published" | "rejected" | "delisted"
/** 审核动作：收录通过 / 拒绝收录 / 下架 / 恢复上架 / 删除 */
export type DecisionAction = "approve" | "reject" | "delist" | "restore" | "delete"
/** 能落到 mod_decisions 的动作：删除不写决定，只写留档 */
export type DecisionWriteAction = Exclude<DecisionAction, "delete">
/** 问题筛选：按体检结论挑条目 —— 大规模审核时先处理这三类最要紧 */
export type QueueIssueFilter = "warn" | "fail" | "offline"
/**
 * 队列筛选：状态 + 问题 + 全部 + 已删除留档。
 * deleted 是只读回收站视图：条目已经退出工作队列，只在这里回溯。
 */
export type QueueFilter = "all" | "deleted" | QueueStatus | QueueIssueFilter

export interface CheckItem {
  key: string
  label: string
  status: CheckStatus
  reason: string
}

export interface DownloadUrl {
  mirror: string
  url: string
  priority: number
}

/** GET /api/mod-sync/state 返回的索引仓库模组（字段可能缺失） */
export interface SyncMod {
  id?: string
  displayName?: string
  version?: string
  author?: { id?: string; name?: string; keyId?: string }
  description?: string
  category?: string
  tags?: string[]
  sizeBytes?: number
  sha256?: string
  downloadUrls?: Array<{ mirror?: string; url?: string; priority?: number }>
  changelog?: string
  repo?: string
  delisted?: boolean
  publishedAt?: string
  source?: string
  downloads?: number
}

export interface SyncModeration {
  id?: string
  source?: string
  authorId?: string
  action?: string
  reason?: { zh?: string; en?: string }
  at?: string
  by?: string
}

export interface SyncState {
  ok?: boolean
  repo?: string
  branch?: string
  sources?: string[]
  mods?: SyncMod[]
  moderation?: Record<string, SyncModeration>
  publishedAt?: string
  warnings?: string[]
  fetchedAt?: string
}

/** POST /api/mod-source/inspect 的单条结果 */
export interface SourceInspectResult {
  source?: string
  /** 来源仓库里 evejs-mod.json 的原文，字段与 SyncMod 一致；取不到时为 null */
  manifest?: SyncMod | null
  /** true = 仓库可访问；false = 仓库 404；null = 额度用尽或网络失败，绝不能当成失联 */
  repoAlive?: boolean | null
  /** 服务端给的人类可读说明，必须原样展示 */
  note?: string
}

export interface SourceInspectResponse {
  ok?: boolean
  results?: SourceInspectResult[]
  warnings?: string[]
  budgetExhausted?: boolean
}

export type SourceInspectStatus = "idle" | "loading" | "done" | "failed"

/** 会话内缓存的来源体检结果，key 为 owner/repo */
export interface SourceInspection {
  source: string
  manifest: SyncMod | null
  repoAlive: boolean | null
  note: string
  status: Exclude<SourceInspectStatus, "idle">
  /** 最近一次体检时间戳，用于「最久没体检过的优先」 */
  at: number
}

/** 队列条目：信息不全的条目字段为空串 / 0，展示时统一显示「—」 */
export interface QueueItem {
  key: string
  /** 审核决定的落点：优先 source（含 / 为 source 类），否则 mod id */
  target: string
  kind: "source" | "id"
  modId: string
  source: string
  displayName: string
  version: string
  category: string
  tags: string[]
  authorId: string
  authorName: string
  authorKeyId: string
  description: string
  changelog: string
  repo: string
  sizeBytes: number
  sha256: string
  downloadUrls: DownloadUrl[]
  downloads: number
  publishedAt: string
  /** 索引仓库给出的原始状态 */
  baseStatus: QueueStatus
  /** 叠加本地 / 已存决定后的展示状态 */
  status: QueueStatus
  decisionAction: string
  reason: string
  checks: CheckItem[]
  /** 是否来自索引仓库的完整条目（false = 只有 id / source 的残缺条目） */
  complete: boolean
  repoAlive: boolean | null
  lastCheckAt: string
  /** 已被单独删除：删除后的条目退出工作队列，只在「已删除 / 全部」里留档查看 */
  deleted: boolean
  /** 删除留档的理由与时间 */
  deletedReason: string
  deletedAt: string
  /** 资料是否来自来源仓库的清单文件（该来源尚未收录进索引） */
  manifestFromSource: boolean
  /** 来源体检状态：idle = 本次会话还没体检过 */
  inspectStatus: SourceInspectStatus
  /** 服务端体检说明，原样展示给维护者 */
  inspectNote: string
}

/** /api/mod_decisions 行 */
export interface ModDecision {
  id: string
  target: string
  kind: string
  action: string
  reason_zh: string
  reason_en: string
  operator: string
  decided_at: string
  applied: boolean
  created?: string
}

export interface ReviewRecord {
  id: string
  mod_id: string
  mod_name: string
  action: string
  reason: string
  mode: string
  operator: string
  acted_at: string
  created: string
  /** 记录来源：repo = 索引仓库里已经生效的审核结果；local = 本机流水（导出重建索引后才生效） */
  origin?: "repo" | "local"
  /** 索引仓库里的原始动作名，映射成展示用动作后仍保留，不丢信息 */
  raw_action?: string
}

export interface DeleteRecord {
  id: string
  mod_id: string
  mod_name: string
  reason: string
  operator: string
  deleted_at: string
  /** 产生这条记录的动因：拒绝收录（reject）or 下架（delist）；老数据为空串按下架处理 */
  action_kind: string
  created: string
}

export interface RepoCheck {
  id: string
  mod_id: string
  mod_name: string
  repo_url: string
  alive: boolean
  detail: string
  checked_at: string
  created: string
}

export interface QueueStats {
  total: number
  pending: number
  published: number
  rejected: number
  delisted: number
  warn: number
  fail: number
  offline: number
  autoEligible: number
  /** 已删除留档的条数（不参与工作队列统计） */
  deleted: number
}

export interface HomeToast {
  kind: "ok" | "error"
  text: string
}

/** 批量操作的进度：面板据此显示「处理中 3 / 12」 */
export interface BulkProgress {
  action: DecisionAction
  label: string
  done: number
  total: number
}

/* ------------------------------------------------------------------ *
 * 展示用常量 / 纯函数（组件共用）
 * ------------------------------------------------------------------ */

export const CHECK_LABELS: Record<string, string> = {
  repo_ownership: "仓库归属：repo 指向 source 这个仓库",
  manifest_completeness: "manifest 字段完整",
  zip_in_author_release: "包体位于作者自己的 Release",
  category_valid: "分类属于允许清单",
  id_unique: "mod id 在索引里唯一",
  key_binding: "author.keyId 与作者绑定一致",
}

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  pending: "待收录",
  published: "已上架",
  rejected: "未通过",
  delisted: "已下架",
}

export interface QueueFilterOption {
  value: QueueFilter
  label: string
  hint: string
  /** 问题筛选（警告 / 不通过 / 失联）用醒目色标记，避免在大批量队列里被漏看 */
  tone: "default" | "warn" | "danger" | "muted"
}

export const QUEUE_FILTERS: QueueFilterOption[] = [
  { value: "pending", label: "待收录", hint: "在收录名单里、索引仓库还没有的条目", tone: "default" },
  { value: "warn", label: "有警告", hint: "自动检查有需留意项，无人值守不会收录", tone: "warn" },
  { value: "fail", label: "检查不通过", hint: "存在硬性检查失败项，建议拒绝收录", tone: "danger" },
  { value: "offline", label: "仓库失联", hint: "巡检找不到对应仓库，需要人工确认", tone: "danger" },
  { value: "published", label: "已上架", hint: "已收录并在索引里生效", tone: "default" },
  { value: "rejected", label: "未通过", hint: "已被拒绝收录，作者修正后可重新提交", tone: "default" },
  { value: "delisted", label: "已下架", hint: "索引保留但已标记下架", tone: "muted" },
  { value: "deleted", label: "已删除", hint: "已单独删除并留档，这里只做回溯", tone: "muted" },
  { value: "all", label: "全部", hint: "工作队列全部条目（含已删除留档）", tone: "default" },
]

export const QUICK_REJECT_REASONS = [
  "仓库不属于作者",
  "manifest 字段缺失",
  "sha256 不合法",
  "ZIP 不在作者 Release",
  "分类非法",
  "id 已被占用",
  "密钥与 author.id 不一致",
]

/** 索引仓库允许的分类（英文为规范名，中文为仓库里实际使用的写法） */
export const CATEGORY_ALLOWLIST = [
  "Gameplay",
  "Economy",
  "AI",
  "Visuals",
  "Tools",
  "玩法",
  "经济",
  "视觉",
  "工具",
]

export const ACTION_LABELS: Record<string, string> = {
  auto_approve: "无人值守自动收录",
  approve: "收录通过",
  reject: "拒绝收录",
  delist: "下架",
  restore: "恢复上架",
  delete: "删除",
}

export const ACTION_KIND_LABELS: Record<string, string> = {
  reject: "拒绝收录",
  delist: "已下架",
  delete: "已删除",
}

export const DECISION_ACTIONS: Array<{ value: DecisionAction; label: string; hint: string }> = [
  { value: "approve", label: "收录通过", hint: "确认收录这条来源" },
  { value: "reject", label: "拒绝收录", hint: "必填理由，并从收录名单移除" },
  { value: "delist", label: "下架", hint: "必填理由，索引保留但标记为已下架" },
  { value: "restore", label: "恢复上架", hint: "撤销之前对该条目的审核结果" },
  { value: "delete", label: "删除", hint: "必填理由：未上架可直接删除，已上架必须先下架" },
]

export function summarizeChecks(items: CheckItem[] | null): CheckStatus {
  const list = Array.isArray(items) ? items : []
  if (list.some((i) => i.status === "fail")) return "fail"
  if (list.some((i) => i.status === "warn")) return "warn"
  return "pass"
}

export function checkCounts(items: CheckItem[] | null) {
  const list = Array.isArray(items) ? items : []
  return {
    pass: list.filter((i) => i.status === "pass").length,
    warn: list.filter((i) => i.status === "warn").length,
    fail: list.filter((i) => i.status === "fail").length,
    total: list.length,
  }
}

/**
 * 单个筛选条件是否命中。
 * 问题筛选（有警告 / 检查不通过 / 仓库失联）与队列概览里的口径完全一致，
 * 否则「概览说有 12 条不通过、点进去却筛出 9 条」会让人不敢信这套数字。
 */
export function matchesQueueFilter(item: QueueItem, filter: QueueFilter): boolean {
  switch (filter) {
    case "all":
    case "deleted":
      return true
    case "warn":
      return item.checks.length > 0 && summarizeChecks(item.checks) === "warn"
    case "fail":
      return item.checks.length > 0 && summarizeChecks(item.checks) === "fail"
    case "offline":
      return item.repoAlive === false
    default:
      return item.status === filter
  }
}

export function countQueueFilter(items: QueueItem[], filter: QueueFilter): number {
  return items.filter((item) => matchesQueueFilter(item, filter)).length
}

/** 批量操作里必须写明理由的动作：拒绝收录 / 下架 / 删除都要留档 */
export const BULK_REASON_REQUIRED: DecisionAction[] = ["reject", "delist", "delete"]

/**
 * 批量操作的前置条件。
 * 单条审核允许维护者自行判断，批量则必须挡住明显不该动的条目：
 * - 收录通过：只作用于「待收录」（未通过是明确拒过的，已上架无需再收）
 * - 拒绝收录：只作用于「待收录 / 未通过」（已上架的不能整批从索引里抹掉）
 * - 下架：作用于「已上架 / 待收录」（待收录按清理处理，与「清理失联」一致）
 * - 恢复上架：只作用于存在审核结果的条目
 * - 删除：已上架的一律跳过，必须先下架
 */
export function bulkActionAllowed(item: QueueItem, action: DecisionAction): boolean {
  if (item.deleted) return false
  switch (action) {
    case "approve":
      return item.status === "pending"
    case "reject":
      return item.status === "pending" || item.status === "rejected"
    case "delist":
      return item.status === "published" || item.status === "pending"
    case "restore":
      return (
        item.decisionAction === "reject" ||
        item.decisionAction === "delist" ||
        item.baseStatus === "delisted"
      )
    case "delete":
      return item.status !== "published"
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelative(iso: string): string {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const diff = Date.now() - t
  if (diff < 60_000) return "刚刚"
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

/* ------------------------------------------------------------------ *
 * 内部工具
 * ------------------------------------------------------------------ */

const MODE_STORAGE_KEY = "evejs-review-mode"
const SYNC_CACHE_MS = 10 * 60 * 1000
const INSPECT_INTERVAL_MS = 15 * 60 * 1000
const INSPECT_BATCH_LIMIT = 3
/** 服务端一次最多处理 6 个来源，多余的会被丢掉 */
const SOURCE_INSPECT_BATCH = 6
/** 自动轮转体检每轮最多查 3 个来源，避免打满接口额度 */
const AUTO_SOURCE_BATCH = 3
/**
 * 两轮自动体检之间的间隔。目标站未登录接口按出口 IP 限流（约 60 次/小时），
 * 巡检本身就要占掉一部分，所以体检不能连着冲：3 个 / 5 分钟 ≈ 36 次/小时，
 * 加上巡检 15 分钟一轮（3 个 ≈ 12 次/小时），整小时大约 48 次，留出余量。
 * 来源上千个时一轮走不完，会跨会话接着轮转，这是预期行为。
 */
const SOURCE_ROTATE_INTERVAL_MS = 5 * 60 * 1000
/** 第一轮体检不用等，打开页面就该看到结果 */
const AUTO_SOURCE_FIRST_DELAY_MS = 900
/** 撞上限流后整体歇多久再试，避免把额度反复打空 */
const API_COOLDOWN_MS = 30 * 60 * 1000
/** 服务端说明文案里出现这些字样，就说明是额度问题而不是仓库问题 */
const RATE_LIMIT_HINTS = ["调用次数已用完", "额度用尽", "rate limit"]
const QUEUE_PAGE_SIZE = 50
const SHA256_RE = /^[0-9a-f]{64}$/i

/** 一批体检结果里有没有「额度用尽」这类说明 —— 有就说明该整体歇一会儿了 */
function hasRateLimitNote(rows: Record<string, SourceInspection>): boolean {
  for (const row of Object.values(rows)) {
    const note = (row?.note || "").toLowerCase()
    if (!note) continue
    if (RATE_LIMIT_HINTS.some((hint) => note.includes(hint.toLowerCase()))) return true
  }
  return false
}

/** 服务端巡检批次返回结构 */
interface InspectTickResult {
  ok?: boolean
  checked?: number
  offline?: number
  /** 本轮没拿到确定结果的条数（限流或网络失败时会出现，这类条目不会再写失联记录） */
  undetermined?: number
  rateLimited?: boolean
}

interface ListResponse<T> {
  items?: T[]
}

/** 同一标签页 2 分钟内不重复拉取索引仓库数据（接口有每小时额度限制） */
let syncCache: { at: number; data: SyncState } | null = null

function readStoredMode(): ReviewMode {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY)
    if (raw === "auto" || raw === "manual") return raw
  } catch {
    /* localStorage 不可用时退回默认 */
  }
  return "manual"
}

function currentOperator(): string {
  try {
    const user = getSessionUser()
    if (user && (user.displayName || user.userId)) return user.displayName || user.userId
  } catch {
    /* 未登录 / 解析失败时退回匿名标识 */
  }
  return "moderator"
}

function nowIso(): string {
  return new Date().toISOString()
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getPocketBaseUrl()}${path}`, {
    headers: { ...getAuthHeaders() },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

async function apiSend<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(`${getPocketBaseUrl()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/** 归一化仓库地址，便于和 source（owner/repo）比较 */
function normRepo(url: string): string {
  return (url || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
}

function check(key: string, status: CheckStatus, reason = ""): CheckItem {
  return { key, label: CHECK_LABELS[key] ?? key, status, reason }
}

/** 逐项自动检查：完全基于索引仓库的真实字段 */
function buildChecks(
  mod: SyncMod,
  idCounts: Map<string, number>,
  keyIdsByAuthor: Map<string, Set<string>>,
): CheckItem[] {
  const items: CheckItem[] = []
  const repo = normRepo(mod.repo || "")
  const source = (mod.source || "").trim().toLowerCase()

  // 1 仓库归属：repo 是否指向 source 这个仓库
  if (!repo) {
    items.push(check("repo_ownership", "fail", "索引里没有仓库地址"))
  } else if (source && !repo.endsWith(source)) {
    items.push(
      check("repo_ownership", "fail", `仓库 ${repo} 与来源 ${mod.source} 不是同一个仓库`),
    )
  } else {
    items.push(check("repo_ownership", "pass"))
  }

  // 2 manifest 完整性
  const missing: string[] = []
  if (!mod.id) missing.push("id")
  if (!mod.displayName) missing.push("displayName")
  if (!mod.version) missing.push("version")
  if (!mod.author?.id) missing.push("author.id")
  if (!mod.author?.name) missing.push("author.name")
  if (!mod.author?.keyId) missing.push("author.keyId")
  if (!(Number(mod.sizeBytes) > 0)) missing.push("sizeBytes")
  if (!SHA256_RE.test(mod.sha256 || "")) missing.push("sha256（64 位十六进制）")
  if (!Array.isArray(mod.downloadUrls) || mod.downloadUrls.length === 0) {
    missing.push("downloadUrls[]")
  }
  items.push(
    missing.length > 0
      ? check("manifest_completeness", "fail", `缺少 ${missing.join(" / ")}`)
      : check("manifest_completeness", "pass"),
  )

  // 3 包体位置：索引仓库不存二进制，包体必须在作者自己的 Release 下
  const urls = Array.isArray(mod.downloadUrls) ? mod.downloadUrls : []
  const offRelease = urls.filter((u) => !(u?.url || "").includes("/releases/download/"))
  if (urls.length === 0) {
    items.push(check("zip_in_author_release", "warn", "没有下载地址，索引仓库不存二进制包"))
  } else if (offRelease.length > 0) {
    items.push(
      check(
        "zip_in_author_release",
        "warn",
        `${offRelease.length} 个下载地址不在 Release 下：${offRelease.map((u) => u.url).join("、")}`,
      ),
    )
  } else {
    items.push(check("zip_in_author_release", "pass"))
  }

  // 4 分类允许清单
  const category = (mod.category || "").trim()
  if (!category) {
    items.push(check("category_valid", "warn", "索引里没有填写分类"))
  } else if (!CATEGORY_ALLOWLIST.includes(category)) {
    items.push(
      check(
        "category_valid",
        "fail",
        `分类「${category}」不在允许清单（${CATEGORY_ALLOWLIST.slice(0, 5).join(" / ")}）`,
      ),
    )
  } else {
    items.push(check("category_valid", "pass"))
  }

  // 5 id 唯一
  const dup = idCounts.get(mod.id || "") || 0
  items.push(
    dup > 1
      ? check("id_unique", "fail", `同一个 id 在索引里出现了 ${dup} 次`)
      : check("id_unique", "pass"),
  )

  // 6 密钥绑定
  const authorId = mod.author?.id || ""
  const keyId = mod.author?.keyId || ""
  if (!keyId) {
    items.push(check("key_binding", "warn", "作者没有绑定密钥（缺少 author.keyId）"))
  } else {
    const keys = keyIdsByAuthor.get(authorId)
    if (keys && keys.size > 1) {
      items.push(
        check("key_binding", "fail", `同一作者 ${authorId} 绑定了多个密钥：${Array.from(keys).join(" / ")}`),
      )
    } else {
      items.push(check("key_binding", "pass"))
    }
  }

  return items
}

function emptyItem(): Omit<
  QueueItem,
  "key" | "target" | "kind" | "baseStatus" | "status" | "decisionAction" | "reason" | "checks" | "complete" | "deleted" | "deletedReason" | "deletedAt"
> {
  return {
    modId: "",
    source: "",
    displayName: "",
    version: "",
    category: "",
    tags: [],
    authorId: "",
    authorName: "",
    authorKeyId: "",
    description: "",
    changelog: "",
    repo: "",
    sizeBytes: 0,
    sha256: "",
    downloadUrls: [],
    downloads: 0,
    publishedAt: "",
    repoAlive: null,
    lastCheckAt: "",
    manifestFromSource: false,
    inspectStatus: "idle",
    inspectNote: "",
  }
}

function toQueueItem(
  mod: SyncMod,
  status: QueueStatus,
  checks: CheckItem[],
  repoCheck: RepoCheck | null,
): QueueItem {
  const source = mod.source || ""
  const id = mod.id || ""
  const target = source || id
  return {
    ...emptyItem(),
    key: `mod:${id || source}`,
    target,
    kind: target.includes("/") ? "source" : "id",
    modId: id,
    source,
    displayName: mod.displayName || "",
    version: mod.version || "",
    category: mod.category || "",
    tags: Array.isArray(mod.tags) ? mod.tags.filter((t) => Boolean(t)) : [],
    authorId: mod.author?.id || "",
    authorName: mod.author?.name || "",
    authorKeyId: mod.author?.keyId || "",
    description: mod.description || "",
    changelog: mod.changelog || "",
    repo: mod.repo || "",
    sizeBytes: Number(mod.sizeBytes) || 0,
    sha256: mod.sha256 || "",
    downloadUrls: (Array.isArray(mod.downloadUrls) ? mod.downloadUrls : [])
      .map((u) => ({
        mirror: u?.mirror || "",
        url: u?.url || "",
        priority: Number(u?.priority) || 0,
      }))
      .filter((u) => Boolean(u.url)),
    downloads: Number(mod.downloads) || 0,
    publishedAt: mod.publishedAt || "",
    baseStatus: status,
    status,
    decisionAction: "",
    reason: "",
    checks,
    complete: true,
    repoAlive: repoCheck ? repoCheck.alive === true : null,
    lastCheckAt: repoCheck?.checked_at || "",
    deleted: false,
    deletedReason: "",
    deletedAt: "",
  }
}

/**
 * 从仓库地址（或 owner/repo 形态的 source）里取出 owner 与 name。
 * 服务端巡检只需要这两个片段，且只接受仓库名形态 —— 传别的过去也会被挡掉。
 */
function parseRepoSlug(item: QueueItem): { owner: string; name: string } | null {
  const raw = (item.repo || item.source || "").trim()
  if (!raw) return null
  const hit = raw.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i)
  if (hit) return { owner: hit[1], name: hit[2].replace(/\.git$/i, "") }
  const parts = raw.split("/").filter(Boolean)
  if (parts.length === 2) return { owner: parts[0], name: parts[1] }
  return null
}

/** 残缺条目补全资料要用到的上下文 */
interface PartialContext {
  inspections: Record<string, SourceInspection>
  repoCheckIndex: Map<string, RepoCheck>
  idCounts: Map<string, number>
  keyIdsByAuthor: Map<string, Set<string>>
}

/**
 * 信息不全的条目：只有 id / source，缺失字段一律留空（展示为「—」）。
 * 若该来源已经体检过且拉到了清单文件，就按真实资料构造条目 —— 字段映射复用
 * toQueueItem，检查项复用 buildChecks，和已发布模组走完全同一套规则。
 */
function toPartialItem(
  sourceOrId: string,
  status: QueueStatus,
  reason: string,
  ctx: PartialContext,
): QueueItem {
  const isSource = sourceOrId.includes("/")
  const tail = sourceOrId.split("/").filter(Boolean).pop() || sourceOrId
  const base: QueueItem = {
    ...emptyItem(),
    key: `partial:${sourceOrId}`,
    target: sourceOrId,
    kind: isSource ? "source" : "id",
    modId: isSource ? "" : sourceOrId,
    source: isSource ? sourceOrId : "",
    displayName: isSource ? tail : sourceOrId,
    baseStatus: status,
    status,
    decisionAction: "",
    reason,
    checks: [],
    complete: false,
    deleted: false,
    deletedReason: "",
    deletedAt: "",
  }

  // 只有 owner/repo 形态的来源能体检，纯 id 的条目保持原样
  if (!isSource) return base

  const inspection = ctx.inspections[sourceOrId]
  const inspectStatus: SourceInspectStatus = inspection?.status ?? "idle"
  const inspectNote = inspection?.note ?? ""
  const aliveFromInspection =
    typeof inspection?.repoAlive === "boolean" ? inspection.repoAlive : null

  // 还没拉到清单：保持残缺，只把体检说明与存活性带出去
  if (!inspection?.manifest) {
    const repoCheck = ctx.repoCheckIndex.get(sourceOrId) ?? null
    return {
      ...base,
      inspectStatus,
      inspectNote,
      repoAlive:
        aliveFromInspection !== null
          ? aliveFromInspection
          : repoCheck
            ? repoCheck.alive === true
            : null,
      lastCheckAt: repoCheck?.checked_at || "",
    }
  }

  // 有清单：补上来源仓库地址（清单里可能没有 repo 字段），再按真实资料构造条目
  const manifest: SyncMod = {
    ...inspection.manifest,
    source: inspection.manifest.source || sourceOrId,
    repo: inspection.manifest.repo || `https://github.com/${sourceOrId}`,
  }
  const repoCheck =
    ctx.repoCheckIndex.get(sourceOrId) ??
    ctx.repoCheckIndex.get(normRepo(manifest.repo || "")) ??
    null
  const built = toQueueItem(
    manifest,
    status,
    buildChecks(manifest, ctx.idCounts, ctx.keyIdsByAuthor),
    repoCheck,
  )
  return {
    ...built,
    key: base.key,
    target: sourceOrId,
    kind: "source",
    baseStatus: status,
    status,
    decisionAction: "",
    reason,
    complete: false,
    manifestFromSource: true,
    inspectStatus,
    inspectNote,
    repoAlive: aliveFromInspection !== null ? aliveFromInspection : built.repoAlive,
  }
}

/** 把审核决定叠加到展示状态上（真实索引数据只读，结论靠叠加体现） */
function overlayStatus(base: QueueStatus, action: string): QueueStatus {
  if (action === "approve") return "published"
  if (action === "reject") return "rejected"
  if (action === "delist") return "delisted"
  if (action === "restore") {
    if (base === "delisted") return "published"
    if (base === "rejected") return "pending"
    return base
  }
  return base
}

interface DecisionLike {
  action: string
  reason_zh: string
}

function withDecision(item: QueueItem, decision: DecisionLike | undefined): QueueItem {
  if (!decision?.action) return item
  const status = overlayStatus(item.baseStatus, decision.action)
  let reason = item.reason
  if (decision.action === "reject" || decision.action === "delist") {
    reason = decision.reason_zh || item.reason
  } else if (decision.action === "restore") {
    reason = ""
  }
  return { ...item, status, decisionAction: decision.action, reason }
}

/** 删除留档：从下架记录里聚合出来的「已删除」条目，key = mod_id */
export interface DeletionInfo {
  reason: string
  at: string
}

/** 按规格的四条规则把 mods / sources / moderation 拼成队列，每条只归一类 */
function buildQueue(
  sync: SyncState | null,
  decisionByTarget: Map<string, DecisionLike>,
  repoCheckIndex: Map<string, RepoCheck>,
  inspections: Record<string, SourceInspection>,
  deletedByModId: Map<string, DeletionInfo>,
): QueueItem[] {
  if (!sync) return []
  const mods = Array.isArray(sync.mods) ? sync.mods : []
  const sources = Array.isArray(sync.sources) ? sync.sources : []
  const moderation = sync.moderation || {}

  const moderationByKey = new Map<string, SyncModeration>()
  for (const [key, value] of Object.entries(moderation)) {
    if (!value) continue
    moderationByKey.set(key, value)
    if (value.id) moderationByKey.set(value.id, value)
    if (value.source) moderationByKey.set(value.source, value)
  }

  const idCounts = new Map<string, number>()
  const keyIdsByAuthor = new Map<string, Set<string>>()
  for (const mod of mods) {
    const id = mod.id || ""
    idCounts.set(id, (idCounts.get(id) || 0) + 1)
    const authorId = mod.author?.id || ""
    const keyId = mod.author?.keyId || ""
    if (authorId && keyId) {
      const set = keyIdsByAuthor.get(authorId) || new Set<string>()
      set.add(keyId)
      keyIdsByAuthor.set(authorId, set)
    }
  }

  const ctx: PartialContext = { inspections, repoCheckIndex, idCounts, keyIdsByAuthor }

  const items: QueueItem[] = []
  const covered = new Set<string>()

  // 规则 1 / 2：索引里已发布的条目 —— delisted 为真 = 已下架，否则 = 已上架
  for (const mod of mods) {
    const status: QueueStatus = mod.delisted === true ? "delisted" : "published"
    const repoCheck =
      repoCheckIndex.get(mod.id || "") ?? repoCheckIndex.get(normRepo(mod.repo || "")) ?? null
    const item = toQueueItem(mod, status, buildChecks(mod, idCounts, keyIdsByAuthor), repoCheck)
    covered.add(mod.id || "")
    covered.add(mod.source || "")
    const entry = moderationByKey.get(mod.id || "") ?? moderationByKey.get(mod.source || "")
    const merged = withDecision(item, entry?.action ? { action: entry.action, reason_zh: entry.reason?.zh || "" } : undefined)
    const decided = decisionByTarget.get(merged.target)
    items.push(withDecision(merged, decided))
  }

  // 规则 3：不在 mods 里但被拒绝收录的条目
  const moderationSeen = new Set<string>()
  for (const value of Object.values(moderation)) {
    if (!value) continue
    const key = value.id || value.source || ""
    if (!key || covered.has(key) || moderationSeen.has(key)) continue
    moderationSeen.add(key)
    if (value.action !== "reject") continue
    const item = toPartialItem(key, "rejected", value.reason?.zh || "", ctx)
    covered.add(key)
    items.push(withDecision(item, decisionByTarget.get(item.target)))
  }

  // 规则 4：在收录名单里、但既不在 mods 也不在 moderation 里 —— 待收录
  for (const source of sources) {
    if (!source || covered.has(source)) continue
    if (moderationByKey.has(source)) continue
    covered.add(source)
    const item = toPartialItem(source, "pending", "", ctx)
    items.push(withDecision(item, decisionByTarget.get(item.target)))
  }

  // 删除留档叠加：删除后的条目不是「查不到」，而是退出工作队列
  if (deletedByModId.size === 0) return items
  return items.map((item) => {
    const hit = deletedByModId.get(item.modId || item.source)
    if (!hit) return item
    return { ...item, deleted: true, deletedReason: hit.reason, deletedAt: hit.at }
  })
}

/* ------------------------------------------------------------------ *
 * 主 hook
 * ------------------------------------------------------------------ */

export function useHome() {
  const [mode, setModeState] = useState<ReviewMode>(() => readStoredMode())
  const [sync, setSync] = useState<SyncState | null>(null)
  const [syncFromCache, setSyncFromCache] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [decisions, setDecisions] = useState<ModDecision[]>([])
  const [localDecisions, setLocalDecisions] = useState<Record<string, DecisionLike>>({})
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>([])
  const [deleteRecords, setDeleteRecords] = useState<DeleteRecord[]>([])
  const [repoChecks, setRepoChecks] = useState<RepoCheck[]>([])
  /** 会话内缓存的来源体检结果（key = owner/repo），只在内存里，刷新页面重新体检 */
  const [sourceInspections, setSourceInspections] = useState<Record<string, SourceInspection>>({})
  const [inspectingSources, setInspectingSources] = useState(false)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<QueueFilter>("pending")
  const [keyword, setKeyword] = useState("")
  const [queuePage, setQueuePage] = useState(1)

  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordsTab, setRecordsTab] = useState<"review" | "delete">("review")
  const [exportOpen, setExportOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toast, setToast] = useState<HomeToast | null>(null)
  const [lastInspectAt, setLastInspectAt] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [reason, setReason] = useState("")
  const [actionKind, setActionKind] = useState<DecisionAction>("reject")
  const [autoPromotedCount, setAutoPromotedCount] = useState(0)
  const [purging, setPurging] = useState(false)
  /** 批量操作的多选：按条目 key 记，切换筛选时保留，方便跨筛选凑一批一起处理 */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)

  const inspectRef = useRef(false)
  const purgeRef = useRef(false)
  const modParamRef = useRef(false)
  const autoTriedRef = useRef<Set<string>>(new Set())
  const queueRef = useRef<QueueItem[]>([])
  /** 体检缓存与队列的镜像，供不依赖 state 的异步流程读取 */
  const inspectionsRef = useRef<Record<string, SourceInspection>>({})
  /** 等待体检的来源（并发保护：同一时刻只跑一批，其余排队） */
  const inspectQueueRef = useRef<Array<{ source: string; force: boolean }>>([])
  const inspectBusyRef = useRef(false)
  /** 本次会话已经发起过体检的来源，自动轮转不再重复 */
  const inspectTriedRef = useRef<Set<string>>(new Set())
  /** 服务端额度用尽时暂停自动轮转，等维护者手动重试 */
  const inspectBudgetRef = useRef(false)
  /** 撞上限流后的冷却截止时间戳：在此之前体检与巡检都先歇着 */
  const apiCooldownRef = useRef(0)
  /** 是否还没跑过自动轮转的第一轮 */
  const sourceRotateFirstRef = useRef(true)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4600)
    return () => window.clearTimeout(timer)
  }, [toast])

  /* ---------------------------- 数据读取 ---------------------------- */

  const loadSyncState = useCallback(async (force: boolean) => {
    if (!force && syncCache && Date.now() - syncCache.at < SYNC_CACHE_MS) {
      return { data: syncCache.data, fromCache: true }
    }
    const data = await apiGet<SyncState>("/api/mod-sync/state")
    syncCache = { at: Date.now(), data }
    return { data, fromCache: false }
  }, [])

  const loadDecisions = useCallback(async () => {
    const data = await apiGet<ListResponse<ModDecision>>("/api/mod_decisions")
    const list = Array.isArray(data.items) ? data.items : []
    setDecisions(list)
    return list
  }, [])

  const loadReviewRecords = useCallback(async () => {
    const data = await apiGet<ListResponse<ReviewRecord>>("/api/review_records")
    setReviewRecords(Array.isArray(data.items) ? data.items : [])
  }, [])

  const loadDeleteRecords = useCallback(async () => {
    const data = await apiGet<ListResponse<DeleteRecord>>("/api/delete_records")
    setDeleteRecords(Array.isArray(data.items) ? data.items : [])
  }, [])

  const loadRepoChecks = useCallback(async () => {
    const data = await apiGet<ListResponse<RepoCheck>>("/api/repo_checks")
    const list = Array.isArray(data.items) ? data.items : []
    setRepoChecks(list)
    const stamps = list
      .map((c) => c.checked_at)
      .filter((v) => Boolean(v))
      .sort()
    if (stamps.length > 0) setLastInspectAt(stamps[stamps.length - 1])
    return list
  }, [])

  const refreshData = useCallback(
    async (force = true) => {
      setRefreshing(true)
      try {
        const { data, fromCache } = await loadSyncState(force)
        setSync(data)
        setSyncFromCache(fromCache)
        setSyncError("")
        setToast({ kind: "ok", text: "已拉取索引仓库最新数据" })
      } catch {
        setSyncError("索引仓库数据拉取失败")
        setToast({ kind: "error", text: "数据拉取失败，请稍后重试" })
      } finally {
        setRefreshing(false)
      }
    },
    [loadSyncState],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [syncResult, decisionList, reviews, deletes, checks] = await Promise.all([
          loadSyncState(false),
          apiGet<ListResponse<ModDecision>>("/api/mod_decisions"),
          apiGet<ListResponse<ReviewRecord>>("/api/review_records"),
          apiGet<ListResponse<DeleteRecord>>("/api/delete_records"),
          apiGet<ListResponse<RepoCheck>>("/api/repo_checks"),
        ])
        if (cancelled) return
        setSync(syncResult.data)
        setSyncFromCache(syncResult.fromCache)
        setDecisions(Array.isArray(decisionList.items) ? decisionList.items : [])
        setReviewRecords(Array.isArray(reviews.items) ? reviews.items : [])
        setDeleteRecords(Array.isArray(deletes.items) ? deletes.items : [])
        const checkList = Array.isArray(checks.items) ? checks.items : []
        setRepoChecks(checkList)
        const stamps = checkList
          .map((c) => c.checked_at)
          .filter((v) => Boolean(v))
          .sort()
        if (stamps.length > 0) setLastInspectAt(stamps[stamps.length - 1])
      } catch {
        if (!cancelled) {
          setSyncError("索引仓库数据拉取失败")
          setToast({ kind: "error", text: "队列加载失败，请稍后重试" })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadSyncState])

  /* ---------------------------- 派生数据 ---------------------------- */

  const repoCheckIndex = useMemo(() => {
    const map = new Map<string, RepoCheck>()
    for (const row of repoChecks) {
      if (row.mod_id) map.set(row.mod_id, row)
      const url = normRepo(row.repo_url || "")
      if (url) map.set(url, row)
    }
    return map
  }, [repoChecks])

  // 已存决定 + 本次会话的乐观决定，叠加到只读的索引数据上
  const decisionByTarget = useMemo(() => {
    const map = new Map<string, DecisionLike>()
    const sorted = [...decisions].sort((a, b) =>
      (a.decided_at || a.created || "").localeCompare(b.decided_at || b.created || ""),
    )
    for (const d of sorted) {
      if (!d.target) continue
      map.set(d.target, { action: d.action, reason_zh: d.reason_zh || "" })
    }
    for (const [target, value] of Object.entries(localDecisions)) {
      map.set(target, value)
    }
    return map
  }, [decisions, localDecisions])

  /** 处置留档里标记为「已删除」的条目（key = mod_id） */
  const deletedByModId = useMemo(() => {
    const map = new Map<string, DeletionInfo>()
    for (const row of deleteRecords) {
      if (row.action_kind !== "delete" || !row.mod_id) continue
      const at = row.deleted_at || row.created || ""
      const prev = map.get(row.mod_id)
      if (!prev || at >= prev.at) map.set(row.mod_id, { reason: row.reason || "", at })
    }
    return map
  }, [deleteRecords])

  /** target → 决定行 id：批量操作靠它省掉每条一次查询 */
  const decisionIdByTarget = useMemo(() => {
    const map = new Map<string, string>()
    const sorted = [...decisions].sort((a, b) =>
      (a.decided_at || a.created || "").localeCompare(b.decided_at || b.created || ""),
    )
    for (const d of sorted) {
      if (d.target && d.id) map.set(d.target, d.id)
    }
    return map
  }, [decisions])

  const queueAllItems = useMemo(
    () => buildQueue(sync, decisionByTarget, repoCheckIndex, sourceInspections, deletedByModId),
    [sync, decisionByTarget, repoCheckIndex, sourceInspections, deletedByModId],
  )
  /** 工作队列：删除后的条目已经退出市场，不再参与筛选与批量操作 */
  const queueItems = useMemo(() => queueAllItems.filter((item) => !item.deleted), [queueAllItems])
  /** 删除留档视图：只在「已删除」与「全部」里可见 */
  const deletedItems = useMemo(() => queueAllItems.filter((item) => item.deleted), [queueAllItems])
  const visibleItems = useMemo(() => {
    if (filterStatus === "all") return queueAllItems
    if (filterStatus === "deleted") return deletedItems
    return queueItems
  }, [filterStatus, queueAllItems, deletedItems, queueItems])

  // 巡检要读「当前队列」来决定查哪几个仓库，但又不希望队列一变就重建定时器，
  // 所以用 ref 兜一层：定时器只依赖 runInspection 的稳定身份。
  useEffect(() => {
    queueRef.current = queueItems
  }, [queueItems])

  const filteredItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const order: Record<QueueStatus, number> = {
      pending: 0,
      rejected: 1,
      delisted: 2,
      published: 3,
    }
    const matched = visibleItems.filter((item) => {
      if (!matchesQueueFilter(item, filterStatus)) return false
      if (!kw) return true
      return [
        item.displayName,
        item.modId,
        item.source,
        item.authorName,
        item.authorId,
        item.category,
        item.tags.join(" "),
      ].some((v) => (v || "").toLowerCase().includes(kw))
    })
    // 已删除视图按删除时间倒序（刚删完最想确认的那条排最前），其余按状态优先级排
    if (filterStatus === "deleted") {
      return matched.sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""))
    }
    return matched.sort((a, b) => {
      const byStatus = (a.deleted ? 4 : order[a.status]) - (b.deleted ? 4 : order[b.status])
      if (byStatus !== 0) return byStatus
      return (a.displayName || a.source || a.modId).localeCompare(b.displayName || b.source || b.modId)
    })
  }, [visibleItems, filterStatus, keyword])

  const queueTotal = filteredItems.length
  const queuePageCount = Math.max(1, Math.ceil(queueTotal / QUEUE_PAGE_SIZE))
  const safeQueuePage = Math.min(Math.max(queuePage, 1), queuePageCount)
  const pagedItems = useMemo(
    () =>
      filteredItems.slice((safeQueuePage - 1) * QUEUE_PAGE_SIZE, safeQueuePage * QUEUE_PAGE_SIZE),
    [filteredItems, safeQueuePage],
  )

  const selected = useMemo<QueueItem | null>(() => {
    if (selectedKey) {
      const hit = queueItems.find((i) => i.key === selectedKey)
      if (hit) return hit
    }
    return pagedItems[0] ?? filteredItems[0] ?? null
  }, [selectedKey, queueItems, pagedItems, filteredItems])

  const stats = useMemo<QueueStats>(() => {
    const count = (s: QueueStatus) => queueItems.filter((i) => i.status === s).length
    // 自动放行只作用于「待收录」：未通过是维护者明确拒过的，永远不自动放行
    const eligible = (i: QueueItem) =>
      i.status === "pending" &&
      i.checks.length > 0 &&
      summarizeChecks(i.checks) === "pass" &&
      i.repoAlive !== false
    return {
      total: queueItems.length,
      pending: count("pending"),
      published: count("published"),
      rejected: count("rejected"),
      delisted: count("delisted"),
      warn: countQueueFilter(queueItems, "warn"),
      fail: countQueueFilter(queueItems, "fail"),
      offline: countQueueFilter(queueItems, "offline"),
      autoEligible: queueItems.filter(eligible).length,
      deleted: deletedItems.length,
    }
  }, [queueItems, deletedItems])

  /** 筛选按钮上的条数：与筛选结果一致，避免「按钮说 12 条、点进去 9 条」 */
  const filterCounts = useMemo<Record<QueueFilter, number>>(() => {
    const counts = {} as Record<QueueFilter, number>
    for (const option of QUEUE_FILTERS) {
      if (option.value === "deleted") counts[option.value] = deletedItems.length
      else if (option.value === "all") counts[option.value] = queueAllItems.length
      else counts[option.value] = countQueueFilter(queueItems, option.value)
    }
    return counts
  }, [queueItems, queueAllItems, deletedItems])

  const selectedItems = useMemo(
    () => queueItems.filter((item) => selectedKeys.has(item.key)),
    [queueItems, selectedKeys],
  )

  const toggleSelect = useCallback((item: QueueItem) => {
    if (item.deleted) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(item.key)) next.delete(item.key)
      else next.add(item.key)
      return next
    })
  }, [])

  /** 批量勾选 / 取消勾选一组条目（本页、当前筛选结果） */
  const selectMany = useCallback((items: QueueItem[], on: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const item of items) {
        if (item.deleted) continue
        if (on) next.add(item.key)
        else next.delete(item.key)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  /* ---------------------------- 从记录中心跳转过来的定位 ---------------------------- */

  useEffect(() => {
    if (modParamRef.current || loading || queueItems.length === 0) return
    let target = ""
    try {
      target = new URLSearchParams(window.location.search).get("mod") || ""
    } catch {
      target = ""
    }
    modParamRef.current = true
    if (!target) return
    const hit = queueItems.find(
      (i) => i.modId === target || i.source === target || i.target === target,
    )
    if (!hit) return
    setFilterStatus("all")
    setQueuePage(1)
    setSelectedKey(hit.key)
    setReason("")
    setActionKind(hit.status === "published" ? "delist" : "approve")
  }, [loading, queueItems])

  /* ---------------------------- 模式切换 ---------------------------- */

  const setMode = useCallback((next: ReviewMode) => {
    setModeState(next)
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next)
    } catch {
      /* 存储不可用时仅保持内存态 */
    }
  }, [])

  /* ---------------------------- 写记录 / 写决定 ---------------------------- */

  const writeReviewRecord = useCallback(
    async (item: QueueItem, action: string, reasonText: string, modeValue: string) => {
      await apiSend("/api/review_records", "POST", {
        mod_id: item.modId || item.source,
        mod_name: item.displayName || item.source,
        action,
        reason: reasonText,
        mode: modeValue,
        operator: currentOperator(),
        acted_at: nowIso(),
      })
    },
    [],
  )

  const writeDeleteRecord = useCallback(
    async (item: QueueItem, actionKindValue: "reject" | "delist" | "delete", reasonText: string) => {
      await apiSend("/api/delete_records", "POST", {
        mod_id: item.modId || item.source,
        mod_name: item.displayName || item.source,
        reason: reasonText,
        operator: currentOperator(),
        deleted_at: nowIso(),
        action_kind: actionKindValue,
      })
    },
    [],
  )

  /**
   * 查该 target 有没有决定：有就 PATCH、没有就 POST。
   * 批量操作把已知的决定 id 传进来，省掉每条一次查询 —— 上千条队列时这是整批耗时的大头。
   */
  const submitDecision = useCallback(
    async (
      item: QueueItem,
      action: DecisionWriteAction,
      reasonText: string,
      options?: { decisionId?: string },
    ) => {
      const target = item.target
      let decisionId = options?.decisionId || ""
      if (!decisionId) {
        const existing = await apiGet<ListResponse<ModDecision>>(
          `/api/mod_decisions?target=${encodeURIComponent(target)}`,
        )
        decisionId = (Array.isArray(existing.items) ? existing.items[0]?.id : "") || ""
      }
      const body = {
        target,
        kind: target.includes("/") ? "source" : "id",
        action,
        reason_zh: reasonText,
        reason_en: reasonText,
        operator: currentOperator(),
        decided_at: nowIso(),
      }
      if (decisionId) {
        try {
          await apiSend(`/api/mod_decisions/${decisionId}`, "PATCH", body)
        } catch {
          // 缓存下来的决定 id 可能已经被清理：退回新建，别让这一条卡住整批
          await apiSend("/api/mod_decisions", "POST", body)
        }
      } else {
        await apiSend("/api/mod_decisions", "POST", body)
      }
      return body
    },
    [],
  )

  const applyLocalDecision = useCallback(
    (item: QueueItem, action: DecisionAction, reasonText: string) => {
      setLocalDecisions((prev) => ({
        ...prev,
        [item.target]: { action, reason_zh: reasonText },
      }))
    },
    [],
  )

  const reloadRecords = useCallback(async () => {
    await Promise.all([loadReviewRecords(), loadDeleteRecords(), loadDecisions()])
  }, [loadDeleteRecords, loadDecisions, loadReviewRecords])

  /* ------------------- 动作落地（单条 / 批量 / 自动共用一条路径） ------------------- */

  const itemLabel = useCallback(
    (item: QueueItem) => item.displayName || item.source || item.modId,
    [],
  )

  /**
   * 一个动作的落地流程：写决定 → 写审核流水 →（拒绝 / 下架 / 删除）写处置留档 → 叠加本地状态。
   * 单条审核、批量操作、无人值守自动收录、批量清理失联都走这一条路径，
   * 免得几处各写一遍，规则慢慢走偏。
   */
  const applyActionInner = useCallback(
    async (
      item: QueueItem,
      action: DecisionAction,
      reasonText: string,
      modeValue: "manual" | "auto",
    ) => {
      const decisionId = decisionIdByTarget.get(item.target)

      if (action === "delete") {
        // 删除：还没收进索引的条目先按「拒绝收录」落地（作者侧看到的就是不收录），
        // 再写一条 action_kind = delete 的处置留档 —— 删除后的条目据此退出工作队列。
        // 已经下架的条目保持下架（索引里本来就没有它），删除只在留档里体现。
        if (item.status === "pending") {
          await submitDecision(item, "reject", reasonText, { decisionId })
          applyLocalDecision(item, "reject", reasonText)
        }
        await writeReviewRecord(item, "delete", reasonText, modeValue)
        await writeDeleteRecord(item, "delete", reasonText)
        return
      }

      if (action === "approve") {
        const auto = modeValue === "auto"
        await submitDecision(item, "approve", "", { decisionId })
        await writeReviewRecord(
          item,
          auto ? "auto_approve" : "approve",
          auto ? "自动检查全部通过，无警告项" : "核对索引仓库资料后收录通过",
          modeValue,
        )
        applyLocalDecision(item, "approve", "")
        return
      }

      if (action === "restore") {
        await submitDecision(item, "restore", "", { decisionId })
        await writeReviewRecord(item, "restore", "撤销之前的审核结果，恢复上架", modeValue)
        applyLocalDecision(item, "restore", "")
        return
      }

      // 拒绝收录 / 下架：理由必填，并且要写下处置留档
      await submitDecision(item, action, reasonText, { decisionId })
      await writeReviewRecord(item, action, reasonText, modeValue)
      await writeDeleteRecord(item, action, reasonText)
      applyLocalDecision(item, action, reasonText)
    },
    [applyLocalDecision, decisionIdByTarget, submitDecision, writeDeleteRecord, writeReviewRecord],
  )
  /**
   * 审核结论同步进索引仓库。索引仓库收到提交后由它自己的 GitHub Actions 重建 + 签名，
   * 于是整条「审核 → 上架」链路都不再需要维护者本机参与。
   * 短时间内多次动作只发一次，免得批量操作打出一串并发提交互相抢分支。
   */
  const indexSyncTimerRef = useRef<number | null>(null)
  const scheduleIndexSync = useCallback(() => {
    if (indexSyncTimerRef.current !== null) return
    indexSyncTimerRef.current = window.setTimeout(() => {
      indexSyncTimerRef.current = null
      void apiSend("/api/index/sync", "POST", {}).catch(() => {
        // 同步失败不回滚审核结果：决定会保持「未同步」，下次动作或定时任务继续重试
      })
    }, 2500)
  }, [])

  /** 所有审核动作（单条 / 批量 / 无人值守自动收录 / 批量清理）都从这里过一遍，顺便触发同步 */
  const applyAction = useCallback(
    async (
      item: QueueItem,
      action: DecisionAction,
      reasonText: string,
      modeValue: "manual" | "auto",
    ) => {
      await applyActionInner(item, action, reasonText, modeValue)
      scheduleIndexSync()
    },
    [applyActionInner, scheduleIndexSync],
  )

  const approveItem = useCallback(
    async (item: QueueItem) => {
      setBusyKey(item.key)
      try {
        await applyAction(item, "approve", "", "manual")
        await reloadRecords()
        setReason("")
        setToast({ kind: "ok", text: `《${itemLabel(item)}》已收录` })
        return true
      } catch {
        setToast({ kind: "error", text: "收录未成功，请重试" })
        return false
      } finally {
        setBusyKey(null)
      }
    },
    [applyAction, itemLabel, reloadRecords],
  )

  const rejectItem = useCallback(
    async (item: QueueItem, reasonText: string) => {
      const trimmed = reasonText.trim()
      if (!trimmed) {
        setToast({ kind: "error", text: "请先填写拒绝收录的理由" })
        return false
      }
      setBusyKey(item.key)
      try {
        await applyAction(item, "reject", trimmed, "manual")
        await reloadRecords()
        setReason("")
        setToast({ kind: "ok", text: `已拒绝收录《${itemLabel(item)}》` })
        return true
      } catch {
        setToast({ kind: "error", text: "拒绝未成功，请重试" })
        return false
      } finally {
        setBusyKey(null)
      }
    },
    [applyAction, itemLabel, reloadRecords],
  )

  const delistItem = useCallback(
    async (item: QueueItem, reasonText: string) => {
      const trimmed = reasonText.trim()
      if (!trimmed) {
        setToast({ kind: "error", text: "请先填写下架理由" })
        return false
      }
      setBusyKey(item.key)
      try {
        await applyAction(item, "delist", trimmed, "manual")
        await reloadRecords()
        setReason("")
        setToast({ kind: "ok", text: `《${itemLabel(item)}》已下架` })
        return true
      } catch {
        setToast({ kind: "error", text: "下架未成功，请重试" })
        return false
      } finally {
        setBusyKey(null)
      }
    },
    [applyAction, itemLabel, reloadRecords],
  )

  const restoreItem = useCallback(
    async (item: QueueItem) => {
      setBusyKey(item.key)
      try {
        await applyAction(item, "restore", "", "manual")
        await reloadRecords()
        setReason("")
        setToast({ kind: "ok", text: `《${itemLabel(item)}》已恢复上架` })
        return true
      } catch {
        setToast({ kind: "error", text: "恢复未成功，请重试" })
        return false
      } finally {
        setBusyKey(null)
      }
    },
    [applyAction, itemLabel, reloadRecords],
  )

  /**
   * 删除单条 MOD。规则：未上架的可以直接删；已上架的必须先下架，再回来删 ——
   * 让「下架」和「删除」分成两步，删除这种不可逆的动作就永远有一步缓冲。
   */
  const deleteItem = useCallback(
    async (item: QueueItem, reasonText: string) => {
      const trimmed = reasonText.trim()
      if (!trimmed) {
        setToast({ kind: "error", text: "请先填写删除理由" })
        return false
      }
      if (item.status === "published") {
        setToast({
          kind: "error",
          text: `《${itemLabel(item)}》已上架，必须先下架，之后才能删除`,
        })
        return false
      }
      setBusyKey(item.key)
      try {
        await applyAction(item, "delete", trimmed, "manual")
        await reloadRecords()
        setReason("")
        setSelectedKeys((prev) => {
          const next = new Set(prev)
          next.delete(item.key)
          return next
        })
        setToast({ kind: "ok", text: `已删除《${itemLabel(item)}》，理由已留档` })
        return true
      } catch {
        setToast({ kind: "error", text: "删除未成功，请重试" })
        return false
      } finally {
        setBusyKey(null)
      }
    },
    [applyAction, itemLabel, reloadRecords],
  )

  /* ---------------------------- 批量操作 ---------------------------- */

  const selectAllFiltered = useCallback(() => {
    selectMany(filteredItems, true)
  }, [filteredItems, selectMany])

  /**
   * 批量执行一个动作。
   * - 只处理满足前置条件的条目，不满足的跳过并如实报数（不硬凑、不假装成功）
   * - 逐条串行执行：服务端与 GitHub 都有额度限制，并发只会把额度一口气打空
   */
  const runBulkAction = useCallback(
    async (action: DecisionAction, reasonText: string) => {
      if (bulkRunning) return
      const trimmed = reasonText.trim()
      if (BULK_REASON_REQUIRED.includes(action) && !trimmed) {
        setToast({ kind: "error", text: "请先填写理由，批量操作会连同理由一起留档" })
        return
      }
      const targets = selectedItems.filter((item) => bulkActionAllowed(item, action))
      const skipped = selectedItems.length - targets.length
      if (targets.length === 0) {
        setToast({
          kind: "error",
          text:
            selectedItems.length === 0
              ? "先在队列里勾选要处理的条目"
              : "选中的条目都不满足这个动作的前置条件",
        })
        return
      }

      const label = ACTION_LABELS[action] ?? action
      setBulkRunning(true)
      setBulkProgress({ action, label, done: 0, total: targets.length })
      let ok = 0
      let failed = 0
      try {
        for (const item of targets) {
          try {
            await applyAction(item, action, trimmed, "manual")
            ok += 1
          } catch {
            /* 单条失败不打断整批，最后统一报数 */
            failed += 1
          }
          setBulkProgress((prev) => (prev ? { ...prev, done: ok + failed } : prev))
        }
        await reloadRecords()
        setSelectedKeys(new Set())
        setReason("")
        const skipNote = skipped > 0 ? `，跳过 ${skipped} 条不符合前置条件的条目` : ""
        setToast(
          failed === 0
            ? { kind: "ok", text: `批量${label}完成：成功 ${ok} 条${skipNote}` }
            : { kind: "error", text: `批量${label}：成功 ${ok} 条、失败 ${failed} 条${skipNote}` },
        )
      } finally {
        setBulkProgress(null)
        setBulkRunning(false)
      }
    },
    [applyAction, bulkRunning, reloadRecords, selectedItems],
  )

  /* ---------------------------- 来源体检 ---------------------------- */

  const commitInspections = useCallback((patch: Record<string, SourceInspection>) => {
    const merged = { ...inspectionsRef.current, ...patch }
    inspectionsRef.current = merged
    setSourceInspections(merged)
  }, [])

  /**
   * 批量体检来源仓库（服务端一次最多 6 个，多余的会被丢掉）。
   * - 去重：缓存里已有结果、且不是失败重试的来源不再重复查
   * - 并发保护：同一时刻只跑一批，其余排队，跑完自动接着下一批
   * - 失败不炸：写一条 failed + 说明文案，之后还能重试
   */
  const inspectSources = useCallback(
    async (rawSources: string[], options?: { force?: boolean }) => {
      const force = options?.force === true
      const queued = new Set(inspectQueueRef.current.map((q) => q.source))
      for (const raw of rawSources) {
        const source = (raw || "").trim()
        if (!source || !source.includes("/")) continue
        const existing = inspectionsRef.current[source]
        if (existing?.status === "loading") continue
        if (!force && existing && existing.status !== "failed") continue
        if (queued.has(source)) continue
        inspectQueueRef.current.push({ source, force })
        queued.add(source)
        inspectTriedRef.current.add(source)
      }
      if (inspectBusyRef.current || inspectQueueRef.current.length === 0) return

      inspectBusyRef.current = true
      setInspectingSources(true)
      try {
        while (inspectQueueRef.current.length > 0) {
          const sources = inspectQueueRef.current.splice(0, SOURCE_INSPECT_BATCH).map((q) => q.source)

          // 先落「体检中」，队列里立刻能看到状态，不会显得卡住
          const loading: Record<string, SourceInspection> = {}
          for (const source of sources) {
            const prev = inspectionsRef.current[source]
            loading[source] = {
              source,
              manifest: prev?.manifest ?? null,
              repoAlive: prev?.repoAlive ?? null,
              note: prev?.note ?? "",
              status: "loading",
              at: prev?.at ?? 0,
            }
          }
          commitInspections(loading)

          let rows: SourceInspectResult[] = []
          let budgetExhausted = false
          try {
            const res = await apiSend<SourceInspectResponse>("/api/mod-source/inspect", "POST", {
              sources,
            })
            rows = Array.isArray(res?.results) ? res.results : []
            budgetExhausted = res?.budgetExhausted === true
          } catch {
            const failed: Record<string, SourceInspection> = {}
            for (const source of sources) {
              const prev = inspectionsRef.current[source]
              failed[source] = {
                source,
                manifest: prev?.manifest ?? null,
                repoAlive: prev?.repoAlive ?? null,
                note: "来源体检接口暂时不可用，稍后可以点「重新体检」再试。",
                status: "failed",
                at: Date.now(),
              }
            }
            commitInspections(failed)
            continue
          }

          const bySource = new Map<string, SourceInspectResult>()
          for (const row of rows) {
            if (row?.source) bySource.set(row.source, row)
          }
          const done: Record<string, SourceInspection> = {}
          for (const source of sources) {
            const row = bySource.get(source)
            done[source] = {
              source,
              manifest: row?.manifest ?? null,
              repoAlive: typeof row?.repoAlive === "boolean" ? row.repoAlive : null,
              // 服务端的说明文案原样保留，不要自己编替代文案
              note: row?.note
                ? row.note
                : row
                  ? ""
                  : budgetExhausted
                    ? "接口额度用尽，稍后会自动重试"
                    : "服务端没有返回这个来源的体检结果，稍后可以重试",
              status: "done",
              at: Date.now(),
            }
          }
          commitInspections(done)

          // 撞上「本小时调用次数已用完」就整体歇一会儿：否则轮转会接着往下冲，
          // 把剩下的来源全部刷成失败 —— 那既浪费额度，又让人误以为仓库都出了问题。
          if (hasRateLimitNote(done) || budgetExhausted) {
            apiCooldownRef.current = Date.now() + API_COOLDOWN_MS
            inspectQueueRef.current.length = 0
            if (budgetExhausted) inspectBudgetRef.current = true
            break
          }
        }
      } finally {
        inspectBusyRef.current = false
        setInspectingSources(false)
      }
    },
    [commitInspections],
  )

  const reinspectSource = useCallback(
    (source: string) => {
      const trimmed = (source || "").trim()
      if (!trimmed) return
      inspectTriedRef.current.delete(trimmed)
      void inspectSources([trimmed], { force: true })
    },
    [inspectSources],
  )

  /**
   * 自动轮转体检：索引数据就绪后，对「待收录 / 未通过」的残缺条目小批量体检
   * （每轮最多 3 个，最久没体检过的优先，会话内不重复同一个来源）。
   */
  useEffect(() => {
    if (loading || !sync || inspectingSources || inspectBudgetRef.current) return
    // 撞过限流就整体歇到冷却结束，别把额度反复打空
    if (Date.now() < apiCooldownRef.current) return
    const candidates: Array<{ source: string; at: number }> = []
    for (const item of queueItems) {
      if (item.complete || !item.source) continue
      if (item.status !== "pending" && item.status !== "rejected") continue
      if (inspectTriedRef.current.has(item.source)) continue
      candidates.push({ source: item.source, at: sourceInspections[item.source]?.at ?? 0 })
    }
    if (candidates.length === 0) return
    candidates.sort((a, b) => a.at - b.at)
    const batch = candidates.slice(0, AUTO_SOURCE_BATCH).map((c) => c.source)
    // 第一轮马上跑（打开页面就该看到结果），之后每轮按间隔慢慢走，别把额度一口气用光
    const delay = sourceRotateFirstRef.current ? AUTO_SOURCE_FIRST_DELAY_MS : SOURCE_ROTATE_INTERVAL_MS
    sourceRotateFirstRef.current = false
    const timer = window.setTimeout(() => {
      void inspectSources(batch)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [loading, sync, queueItems, sourceInspections, inspectingSources, inspectSources])

  /** 人工模式下选中一条还没有体检结果的残缺条目：立刻单独体检它 */
  useEffect(() => {
    if (loading || mode !== "manual") return
    if (!selected || selected.complete || !selected.source) return
    if (selected.inspectStatus !== "idle") return
    void inspectSources([selected.source])
  }, [loading, mode, selected, inspectSources])

  /* ---------------------------- 巡检 ---------------------------- */

  const runInspection = useCallback(async () => {
    if (inspectRef.current) return
    inspectRef.current = true
    setInspecting(true)
    try {
      // 队列来自索引仓库，服务端不持有模组清单 —— 由这里按「最久没查过的优先」
      // 排出本轮要查的仓库传过去；没查过的排最前，这样新收录的条目会先被覆盖到。
      const candidates: Array<{ item: QueueItem; owner: string; name: string }> = []
      for (const item of queueRef.current) {
        if (item.status === "delisted") continue
        const slug = parseRepoSlug(item)
        if (!slug) continue
        candidates.push({ item, owner: slug.owner, name: slug.name })
      }
      candidates.sort((a, b) => {
        const av = a.item.lastCheckAt || ""
        const bv = b.item.lastCheckAt || ""
        if (av === bv) return 0
        if (!av) return -1
        if (!bv) return 1
        return av < bv ? -1 : 1
      })
      const targets = candidates.slice(0, INSPECT_BATCH_LIMIT).map((c) => ({
        modId: c.item.modId || c.item.source,
        modName: c.item.displayName || c.item.source || c.item.modId,
        owner: c.owner,
        name: c.name,
      }))

      if (targets.length === 0) {
        setToast({ kind: "error", text: "队列里还没有可巡检的仓库地址" })
        return
      }

      const result = await apiSend<InspectTickResult>("/api/mod-inspect/tick", "POST", {
        limit: INSPECT_BATCH_LIMIT,
        targets,
      })
      await loadRepoChecks()
      const checked = Number(result?.checked) || 0
      const offline = Number(result?.offline) || 0
      const undetermined = Number(result?.undetermined) || 0
      if (result?.rateLimited) {
        // 限流期间继续按周期硬撞只会一直失败，整体歇到冷却结束再继续
        apiCooldownRef.current = Date.now() + API_COOLDOWN_MS
        setToast({
          kind: "error",
          text: "目标站本小时调用次数已用完，巡检先歇一会儿，到点会自动继续",
        })
      } else if (offline > 0) {
        setToast({ kind: "error", text: `本轮巡检 ${checked} 个 MOD，其中 ${offline} 个仓库失联` })
      } else if (checked === 0 && undetermined > 0) {
        // 一条都没查成（限流或网络失败）：这些条目不会再写失联记录，
        // 但也绝不能报成「仓库均在线」——那是拿没查成当查过了。
        setToast({
          kind: "error",
          text: `本轮巡检有 ${undetermined} 个仓库没拿到确定结果，稍后会自动重试`,
        })
      } else {
        setToast({ kind: "ok", text: `本轮巡检完成：检查了 ${checked} 个 MOD，仓库均在线` })
      }
    } catch {
      setToast({ kind: "error", text: "巡检未完成，请稍后重试" })
    } finally {
      inspectRef.current = false
      setInspecting(false)
    }
  }, [loadRepoChecks])

  useEffect(() => {
    if (loading) return
    const timer = window.setInterval(() => {
      // 冷却期内不自动巡检：撞了限流还按周期硬撞只会一直失败、白烧额度
      if (Date.now() < apiCooldownRef.current) return
      void runInspection()
    }, INSPECT_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [loading, runInspection])

  /**
   * 批量清理仓库已失联的条目：索引数据只读，因此以「下架决定」的方式落地，
   * 同时写删除记录与审核记录，导出后回本机重建索引即生效。
   */
  const purgeOfflineMods = useCallback(async () => {
    if (purgeRef.current) return
    const targets = queueItems.filter((i) => i.repoAlive === false && i.status !== "delisted")
    if (targets.length === 0) {
      setToast({ kind: "error", text: "当前没有需要清理的失联条目" })
      return
    }
    purgeRef.current = true
    setPurging(true)
    const reasonText = "仓库已失联，清理该条申请"
    let removed = 0
    try {
      for (const item of targets) {
        try {
          await applyAction(item, "delist", reasonText, "manual")
          removed += 1
        } catch {
          /* 单条失败不打断整批，继续清理后面的 */
        }
      }
      await reloadRecords()
      setToast(
        removed === 0
          ? { kind: "error", text: "清理未成功，请稍后重试" }
          : { kind: "ok", text: `已下架 ${removed} 个仓库失联的 MOD，理由已留档` },
      )
    } finally {
      purgeRef.current = false
      setPurging(false)
    }
  }, [applyAction, queueItems, reloadRecords])

  /* -------------------- 无人值守模式自动收录 -------------------- */

  const runAutoApprove = useCallback(
    async (targets: QueueItem[]) => {
      if (targets.length === 0) return
      for (const item of targets) autoTriedRef.current.add(item.target)
      let done = 0
      for (const item of targets) {
        try {
          await applyAction(item, "approve", "", "auto")
          done += 1
        } catch {
          /* 单条失败不影响后面的条目 */
        }
      }
      if (done > 0) {
        setAutoPromotedCount(done)
        await reloadRecords()
        const fromInspection = targets.filter((i) => i.manifestFromSource).length
        setToast({
          kind: "ok",
          text:
            fromInspection > 0
              ? `无人值守模式已自动收录 ${done} 个 MOD，其中 ${fromInspection} 个来自来源体检通过，其余留在队列待人工处理`
              : `无人值守模式已自动收录 ${done} 个 MOD，其余留在队列待人工处理`,
        })
      }
    },
    [applyAction, reloadRecords],
  )

  useEffect(() => {
    if (loading || mode !== "auto") return
    // 「未通过」的条目由维护者明确拒过，只能人工点「恢复上架」，这里永不自动放行
    const eligible = queueItems.filter(
      (i) =>
        i.status === "pending" &&
        i.checks.length > 0 &&
        summarizeChecks(i.checks) === "pass" &&
        i.repoAlive !== false,
    )
    const fresh = eligible.filter((i) => !autoTriedRef.current.has(i.target))
    if (fresh.length === 0) return
    void runAutoApprove(fresh)
  }, [loading, mode, queueItems, runAutoApprove])

  /* ---------------------------- 导出 ---------------------------- */

  const exportEntries = useMemo(() => {
    const map = new Map<string, ModDecision>()
    for (const d of decisions) {
      if (!d.target) continue
      const prev = map.get(d.target)
      if (!prev || (d.decided_at || d.created || "") > (prev.decided_at || prev.created || "")) {
        map.set(d.target, d)
      }
    }
    for (const [target, value] of Object.entries(localDecisions)) {
      const prev = map.get(target)
      map.set(target, {
        id: prev?.id ?? `local-${target}`,
        target,
        kind: target.includes("/") ? "source" : "id",
        action: value.action,
        reason_zh: value.reason_zh,
        reason_en: value.reason_zh,
        operator: prev?.operator ?? currentOperator(),
        decided_at: prev?.decided_at ?? nowIso(),
        applied: prev?.applied ?? false,
      })
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.decided_at || b.created || "").localeCompare(a.decided_at || a.created || ""),
    )
  }, [decisions, localDecisions])

  /**
   * 「审核记录」弹窗的数据：本机流水 **加上索引仓库里已经生效的审核结果**。
   * 少了仓库这一路，维护者早先在仓库里做的决定在这个弹窗里就查不到 —— 工作台把某条
   * 显示成「未通过」并带出拒绝理由，弹窗里却一条都没有，看起来就像「记录没同步」。
   * 去重规则与记录中心一致：同名同动作保留仓库那条（已生效），本机副本不再重复列。
   */
  const dialogReviewRecords = useMemo<ReviewRecord[]>(() => {
    const applied = new Set<string>()
    const fromRepo: ReviewRecord[] = []
    const nameById = new Map<string, string>()
    for (const m of sync?.mods || []) {
      if (m.id) nameById.set(m.id, m.displayName || m.id)
    }
    for (const [key, value] of Object.entries(sync?.moderation || {})) {
      if (!value) continue
      const rawAction = (value.action || "").trim()
      if (!rawAction) continue
      const action = rawAction === "delist" ? "delist" : "reject"
      const modId = value.id || value.source || key
      if (!modId) continue
      const tail = (value.source || "").split("/").filter(Boolean).pop() || ""
      applied.add(`${modId}::${action}`)
      fromRepo.push({
        id: `sync-${key}`,
        mod_id: modId,
        mod_name: nameById.get(modId) || tail || modId,
        action,
        reason: value.reason?.zh || "",
        mode: "",
        operator: value.by || "",
        acted_at: value.at || "",
        created: value.at || "",
        origin: "repo",
        raw_action: rawAction,
      })
    }
    const local = reviewRecords
      .filter((r) => !applied.has(`${r.mod_id}::${r.action}`))
      .map((r) => ({ ...r, origin: r.origin ?? ("local" as const) }))
    return [...fromRepo, ...local].sort((a, b) =>
      (b.acted_at || b.created || "").localeCompare(a.acted_at || a.created || ""),
    )
  }, [sync, reviewRecords])

  const moderationJson = useMemo(
    () =>
      JSON.stringify(
        {
          schemaVersion: 1,
          updatedAt: nowIso(),
          entries: exportEntries.map((d) => ({
            target: d.target,
            kind: d.kind || (d.target.includes("/") ? "source" : "id"),
            action: d.action,
            reason: { zh: d.reason_zh || "", en: d.reason_en || "" },
            at: d.decided_at || "",
            by: d.operator || "",
          })),
        },
        null,
        2,
      ),
    [exportEntries],
  )

  const exportSources = useMemo(() => {
    const rejected = new Set(
      exportEntries.filter((d) => d.action === "reject").map((d) => d.target),
    )
    const sources = Array.isArray(sync?.sources) ? sync?.sources ?? [] : []
    return sources.filter((s) => s && !rejected.has(s))
  }, [sync, exportEntries])

  const sourcesJson = useMemo(
    () => JSON.stringify({ schemaVersion: 1, sources: exportSources }, null, 2),
    [exportSources],
  )

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setToast({ kind: "ok", text: `${label} 已复制到剪贴板` })
    } catch {
      setToast({ kind: "error", text: "复制失败，请手动选中内容复制" })
    }
  }, [])

  const downloadJson = useCallback((filename: string, text: string) => {
    try {
      const blob = new Blob([text], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      setToast({ kind: "error", text: "下载失败，请改用复制" })
    }
  }, [])

  /* ---------------------------- 交互回调 ---------------------------- */

  const selectItem = useCallback((item: QueueItem) => {
    setSelectedKey(item.key)
    setReason("")
    setActionKind(item.status === "published" || item.status === "delisted" ? "delist" : "approve")
  }, [])

  const openRecords = useCallback(
    (tab: "review" | "delete" = "review") => {
      setRecordsTab(tab)
      setRecordsOpen(true)
      void Promise.all([loadReviewRecords(), loadDeleteRecords()])
    },
    [loadDeleteRecords, loadReviewRecords],
  )

  const openExport = useCallback(() => {
    setExportOpen(true)
    void loadDecisions()
  }, [loadDecisions])

  const applyQuickReason = useCallback((text: string) => {
    setReason(text)
  }, [])

  // 筛选条件变化后回到第一页，避免停在越界的空页
  const changeFilterStatus = useCallback((next: QueueFilter) => {
    setFilterStatus(next)
    setQueuePage(1)
  }, [])

  const changeKeyword = useCallback((value: string) => {
    setKeyword(value)
    setQueuePage(1)
  }, [])

  const changeQueuePage = useCallback((next: number) => {
    setQueuePage(Math.max(1, next))
  }, [])

  return {
    // 状态
    mode: mode,
    repo: sync?.repo || "",
    branch: sync?.branch || "",
    publishedAt: sync?.publishedAt || "",
    fetchedAt: sync?.fetchedAt || "",
    sourceCount: Array.isArray(sync?.sources) ? (sync?.sources ?? []).length : 0,
    warnings: Array.isArray(sync?.warnings) ? sync?.warnings ?? [] : [],
    syncFromCache: syncFromCache,
    syncError: syncError,
    queueItems: queueItems,
    deletedItems: deletedItems,
    items: pagedItems,
    queueTotal: queueTotal,
    queuePage: safeQueuePage,
    queuePageCount: queuePageCount,
    queuePageSize: QUEUE_PAGE_SIZE,
    selected: selected,
    stats: stats,
    loading: loading,
    refreshing: refreshing,
    busyKey: busyKey,
    toast: toast,
    inspecting: inspecting,
    lastInspectAt: lastInspectAt,
    autoPromotedCount: autoPromotedCount,
    purging: purging,
    sourceInspections: sourceInspections,
    inspectingSources: inspectingSources,
    filterStatus: filterStatus,
    filterCounts: filterCounts,
    keyword: keyword,
    reason: reason,
    actionKind: actionKind,
    quickReasons: QUICK_REJECT_REASONS,
    reviewRecords: dialogReviewRecords,
    deleteRecords: deleteRecords,
    recordsOpen: recordsOpen,
    recordsTab: recordsTab,
    exportOpen: exportOpen,
    exportEntries: exportEntries,
    moderationJson: moderationJson,
    sourcesJson: sourcesJson,
    exportSources: exportSources,
    // 回调
    setMode: setMode,
    refreshData: refreshData,
    setFilterStatus: changeFilterStatus,
    setKeyword: changeKeyword,
    setQueuePage: changeQueuePage,
    setReason: setReason,
    setActionKind: setActionKind,
    selectItem: selectItem,
    approveItem: approveItem,
    rejectItem: rejectItem,
    delistItem: delistItem,
    restoreItem: restoreItem,
    deleteItem: deleteItem,
    // 批量操作
    selectedKeys: selectedKeys,
    selectedItems: selectedItems,
    toggleSelect: toggleSelect,
    selectMany: selectMany,
    clearSelection: clearSelection,
    selectAllFiltered: selectAllFiltered,
    bulkRunning: bulkRunning,
    bulkProgress: bulkProgress,
    runBulkAction: runBulkAction,
    purgeOfflineMods: purgeOfflineMods,
    runInspection: runInspection,
    reinspectSource: reinspectSource,
    openRecords: openRecords,
    setRecordsOpen: setRecordsOpen,
    setRecordsTab: setRecordsTab,
    openExport: openExport,
    setExportOpen: setExportOpen,
    copyText: copyText,
    downloadJson: downloadJson,
    applyQuickReason: applyQuickReason,
    summarizeChecks: summarizeChecks,
    checkCounts: checkCounts,
  }
}

export type HomeLogic = ReturnType<typeof useHome>
