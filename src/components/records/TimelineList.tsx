import { useEffect, useRef } from "react"
import { History, Loader2, RadioTower } from "lucide-react"
import { ActionBadge, ModeBadge, OriginBadge, RepoAliveBadge } from "./recordBadges"
import { Pager } from "@/components/common/Pager"
import type { TimelineItem } from "@/pages/Records/useRecords"
import { formatDateTime, formatOperator, formatRelative } from "@/pages/Records/useRecords"
import { cn } from "@/lib/utils"

interface TimelineListProps {
  items: TimelineItem[]
  selectedId: string | null
  onSelect: (item: TimelineItem) => void
  loading: boolean
  errorText: string
  total: number
  page: number
  pageCount: number
  pageSize: number
  onPageChange: (next: number) => void
}

export function TimelineList(p: TimelineListProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [p.page])

  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card shadow-md">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">动作时间线</h2>
          <p className="text-xs text-muted-foreground">按时间倒序，点任意一条查看完整详情</p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-xs text-secondary-foreground">
          {p.total}
        </span>
      </div>

      <div ref={listRef} className="min-h-0 max-h-[65vh] flex-1 overflow-y-auto p-4">
        {p.loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在载入记录
          </div>
        ) : p.errorText ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            {p.errorText}
          </p>
        ) : p.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-12 text-center">
            <History className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">当前筛选下没有记录</p>
            <p className="text-xs text-muted-foreground">试试放宽动作类型或时间范围</p>
          </div>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-5">
            {p.items.map((item) => {
              const active = item.id === p.selectedId
              return (
                <li key={item.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[1.65rem] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-card",
                      item.action === "reject" ||
                      item.action === "delist" ||
                      item.action === "delete"
                        ? "bg-destructive"
                        : item.action === "repo_check"
                          ? "bg-muted-foreground"
                          : "bg-primary",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => p.onSelect(item)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                      active
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-background hover:border-primary/30",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionBadge action={item.action} />
                        <OriginBadge origin={item.origin} />
                        <ModeBadge mode={item.mode} />
                        {item.action === "repo_check" ? (
                          <RepoAliveBadge alive={item.alive} />
                        ) : null}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatRelative(item.at)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-foreground">
                        {item.mod_name || item.mod_id}
                      </span>
                      <span className="break-all font-mono text-xs text-muted-foreground">
                        {item.mod_id}
                      </span>
                    </div>

                    {item.reason ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        理由：{item.reason}
                      </p>
                    ) : item.detail ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {item.action === "repo_check" ? (
                          <RadioTower className="h-3.5 w-3.5" />
                        ) : null}
                        {item.detail}
                      </p>
                    ) : null}

                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {formatOperator(item.operator)} · {formatDateTime(item.at)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ol>
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
