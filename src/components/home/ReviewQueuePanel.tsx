import { useEffect, useRef } from "react"
import { Inbox, Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Pager } from "@/components/common/Pager"
import { CheckSummaryBadge, DeletedBadge, OfflineBadge, QueueStatusBadge } from "./badges"
import { QUEUE_FILTERS, formatRelative, summarizeChecks } from "@/pages/Home/useHome"
import type { QueueFilter, QueueFilterOption, QueueItem } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface ReviewQueuePanelProps {
  items: QueueItem[]
  selectedId: string | null
  onSelect: (item: QueueItem) => void
  filterStatus: QueueFilter
  onFilterChange: (next: QueueFilter) => void
  /** 各筛选条件下的条数，直接印在筛选按钮上（与筛选结果严格一致） */
  filterCounts: Record<QueueFilter, number>
  keyword: string
  onKeywordChange: (value: string) => void
  loading: boolean
  busyKey: string | null
  total: number
  page: number
  pageCount: number
  pageSize: number
  onPageChange: (next: number) => void
  /** 批量操作：多选状态与勾选回调 */
  selectedKeys: Set<string>
  onToggleSelect: (item: QueueItem) => void
  onSelectMany: (items: QueueItem[], on: boolean) => void
  onSelectAllFiltered: () => void
  onClearSelection: () => void
  bulkRunning: boolean
}

/** 问题筛选（警告 / 不通过 / 失联）用醒目色，避免在大批量队列里被漏看 */
const FILTER_TONE: Record<QueueFilterOption["tone"], { active: string; idle: string }> = {
  default: {
    active: "border-primary/40 bg-primary/10 text-primary",
    idle: "border-border bg-background text-muted-foreground hover:text-foreground",
  },
  warn: {
    active: "border-secondary-foreground/40 bg-secondary text-secondary-foreground",
    idle: "border-border bg-background text-muted-foreground hover:text-foreground",
  },
  danger: {
    active: "border-destructive/50 bg-destructive/10 text-destructive",
    idle: "border-destructive/30 bg-background text-muted-foreground hover:border-destructive/50 hover:text-foreground",
  },
  muted: {
    active: "border-border bg-muted text-foreground",
    idle: "border-border bg-background text-muted-foreground hover:text-foreground",
  },
}

export function ReviewQueuePanel(p: ReviewQueuePanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const filtered = p.filterStatus !== "all" || p.keyword.trim().length > 0
  const activeOption = QUEUE_FILTERS.find((f) => f.value === p.filterStatus)
  const pageSelectable = p.items.filter((item) => !item.deleted)
  const pageAllSelected =
    pageSelectable.length > 0 && pageSelectable.every((item) => p.selectedKeys.has(item.key))
  const selectedCount = p.selectedKeys.size
  const hasMultiPage = p.total > p.items.length

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [p.page])

  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card shadow-md">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">审核队列</h2>
          <p className="text-xs text-muted-foreground">来自索引仓库的真实来源</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {selectedCount > 0 ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary">
              已选 {selectedCount}
            </span>
          ) : null}
          <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-xs text-secondary-foreground">
            {p.total}
          </span>
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={p.keyword}
            onChange={(e) => p.onKeywordChange(e.target.value)}
            placeholder="搜索名称 / id / 来源 / 作者 / 分类"
            className="pl-9 focus-visible:shadow-focus"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUEUE_FILTERS.map((f) => {
            const count = p.filterCounts[f.value] ?? 0
            const active = p.filterStatus === f.value
            return (
              <button
                key={f.value}
                type="button"
                title={f.hint}
                onClick={() => p.onFilterChange(f.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  active ? FILTER_TONE[f.tone].active : FILTER_TONE[f.tone].idle,
                )}
              >
                {f.label}
                <span className={cn("font-mono text-[11px]", active ? "" : "opacity-70")}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        {activeOption ? (
          <p className="text-xs text-muted-foreground">{activeOption.hint}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2.5 text-xs">
          <span className="text-muted-foreground">
            {p.bulkRunning ? "批量处理中…" : selectedCount > 0 ? `已选 ${selectedCount} 条` : "批量操作：勾选条目"}
          </span>
          <button
            type="button"
            onClick={() => p.onSelectMany(pageSelectable, !pageAllSelected)}
            disabled={pageSelectable.length === 0}
            className="rounded-full border border-border bg-background px-2.5 py-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-50"
          >
            {pageAllSelected ? "取消本页" : `全选本页（${pageSelectable.length}）`}
          </button>
          {hasMultiPage ? (
            <button
              type="button"
              onClick={p.onSelectAllFiltered}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              全选筛选结果（{p.total}）
            </button>
          ) : null}
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={p.onClearSelection}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:shadow-focus focus-visible:outline-none"
            >
              清空已选
            </button>
          ) : null}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 max-h-[60vh] flex-1 overflow-y-auto p-3">
        {p.loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载队列
          </div>
        ) : p.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-10 text-center">
            <Inbox className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filtered ? "当前筛选下没有条目" : "索引仓库里还没有可审核的来源"}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {filtered
                ? "换个状态筛选，或清空搜索关键词再看看。"
                : "等作者提交收录申请，或点右上角刷新数据重新拉取索引仓库。"}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {p.items.map((item) => {
              const active = item.key === p.selectedId
              const busy = item.key === p.busyKey
              const checked = p.selectedKeys.has(item.key)
              return (
                <li key={item.key} className="flex items-start gap-2">
                  {item.deleted ? (
                    <span aria-hidden className="mt-3.5 h-4 w-4 shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => p.onToggleSelect(item)}
                      aria-label={`勾选 ${item.displayName || item.source || item.modId}`}
                      className="mt-3.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => p.onSelect(item)}
                    className={cn(
                      "min-w-0 flex-1 rounded-md border p-3 text-left transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                      item.deleted
                        ? "border-dashed border-border bg-background/60 opacity-80"
                        : checked
                          ? "border-primary/50 bg-primary/10"
                          : active
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-background hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {item.displayName || "—"}
                      </span>
                      {busy ? (
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : item.deleted ? (
                        <DeletedBadge />
                      ) : (
                        <QueueStatusBadge status={item.status} />
                      )}
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {item.modId || item.source || "—"} · v{item.version || "—"}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.authorName || item.authorId || "—"} · {item.category || "—"} ·{" "}
                      {item.publishedAt || "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {item.checks.length > 0 ? (
                        <CheckSummaryBadge status={summarizeChecks(item.checks)} />
                      ) : item.inspectStatus === "loading" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1 text-xs text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          体检中
                        </span>
                      ) : item.inspectStatus === "idle" ? (
                        <span className="rounded-full border border-dashed border-primary/30 px-2.5 py-1 text-xs text-muted-foreground">
                          待体检
                        </span>
                      ) : (
                        <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
                          信息不全
                        </span>
                      )}
                      {item.manifestFromSource ? (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
                          来源清单
                        </span>
                      ) : null}
                      {item.repoAlive === false ? <OfflineBadge /> : null}
                      {item.complete ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatRelative(item.lastCheckAt)}
                        </span>
                      ) : null}
                    </div>
                    {item.deleted ? (
                      <p className="mt-1.5 truncate text-xs text-muted-foreground">
                        删除留档：{item.deletedReason || "未填写理由"}
                        {item.deletedAt ? ` · ${formatRelative(item.deletedAt)}` : ""}
                      </p>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Pager
        page={p.page}
        pageCount={p.pageCount}
        total={p.total}
        pageSize={p.pageSize}
        onPageChange={p.onPageChange}
      />
    </section>
  )
}
