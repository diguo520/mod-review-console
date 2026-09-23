import { LoginGate } from "@/components/common/LoginGate"
import { RecordsPage } from "./RecordsPage"
import { useRecords } from "./useRecords"

function RecordsCenter() {
  const vm = useRecords()
  return <RecordsPage {...vm} />
}

export default function RecordsRoute() {
  return (
    <LoginGate>
      <RecordsCenter />
    </LoginGate>
  )
}
