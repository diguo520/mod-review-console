import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { getAuthHeaders } from "@/lib/auth"
import { ACTION_LABELS as HOME_ACTION_LABELS } from "@/pages/Home/useHome"

/* ------------------------------------------------------------------ *
 * 类型（字段名 100% 跟 PocketBase 一致，snake_case）
 * ------------------------------------------------------------------ */

export type RecordAction =
  | "approve"
  | "reject"
  | "auto_approve"
  | "delist"
  | "restore"
  | "delete"
  | "repo_check"
export type TimeRange = "today" | "7d" | "30d" | "all"
/**
 * 记录来源：
 * - repo  索引仓库里已经生效的审核结果（导出重建索引之后才进得来）
 * - local 本机流水，导出并重建索引之前只在本机可见
 */
export type RecordOrigin = "repo" | "local"
export type OriginFilter = "all" | RecordOrigin

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
}

export interface DeleteRecord {
  id: string
  mod_id: string
  mod_name: string
  reason: string
  operator: string
  deleted_at: string
  /** 处置留档的动因：拒绝收录（reject）or 下架（delist）；老数据为空串，按下架处理 */
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

/** 索引仓库条目（/api/mod-sync/state 的 mods[]，字段可能缺失） */
interface SyncModLite {
  id?: string
  displayName?: string
  version?: string
  author?: { id?: string; name?: string }
  category?: string
  sizeBytes?: number
  sha256?: string
  repo?: string
}

/** 索引仓库里已生效的审核结果（/api/mod-sync/state 的 moderation{}） */
interface SyncModerationLite {
  id?: string
  source?: string
  authorId?: string
  action?: string
  reason?: { zh?: string; en?: string }
  at?: string
  by?: string
}

interface SyncStateLite {
  mods?: SyncModLite[]
  moderation?: Record<string, SyncModerationLite>
}

/** 详情面板里的 MOD 快照（取自索引仓库当前数据） */
export interface ModSnapshot {
  display_name: string
  mod_id: string
  version: string
  category: string
  author_id: string
  author_name: string
  repo: string
  size_bytes: number
  sha256: string
}

export interface TimelineItem {
  id: string
  source: "review" | "delete" | "check" | "sync"
  /** 记录来源：索引仓库已生效 / 本机待应用 */
  origin: RecordOrigin
  action: RecordAction
  /** 仓库里的原始动作名；与 action 不同时在详情里额外展示，不丢信息 */
  raw_action: string
  mod_id: string
  mod_name: string
  operator: string
  mode: string
  reason: string
  detail: string
  at: string
  alive: boolean | null
  repo_url: string
  snapshot: ModSnapshot | null
}

export interface RecordStats {
  total: number
  approve: number
  reject: number
  auto_approve: number
  delist: number
  restore: number
  delete: number
  repo_check: number
  /** 当前筛选下已生效（来自索引仓库）的条数 */
  repo: number
  /** 当前筛选下待应用（本机操作）的条数 */
  local: number
}

/* ------------------------------------------------------------------ *
 * 展示用常量 / 纯函数
 * ------------------------------------------------------------------ */

/** 动作文案：收录 / 拒绝 / 下架 / 恢复与审核台共用措辞，另补巡检与自动放行 */
export const ACTION_LABELS: Record<RecordAction, string> = {
  approve: HOME_ACTION_LABELS.approve,
  reject: HOME_ACTION_LABELS.reject,
  auto_approve: "自动放行",
  delist: HOME_ACTION_LABELS.delist,
  restore: HOME_ACTION_LABELS.restore,
  delete: HOME_ACTION_LABELS.delete,
  repo_check: "仓库巡检",
}

export const ACTION_HINTS: Record<RecordAction, string> = {
  approve: "维护者人工核对后收录通过",
  reject: "写明理由退回作者",
  auto_approve: "无人值守模式下自动放行",
  delist: "从市场撤下并留处置留档",
  restore: "撤销之前的审核结果，恢复上架",
  delete: "彻底移出市场并留档，不可逆",
  repo_check: "周期确认作者仓库是否仍在线",
}

export const ACTION_ORDER: RecordAction[] = [
  "approve",
  "reject",
  "auto_approve",
  "delist",
  "delete",
  "restore",
  "repo_check",
]

export const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "all", label: "全部" },
]

export const ORIGIN_LABELS: Record<RecordOrigin, string> = {
  repo: "已生效",
  local: "待应用",
}

export const ORIGIN_HINTS: Record<RecordOrigin, string> = {
  repo: "来自索引仓库，这条审核结果已经在线上生效",
  local: "本机操作记录，导出并重建索引之后才会在索引仓库里生效",
}

