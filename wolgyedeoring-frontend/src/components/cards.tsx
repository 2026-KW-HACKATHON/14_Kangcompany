// 목록 카드 (시안 hub.js myBookingCard · experience.js availableCards/requestCards)
import { useNavigate } from 'react-router-dom'
import { paths } from '../app/paths'
import { Badge, Countdown } from './ui'
import { Icon } from './icons'
import { dateTimeLabel, formatWon, timeLabel, dateLabel } from '../lib/format'
import { REQUEST_STATUS, RESERVATION_STATUS, effectiveRequestStatus, eventLabel, noteBody } from '../lib/status'
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

/** 420000 → 42만 원, 425000 → 42.5만 원 */
const shortWon = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만 원` : formatWon(n))

/** 사장님에게 온 동네 요청 카드 — 흰 카드 + 왼쪽 색 띠, 핵심 숫자(인원·예산·총액)를 색 칩으로 */
export function OwnerRequestCard({ id, headcount, desiredAt, budget, eventType, note, mine, groupName, deadline, canAccept = true, remaining }: {
  id: number; headcount: number; desiredAt: string; budget: number; eventType: Request['event_type']; note: string | null
  mine?: string | null; groupName?: string; deadline?: string; canAccept?: boolean; remaining?: number
}) {
  const nav = useNavigate()
  const declined = mine === 'declined'
  const memo = noteBody(note)
  const hoursLeft = deadline ? (new Date(deadline).getTime() - Date.now()) / 3600e3 : null
  const urgent = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 3
  const state = declined ? 'is-declined' : !canAccept ? 'is-blocked' : urgent ? 'is-urgent' : 'is-new'
  return (
    <button type="button" className={`req-tile ${state}`} onClick={() => nav(paths.ownerRequest(id))}>
      <div className="req-tile-top">
        <Badge tone={declined ? 'muted' : !canAccept ? 'muted' : 'success'}>{declined ? '거절함' : !canAccept ? '자리 부족' : '새 요청'}</Badge>
        {groupName && <span className="req-tile-group">{groupName}</span>}
      </div>
      <h3>{eventLabel(eventType, note)}</h3>
      <p className="req-tile-when"><Icon name="calendar" />{dateLabel(desiredAt)} · {timeLabel(desiredAt)}</p>
      <div className="req-tile-chips">
        <span className="req-chip people"><small>인원</small><strong>{headcount}명</strong></span>
        <span className="req-chip budget"><small>1인</small><strong>{formatWon(budget)}</strong></span>
        <span className="req-chip total"><small>총액</small><strong>{shortWon(headcount * budget)}</strong></span>
      </div>
      {memo && <p className="req-tile-memo">“{memo}”</p>}
      <div className="req-tile-foot">
        {deadline ? <Countdown until={deadline} /> : <span />}
        {!canAccept && remaining !== undefined && <span className="meta">남은 자리 {remaining}석</span>}
        <span className="req-tile-cta">확인하기<Icon name="chevron" /></span>
      </div>
    </button>
  )
}
