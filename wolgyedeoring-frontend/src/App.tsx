import { Link, Route, Routes } from 'react-router-dom'
import DevCheck from './pages/DevCheck'
import PaySuccess from './pages/PaySuccess'
import PayFail from './pages/PayFail'

// 화면(라우트)은 UI 작업 때 추가. 지금은 데이터 연결 확인용 페이지와 결제 리다이렉트만 있음
// 정해진 경로: /r/:token (참석 조사, 로그인 없음), /pay/success, /pay/fail (토스 결제 복귀)
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dev" element={<DevCheck />} />
      <Route path="/pay/success" element={<PaySuccess />} />
      <Route path="/pay/fail" element={<PayFail />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}

function Home() {
  return (
    <main style={{ padding: 24, fontSize: 17 }}>
      <h1>월계더링</h1>
      <p>화면 작업 전입니다. 데이터 연결 확인은 <Link to="/dev">/dev</Link>.</p>
    </main>
  )
}
