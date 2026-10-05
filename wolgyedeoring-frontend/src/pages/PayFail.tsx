import { Link, useSearchParams } from 'react-router-dom'

// 토스 결제창 실패·취소 후 돌아오는 페이지 (토스가 code, message 를 붙여 줌)
export default function PayFail() {
  const [params] = useSearchParams()
  const reservationId = params.get('reservation')
  const message = params.get('message') ?? '결제가 완료되지 않았어요'
  return (
    <main style={{ padding: 24, fontSize: 17 }}>
      <p role="alert">{message}</p>
      <p>예약은 그대로 결제 대기 상태예요. 예약 상세에서 다시 결제할 수 있어요.</p>
      <p><Link to={reservationId ? `/group/reservations/${reservationId}` : '/'}>예약 상세로 가기</Link></p>
    </main>
  )
}
