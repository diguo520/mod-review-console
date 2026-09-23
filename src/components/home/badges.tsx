import { cn } from "@/lib/utils"
import type { CheckStatus, QueueStatus } from "@/pages/Home/useHome"
import { QUEUE_STATUS_LABELS } from "@/pages/Home/useHome"

const SUMMARY_LABEL: Record<CheckStatus, string> = {
  pass: "全部通过",
  warn: "有警告",
  fail: "不通过",
}

const SUMMARY_CLASS: Record<CheckStatus, string> = {
  pass: "bg-primary/10 text-primary border-primary/30",
  warn: "bg-secondary text-secondary-foreground border-border",
  fail: "bg-destructive/10 text-destructive border-destructive/30",
}

const QUEUE_CLASS: Record<QueueStatus, string> = {
  pending: "bg-secondary text-secondary-foreground border-border",
  published: "bg-primary/10 text-primary border-primary/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  delisted: "bg-muted text-muted-foreground border-border",
}

export function CheckSummaryBadge({
  status,
  className,
}: {
  status: CheckStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        SUMMARY_CLASS[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {SUMMARY_LABEL[status]}
    </span>
  )
}

export function QueueStatusBadge({
  status,
  className,
}: {
  status: QueueStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        QUEUE_CLASS[status],
        className,
      )}
    >
      {QUEUE_STATUS_LABELS[status]}
    </span>
  )
}

export function OfflineBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive",
        className,
      )}
    >
      仓库失联
    </span>
  )
}

/** 已删除留档：条目已退出工作队列，只在「已删除 / 全部」筛选里可见 */
export function DeletedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      已删除
    </span>
  )
}

export function CheckStatusDot({ status }: { status: CheckStatus }) {
  const tone =
    status === "pass" ? "bg-primary" : status === "fail" ? "bg-destructive" : "bg-muted-foreground"
  return <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone)} />
}
