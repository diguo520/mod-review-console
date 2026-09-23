import { Loader2, RefreshCw } from "lucide-react"
import { CheckStatusDot } from "./badges"
import { Button } from "@/components/ui/button"
import { CHECK_LABELS, checkCounts, summarizeChecks } from "@/pages/Home/useHome"
import type { CheckItem, CheckStatus, SourceInspectStatus } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface CheckListPanelProps {
  items: CheckItem[] | null
  /** 索引里是否有完整条目可核对 */
  complete?: boolean
  /** 来源体检状态（残缺条目用） */
  inspectStatus?: SourceInspectStatus
  /** 服务端给的体检说明，原样展示，不做改写 */
  inspectNote?: string
  /** 重新体检这个来源 */
  onRetry?: () => void
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: "通过",
  warn: "警告",
  fail: "不通过",
}

const STATUS_CLASS: Record<CheckStatus, string> = {
  pass: "text-primary",
  warn: "text-muted-foreground",
  fail: "text-destructive",
}

const SUMMARY_TEXT: Record<CheckStatus, string> = {
  pass: "全部通过",
  warn: "有警告项",
  fail: "存在不通过",
}

export function CheckListPanel({
  items,
  complete = true,
  inspectStatus = "idle",
  inspectNote = "",
  onRetry,
}: CheckListPanelProps) {
  const list = Array.isArray(items) ? items : []
  const counts = checkCounts(items)
  const summary = summarizeChecks(items)
  const checking = !complete && (inspectStatus === "loading" || inspectStatus === "idle")

  return (
    <section className="rounded-lg border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">自动检查清单</h3>
          {list.length > 0 ? (
            <span className={cn("text-xs", STATUS_CLASS[summary])}>{SUMMARY_TEXT[summary]}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
            通过 {counts.pass}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
            警告 {counts.warn}
          </span>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
            不通过 {counts.fail}
          </span>
        </div>
      </div>

      {list.length === 0 ? (
        checking ? (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            正在体检这个来源…
          </p>
        ) : (
          <div className="mt-3 space-y-3 rounded-md border border-dashed border-border px-3 py-4">
            <p className="text-sm text-muted-foreground">
              {complete
                ? "索引里还没有这个条目的字段，暂时无法逐项核对。"
                : "这条来源只有仓库地址，尚未收录为模组，索引里还没有它的 manifest，暂时无法逐项核对。"}
            </p>
            {!complete && inspectNote ? (
              <p className="break-words text-sm text-foreground">{inspectNote}</p>
            ) : null}
            {!complete && onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新体检
              </Button>
            ) : null}
          </div>
        )
      ) : (
        // 两列排布：检查项之间是并列关系，一列铺开太长，右栏才是重点
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((item) => {
            const label = CHECK_LABELS[item.key] ?? item.label
            return (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <CheckStatusDot status={item.status} />
                <div className="min-w-0 flex-1">
                  {/* 结论徽标固定贴右边：两列时每项宽度不同，靠右才能一眼竖着扫下来 */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-foreground" title={label}>
                      {label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs",
                        STATUS_CLASS[item.status],
                      )}
                    >
                      {STATUS_TEXT[item.status]}
                    </span>
                  </div>
                  {item.reason ? (
                    <p className="mt-1 break-all text-xs text-muted-foreground">{item.reason}</p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {list.length > 0 && !complete && inspectNote ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {inspectNote}
        </p>
      ) : null}
    </section>
  )
}
