import { Eraser, History, Radar, RotateCcw, ShieldCheck, ShieldX, Trash2, Zap } from "lucide-react"
import type { RecordAction, RecordStats } from "@/pages/Records/useRecords"
import { ACTION_HINTS, ACTION_LABELS } from "@/pages/Records/useRecords"
import { cn } from "@/lib/utils"

interface RecordsStatStripProps {
  stats: RecordStats
  actionTypes: RecordAction[]
  onToggle: (action: RecordAction) => void
}

const TILES: Array<{ action: RecordAction; icon: typeof Zap; accent: string }> = [
  { action: "approve", icon: ShieldCheck, accent: "text-primary" },
  { action: "reject", icon: ShieldX, accent: "text-destructive" },
  { action: "auto_approve", icon: Zap, accent: "text-primary" },
  { action: "delist", icon: Trash2, accent: "text-destructive" },
  { action: "delete", icon: Eraser, accent: "text-destructive" },
  { action: "restore", icon: RotateCcw, accent: "text-primary" },
  { action: "repo_check", icon: Radar, accent: "text-card-foreground" },
]

export function RecordsStatStrip(p: RecordsStatStripProps) {
  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">当前筛选</span>
          <History className="h-4 w-4 text-primary" />
        </div>
        <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{p.stats.total}</p>
        <p className="mt-1 text-xs text-muted-foreground">符合条件的时间线条目</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            已生效 {p.stats.repo}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            待应用 {p.stats.local}
          </span>
        </div>
      </div>

      {TILES.map((tile) => {
        const Icon = tile.icon
        const active = p.actionTypes.includes(tile.action)
        return (
          <button
            key={tile.action}
            type="button"
            onClick={() => p.onToggle(tile.action)}
            className={cn(
              "rounded-lg border bg-card p-4 text-left shadow-md transition-transform duration-300 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none",
              active ? "border-primary/50 ring-1 ring-primary/30" : "border-border",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{ACTION_LABELS[tile.action]}</span>
              <Icon className={cn("h-4 w-4", tile.accent)} />
            </div>
            <p className={cn("mt-2 font-display text-3xl font-bold", tile.accent)}>
              {p.stats[tile.action]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{ACTION_HINTS[tile.action]}</p>
          </button>
        )
      })}
    </section>
  )
}
