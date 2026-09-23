import { useEffect, useRef, useState } from "react"
import { LogOut, ShieldCheck, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  logoutSession,
  redirectToLogin,
  refreshSession,
  type SessionUser,
} from "@/lib/session"

/**
 * 极简管理员入口：只认「当前是谁在操作」这一件事。
 * 不展示钱包余额 / 会员 / 充值 —— 这个后台是内部审核工具，不走平台计费。
 */
export function AdminBadge() {
  const [account, setAccount] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    refreshSession()
      .then((info) => {
        if (alive) setAccount(info)
      })
      .catch(() => {
        /* 拿不到账号就当未登录处理 */
      })
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDocDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocDown)
    return () => document.removeEventListener("mousedown", onDocDown)
  }, [open])

  if (!ready) {
    return <div className="h-9 w-28 animate-pulse rounded-full bg-muted" aria-hidden="true" />
  }

  if (!account) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => redirectToLogin()}
        className="gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
      >
        <UserRound className="h-4 w-4" />
        管理员登录
      </Button>
    )
  }

  const name = account.displayName || "管理员"

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:shadow-focus focus-visible:outline-none"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <span className="max-w-[8rem] truncate">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card p-2 shadow-md">
          <div className="px-3 py-2 text-xs text-muted-foreground">
            当前管理员: <span className="text-foreground">{name}</span>
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              void logoutSession()
              setAccount(null)
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
