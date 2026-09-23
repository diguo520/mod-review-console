import { RotateCcw, Search, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { OriginFilter, RecordAction, TimeRange } from "@/pages/Records/useRecords"
import {
  ACTION_LABELS,
  ACTION_ORDER,
  ORIGIN_FILTERS,
  TIME_RANGES,
  formatOperator,
} from "@/pages/Records/useRecords"
import { cn } from "@/lib/utils"

interface RecordsFilterBarProps {
  actionTypes: RecordAction[]
  onToggleAction: (action: RecordAction) => void
  originFilter: OriginFilter
  onOriginChange: (value: OriginFilter) => void
  modKeyword: string
  onKeywordChange: (value: string) => void
  operators: string[]
  operatorFilter: string
  onOperatorChange: (value: string) => void
  timeRange: TimeRange
  onTimeRangeChange: (value: TimeRange) => void
  onClear: () => void
  hasActiveFilter: boolean
}

export function RecordsFilterBar(p: RecordsFilterBarProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-md">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-card-foreground">筛选时间线</h2>
        <span className="text-xs text-muted-foreground">
          动作类型、来源、MOD、操作人、时间范围可叠加生效
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {ACTION_ORDER.map((action) => {
          const active = p.actionTypes.includes(action)
          return (
            <button
              key={action}
              type="button"
              onClick={() => p.onToggleAction(action)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {ACTION_LABELS[action]}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">来源</span>
        {ORIGIN_FILTERS.map((origin) => {
          const active = p.originFilter === origin.value
          return (
            <button
              key={origin.value}
              type="button"
              onClick={() => p.onOriginChange(origin.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {origin.label}
            </button>
          )
        })}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1.6fr_1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={p.modKeyword}
            onChange={(e) => p.onKeywordChange(e.target.value)}
            placeholder="搜索 MOD 名称或 id"
            className="pl-9 focus-visible:shadow-focus"
          />
        </div>

        <Select
          value={p.operatorFilter || "all"}
          onValueChange={(v) => p.onOperatorChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="focus-visible:shadow-focus">
            <SelectValue placeholder="全部操作人" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作人</SelectItem>
            {p.operators.map((op) => (
              <SelectItem key={op} value={op}>
                {formatOperator(op)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => p.onTimeRangeChange(r.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                p.timeRange === r.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {p.hasActiveFilter ? "筛选已生效，清空可回到全部记录" : "当前展示全部记录"}
        </p>
        <button
          type="button"
          onClick={p.onClear}
          disabled={!p.hasActiveFilter}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
            p.hasActiveFilter
              ? "border-primary/40 text-primary hover:bg-primary/10"
              : "border-border text-muted-foreground opacity-60",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          清空筛选
        </button>
      </div>
    </section>
  )
}
