// 상태 코드 → 화면 라벨·배지 톤 (docs/ui-handoff/ia/state-definitions.md 와 1:1)
// 라벨을 바꾸려면 상태 정의도를 먼저 고치고 여기를 맞춘다

import type {
  EventType, GroupType, MenuCategory, PaymentStatus, ReceiptStatus,
  ReservationStatus, RequestStatus, ResponseStatus, SlotStatus, ModifyStatus, Role,
} from '../types/db'

/** 배지 톤: 색은 디자인 토큰에서 매핑 (state-definitions 0장) */
export type Tone = 'neutral' | 'warning' | 'success' | 'danger' | 'muted'
export interface StatusView { label: string; tone: Tone }

export const EVENT_LABEL: Record<EventType, string> = {
  opening_party: '개강총회', snack_event: '간식행사', after_party: '뒤풀이', closing_party: '종강총회', etc: '기타 행사',
}
export const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  student_council: '학생회', club: '동아리', residents: '주민모임', hobby: '동호회', etc: '기타',
}
export const MENU_CATEGORY_LABEL: Record<MenuCategory, string> = {
  main: '메인', side: '곁들임', meal: '식사', drink: '주류·음료', etc: '기타',
}

// 1. 예약 요청 -----------------------------------------------------------
export const REQUEST_STATUS: Record<RequestStatus, StatusView> = {
  open: { label: '응답 대기', tone: 'neutral' },
  confirmed: { label: '가게 확정', tone: 'success' },
  expired: { label: '만료', tone: 'muted' },
  cancelled: { label: '취소', tone: 'muted' },
}

/**
 * 단체 화면용 실제 상태: 자동 만료는 사장님 쪽 조회 때 처리되므로
 * open 이어도 응답 기한이 지났으면 만료로 보여준다
 */
export function effectiveRequestStatus(r: { status: RequestStatus; response_deadline: string }, now = Date.now()): RequestStatus {
  if (r.status === 'open' && new Date(r.response_deadline).getTime() < now) return 'expired'
  return r.status
}

/** 사장님 S-02 "내 응답" */
export function myResponseView(s: ResponseStatus | null): StatusView {
  if (s === 'declined') return { label: '거절함', tone: 'muted' }
  if (s === 'accepted') return { label: '수락함', tone: 'success' }
  return { label: '새 요청', tone: 'warning' }
}

// 2. 예약 -----------------------------------------------------------------
export const RESERVATION_STATUS: Record<ReservationStatus, StatusView> = {
  awaiting_payment: { label: '결제 대기', tone: 'warning' },
  confirmed: { label: '확정', tone: 'success' },
  completed: { label: '완료', tone: 'success' },
  no_show: { label: '노쇼', tone: 'danger' },
  cancelled: { label: '취소됨', tone: 'muted' },
}

/** 상태별 "다음 할 일" (역할마다 다름, state-definitions 2장) */
export function reservationNextStep(status: ReservationStatus, role: Role, opts: { hasRsvp?: boolean; hasReceipt?: boolean } = {}): string | null {
  if (role === 'group') {
    switch (status) {
      case 'awaiting_payment': return '예약금을 결제해야 확정돼요'
      case 'confirmed': return opts.hasRsvp ? null : '참석 조사를 만들어 인원을 확인해 보세요'
      case 'cancelled': return '환불 상태를 확인하세요'
      default: return null
    }
  }
  switch (status) {
    case 'awaiting_payment': return '단체의 결제를 기다리는 중'
    case 'confirmed': return '사전 주문 확인 → 행사 후 완료 처리'
    case 'completed': return opts.hasReceipt ? null : '영수증을 등록하세요'
    default: return null
  }
}

export const MODIFY_STATUS: Record<ModifyStatus, StatusView> = {
  pending: { label: '수정 요청 중', tone: 'warning' }, // 단체 화면에서는 neutral 로 써도 됨
  accepted: { label: '수정 반영됨', tone: 'success' },
  rejected: { label: '수정 거절됨', tone: 'muted' },
}

