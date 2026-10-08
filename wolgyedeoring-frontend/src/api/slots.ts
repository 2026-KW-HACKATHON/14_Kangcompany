import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { Slot, Store } from '../types/db'

export type SlotWithStore = Slot & { stores: Pick<Store, 'id' | 'name' | 'address' | 'phone' | 'photo_url' | 'intro' | 'lat' | 'lng'> }

/** [단체] 예약 가능한 빈 날짜 (G-04) */
export async function listOpenSlots(filter: { from?: string; to?: string; minCapacity?: number } = {}): Promise<SlotWithStore[]> {
  let q = supabase
    .from('slots')
    .select('*, stores(id, name, address, phone, photo_url, intro, lat, lng)')
    .eq('status', 'open')
    .gte('start_at', filter.from ?? new Date().toISOString())
  if (filter.to) q = q.lte('start_at', filter.to)
  if (filter.minCapacity) q = q.gte('capacity', filter.minCapacity)
  return unwrap(await q.order('start_at')) as SlotWithStore[]
}

/** [사장님] 내 가게 빈 날짜 (S-06) */
export async function listMySlots(storeId: number): Promise<Slot[]> {
  return unwrap(await supabase.from('slots').select('*').eq('store_id', storeId).order('start_at', { ascending: false }))
}

export async function openSlot(input: Pick<Slot, 'store_id' | 'start_at' | 'end_at' | 'capacity' | 'deposit_amount'>): Promise<Slot> {
  return unwrap(await supabase.from('slots').insert(input).select().single())
}

/** 일괄 공개는 한 트랜잭션으로 처리. 같은 요청 키의 재시도는 기존 결과를 반환한다. */
export async function openSlots(storeId: number, batchId: string, input: Pick<Slot, 'start_at' | 'end_at' | 'capacity' | 'deposit_amount'>[]): Promise<Slot[]> {
  return unwrap(await supabase.rpc('publish_slots', { p_store_id: storeId, p_batch_id: batchId, p_slots: input })) as Slot[]
}

/** 닫기/다시 열기. 예약된(booked) 날짜는 서버가 거절 (008) */
export async function setSlotClosed(slotId: number, closed: boolean): Promise<Slot> {
  return unwrap(await supabase.from('slots').update({ status: closed ? 'closed' : 'open' }).eq('id', slotId).select().single())
}
