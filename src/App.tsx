import { Route, Routes } from "react-router-dom"
import { LoginGate } from "@/components/common/LoginGate"
import HomeRoute from "./pages/Home/index.tsx"
import RecordsRoute from "./pages/Records/index.tsx"

function App() {
  return (
    // 登录门套在最外层: 这个后台的每个动作都会改动索引仓库的收录结果, 未登录时
    // 连业务页面都不渲染 —— 顺带省掉未登录访客白跑一轮索引拉取 / 巡检的接口额度。
    <LoginGate>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/records" element={<RecordsRoute />} />
        <Route path="*" element={<HomeRoute />} />
      </Routes>
    </LoginGate>
  )
}

export default App
