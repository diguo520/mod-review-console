import { Clock, Download, FileText, GitBranch, KeyRound, Loader2, Package, Tag, User } from "lucide-react"
import { CheckListPanel } from "./CheckListPanel"
import { OfflineBadge, QueueStatusBadge } from "./badges"
import { formatBytes, formatDateTime } from "@/pages/Home/useHome"
import type { QueueItem } from "@/pages/Home/useHome"

interface ModDetailPanelProps {
  mod: QueueItem | null
  loading: boolean
  /** 重新体检这个来源（残缺条目体检失败 / 取不到资料时用） */
  onReinspect?: (source: string) => void
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

export function ModDetailPanel({ mod, loading, onReinspect }: ModDetailPanelProps) {
  if (loading && !mod) {
    return (
      <section className="flex h-full min-h-72 items-center justify-center rounded-lg border border-border bg-card shadow-md">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在载入模组资料
        </span>
      </section>
    )
  }

  if (!mod) {
    return (
      <section className="flex h-full min-h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-md">
        <FileText className="h-7 w-7 text-muted-foreground" />
        <h2 className="text-base font-semibold text-card-foreground">从左侧队列选一条来源</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          这里会展示索引仓库里的完整资料：作者身份、仓库与下载地址、包体指纹，以及逐项自动检查结论。
        </p>
      </section>
    )
  }

  return (
    <section className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">模组详情</p>
          <h2 className="mt-1 text-3xl font-bold text-card-foreground">{mod.displayName || "—"}</h2>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{mod.modId || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QueueStatusBadge status={mod.status} />
          {mod.repoAlive === false ? <OfflineBadge /> : null}
          <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
            {mod.category || "未分类"}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-foreground">
            v{mod.version || "—"}
          </span>
        </div>
      </div>

      {mod.manifestFromSource ? (
        <p className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          该来源尚未收录进索引，以下资料来自来源仓库的清单文件。
        </p>
      ) : !mod.complete ? (
        <p className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          该来源只有仓库地址，尚未收录为模组：索引仓库里还没有它的 manifest，下面缺失的字段统一显示「—」。
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {mod.description || "索引里没有这个模组的描述。"}
      </p>

      {mod.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          {mod.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field icon={User} label="作者" value={`${mod.authorName || "—"} (${mod.authorId || "—"})`} />
        <Field icon={KeyRound} label="作者密钥 ID" value={mod.authorKeyId} mono />
        <Field icon={GitBranch} label="仓库" value={mod.repo} mono />
        <Field icon={Package} label="收录来源" value={mod.source} mono />
        <Field icon={FileText} label="包大小" value={formatBytes(mod.sizeBytes)} />
        <Field icon={Download} label="下载次数" value={mod.downloads > 0 ? String(mod.downloads) : ""} />
        <Field icon={Clock} label="发布时间" value={formatDateTime(mod.publishedAt)} />
        <Field icon={FileText} label="mod id" value={mod.modId} mono />
      </div>

      <Field icon={FileText} label="sha256" value={mod.sha256} mono />

      <div className="rounded-md border border-border bg-background/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          下载地址（索引仓库不存二进制，包体在作者自己的 Release 下）
        </div>
        {mod.downloadUrls.length === 0 ? (
          <p className="mt-1 text-sm text-foreground">—</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {mod.downloadUrls.map((u, index) => (
              <li key={`${u.mirror}-${index}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {u.mirror || "未标注镜像"} · P{u.priority}
                </span>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  {u.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-border bg-background/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          更新日志
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
          {mod.changelog || "—"}
        </p>
      </div>

      {mod.reason ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          <p className="text-xs text-destructive">已有审核结论的理由</p>
          <p className="mt-1 text-sm text-foreground">{mod.reason}</p>
        </div>
      ) : null}

      <CheckListPanel
        items={mod.checks}
        complete={mod.complete}
        inspectStatus={mod.inspectStatus}
        inspectNote={mod.inspectNote}
        onRetry={onReinspect ? () => onReinspect(mod.source) : undefined}
      />
    </section>
  )
}
