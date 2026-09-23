import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { ClearScope } from "@/pages/Records/useRecords"
import { cn } from "@/lib/utils"

interface ClearRecordsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  localCount: number
  checkCount: number
  clearing: boolean
  onConfirm: (scopes: ClearScope[]) => void
}

/**
 * 清空本机记录。
 * 只清本机的暂存，索引仓库里已生效的审核结果**不在本机、清不掉** —— 这一点必须在
 * 弹窗里说清楚，否则维护者会以为清空能把仓库里的结论也一并撤掉。
 */
export function ClearRecordsDialog(p: ClearRecordsDialogProps) {
  const [scopes, setScopes] = useState<ClearScope[]>(["local"])

  // 每次打开都回到默认（只勾本机操作记录），避免上一次的勾选状态意外带过来
  useEffect(() => {
    if (p.open) setScopes(["local"])
  }, [p.open])

  const toggle = (scope: ClearScope) =>
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )

  const options: Array<{ scope: ClearScope; title: string; count: number; hint: string }> = [
    {
      scope: "local",
      title: "本机操作记录",
      count: p.localCount,
      hint: "收录通过 / 拒绝收录 / 自动放行 / 下架 / 恢复上架，以及对应的下架留档与审核决定",
    },
    {
      scope: "checks",
      title: "仓库巡检记录",
      count: p.checkCount,
      hint: "仓库是否仍可访问的巡检流水；清掉后队列里的「仓库失联」标记会一并消失",
    },
  ]

  const total =
    (scopes.includes("local") ? p.localCount : 0) + (scopes.includes("checks") ? p.checkCount : 0)

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-xl border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">清空本机记录</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            清掉的是本机的暂存记录，用来在导出并重建索引之后把时间线归零。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              索引仓库里已经生效的审核结果不在这台机器上，清不掉 —— 那部分要改，得回仓库里改。
            </p>
          </div>

          {options.map((opt) => {
            const active = scopes.includes(opt.scope)
            const empty = opt.count === 0
            return (
              <button
                key={opt.scope}
                type="button"
                disabled={empty}
                onClick={() => toggle(opt.scope)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  active
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background/60 hover:border-primary/30",
                  empty && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    active ? "border-primary text-primary" : "border-border text-transparent",
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{opt.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {opt.count} 条
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {opt.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <DialogFooter className="gap-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {scopes.length === 0
              ? "先选一个要清空的范围"
              : `将删除 ${total} 条本机记录，删除后无法撤销`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={p.clearing}
              onClick={() => p.onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={p.clearing || scopes.length === 0}
              onClick={() => p.onConfirm(scopes)}
            >
              <Trash2 className="h-4 w-4" />
              {p.clearing ? "清空中…" : "确认清空"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
