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
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [error, setError] = useState('')
  const [r, setR] = useState<ReservationRow | null>(null)
  const job = useRef<{ key: string; promise: Promise<ReservationRow> } | null>(null)
  const search = params.toString()

  useEffect(() => {
    let active = true
    setState('working')
    setR(null)
    // StrictMode에서도 같은 결제 승인은 한 번만 호출하고 결과 구독만 다시 연결한다.
    if (job.current?.key !== search) {
      const promise = (async () => {
        const id = Number(reservationId)
        if (!reservationId || !Number.isSafeInteger(id) || id <= 0) throw new Error('예약 정보가 올바르지 않아요.')
        if (!direct) await payments.confirmPaymentFromUrl(`?${search}`)
        const result = await reservations.getReservation(id)
        if (result.status !== 'confirmed') throw new Error('아직 예약 확정이 확인되지 않았어요. 예약 상세에서 결제 상태를 확인해 주세요.')
        return result
      })()
      job.current = { key: search, promise }
    }
    job.current.promise
      .then((result) => { if (active) { setR(result); setState('done') } })
      .catch((e) => { if (active) { setState('error'); setError(toApiError(e).message) } })
    return () => { active = false }
  }, [direct, reservationId, search])

  if (state === 'working') return <Page title="예약 확정" back={false}><Loading label="결제를 확인하고 있어요." /></Page>
  if (state === 'error') return (
    <Page title="결제 결과" back={false} dock={<Dock><Button variant="primary" onClick={() => nav(reservationId ? paths.groupReservation(reservationId) : paths.groupHome)}>예약 상세로</Button></Dock>}>
      <ErrorBox title="예약 확정을 확인하지 못했어요." message={error} />
    </Page>
  )
  return (
    <Page title="예약 확정" back={reservationId ? paths.groupReservation(reservationId) : paths.groupHome}
      dock={<Dock><Button variant="primary" onClick={() => nav(reservationId ? paths.groupReservation(reservationId) : paths.groupHome, { replace: true })}>예약 상세 보기</Button></Dock>}>
      <SuccessHero art="check" title="모일 준비가 끝났어요.">
        {r?.deposit_amount === 0 ? <>예약금 없이<br />예약이 확정됐어요.</> : <>예약금 결제가 완료되어<br />예약이 확정됐어요.</>}
      </SuccessHero>
      <Badge tone="success">확정</Badge>
      {r && (
        <section className="card">
          <h2>{r.stores.name}</h2>
          <Rows rows={[['방문 날짜', dateLabel(r.start_at)], ['방문 시간', timeLabel(r.start_at)], ['모임 종류', eventLabel(r.event_type, r.requests?.note)], ['예상 인원', `${r.headcount}명`], ...(r.budget_per_person ? [['1인 예산', formatWon(r.budget_per_person)] as [string, string]] : []), ['예약 번호', `WG-${String(r.id).padStart(4, '0')}`]]} />
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
