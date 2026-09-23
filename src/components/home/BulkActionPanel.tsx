import { useState } from "react"
import { Ban, CheckCircle2, Eraser, Layers, Loader2, RotateCcw, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ACTION_LABELS, BULK_REASON_REQUIRED, bulkActionAllowed } from "@/pages/Home/useHome"
import type { BulkProgress, DecisionAction, QueueItem } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface BulkActionPanelProps {
  /** 当前选中的条目（跨筛选保留） */
  items: QueueItem[]
  reason: string
  onReasonChange: (value: string) => void
  quickReasons: string[]
  onApplyQuickReason: (value: string) => void
  onRun: (action: DecisionAction, reason: string) => void
  onClear: () => void
  running: boolean
  progress: BulkProgress | null
}

const BULK_ACTIONS: Array<{
  value: DecisionAction
  icon: typeof Ban
  danger: boolean
  hint: string
}> = [
  { value: "approve", icon: CheckCircle2, danger: false, hint: "只处理「待收录」" },
  { value: "reject", icon: Ban, danger: true, hint: "处理「待收录 / 未通过」" },
  { value: "delist", icon: Trash2, danger: true, hint: "处理「已上架 / 待收录」" },
  { value: "restore", icon: RotateCcw, danger: false, hint: "处理已有审核结论的条目" },
  { value: "delete", icon: Eraser, danger: true, hint: "已上架的先下架，才能删" },
]

/**
 * 批量操作台：勾选条目后出现，一次处理一批。
 * 破坏性动作（拒绝 / 下架 / 删除）必须写明理由，理由会逐条写进审核流水与处置留档。
 */
export function BulkActionPanel(p: BulkActionPanelProps) {
  const total = p.items.length
  const itemsKey = p.items.map((item) => item.key).join("|")
  /**
   * 待确认的动作连同「在哪一批选择下点的」一起记：
   * 选择一变（换了一批条目 / 批量跑完自动清空），确认框自己就失效了 —— 不必用副作用去清状态。
   */
  const [pending, setPending] = useState<{ action: DecisionAction; forKey: string } | null>(null)
  const pendingAction = pending && pending.forKey === itemsKey ? pending.action : null
  const choosePending = (action: DecisionAction | null) => {
    setPending(action ? { action, forKey: itemsKey } : null)
  }

  const countFor = (action: DecisionAction) =>
    p.items.filter((item) => bulkActionAllowed(item, action)).length

  const pendingCount = pendingAction ? countFor(pendingAction) : 0
  const pendingSkipped = total - pendingCount
  const pendingLabel = pendingAction ? (ACTION_LABELS[pendingAction] ?? pendingAction) : ""
  const pendingDanger =
    pendingAction === "reject" || pendingAction === "delist" || pendingAction === "delete"
  const needsReason =
    pendingAction !== null && BULK_REASON_REQUIRED.includes(pendingAction)
  const canRun = !p.running && pendingCount > 0 && (!needsReason || p.reason.trim().length > 0)

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Layers className="h-4 w-4 text-primary" />
            批量操作
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            已选 <span className="font-mono text-primary">{total}</span> 条 · 不符合前置条件的条目会自动跳过并如实报数
          </p>
        </div>
        <button
          type="button"
          onClick={p.onClear}
          disabled={p.running}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          清空已选
        </button>
      </div>

      {p.running && p.progress ? (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在批量{p.progress.label}：{p.progress.done} / {p.progress.total} 条已完成
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${
                  p.progress.total > 0
                    ? Math.round((p.progress.done / p.progress.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {BULK_ACTIONS.map((action) => {
          const Icon = action.icon
          const count = countFor(action.value)
          const selected = pendingAction === action.value
          return (
            <Button
              key={action.value}
              type="button"
              variant="outline"
              disabled={p.running || count === 0}
              onClick={() => choosePending(action.value)}
              className={cn(
                "h-auto flex-col items-start gap-0.5 py-2 focus-visible:shadow-focus",
                action.danger
                  ? "border-destructive/40 text-destructive"
                  : "border-primary/40 text-primary",
                selected && (action.danger ? "bg-destructive/10" : "bg-primary/10"),
                count === 0 && "opacity-50",
              )}
            >
              <span className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4" />
                批量{ACTION_LABELS[action.value]}
              </span>
              <span className="text-[11px] font-normal opacity-80">
                可处理 {count} / {total} 条 · {action.hint}
              </span>
            </Button>
          )
        })}
      </div>

      {pendingAction ? (
        <div
          className={cn(
            "space-y-2 rounded-md border p-3",
            pendingDanger ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5",
          )}
        >
          <p className="text-xs text-foreground">
            确认对 <span className="font-mono text-primary">{pendingCount}</span> 条执行「批量
            {pendingLabel}」
            {pendingSkipped > 0 ? `，另有 ${pendingSkipped} 条不符合前置条件会被跳过` : ""}。
          </p>

          {pendingAction === "delete" ? (
            <p className="text-xs text-destructive">
              删除不可逆：这些条目会退出工作队列，之后只能在「已删除」筛选和操作记录里回溯。
              已上架的条目必须先下架再删。
            </p>
          ) : null}

          {needsReason ? (
            <>
              <label htmlFor="bulk-reason" className="text-xs font-medium text-foreground">
                批量操作的理由（必填，会逐条写进审核流水与处置留档）
              </label>
              <Textarea
                id="bulk-reason"
                value={p.reason}
                onChange={(e) => p.onReasonChange(e.target.value)}
                placeholder="写明这批条目为什么这样处理"
                className="min-h-20 focus-visible:shadow-focus"
              />
              <div className="flex flex-wrap gap-1.5">
                {p.quickReasons.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => p.onApplyQuickReason(q)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => p.onRun(pendingAction, p.reason)}
              disabled={!canRun}
              className={cn(
                "flex-1 gap-2 focus-visible:shadow-focus disabled:opacity-50",
                pendingDanger
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {p.running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认执行
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => choosePending(null)}
              disabled={p.running}
              className="gap-2 focus-visible:shadow-focus"
            >
              取消
            </Button>
          </div>

          {needsReason && p.reason.trim().length === 0 ? (
            <p className="text-xs text-muted-foreground">
              批量拒绝收录、下架、删除都必须写明理由，填好才能执行。
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          先选一个动作，再在确认框里复核条数；批量操作逐条串行执行，跑完会报出成功与跳过数。
        </p>
      )}
    </section>
  )
}
