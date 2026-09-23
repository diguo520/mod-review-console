import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { KeyRound, Loader2, Lock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ADMIN_USERNAME_INPUT_ID,
  ensureSessionSilent,
  getSessionUser,
  loginWithPassword,
  subscribeSession,
} from "@/lib/session"

type GateState = "checking" | "authed" | "anon"

/**
 * 登录门禁：这个后台的每个动作都会改动索引仓库的收录结果，只对管理员开放。
 *
 * 未登录时整页替换成一道门，**不渲染任何业务内容** —— 这样也顺带避免了
 * 未登录访客白跑一轮索引拉取 / 来源体检 / 仓库巡检，把接口额度浪费掉。
 * 身份由 Pages Function 校验账号密码后签发 HttpOnly Cookie，前端拿不到令牌。
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [gateState, setGateState] = useState<GateState>(() =>
    getSessionUser() ? "authed" : "checking",
  )
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (gateState !== "checking") return
    let alive = true
    // 静默确认卡住也必须给用户一个明确落点，不能一直转圈。
    const guard = window.setTimeout(() => {
      if (alive) setGateState((prev) => (prev === "checking" ? "anon" : prev))
    }, 6000)
    ensureSessionSilent()
      .catch(() => false)
      .then((ok) => {
        window.clearTimeout(guard)
        if (!alive) return
        setGateState((prev) => (prev === "checking" ? (ok ? "authed" : "anon") : prev))
      })
    return () => {
      alive = false
      window.clearTimeout(guard)
    }
  }, [gateState])

  // 会话被清掉(在工作台里点了退出)时把门重新关上。
  useEffect(() => {
    return subscribeSession(() => {
      setGateState(getSessionUser() ? "authed" : "anon")
    })
  }, [])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const name = username.trim()
    if (!name || !password) {
      setError("请先填写管理员账号与密码")
      return
    }
    setError("")
    setSubmitting(true)
    const result = await loginWithPassword(name, password)
    setSubmitting(false)
    if (result.ok) {
      setPassword("")
      setGateState("authed")
      return
    }
    setError(result.error)
  }

  if (gateState === "authed") return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Lock className="h-5 w-5" />
        </div>

        <h1 className="mt-5 text-lg font-semibold text-foreground">审核后台 · 仅管理员可用</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          这里的每个动作都会直接改动索引仓库的收录结果 —— 收录、拒绝、下架都会落到正式索引上。
          所以不对外开放，请先用管理员账号登录。
        </p>

        {gateState === "checking" ? (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            正在确认登录状态…
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <label htmlFor={ADMIN_USERNAME_INPUT_ID} className="text-sm font-medium text-foreground">
                管理员账号
              </label>
              <Input
                id={ADMIN_USERNAME_INPUT_ID}
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                placeholder="admin"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="admin-password" className="text-sm font-medium text-foreground">
                管理员密码
              </label>
              <Input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {submitting ? "正在登录…" : "登录"}
            </Button>

            <p className="text-xs text-muted-foreground">
              账号由站点管理员分配；登录状态会在有效期结束后自动失效。
              （部署与账号配置见仓库里的 DEPLOY.md。）
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
