import { useEffect, useRef, useState } from 'react'
import { paths } from '../app/paths'
import { Link, useSearchParams } from 'react-router-dom'
import { payments } from '../api'
import { toApiError } from '../lib/errors'

// 토스 결제창 성공 후 돌아오는 페이지: 서버 승인 → 예약 확정
export default function PaySuccess() {
  const [params] = useSearchParams()
  const reservationId = params.get('reservation')
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('결제를 확인하고 있어요')
  const ran = useRef(false) // StrictMode 에서 두 번 호출 방지 (서버도 중복 승인은 막음)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    payments.confirmPaymentFromUrl()
      .then(() => { setState('done'); setMessage('예약금 결제가 끝났어요. 예약이 확정됐어요') })
      .catch((e) => { setState('error'); setMessage(toApiError(e).message) })
  }, [])

  return (
    <main style={{ padding: 24, fontSize: 17 }}>
      <p role="status">{message}</p>
      {state !== 'working' && (
        <p><Link to={reservationId ? paths.groupReservation(reservationId) : paths.groupHome}>예약 상세로 가기</Link></p>
      )}
    </main>
  )
}
