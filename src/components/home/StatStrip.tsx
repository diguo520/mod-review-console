import { AlertTriangle, Archive, Ban, CheckCircle2, Inbox, WifiOff } from "lucide-react"
import type { QueueStats, ReviewMode } from "@/pages/Home/useHome"
import { cn } from "@/lib/utils"

interface StatStripProps {
  stats: QueueStats
  mode: ReviewMode
  autoPromotedCount: number
}

interface Tile {
  key: string
  label: string
  value: number
  hint: string
  icon: typeof CheckCircle2
  accent: string
}

export function StatStrip({ stats, mode, autoPromotedCount }: StatStripProps) {
  const tiles: Tile[] = [
    {
      key: "pending",
      label: "待收录",
      value: stats.pending,
      hint: "在收录名单里、索引还没有的仓库",
      icon: Inbox,
      accent: "text-primary",
    },
    {
      key: "auto",
      label: "可自动收录",
      value: stats.autoEligible,
      hint: mode === "auto" ? "无人值守会立即收录" : "切到无人值守即自动收录",
      icon: CheckCircle2,
      accent: "text-primary",
    },
    {
      key: "published",
      label: "已上架",
      value: stats.published,
      hint: `未通过 ${stats.rejected} · 已下架 ${stats.delisted}`,
      icon: Archive,
      accent: "text-primary",
    },
    {
      key: "warn",
      label: "有警告",
      value: stats.warn,
      hint: "检查通过但有需留意项",
      icon: AlertTriangle,
      accent: "text-card-foreground",
    },
    {
      key: "fail",
      label: "检查不通过",
      value: stats.fail,
      hint: "存在硬性检查失败",
      icon: Ban,
      accent: "text-destructive",
    },
    {
      key: "offline",
      label: "仓库失联",
      value: stats.offline,
      hint: "巡检未找到对应仓库",
      icon: WifiOff,
      accent: "text-destructive",
    },
  ]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">队列概览</h2>
        <p className="font-mono text-xs text-muted-foreground">
          共 <span className="text-primary">{stats.total}</span> 条来源在队列里
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <div
              key={tile.key}
              className="group rounded-lg border border-border bg-card p-4 shadow-md transition-transform duration-300 hover:scale-105"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{tile.label}</span>
                <Icon className={cn("h-4 w-4", tile.accent)} />
              </div>
              <p className={cn("mt-2 font-display text-3xl font-bold", tile.accent)}>{tile.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
            </div>
          )
        })}
      </div>
      {autoPromotedCount > 0 ? (
        <p className="text-xs text-primary">
          本次会话无人值守模式已自动收录 {autoPromotedCount} 个条目，可在审核记录里回溯。
        </p>
      ) : null}
      {stats.deleted > 0 ? (
        <p className="text-xs text-muted-foreground">
          另有 {stats.deleted} 条已删除留档，不参与上面的统计；点筛选里的「已删除」可以回溯。
        </p>
      ) : null}
    </section>
  )
}
