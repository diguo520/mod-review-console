import { Ban, CheckCircle2, Eraser, Loader2, RotateCcw, ShieldAlert, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CheckSummaryBadge } from "./badges"
import { DECISION_ACTIONS, summarizeChecks } from "@/pages/Home/useHome"
import type { DecisionAction, QueueItem } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface ReviewActionPanelProps {
  item: QueueItem | null
  actionKind: DecisionAction
  onActionKindChange: (next: DecisionAction) => void
  reason: string
  onReasonChange: (value: string) => void
  quickReasons: string[]
  onApplyQuickReason: (value: string) => void
  onApprove: (item: QueueItem) => void
  onReject: (item: QueueItem, reason: string) => Promise<boolean>
  onDelist: (item: QueueItem, reason: string) => Promise<boolean>
  onRestore: (item: QueueItem) => void
  onDelete: (item: QueueItem, reason: string) => Promise<boolean>
  busy: boolean
}

const ACTION_ICONS: Record<DecisionAction, typeof CheckCircle2> = {
  approve: CheckCircle2,
  reject: Ban,
  delist: Trash2,
  restore: RotateCcw,
  delete: Eraser,
}

const REASON_COPY: Record<
  "reject" | "delist" | "delete",
  { label: string; placeholder: string; submit: string }
> = {
  reject: {
    label: "拒绝收录的理由（必填）",
    placeholder: "写明不通过的具体问题，作者据此修正后重新提交",
    submit: "提交拒绝收录",
  },
  delist: {
    label: "下架的理由（必填）",
    placeholder: "写明下架原因，会连同操作人一并留档",
    submit: "确认下架",
  },
  delete: {
    label: "永久删除的理由（必填）",
    placeholder: "写明为什么彻底删除这个 MOD，理由会连同操作人一并留档并同步到索引仓库",
    submit: "确认永久删除",
  },
}

const STATUS_HINT: Record<string, string> = {
  pending: "这条来源还在收录名单里，索引仓库中还没有它的模组记录。",
  resubmitted:
    "作者更新了这条曾被拒绝 / 已下架的 MOD 并重新提交，索引里还没生效：复审通过后新版本才会进索引。",
  published: "这条模组已经收录上架，索引里可以看到它。",
  rejected: "这条来源已被拒绝收录，索引里不会收录它；作者重新提交后会回到复审队列。",
  delisted: "这条模组已被下架，索引保留但标记为已下架。",
}

