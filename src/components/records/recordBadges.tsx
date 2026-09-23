import { cn } from "@/lib/utils"
import type { RecordAction, RecordOrigin } from "@/pages/Records/useRecords"
import { ACTION_LABELS, ORIGIN_HINTS, ORIGIN_LABELS } from "@/pages/Records/useRecords"

const ACTION_TONE: Record<RecordAction, string> = {
  approve: "border-primary/40 bg-primary/10 text-primary",
  reject: "border-destructive/40 bg-destructive/10 text-destructive",
  auto_approve: "border-primary/30 bg-primary/5 text-primary",
  delist: "border-destructive/30 bg-destructive/5 text-destructive",
  restore: "border-primary/30 bg-primary/5 text-primary",
  delete: "border-destructive/50 bg-destructive/10 text-destructive",
  repo_check: "border-border bg-secondary text-secondary-foreground",
}

export function ActionBadge({
  action,
  className,
}: {
  action: RecordAction
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        ACTION_TONE[action],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ACTION_LABELS[action]}
    </span>
  )
}

export function RepoAliveBadge({
  alive,
  className,
}: {
  alive: boolean | null
  className?: string
}) {
  if (alive === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
      >
        结果未定
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        alive
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-destructive/50 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {alive ? "仓库在线" : "仓库失联"}
    </span>
  )
}

/** 记录来源徽标：已生效（索引仓库） / 待应用（本机操作） */
export function OriginBadge({
  origin,
  className,
}: {
  origin: RecordOrigin
  className?: string
}) {
  const live = origin === "repo"
  return (
    <span
      title={ORIGIN_HINTS[origin]}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        live
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ORIGIN_LABELS[origin]}
    </span>
  )
}

export function ModeBadge({ mode, className }: { mode: string; className?: string }) {
  if (!mode) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground",
        className,
      )}
    >
      {mode === "auto" ? "无人值守" : "人工审核"}
    </span>
  )
}
