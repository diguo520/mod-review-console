import { LoginGate } from "@/components/common/LoginGate"
import { HomePage } from "./HomePage"
import { useHome } from "./useHome"

function HomeWorkbench() {
  const vm = useHome()
  return <HomePage {...vm} />
}

export default function HomeRoute() {
  return (
    <LoginGate>
      <HomeWorkbench />
    </LoginGate>
  )
}
