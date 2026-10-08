import { supabase } from '../lib/supabase'
import { unwrap, toApiError } from '../lib/errors'
import type { Store } from '../types/db'

export type StoreInput = Pick<Store, 'name' | 'max_capacity'> &
  Partial<Pick<Store, 'address' | 'phone' | 'intro' | 'lat' | 'lng' | 'photo_url' | 'category' | 'address_detail' | 'hours' | 'business_no' | 'commerce_no'>>

export async function getMyStore(ownerId: string): Promise<Store | null> {
  return unwrap(await supabase.from('stores').select('*').eq('owner_id', ownerId).order('id').limit(1).maybeSingle())
}

export async function getStore(id: number): Promise<Store> {
  return unwrap(await supabase.from('stores').select('*').eq('id', id).single())
}

/** 지도(G-04)용: 참여 가게 전체. 표시 범위는 #8 결정에 따름 */
export async function listStores(): Promise<Store[]> {
  return unwrap(await supabase.from('stores').select('*').order('name'))
}

export async function createStore(ownerId: string, input: StoreInput): Promise<Store> {
  return unwrap(await supabase.from('stores').insert({ owner_id: ownerId, ...input }).select().single())
}

export async function updateStore(id: number, patch: Partial<StoreInput>): Promise<Store> {
  return unwrap(await supabase.from('stores').update(patch).eq('id', id).select().single())
}

/** 대표 사진 업로드 → photo_url 저장. 경로 첫 폴더가 가게 id 여야 업로드 권한이 있음 (008) */
export async function uploadStorePhoto(storeId: number, file: File): Promise<Store> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${storeId}/main-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('store-photos').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw toApiError(error)
  const { data } = supabase.storage.from('store-photos').getPublicUrl(path)
  return updateStore(storeId, { photo_url: data.publicUrl })
}
