// G-10 예약 확정 완료 (시안 15): 토스 결제창에서 돌아오면 서버 승인 → 예약 확정 (0원·시연용 결제는 바로 이 화면)
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { paths } from '../app/paths'
import { payments, reservations } from '../api'
import { toApiError } from '../lib/errors'
import { Page } from '../components/layout'
import { Badge, Button, Dock, ErrorBox, Loading, Rows, SuccessHero } from '../components/ui'
import { dateLabel, formatWon, timeLabel } from '../lib/format'
import { eventLabel } from '../lib/status'
import type { ReservationRow } from '../api/reservations'

export default function PaySuccess() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const reservationId = params.get('reservation')
  const direct = params.has('zero') || params.has('test')
  const [state, setState] = useState<'working' | 'done' | 'error'>(direct ? 'done' : 'working')
  const [error, setError] = useState('')
  const [r, setR] = useState<ReservationRow | null>(null)
  const ran = useRef(false) // StrictMode 에서 두 번 호출 방지 (서버도 중복 승인은 막음)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const load = () => (reservationId ? reservations.getReservation(Number(reservationId)).then(setR).catch(() => undefined) : undefined)
    if (direct) { void load(); return }
    payments.confirmPaymentFromUrl()
      .then(() => { setState('done'); void load() })
      .catch((e) => { setState('error'); setError(toApiError(e).message) })
  }, [direct, reservationId])

  if (state === 'working') return <Page title="예약 확정" back={false}><Loading label="결제를 확인하고 있어요." /></Page>
  if (state === 'error') return (
    <Page title="결제 결과" back={false} dock={<Dock><Button variant="primary" onClick={() => nav(reservationId ? paths.groupReservation(reservationId) : paths.groupHome)}>예약 상세로</Button></Dock>}>
      <ErrorBox message={error} />
    </Page>
  )
  return (
    <Page title="예약 확정" back={reservationId ? paths.groupReservation(reservationId) : paths.groupHome}
      dock={<Dock><Button variant="primary" onClick={() => nav(reservationId ? paths.groupReservation(reservationId) : paths.groupHome, { replace: true })}>예약 상세 보기</Button></Dock>}>
      <SuccessHero art="check" title="모일 준비가 끝났어요.">
        {params.has('zero') ? <>예약금 없이<br />예약이 확정됐어요.</> : <>예약금 결제가 완료되어<br />예약이 확정됐어요.</>}
      </SuccessHero>
      <Badge tone="success">확정</Badge>
      {r && (
        <section className="card">
          <h2>{r.stores.name}</h2>
          <Rows rows={[['방문 날짜', dateLabel(r.start_at)], ['방문 시간', timeLabel(r.start_at)], ['모임 종류', eventLabel(r.event_type, r.requests?.note)], ['예상 인원', `${r.headcount}명`], ['예약금', r.deposit_amount ? formatWon(r.deposit_amount) : '없음'], ['예약 번호', `WG-${String(r.id).padStart(4, '0')}`]]} />
        </section>
      )}
      {reservationId && (
        <div className="option-grid">
          <Button onClick={() => nav(paths.groupRsvp(reservationId))}>참석 링크 만들기</Button>
          <Button onClick={() => nav(paths.groupRsvpResponses(reservationId))}>참석 현황 보기</Button>
        </div>
      )}
    </Page>
  )
}
