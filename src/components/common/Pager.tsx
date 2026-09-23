import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PagerProps {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (next: number) => void
  className?: string
}

/**
 * 通用分页器：只负责翻页与「第 N 页 / 共 M 条」的展示，
 * 数据切片由各自的逻辑层完成。
 */
export function Pager(p: PagerProps) {
  if (p.total <= 0) return null

  const canPrev = p.page > 1
  const canNext = p.page < p.pageCount

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-2.5",
        p.className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        共 <span className="font-mono text-foreground">{p.total}</span> 条 · 每页 {p.pageSize} 条
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => p.onPageChange(p.page - 1)}
          className="gap-1 focus-visible:shadow-focus"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          上一页
        </Button>
        <span className="font-mono text-xs text-primary">
          第 {p.page} / {p.pageCount} 页
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => p.onPageChange(p.page + 1)}
          className="gap-1 focus-visible:shadow-focus"
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
