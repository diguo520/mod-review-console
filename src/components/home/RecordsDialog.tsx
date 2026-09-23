import { FileClock, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ACTION_KIND_LABELS, ACTION_LABELS, formatDateTime } from "@/pages/Home/useHome"
import type { DeleteRecord, ReviewRecord } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface RecordsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: "review" | "delete"
  onTabChange: (next: "review" | "delete") => void
  reviewRecords: ReviewRecord[]
  deleteRecords: DeleteRecord[]
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}

/** 处置留档的动因配色：拒绝收录与删除都用破坏色，下架用中性色 */
const DELETE_KIND_TONE: Record<string, string> = {
  reject: "border-destructive/40 bg-destructive/10 text-destructive",
  delete: "border-destructive/50 bg-destructive/10 text-destructive",
  delist: "border-border bg-secondary text-secondary-foreground",
}

export function RecordsDialog(p: RecordsDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">操作记录</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            无人值守自动收录、人工收录通过、拒绝收录、下架与删除都会留痕，按时间倒序排列；
            索引仓库里已经生效的审核结果也一并列出，标为「已生效」。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={p.tab}
          onValueChange={(v) => p.onTabChange(v === "delete" ? "delete" : "review")}
        >
          <TabsList className="bg-secondary">
            <TabsTrigger value="review" className="gap-2">
              <FileClock className="h-4 w-4" />
              审核记录
            </TabsTrigger>
            <TabsTrigger value="delete" className="gap-2">
              <Trash2 className="h-4 w-4" />
              处置记录
            </TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="mt-4">
            {p.reviewRecords.length === 0 ? (
              <EmptyRow text="还没有审核记录" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {p.reviewRecords.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {r.mod_name || r.mod_id}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {r.origin === "repo" ? (
                          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                            已生效
                          </span>
                        ) : (
                          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                            待应用
                          </span>
                        )}
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                          {ACTION_LABELS[r.action] || r.action}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {r.mod_id} ·{" "}
                      {r.origin === "repo"
                        ? "索引仓库"
                        : r.mode === "auto"
                          ? "无人值守"
                          : "人工审核"}{" "}
                      · {r.operator || "moderator"} · {formatDateTime(r.acted_at || r.created)}
                    </p>
                    {r.raw_action && r.raw_action !== r.action ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        仓库里的原始动作：{r.raw_action}
                      </p>
                    ) : null}
                    {r.reason ? (
                      <p className="mt-1 text-xs text-muted-foreground">理由：{r.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="delete" className="mt-4">
            {p.deleteRecords.length === 0 ? (
              <EmptyRow text="还没有下架或删除记录" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {p.deleteRecords.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {r.mod_name || r.mod_id}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          DELETE_KIND_TONE[r.action_kind] ?? DELETE_KIND_TONE.delist,
                        )}
                      >
                        {ACTION_KIND_LABELS[r.action_kind] || ACTION_KIND_LABELS.delist}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {r.mod_id} · {r.operator || "moderator"} ·{" "}
                      {formatDateTime(r.deleted_at || r.created)}
                    </p>
                    {r.reason ? (
                      <p className="mt-1 text-xs text-muted-foreground">理由：{r.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
