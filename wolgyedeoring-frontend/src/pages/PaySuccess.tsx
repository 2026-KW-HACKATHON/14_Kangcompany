// G-10 결제 결과(성공): 토스 결제창에서 돌아오면 서버 승인 → 예약 확정 → 예약 상세 / 참석 조사(G-12)
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { paths } from '../app/paths'
import { payments } from '../api'
import { toApiError } from '../lib/errors'
import { Page } from '../components/layout'
import { BottomAction } from '../components/ui'

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
    <Page title="결제 결과">
      <p role="status" className={state === 'error' ? 'inline-error' : 'strong'}>{message}</p>
      {state === 'done' && reservationId && <p className="muted">참석 조사를 만들면 참석 인원이 예약에 자동 반영돼요.</p>}
      {state !== 'working' && (
        <BottomAction>
          <div className="btn-row">
            <Link className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center' }} to={reservationId ? paths.groupReservation(reservationId) : paths.groupHome}>예약 상세로</Link>
            {state === 'done' && reservationId && (
              <Link className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center' }} to={paths.groupRsvp(reservationId)}>참석 조사 만들기</Link>
            )}
          </div>
        </BottomAction>
      )}
    </Page>
  )
}
