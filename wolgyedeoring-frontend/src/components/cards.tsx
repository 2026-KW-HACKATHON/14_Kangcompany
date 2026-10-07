// 목록 카드: 예약 / 요청
import { useNavigate } from 'react-router-dom'
import { paths } from '../app/paths'
import { Badge, Card, Countdown } from './ui'
import { formatDateTime, formatWon } from '../lib/format'
import { EVENT_LABEL, REQUEST_STATUS, RESERVATION_STATUS, effectiveRequestStatus } from '../lib/status'
import type { ReservationRow } from '../api/reservations'
import type { Request } from '../types/db'

export function ReservationCard({ r, role }: { r: ReservationRow; role: 'group' | 'owner' }) {
  const nav = useNavigate()
  const st = RESERVATION_STATUS[r.status]
  return (
    <Card as="li" onClick={() => nav(role === 'group' ? paths.groupReservation(r.id) : paths.ownerReservation(r.id))}>
      <div className="card-top">
        <span className="strong">{role === 'group' ? r.stores.name : r.groups.name}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p>{formatDateTime(r.start_at)} · {r.headcount}명 · {EVENT_LABEL[r.event_type]}</p>
      {r.deposit_amount > 0 && <p className="muted">예약금 {formatWon(r.deposit_amount)}</p>}
      {r.modify_status === 'pending' && <Badge tone={role === 'owner' ? 'warning' : 'neutral'}>조건 수정 요청 중</Badge>}
    </Card>
  )
}

export function RequestCard({ r }: { r: Request }) {
  const nav = useNavigate()
  const s = effectiveRequestStatus(r)
  const st = REQUEST_STATUS[s]
  return (
    <Card as="li" onClick={() => nav(paths.groupRequest(r.id))}>
      <div className="card-top">
        <span className="strong">{EVENT_LABEL[r.event_type]} 요청</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p>{formatDateTime(r.desired_at)} · {r.headcount}명 · 1인 {formatWon(r.budget_per_person)}</p>
      {s === 'open' && <Countdown until={r.response_deadline} />}
    </Card>
  )
}
