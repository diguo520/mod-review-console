import { GitBranch, Loader2, Radar, ScrollText, Trash2 } from "lucide-react"
import { AdminBadge } from "@/components/common/AdminBadge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/pages/Home/useHome"
import type { ReviewMode } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface WorkbenchTopBarProps {
  mode: ReviewMode
  setMode: (next: ReviewMode) => void
  lastInspectAt: string | null
  inspecting: boolean
  runInspection: () => void
  offlineCount: number
  purging: boolean
  purgeOfflineMods: () => void
  openRecords: (tab: "review" | "delete") => void
}

const MODES: Array<{ value: ReviewMode; label: string; hint: string }> = [
  {
    value: "auto",
    label: "无人值守",
    hint: "检查全部通过且无警告的待收录条目自动收录；未通过的不自动放行",
  },
  { value: "manual", label: "人工审核", hint: "每条来源都需要维护者确认后才会收录" },
]

export function WorkbenchTopBar(p: WorkbenchTopBarProps) {
  const activeHint = MODES.find((m) => m.value === p.mode)?.hint ?? ""

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
            <GitBranch className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              EveJS Mod Registry
            </p>
            <h1 className="text-lg font-semibold text-foreground">审核工作台</h1>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
            {MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => p.setMode(item.value)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  p.mode === item.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="hidden text-xs text-muted-foreground lg:block">{activeHint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden flex-col items-end leading-tight md:flex">
            <span className="text-xs text-muted-foreground">上次巡检</span>
            <span className="font-mono text-xs text-foreground">
              {p.lastInspectAt ? formatDateTime(p.lastInspectAt) : "尚未巡检"}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={p.runInspection}
            disabled={p.inspecting}
            className="gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
          >
            {p.inspecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {p.inspecting ? "巡检中" : "立即巡检"}
          </Button>
          {p.offlineCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={p.purgeOfflineMods}
              disabled={p.purging}
              className="gap-2 border-destructive/40 text-destructive focus-visible:shadow-focus"
            >
              {p.purging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {p.purging ? "处理中" : `清理失联 ${p.offlineCount}`}
            </Button>
          ) : null}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => p.openRecords("review")}
            >
              <ScrollText className="h-4 w-4" />
              审核记录
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => p.openRecords("delete")}
            >
              <Trash2 className="h-4 w-4" />
              处置记录
            </Button>
          </div>
          <span className="hidden h-6 w-px bg-border md:block" />
          <AdminBadge />
        </div>
      </div>
    </header>
  )
}
