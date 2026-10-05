// 예약 조회·상태 변경 (API.md 3장 공통)
import { supabase } from '../lib/supabase'
import { unwrap, unwrapFunction } from '../lib/errors'
import type {
  EventType, Group, Payment, Reservation, ReservationActions, ReservationContacts, Store,
} from '../types/db'

export type ReservationRow = Reservation & {
  groups: Pick<Group, 'id' | 'name' | 'group_type'>
  stores: Pick<Store, 'id' | 'name' | 'address' | 'phone' | 'photo_url' | 'lat' | 'lng'>
}

const SELECT = '*, groups(id, name, group_type), stores(id, name, address, phone, photo_url, lat, lng)'

/** 내 예약 목록 (단체·사장님 모두 자기 것만 보임) */
export async function listMyReservations(opts: { upcomingOnly?: boolean } = {}): Promise<ReservationRow[]> {
  let q = supabase.from('reservations').select(SELECT)
  if (opts.upcomingOnly) q = q.gte('start_at', new Date().toISOString())
  return unwrap(await q.order('start_at')) as ReservationRow[]
}

export async function getReservation(id: number): Promise<ReservationRow> {
  return unwrap(await supabase.from('reservations').select(SELECT).eq('id', id).single()) as ReservationRow
}

/** 버튼 표시 기준 (008, B-09). 상태 변경 직후 다시 불러올 것 */
export async function getActions(id: number): Promise<ReservationActions> {
  return unwrap(await supabase.rpc('reservation_actions', { p_reservation_id: id })) as ReservationActions
}

/** 상대방 연락처 (008, B-01). 결제 대기 이상만 */
export async function getContacts(id: number): Promise<ReservationContacts> {
  return unwrap(await supabase.rpc('reservation_contacts', { p_reservation_id: id })) as ReservationContacts
}

/** 가장 최근 결제 시도 (예약금 영역 표시용). 없으면 null */
export async function getLatestPayment(id: number): Promise<Payment | null> {
  return unwrap(await supabase.from('payments').select('*').eq('reservation_id', id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle())
}

/** [단체] 빈 날짜 예약 (+사전 주문). items 가 비어 있으면 예약만 */
export async function bookSlot(input: {
  slotId: number; groupId: number; eventType: EventType; headcount: number
  budgetPerPerson?: number | null; items?: { menu_id: number; qty: number }[]
}) {
  if (input.items && input.items.length > 0) {
    return unwrap(await supabase.rpc('book_slot_with_menu', {
      p_slot_id: input.slotId, p_group_id: input.groupId, p_event_type: input.eventType,
      p_headcount: input.headcount, p_items: input.items, p_budget_per_person: input.budgetPerPerson ?? null,
    }))
  }
  return unwrap(await supabase.rpc('book_slot', {
    p_slot_id: input.slotId, p_group_id: input.groupId, p_event_type: input.eventType,
    p_headcount: input.headcount, p_budget_per_person: input.budgetPerPerson ?? null,
  }))
}

/**
 * 취소. actions.cancel_via 가 'toss' 면 환불과 함께 Edge Function 으로,
 * 'rpc' 면 cancel_reservation 으로 (결제 전·테스트 결제)
 */
export async function cancelReservation(id: number, via: 'toss' | 'rpc', reason = '예약 취소') {
  if (via === 'toss') {
    return unwrapFunction(await supabase.functions.invoke('toss-payment', {
      body: { action: 'cancel', reservation_id: id, reason },
    }))
  }
  return unwrap(await supabase.rpc('cancel_reservation', { p_reservation_id: id }))
}

/** [사장님] 완료 / 노쇼. 행사 시작 이후에만 가능 (008, R-03) */
export async function finishReservation(id: number, noShow = false) {
  return unwrap(await supabase.rpc('finish_reservation', { p_reservation_id: id, p_no_show: noShow }))
}

/** [단체] 조건 수정 요청 (결제 전·1회·행사 24시간 전까지, 주체는 #3 결정 대기) */
export async function requestModification(id: number, change: { startAt?: string; headcount?: number; note?: string }) {
  return unwrap(await supabase.rpc('request_modification', {
    p_reservation_id: id, p_start_at: change.startAt ?? null, p_headcount: change.headcount ?? null, p_note: change.note ?? null,
  }))
}

/** [사장님] 조건 수정 응답 */
export async function respondModification(id: number, accept: boolean) {
  return unwrap(await supabase.rpc('respond_modification', { p_reservation_id: id, p_accept: accept }))
}
