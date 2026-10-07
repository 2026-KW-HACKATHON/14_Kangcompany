import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { PreorderSummary } from '../types/db'

export async function getPreorder(reservationId: number): Promise<PreorderSummary> {
  return unwrap(await supabase.rpc('get_preorder', { p_reservation_id: reservationId })) as PreorderSummary
}

/** 전체 교체. 빈 배열이면 비우기. 반환은 조회와 같은 형식 */
export async function setPreorder(reservationId: number, items: { menu_id: number; qty: number }[]): Promise<PreorderSummary> {
  return unwrap(await supabase.rpc('set_preorder', { p_reservation_id: reservationId, p_items: items })) as PreorderSummary
}