export const ORIGIN_FILTERS: Array<{ value: OriginFilter; label: string }> = [
  { value: "all", label: "全部来源" },
  { value: "repo", label: "已生效" },
  { value: "local", label: "待应用" },
]

const TIMELINE_PAGE_SIZE = 50

export function isRecordAction(value: string): value is RecordAction {
  return (ACTION_ORDER as string[]).includes(value)
}

export function formatOperator(value: string): string {
  if (!value) return "维护者"
  if (value === "moderator") return "维护者"
  if (value.startsWith("rh:")) return value.slice(3)
  return value
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
  return `${Math.floor(hours / 24)} 天前`
}

function rangeCutoff(range: TimeRange): number {
  const now = Date.now()
  if (range === "today") {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }
  if (range === "7d") return now - 7 * 86_400_000
  if (range === "30d") return now - 30 * 86_400_000
  return 0
}

/** 索引仓库里的审核动作只有 reject / delist，其它取值一律按拒绝收录归类 */
function toRecordAction(raw: string): RecordAction {
  return raw === "delist" ? "delist" : "reject"
}

/* ------------------------------------------------------------------ *
 * 数据读取
 * ------------------------------------------------------------------ */

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getPocketBaseUrl()}${path}`, {
    headers: { ...getAuthHeaders() },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getPocketBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    // 服务端要求登录时会把原因写在 body 里 —— 直接把它带给用户，比 "HTTP 401" 有用得多：
    // 维护者一眼就知道是登录态的问题，而不是系统坏了
    let detail = ""
    try {
      const data = (await res.json()) as { message?: string }
      detail = data?.message || ""
    } catch {
      /* body 不是 JSON 就退回状态码 */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

/** 可清空的范围：本机操作记录 / 仓库巡检记录。索引仓库里已生效的结果不在本机，清不掉 */
export type ClearScope = "local" | "checks"

interface ListResponse<T> {
  items?: T[]
}

async function fetchReviewRecords(): Promise<ReviewRecord[]> {
  const data = await apiGet<ListResponse<ReviewRecord>>("/api/review_records")
  return Array.isArray(data.items) ? data.items : []
}

async function fetchDeleteRecords(): Promise<DeleteRecord[]> {
  const data = await apiGet<ListResponse<DeleteRecord>>("/api/delete_records")
  return Array.isArray(data.items) ? data.items : []
}

async function fetchRepoChecks(): Promise<RepoCheck[]> {
  const data = await apiGet<ListResponse<RepoCheck>>("/api/repo_checks")
  return Array.isArray(data.items) ? data.items : []
}

/** 索引仓库快照：mods[] 用来补 MOD 快照与名字，moderation{} 是已生效的审核结果 */
interface SyncSnapshotData {
  mods: SyncModLite[]
  moderation: Record<string, SyncModerationLite>
  ok: boolean
}

/**
 * 拉索引仓库状态。这一路失败不能拖垮整页：拿不到就返回 ok:false，
 * 本机三张流水照常显示，另外给维护者一句说明。
 */
async function fetchSyncState(): Promise<SyncSnapshotData> {
  try {
    const data = await apiGet<SyncStateLite>("/api/mod-sync/state")
    return {
      mods: Array.isArray(data.mods) ? data.mods : [],
      moderation:
        data.moderation && typeof data.moderation === "object" ? data.moderation : {},
      ok: true,
    }
  } catch {
    return { mods: [], moderation: {}, ok: false }
  }
}

/* ------------------------------------------------------------------ *
 * 主 hook
 * ------------------------------------------------------------------ */

export function useRecords() {
  const navigate = useNavigate()
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>([])
  const [deleteRecords, setDeleteRecords] = useState<DeleteRecord[]>([])
  const [repoChecks, setRepoChecks] = useState<RepoCheck[]>([])
  const [syncMods, setSyncMods] = useState<SyncModLite[]>([])
  const [syncModeration, setSyncModeration] = useState<Record<string, SyncModerationLite>>({})
  // 初值取 true，避免首次加载期间闪出「拉不到索引仓库」的提示
  const [syncAvailable, setSyncAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState("")

  const [actionTypes, setActionTypes] = useState<RecordAction[]>([])
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all")
  const [modKeyword, setModKeyword] = useState("")
  const [operatorFilter, setOperatorFilter] = useState("")
  const [timeRange, setTimeRange] = useState<TimeRange>("all")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [timelinePage, setTimelinePage] = useState(1)

  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  /** 清空后的结果说明，显示在时间线上方，不弹窗打断 */
  const [clearNote, setClearNote] = useState("")

  /* ---------------------------- 数据读取 ---------------------------- */

  const loadAll = useCallback(async () => {
    const [reviews, deletes, checks, syncState] = await Promise.all([
      fetchReviewRecords(),
      fetchDeleteRecords(),
      fetchRepoChecks(),
      fetchSyncState(),
    ])
    setReviewRecords(reviews)
    setDeleteRecords(deletes)
    setRepoChecks(checks)
    setSyncMods(syncState.mods)
    setSyncModeration(syncState.moderation)
    setSyncAvailable(syncState.ok)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setErrorText("")
      try {
        await loadAll()
      } catch {
        if (!cancelled) setErrorText("记录加载失败，请稍后重试")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadAll])

  /* ---------------------------- 派生：时间线 ---------------------------- */

  const snapshotByModId = useMemo(() => {
    const map = new Map<string, ModSnapshot>()
    for (const mod of syncMods) {
      const id = mod.id || ""
      if (!id || map.has(id)) continue
      map.set(id, {
        display_name: mod.displayName || "",
        mod_id: id,
        version: mod.version || "",
        category: mod.category || "",
        author_id: mod.author?.id || "",
        author_name: mod.author?.name || "",
        repo: mod.repo || "",
        size_bytes: Number(mod.sizeBytes) || 0,
        sha256: mod.sha256 || "",
      })
    }
    return map
  }, [syncMods])

  /** mod id → 展示名，用来给仓库里的审核结果补一个可读的名字 */
  const nameByModId = useMemo(() => {
    const map = new Map<string, string>()
    for (const mod of syncMods) {
      const id = mod.id || ""
      if (!id || map.has(id)) continue
      map.set(id, mod.displayName || "")
    }
    return map
  }, [syncMods])

  const items = useMemo<TimelineItem[]>(() => {
    const merged: TimelineItem[] = []
    /**
     * 索引仓库里已经生效的 (mod_id, action)。
     * 本机那几条 reject / delist 只是还没导出应用的副本，两边同时列会让维护者
     * 看到一对重复记录 —— 所以同名同动作一律保留仓库那条（已生效）。
     */
    const appliedKeys = new Set<string>()

    // 数据源 4：索引仓库里已生效的审核结果（reject / delist 才会写进仓库）
    for (const [key, value] of Object.entries(syncModeration)) {
      if (!value) continue
      const rawAction = (value.action || "").trim()
      if (!rawAction) continue
      const action = toRecordAction(rawAction)
      const modId = value.id || value.source || key
      if (!modId) continue
      const source = value.source || ""
      const tail = source.split("/").filter(Boolean).pop() || ""
      appliedKeys.add(`${modId}::${action}`)
      merged.push({
        id: `sync-${key}`,
        source: "sync",
        origin: "repo",
        raw_action: rawAction,
        action,
        mod_id: modId,
        mod_name: nameByModId.get(modId) || tail || modId,
        operator: value.by || "",
        mode: "",
        reason: value.reason?.zh || "",
        detail: "该审核结果已写进索引仓库并生效",
        at: value.at || "",
        alive: null,
        repo_url: "",
        snapshot: snapshotByModId.get(modId) ?? null,
      })
    }

    for (const r of reviewRecords) {
      if (!isRecordAction(r.action)) continue
      // 拒绝与下架在处置留档里另有更完整的理由留档，统一由那边出条目，避免同一次动作出现两条
      if (r.action === "reject" || r.action === "delist" || r.action === "delete") continue
      merged.push({
        id: `review-${r.id}`,
        source: "review",
        origin: "local",
        raw_action: r.action,
        action: r.action,
        mod_id: r.mod_id,
        mod_name: r.mod_name,
        operator: r.operator,
        mode: r.mode,
        reason: r.reason,
        detail: r.mode === "auto" ? "无人值守模式自动放行" : "人工审核动作",
        at: r.acted_at || r.created,
        alive: null,
        repo_url: "",
        snapshot: snapshotByModId.get(r.mod_id) ?? null,
      })
    }

    for (const d of deleteRecords) {
      // 老数据的 action_kind 可能是空串或已废弃的取值，一律按下架处理；
      // delete 是「单独删除」的留档，与下架区分开
      const action: RecordAction =
        d.action_kind === "reject" ? "reject" : d.action_kind === "delete" ? "delete" : "delist"
      // 同一个 MOD 的同一个动作已经在索引仓库里生效，就不再重复列本机这条
      if (appliedKeys.has(`${d.mod_id}::${action}`)) continue
      merged.push({
        id: `delete-${d.id}`,
        source: "delete",
        origin: "local",
        raw_action: action,
        action,
        mod_id: d.mod_id,
        mod_name: d.mod_name,
        operator: d.operator,
        mode: "manual",
        reason: d.reason,
        detail:
          action === "reject"
            ? "拒绝收录已留档，条目退回作者"
            : action === "delete"
              ? "已单独删除并留档，条目退出工作队列"
              : "已从市场撤下",
        at: d.deleted_at || d.created,
        alive: null,
        repo_url: "",
        snapshot: snapshotByModId.get(d.mod_id) ?? null,
      })
    }

    for (const c of repoChecks) {
      merged.push({
        id: `check-${c.id}`,
        source: "check",
        origin: "local",
        raw_action: "repo_check",
        action: "repo_check",
        mod_id: c.mod_id,
        mod_name: c.mod_name,
        operator: "巡检任务",
        mode: "",
        reason: "",
        detail: c.detail,
        at: c.checked_at || c.created,
        alive: c.alive === true,
        repo_url: c.repo_url,
        snapshot: snapshotByModId.get(c.mod_id) ?? null,
      })
    }

    return merged.sort((a, b) => (b.at || "").localeCompare(a.at || ""))
  }, [syncModeration, nameByModId, reviewRecords, deleteRecords, repoChecks, snapshotByModId])

  const operators = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      if (item.action === "repo_check") continue
      if (item.operator) set.add(item.operator)
    }
    return Array.from(set).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    const kw = modKeyword.trim().toLowerCase()
    const cutoff = rangeCutoff(timeRange)
    return items.filter((item) => {
      if (actionTypes.length > 0 && !actionTypes.includes(item.action)) return false
      if (originFilter !== "all" && item.origin !== originFilter) return false
      if (operatorFilter && item.operator !== operatorFilter) return false
      if (cutoff > 0) {
        const t = new Date(item.at).getTime()
        if (Number.isNaN(t) || t < cutoff) return false
      }
      if (!kw) return true
      return [item.mod_name, item.mod_id].some((v) => (v || "").toLowerCase().includes(kw))
    })
  }, [items, actionTypes, originFilter, modKeyword, operatorFilter, timeRange])

  // 分页：先按筛选条件收敛，再对合并排序后的结果切页，只渲染当前页
  const filteredCount = filteredItems.length
  const timelinePageCount = Math.max(1, Math.ceil(filteredCount / TIMELINE_PAGE_SIZE))
  const safeTimelinePage = Math.min(Math.max(timelinePage, 1), timelinePageCount)
  const pagedItems = useMemo(
    () =>
      filteredItems.slice(
        (safeTimelinePage - 1) * TIMELINE_PAGE_SIZE,
        safeTimelinePage * TIMELINE_PAGE_SIZE,
      ),
    [filteredItems, safeTimelinePage],
  )

  const stats = useMemo<RecordStats>(() => {
    const count = (a: RecordAction) => filteredItems.filter((i) => i.action === a).length
    return {
      total: filteredItems.length,
      approve: count("approve"),
      reject: count("reject"),
      auto_approve: count("auto_approve"),
      delist: count("delist"),
      restore: count("restore"),
      delete: count("delete"),
      repo_check: count("repo_check"),
      repo: filteredItems.filter((i) => i.origin === "repo").length,
      local: filteredItems.filter((i) => i.origin === "local").length,
    }
  }, [filteredItems])

  const selected = useMemo<TimelineItem | null>(() => {
    if (!selectedId) return null
    return filteredItems.find((i) => i.id === selectedId) ?? null
  }, [selectedId, filteredItems])

  const hasActiveFilter =
    actionTypes.length > 0 ||
    originFilter !== "all" ||
    modKeyword.trim().length > 0 ||
    operatorFilter !== "" ||
    timeRange !== "all"

  /** 索引仓库拉不到时给维护者一句说明，而不是把整页变成错误态 */
  const syncNote = syncAvailable
    ? ""
    : "索引仓库暂时拉不到，当前只显示本机记录；索引里已生效的审核结果可能缺失，稍后可重新打开本页刷新。"

  /**
   * 本机可清空的条数。索引仓库里已生效的那些**不在本机**，所以清不掉也不用清 ——
   * 弹窗里要照实说明，否则维护者会以为清空能连仓库一起改。
   */
  const localClearableCount = reviewRecords.length + deleteRecords.length
  const checkClearableCount = repoChecks.length

  /* ---------------------------- 交互回调 ---------------------------- */

  const toggleAction = useCallback((action: RecordAction) => {
    setActionTypes((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action],
    )
    setTimelinePage(1)
  }, [])

  const clearFilters = useCallback(() => {
    setActionTypes([])
    setOriginFilter("all")
    setModKeyword("")
    setOperatorFilter("")
    setTimeRange("all")
    setTimelinePage(1)
  }, [])

  // 筛选条件变化后回到第一页，避免停在越界的空页
  const changeOriginFilter = useCallback((value: OriginFilter) => {
    setOriginFilter(value)
    setTimelinePage(1)
  }, [])

  const changeModKeyword = useCallback((value: string) => {
    setModKeyword(value)
    setTimelinePage(1)
  }, [])

  const changeOperatorFilter = useCallback((value: string) => {
    setOperatorFilter(value)
    setTimelinePage(1)
  }, [])

  const changeTimeRange = useCallback((value: TimeRange) => {
    setTimeRange(value)
    setTimelinePage(1)
  }, [])

  const changeTimelinePage = useCallback((next: number) => {
    setTimelinePage(Math.max(1, next))
  }, [])

  const selectItem = useCallback((item: TimelineItem) => {
    setSelectedId(item.id)
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedId(null)
  }, [])

  const goToWorkbench = useCallback(
    (modId: string) => {
      if (!modId) return
      navigate(`/?mod=${encodeURIComponent(modId)}`)
    },
    [navigate],
  )

  /**
   * 清空本机记录。导出并重建索引之后，本机的暂存记录就该归零，否则时间线里
   * 已经生效的东西和还没应用的东西混在一起，看不出还剩哪些没处理。
   * 逐条删上百条既慢又会中途失败，所以交给服务端一次删完并回报条数。
   */
  const clearRecords = useCallback(
    async (scopes: ClearScope[]) => {
      if (scopes.length === 0) return
      setClearing(true)
      setClearNote("")
      try {
        const data = await apiPost<{ ok?: boolean; removed?: { local?: number; checks?: number } }>(
          "/api/mod-records/clear",
          { scopes: scopes },
        )
        const parts: string[] = []
        if (scopes.includes("local")) parts.push(`本机操作记录 ${data.removed?.local ?? 0} 条`)
        if (scopes.includes("checks")) parts.push(`仓库巡检记录 ${data.removed?.checks ?? 0} 条`)
        setClearNote(`已清空：${parts.join("、")}。索引仓库里已生效的审核结果不受影响。`)
        setClearOpen(false)
        setSelectedId(null)
        setTimelinePage(1)
        await loadAll()
      } catch (err) {
        // 服务端给了具体原因（比如要求先登录）就照实说，只有拿不到原因时才说「稍后重试」
        const detail = err instanceof Error ? err.message : ""
        setClearNote(
          detail && !detail.startsWith("HTTP ")
            ? `${detail}，记录没有变动。`
            : "清空失败，记录没有变动，请稍后重试。",
        )
      } finally {
        setClearing(false)
      }
    },
    [loadAll],
  )

  return {
    // 状态
    loading: loading,
    errorText: errorText,
    syncNote: syncNote,
    items: pagedItems,
    filteredCount: filteredCount,
    timelinePage: safeTimelinePage,
    timelinePageCount: timelinePageCount,
    timelinePageSize: TIMELINE_PAGE_SIZE,
    totalCount: items.length,
    stats: stats,
    operators: operators,
    selected: selected,
    hasActiveFilter: hasActiveFilter,
    actionTypes: actionTypes,
    originFilter: originFilter,
    modKeyword: modKeyword,
    operatorFilter: operatorFilter,
    timeRange: timeRange,
    clearOpen: clearOpen,
    clearing: clearing,
    clearNote: clearNote,
    localClearableCount: localClearableCount,
    checkClearableCount: checkClearableCount,
    // 回调
    toggleAction: toggleAction,
    setClearOpen: setClearOpen,
    setClearNote: setClearNote,
    clearRecords: clearRecords,
    clearFilters: clearFilters,
    setOriginFilter: changeOriginFilter,
    setModKeyword: changeModKeyword,
    setOperatorFilter: changeOperatorFilter,
    setTimeRange: changeTimeRange,
    setTimelinePage: changeTimelinePage,
    selectItem: selectItem,
    closeDetail: closeDetail,
    goToWorkbench: goToWorkbench,
  }
}

export type RecordsLogic = ReturnType<typeof useRecords>
