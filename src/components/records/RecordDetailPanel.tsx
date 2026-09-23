import {
  ArrowUpRight,
  Clock,
  FileText,
  KeyRound,
  Package,
  Tag,
  User,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ActionBadge, ModeBadge, OriginBadge, RepoAliveBadge } from "./recordBadges"
import type { TimelineItem } from "@/pages/Records/useRecords"
import {
  ACTION_HINTS,
  ORIGIN_HINTS,
  ORIGIN_LABELS,
  formatDateTime,
  formatOperator,
} from "@/pages/Records/useRecords"
import { formatBytes } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface RecordDetailPanelProps {
  item: TimelineItem | null
  onClose: () => void
  onGoToWorkbench: (modId: string) => void
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof User
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={mono ? "mt-1 break-all font-mono text-xs text-foreground" : "mt-1 text-sm text-foreground"}>
        {value || "—"}
      </p>
    </div>
  )
}

export function RecordDetailPanel(p: RecordDetailPanelProps) {
  if (!p.item) return null
  const item = p.item
  const snap = item.snapshot

  return (
    <>
      <div
        aria-hidden
        onClick={p.onClose}
        className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg animate-in slide-in-from-right duration-300 flex-col border-l border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">动作详情</p>
            <h2 className="mt-1 truncate text-2xl font-bold text-card-foreground">
              {item.mod_name || item.mod_id}
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.mod_id}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={p.onClose}
            className="gap-1 text-muted-foreground hover:text-foreground focus-visible:shadow-focus"
          >
            <X className="h-4 w-4" />
            关闭
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge action={item.action} />
            <OriginBadge origin={item.origin} />
            <ModeBadge mode={item.mode} />
            {item.action === "repo_check" ? <RepoAliveBadge alive={item.alive} /> : null}
          </div>

          <p className="text-xs text-muted-foreground">{ACTION_HINTS[item.action]}</p>

          <div
            className={cn(
              "rounded-md border px-3 py-2",
              item.origin === "repo"
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-background/60",
            )}
          >
            <p className="text-xs text-muted-foreground">
              记录来源 · {ORIGIN_LABELS[item.origin]}
            </p>
            <p className="mt-1 text-sm text-foreground">{ORIGIN_HINTS[item.origin]}</p>
            {item.raw_action && item.raw_action !== item.action ? (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                仓库里的原始动作名：{item.raw_action}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field icon={User} label="操作人" value={formatOperator(item.operator)} />
            <Field icon={Clock} label="操作时间" value={formatDateTime(item.at)} mono />
          </div>

          {item.reason ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3">
              <p className="text-xs text-destructive">理由原文</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{item.reason}</p>
            </div>
          ) : null}

          {item.action === "repo_check" ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-background/60 px-3 py-3">
                <p className="text-xs text-muted-foreground">巡检结论</p>
                <p className="mt-1 text-sm text-foreground">{item.detail || "—"}</p>
              </div>
              <Field icon={Package} label="仓库地址" value={item.repo_url} mono />
            </div>
          ) : item.detail ? (
            <div className="rounded-md border border-border bg-background/60 px-3 py-3">
              <p className="text-xs text-muted-foreground">动作说明</p>
              <p className="mt-1 text-sm text-foreground">{item.detail}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium text-foreground">MOD 快照</p>
            {snap ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field icon={FileText} label="名称" value={snap.display_name} />
                <Field icon={Tag} label="分类" value={snap.category} />
                <Field icon={KeyRound} label="版本" value={`v${snap.version || "—"}`} mono />
                <Field
                  icon={User}
                  label="作者"
                  value={`${snap.author_name || "—"} (${snap.author_id || "—"})`}
                />
                <Field icon={Package} label="仓库" value={snap.repo} mono />
                <Field icon={FileText} label="包大小" value={formatBytes(snap.size_bytes)} />
                <div className="sm:col-span-2">
                  <Field icon={FileText} label="sha256" value={snap.sha256} mono />
                </div>
              </div>
            ) : (
              <p className="mt-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                {item.origin === "repo"
                  ? "该条记录来自索引仓库，没有本机快照；上面的 MOD 名称、理由、操作人与时间就是这条记录的全部内容。"
                  : "该 MOD 当前不在索引仓库清单里，暂无快照可对照。"}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button
            type="button"
            onClick={() => p.onGoToWorkbench(item.mod_id)}
            disabled={!item.mod_id}
            className="w-full gap-2 bg-primary text-primary-foreground focus-visible:shadow-focus"
          >
            <ArrowUpRight className="h-4 w-4" />
            去审核台看这个 MOD
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            会跳回审核台并把队列切到「全部」，自动选中该条目
          </p>
        </div>
      </aside>
    </>
  )
}
