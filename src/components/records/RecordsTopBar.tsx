import { ArrowLeft, History, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { AdminBadge } from "@/components/common/AdminBadge"
import { Button } from "@/components/ui/button"

interface RecordsTopBarProps {
  totalCount: number
  /** 本机可清空的条数；为 0 时按钮置灰，避免点开一个空弹窗 */
  clearableCount: number
  onOpenClear: () => void
}

export function RecordsTopBar({ totalCount, clearableCount, onOpenClear }: RecordsTopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
            <History className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              EveJS Mod Registry
            </p>
            <h1 className="text-lg font-semibold text-foreground">记录中心</h1>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <span className="hidden rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground md:inline-flex">
            共 {totalCount} 条动作
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={clearableCount === 0}
            onClick={onOpenClear}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 focus-visible:shadow-focus"
          >
            <Trash2 className="h-4 w-4" />
            清空记录
          </Button>
          <Link to="/">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
            >
              <ArrowLeft className="h-4 w-4" />
              返回审核台
            </Button>
          </Link>
          <span className="hidden h-6 w-px bg-border md:block" />
          <AdminBadge />
        </div>
      </div>
    </header>
  )
}
