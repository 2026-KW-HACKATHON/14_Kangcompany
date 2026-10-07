// 목록 카드 (시안 hub.js myBookingCard · experience.js availableCards/requestCards)
import { useNavigate } from 'react-router-dom'
import { paths } from '../app/paths'
import { Badge, Countdown } from './ui'
import { Icon } from './icons'
import { dateTimeLabel, formatWon, timeLabel, dateLabel } from '../lib/format'
import { REQUEST_STATUS, RESERVATION_STATUS, effectiveRequestStatus, eventLabel } from '../lib/status'
import type { ReservationRow } from '../api/reservations'
import type { Request } from '../types/db'
import type { SlotWithStore } from '../api/slots'

export function ReservationCard({ r, role }: { r: ReservationRow; role: 'group' | 'owner' }) {
  const nav = useNavigate()
  const st = RESERVATION_STATUS[r.status]
  const label = r.status === 'awaiting_payment' && r.deposit_amount === 0 ? '확정 대기' : st.label
  return (
    <button type="button" className="offer-card my-booking-card" onClick={() => nav(role === 'group' ? paths.groupReservation(r.id) : paths.ownerReservation(r.id))}>
      <div className="row"><Badge tone={st.tone}>{label}</Badge><span className="meta">{r.headcount}명</span></div>
      <h3>{role === 'group' ? r.stores.name : r.groups.name}</h3>
      <p>{dateTimeLabel(r.start_at)}</p>
      {role === 'owner' && <p className="meta">{eventLabel(r.event_type, r.requests?.note)}{r.deposit_amount > 0 ? ` · 예약금 ${formatWon(r.deposit_amount)}` : ''}</p>}
      {r.modify_status === 'pending' && <p className="meta">조건 수정 요청 중</p>}
      <span className="card-action">{role === 'group' ? '예약 관리' : '예약 확인'}<Icon name="chevron" /></span>
    </button>
  )
}

export function RequestCard({ r }: { r: Request }) {
  const nav = useNavigate()
  const s = effectiveRequestStatus(r)
  const st = REQUEST_STATUS[s]
  return (
    <button type="button" className="offer-card my-booking-card" onClick={() => nav(paths.groupRequest(r.id))}>
      <div className="row"><Badge tone={st.tone}>{st.label}</Badge><span className="meta">{r.headcount}명</span></div>
      <h3>{eventLabel(r.event_type, r.note)} 모임</h3>
      <p>{dateTimeLabel(r.desired_at)}</p>
      {s === 'open' && <Countdown until={r.response_deadline} />}
      <span className="card-action">요청 진행 확인<Icon name="chevron" /></span>
    </button>
  )
}

/** 공개 빈자리 카드 (단체) */
export function SlotCard({ s }: { s: SlotWithStore }) {
  const nav = useNavigate()
  return (
    <button type="button" className="offer-card available-card" onClick={() => nav(paths.groupSlotBook(s.id))}>
      <div className="row"><h3>{s.stores.name}</h3><Badge tone="success">예약 가능</Badge></div>
      <p className="slot-time">{timeLabel(s.start_at)} – {timeLabel(s.end_at)}</p>
      <p>최대 {s.capacity}명 · 예약금 {s.deposit_amount > 0 ? formatWon(s.deposit_amount) : '없음'}</p>
      {s.stores.intro && <p className="meta">{s.stores.intro}</p>}
    </button>
  )
}

/** 사장님에게 온 동네 요청 카드 (익명) */
export function OwnerRequestCard({ id, headcount, desiredAt, budget, eventType, note, mine }: {
  id: number; headcount: number; desiredAt: string; budget: number; eventType: Request['event_type']; note: string | null; mine?: string
}) {
  const nav = useNavigate()
  return (
    <button type="button" className="offer-card request-card" onClick={() => nav(paths.ownerRequest(id))}>
      <div className="row"><Badge tone={mine === 'declined' ? 'muted' : 'neutral'}>{mine === 'declined' ? '거절함' : '새 요청'}</Badge><span className="meta">월계동 · 단체 요청</span></div>
      <h3>{eventLabel(eventType, note)} · {headcount}명</h3>
      <p className="slot-time">{dateLabel(desiredAt)} · {timeLabel(desiredAt)}</p>
      <p>1인 {formatWon(budget)}</p>
      <span className="card-action">조건 확인 후 수락<Icon name="chevron" /></span>
    </button>
  )
}