export function ReviewActionPanel(p: ReviewActionPanelProps) {
  const item = p.item

  if (!item) {
    return (
      <section className="flex h-full flex-col rounded-lg border border-dashed border-border bg-card p-5 shadow-md">
        <h2 className="text-base font-semibold text-card-foreground">审核操作区</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          选中队列里的条目后，这里会出现收录通过、拒绝收录、下架、恢复上架与永久删除的入口。
        </p>
      </section>
    )
  }

  const summary = summarizeChecks(item.checks)
  // 已上架的条目不能直接删：先下架、再删除，删除这种不可逆的动作就永远有一步缓冲
  const deleteBlocked = item.status === "published"
  // 已留档的条目仍允许再点一次「永久删除」：重复删除幂等，正好用来把索引仓库里漏掉的补剔除
  const deletedRepair = item.deleted === true
  const reasonKind: "reject" | "delist" | "delete" | null =
    p.actionKind === "reject" || p.actionKind === "delist" || p.actionKind === "delete"
      ? p.actionKind
      : null
  const needsReason = reasonKind !== null
  const dangerous = needsReason
  const blocked =
    (p.actionKind === "delete" && deleteBlocked) || (item.deleted && p.actionKind !== "delete")
  const canSubmit = (!needsReason || p.reason.trim().length > 0) && !p.busy && !blocked
  const activeHint = DECISION_ACTIONS.find((a) => a.value === p.actionKind)?.hint ?? ""
  const copy = reasonKind ? REASON_COPY[reasonKind] : null
  const SubmitIcon = ACTION_ICONS[p.actionKind]

  const submit = () => {
    if (p.actionKind === "reject") void p.onReject(item, p.reason)
    else if (p.actionKind === "delist") void p.onDelist(item, p.reason)
    else if (p.actionKind === "delete") void p.onDelete(item, p.reason)
    else if (p.actionKind === "restore") p.onRestore(item)
    else p.onApprove(item)
  }

  return (
    <section className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">审核操作区</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">结论会写入审核流水，可导出后回本机重建索引</p>
        </div>
        {item.checks.length > 0 ? <CheckSummaryBadge status={summary} /> : null}
      </div>

      <div className="rounded-md border border-border bg-background/60 px-3 py-2">
        <p className="text-sm font-medium text-foreground">{item.displayName || "—"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          本次决定落在 {item.kind === "source" ? "来源" : "模组 id"}
        </p>
        <p className="mt-0.5 break-all font-mono text-xs text-primary">{item.target}</p>
      </div>

      <p className="text-xs text-muted-foreground">{STATUS_HINT[item.status] ?? ""}</p>

      {item.status === "resubmitted" ? (
        <div className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          <p className="font-medium">
            重新提交复审
            {item.previousAction === "delist" ? "（此前已下架）" : "（此前未通过）"}
            {item.previousAt ? ` · ${item.previousAt.slice(0, 10)}` : ""}
          </p>
          <p className="mt-1">
            {item.resubmitNote || "作者更新后重新提交"}。
            {item.previousReason ? `上次结论：${item.previousReason}。` : ""}
            {item.autoResubmit
              ? "本次自动检查全部通过时，无人值守模式会直接复审收录（理由属于自动检查可复核的类别）。"
              : "该条需要人工复审：无人值守模式不会自动放行。"}
          </p>
        </div>
      ) : null}

      {item.permanent ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          这条已被永久除名：作者再次提交也不会回到复审队列，除非先撤销这条决定。
        </div>
      ) : null}

      {item.deleted ? (
        <p className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Eraser className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          这条已经删除并留档（{item.deletedReason || "未填写理由"}），不再参与审核与批量操作。
          如果索引仓库里还留着它，选中「永久删除」再提交一次即可补剔除（重复删除是幂等的）。
        </p>
      ) : null}

      {item.checks.length > 0 && summary === "fail" ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          自动检查存在不通过项，建议拒绝收录；确需放行请自行确认风险。
        </p>
      ) : null}

      {item.checks.length > 0 && summary === "warn" ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          存在警告项，无人值守模式不会自动收录，需人工判断。
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">选择一个动作</p>
        <div className="grid grid-cols-2 gap-2">
          {DECISION_ACTIONS.map((action) => {
            const Icon = ACTION_ICONS[action.value]
            const selected = p.actionKind === action.value
            const actionDangerous =
              action.value === "reject" || action.value === "delist" || action.value === "delete"
            const actionBlocked =
              (action.value === "delete" && deleteBlocked) ||
              (item.deleted && action.value !== "delete")
            return (
              <Button
                key={action.value}
                type="button"
                variant="outline"
                disabled={actionBlocked}
                title={
                  action.value === "delete" && deleteBlocked
                    ? "已上架的 MOD 必须先下架，才能删除"
                    : action.hint
                }
                onClick={() => p.onActionKindChange(action.value)}
                className={cn(
                  "justify-start gap-2 focus-visible:shadow-focus",
                  actionDangerous
                    ? "border-destructive/40 text-destructive"
                    : "border-primary/40 text-primary",
                  selected &&
                    (actionDangerous ? "bg-destructive/10" : "bg-primary/10 ring-1 ring-primary/40"),
                  actionBlocked && "opacity-50",
                )}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </Button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">{activeHint}</p>
      </div>

      {copy ? (
        <div className="space-y-2 rounded-md border border-border bg-background/60 p-3">
          <label htmlFor="review-reason" className="text-xs font-medium text-foreground">
            {copy.label}
          </label>
          <Textarea
            id="review-reason"
            value={p.reason}
            onChange={(e) => p.onReasonChange(e.target.value)}
            placeholder={copy.placeholder}
            className="min-h-24 focus-visible:shadow-focus"
          />
          <div>
            <p className="text-xs text-muted-foreground">常用理由（点击填入，可继续编辑）</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
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
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "w-full gap-2 focus-visible:shadow-focus disabled:opacity-50",
          dangerous
            ? "bg-destructive text-destructive-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {p.busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <SubmitIcon className="h-4 w-4" />
        )}
        {copy ? copy.submit : p.actionKind === "restore" ? "确认恢复上架" : "确认收录通过"}
      </Button>

      {needsReason && p.reason.trim().length === 0 ? (
        <p className="text-xs text-muted-foreground">
          拒绝收录、下架与删除都必须写明理由，填好才能提交。
        </p>
      ) : null}

      {p.actionKind === "reject" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          拒绝收录会把这条来源从收录名单里移除，并写入索引仓库的审核结论；
          作者修正后重新提交（PR 重新登记这个来源）会自动回到「重新提交」队列，等待复审。
        </p>
      ) : null}

      {p.actionKind === "restore" ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          恢复上架会撤销之前对该条目的审核结果，索引里的原始状态随之生效。
        </p>
      ) : null}

      {p.actionKind === "delete" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {deleteBlocked
            ? "这条已经上架，不能直接删除：先下架，确认无误后再回来删除。"
            : deletedRepair
              ? "这条已经删除留档。再提交一次会重放永久删除决定，把索引仓库里剩余的记录也剔除掉。"
              : "永久删除不可逆：条目会退出工作队列，并同步从索引仓库剔除（来源级的连收录名单一起移除），之后只能在「已删除」筛选与操作记录里回溯。"}
        </p>
      ) : null}
    </section>
  )
}
