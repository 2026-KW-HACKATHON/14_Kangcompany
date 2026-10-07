// 예약 요청 (선착순 확정, API.md 3-①)
import { supabase } from '../lib/supabase'
import { unwrap, toApiError } from '../lib/errors'
import type { EventType, OpenRequestForStore, Request, RequestReach, Reservation, Store } from '../types/db'

export interface NewRequest {
  group_id: number
  event_type: EventType
  desired_at: string // ISO (+09:00)
  headcount: number
  budget_per_person: number
  flexible_days?: number // 선착순에서 쓰이지 않음 (B-06 결정 대기)
  note?: string | null
}

// ---------------- 단체 ----------------

/** 요청 보내기. 응답 기한(response_deadline)은 서버가 계산해서 돌려줌 */
export async function createRequest(input: NewRequest): Promise<Request> {
  return unwrap(await supabase.from('requests').insert(input).select().single())
}

export async function listMyRequests(groupId: number): Promise<Request[]> {
  return unwrap(await supabase.from('requests').select('*').eq('group_id', groupId).order('created_at', { ascending: false }))
}

export async function getRequest(id: number): Promise<Request> {
  return unwrap(await supabase.from('requests').select('*').eq('id', id).single())
}

/** 메모만 수정 가능 */
export async function updateRequestNote(id: number, note: string | null): Promise<Request> {
  return unwrap(await supabase.from('requests').update({ note }).eq('id', id).select().single())
}

/** 응답 대기 중 요청 철회 (008, B-04) */
export async function cancelRequest(id: number): Promise<Request> {
  return unwrap(await supabase.rpc('cancel_request', { p_request_id: id })) as Request
}

/** 받을 수 있는 가게 수 (008, B-05). desiredAt 을 주면 그 시간대 남은 자리까지 고려 */
export async function requestReach(headcount: number, desiredAt?: string): Promise<RequestReach> {
  return unwrap(await supabase.rpc('request_reach', { p_headcount: headcount, p_desired_at: desiredAt ?? null })) as RequestReach
}

/** 요청으로 확정된 예약 (G-03 → G-06 이동용). 아직 없으면 null */
export async function getReservationForRequest(requestId: number) {
  return unwrap(await supabase
    .from('reservations')
    .select('*, stores(id, name, address, phone, photo_url, lat, lng)')
    .eq('request_id', requestId)
    .maybeSingle()) as (Reservation & { stores: Pick<Store, 'id' | 'name' | 'address' | 'phone' | 'photo_url' | 'lat' | 'lng'> }) | null
}

/** 거절한 가게 수 (G-03) */
export async function countDeclined(requestId: number): Promise<number> {
  const { count, error } = await supabase
    .from('request_responses')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', requestId)
    .eq('status', 'declined')
  if (error) throw toApiError(error)
  return count ?? 0
}

// ---------------- 사장님 ----------------

/** 받은 요청 목록 (응답 기한 임박순). 지난 요청은 서버가 자동 만료 */
export async function listOpenRequestsForStore(storeId: number): Promise<OpenRequestForStore[]> {
  return unwrap(await supabase.rpc('open_requests_for_store', { p_store_id: storeId })) as OpenRequestForStore[]
}

/**
 * 수락 = 즉시 확정(결제 대기 예약 생성). 다른 가게가 먼저 수락했으면
 * ApiError(kind: 'closed') → 토스트 + 목록 새로고침
 */
export async function acceptRequest(requestId: number, storeId: number, depositAmount: number) {
  return unwrap(await supabase.rpc('respond_to_request', {
    p_request_id: requestId, p_store_id: storeId, p_accept: true, p_deposit_amount: depositAmount,
  }))
}

export async function declineRequest(requestId: number, storeId: number) {
  return unwrap(await supabase.rpc('respond_to_request', {
    p_request_id: requestId, p_store_id: storeId, p_accept: false,
  }))
}