// 3. 결제 (가장 최근 행 기준, 행이 없으면 null) ------------------------------
export function paymentView(s: PaymentStatus | null): StatusView {
  switch (s) {
    case null: return { label: '미결제', tone: 'warning' }
    case 'pending': return { label: '결제 진행 중', tone: 'neutral' }
    case 'paid': return { label: '결제 완료', tone: 'success' }
    case 'failed': return { label: '결제 실패', tone: 'danger' }
    case 'refunded': return { label: '환불 완료', tone: 'muted' }
  }
}

// 4. 영수증 ---------------------------------------------------------------
export const RECEIPT_STATUS: Record<ReceiptStatus, StatusView> = {
  processing: { label: '인식 중', tone: 'neutral' },
  needs_review: { label: '확인 필요', tone: 'warning' },
  done: { label: '확정', tone: 'success' },
  failed: { label: '인식 실패', tone: 'danger' },
}

// 5. 빈 날짜 (역할마다 라벨이 다름) ------------------------------------------
export function slotView(s: SlotStatus, role: Role): StatusView {
  if (s === 'open') return { label: role === 'owner' ? '열림' : '예약 가능', tone: 'success' }
  if (s === 'booked') return { label: '예약됨', tone: 'neutral' }
  return { label: '닫음', tone: 'muted' }
}

// 6. 참석 조사 -------------------------------------------------------------
export function rsvpView(p: { is_open: boolean; cancelled: boolean; attending: number }): StatusView {
  if (p.cancelled) return { label: '취소된 행사', tone: 'muted' }
  if (p.is_open) return { label: `응답 받는 중 · ${p.attending}명 참석`, tone: 'success' }
  return { label: '마감', tone: 'muted' }
}

/** 응답 기한 카운트다운: 3시간 이하면 warning (state-definitions 8장) */
export function deadlineTone(hoursLeft: number | null): Tone {
  if (hoursLeft === null) return 'muted'
  return hoursLeft <= 3 ? 'warning' : 'neutral'
}

// 모임 종류 (시안 A2: 회식·뒤풀이·총회·간식행사·기타) ↔ DB event_type
// DB 에 '회식' 값이 없어 etc + 메모 머리표 [회식] 으로 저장한다. 기타 직접 입력도 [입력값] 으로.
export interface EventChoice { key: string; label: string; sub?: string; type: EventType; tag?: string; art: 'gathering' | 'cheers' | 'celebration' | 'snack' | 'other'; studentOnly?: boolean }
export const EVENT_CHOICES: EventChoice[] = [
  { key: 'dinner', label: '회식', type: 'etc', tag: '회식', art: 'gathering' },
  { key: 'after', label: '뒤풀이', type: 'after_party', art: 'cheers' },
  { key: 'opening', label: '개강총회', sub: '개강', type: 'opening_party', art: 'celebration', studentOnly: true },
  { key: 'closing', label: '종강총회', sub: '종강', type: 'closing_party', art: 'celebration', studentOnly: true },
  { key: 'snack', label: '간식행사', type: 'snack_event', art: 'snack', studentOnly: true },
  { key: 'other', label: '기타', type: 'etc', art: 'other' },
]
const TAG_RE = /^\[([^\]]{1,40})\]\s*/
/** 화면에 보일 모임 종류 */
export function eventLabel(type: EventType, note?: string | null): string {
  if (type === 'etc' && note) { const m = note.match(TAG_RE); if (m) return m[1] }
  return type === 'etc' ? '기타 모임' : EVENT_LABEL[type]
}
/** 메모에서 모임 종류 머리표를 뺀 본문 */
export function noteBody(note?: string | null): string {
  return (note ?? '').replace(TAG_RE, '')
}
/** 저장할 메모 = [모임 종류] + 본문 (etc 일 때만) */
export function composeNote(choice: EventChoice, otherText: string, body: string): string | null {
  const tag = choice.tag ?? (choice.key === 'other' ? otherText.trim() : '')
  const text = body.trim()
  const out = choice.type === 'etc' && tag ? `[${tag}] ${text}`.trim() : text
  return out || null
}
