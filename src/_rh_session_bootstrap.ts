import { refreshSession } from "./lib/session"

// Best-effort session bootstrap, kept outside App.tsx so generated pages cannot
// accidentally drop it. It asks the server once at startup whether the current
// browser already holds a valid admin session, and stays anonymous otherwise —
// the login gate still makes the final call right before it renders the console.
if (typeof window !== "undefined") {
  void refreshSession().catch(() => undefined)
}
