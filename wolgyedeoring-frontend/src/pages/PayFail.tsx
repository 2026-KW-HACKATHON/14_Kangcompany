// G-10 결제 결과(실패·취소): 예약은 결제 대기 그대로 → 다시 결제
import { useNavigate, useSearchParams } from 'react-router-dom'
import { paths } from '../app/paths'
import { Page } from '../components/layout'
import { BottomAction, Button } from '../components/ui'

export default function PayFail() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const reservationId = params.get('reservation')
  const message = params.get('message') ?? '결제가 완료되지 않았어요'
  return (
    <Page title="결제 결과">
      <p role="alert" className="inline-error">{message}</p>
      <p>예약은 그대로 결제 대기 상태예요. 다시 결제할 수 있어요.</p>
      <BottomAction>
        <Button variant="primary" onClick={() => nav(reservationId ? paths.groupPay(reservationId) : paths.groupHome, { replace: true })}>다시 결제하기</Button>
      </BottomAction>
    </Page>
  )
}
