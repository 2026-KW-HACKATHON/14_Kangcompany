// A-01 시작
import { useNavigate } from 'react-router-dom'
import { paths } from '../../app/paths'
import { Button } from '../../components/ui'

export default function Start() {
  const nav = useNavigate()
  return (
    <div className="page">
      <main className="page-body" style={{ justifyContent: 'center' }}>
        <h1 className="big">월계더링</h1>
        <p className="muted">단체 모임 날짜와 인원만 알려주면, 월계1동 가게가 먼저 수락해요.</p>
        <div className="form">
          <Button variant="primary" onClick={() => nav(paths.signup)}>시작하기</Button>
          <Button variant="text" onClick={() => nav(paths.login)}>이미 계정이 있어요</Button>
        </div>
      </main>
    </div>
  )
}
