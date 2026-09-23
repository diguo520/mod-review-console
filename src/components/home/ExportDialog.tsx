import { ClipboardCopy, Download, FileJson, FolderGit2, Terminal } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ACTION_LABELS } from "@/pages/Home/useHome"
import type { ModDecision } from "@/pages/Home/useHome"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: ModDecision[]
  sources: string[]
  moderationJson: string
  sourcesJson: string
  onCopy: (text: string, label: string) => void
  onDownload: (filename: string, text: string) => void
}

function JsonPane({
  title,
  hint,
  filename,
  text,
  onCopy,
  onDownload,
}: {
  title: string
  hint: string
  filename: string
  text: string
  onCopy: (text: string, label: string) => void
  onDownload: (filename: string, text: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCopy(text, title)}
            className="gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
          >
            <ClipboardCopy className="h-4 w-4" />
            复制
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDownload(filename, text)}
            className="gap-2 focus-visible:shadow-focus"
          >
            <Download className="h-4 w-4" />
            下载
          </Button>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs text-foreground">
        {text}
      </pre>
    </div>
  )
}

export function ExportDialog(p: ExportDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">导出审核结果</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            把本次所有审核决定合成为两个文件的内容，带回本机应用后索引才会真正更新。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">本次审核决定</p>
            <p className="mt-1 font-display text-2xl font-bold text-primary">{p.entries.length}</p>
          </div>
          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">收录名单剩余</p>
            <p className="mt-1 font-display text-2xl font-bold text-card-foreground">
              {p.sources.length}
            </p>
          </div>
        </div>

        {p.entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            还没有任何审核决定。先在队列里做几条审核，再回来导出。
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {p.entries.slice(0, 12).map((entry) => (
              <span
                key={entry.target}
                className="rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-secondary-foreground"
              >
                {entry.target} · {ACTION_LABELS[entry.action] || entry.action}
              </span>
            ))}
            {p.entries.length > 12 ? (
              <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
                另有 {p.entries.length - 12} 条
              </span>
            ) : null}
          </div>
        )}

        <Tabs defaultValue="moderation">
          <TabsList className="bg-secondary">
            <TabsTrigger value="moderation" className="gap-2">
              <FileJson className="h-4 w-4" />
              moderation.json
            </TabsTrigger>
            <TabsTrigger value="sources" className="gap-2">
              <FolderGit2 className="h-4 w-4" />
              sources.json
            </TabsTrigger>
          </TabsList>

          <TabsContent value="moderation" className="mt-4">
            <JsonPane
              title="moderation.json"
              hint="每条审核决定：target、kind、action、中英理由、时间与操作人"
              filename="moderation.json"
              text={p.moderationJson}
              onCopy={p.onCopy}
              onDownload={p.onDownload}
            />
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            <JsonPane
              title="sources.json"
              hint="收录名单经「拒绝收录」移除后的结果"
              filename="sources.json"
              text={p.sourcesJson}
              onCopy={p.onCopy}
              onDownload={p.onDownload}
            />
          </TabsContent>
        </Tabs>

        <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Terminal className="h-4 w-4 text-primary" />
            拿到文件之后怎么用
          </p>
          <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>1. 把 moderation.json 与 sources.json 放回索引仓库里各自对应的位置。</li>
            <li>2. 在你自己的机器上跑一次索引重建，让两条文件重新生成模组索引。</li>
            <li>3. 提交这次改动，索引更新后才对所有人生效。</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            签名私钥只留在你本机，这一步不在页面上做，审核结论文件本身不含私钥。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
