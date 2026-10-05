import { supabase } from '../lib/supabase'
import { unwrap, unwrapFunction } from '../lib/errors'
import type { ExtractMenuResult, Menu, MenuCategory } from '../types/db'

export async function listMenus(storeId: number, opts: { includeInactive?: boolean } = {}): Promise<Menu[]> {
  let q = supabase.from('menus').select('*').eq('store_id', storeId)
  if (!opts.includeInactive) q = q.eq('is_active', true)
  return unwrap(await q.order('category').order('name'))
}

/** 메뉴판 사진 인식 (저장 안 함). imageBase64 는 data URL 이어도 됨 */
export async function extractMenu(storeId: number, imageBase64: string, mediaType = 'image/jpeg'): Promise<ExtractMenuResult> {
  return unwrapFunction(await supabase.functions.invoke<ExtractMenuResult>('extract-menu', {
    body: { store_id: storeId, image_base64: imageBase64, media_type: mediaType },
  }))
}

export interface MenuInput { name: string; price: number | null; category: MenuCategory }

/** 메뉴 일괄 저장. deactivateMissing = true 면 목록에 없는 기존 메뉴 판매 중지 */
export async function saveMenus(storeId: number, items: MenuInput[], deactivateMissing = false) {
  return unwrap(await supabase.rpc('save_menus', {
    p_store_id: storeId, p_items: items, p_deactivate_missing: deactivateMissing,
  })) as { inserted: number; updated: number; deactivated: number }
}

/** 판매 중지 / 다시 판매 (삭제하지 않음: 과거 기록 보존) */
export async function setMenuActive(id: number, active: boolean): Promise<Menu> {
  return unwrap(await supabase.from('menus').update({ is_active: active }).eq('id', id).select().single())
}

/** 가격·분류 수정 (이름 변경은 save_menus 가 이름 기준이라 여기서만) */
export async function updateMenu(id: number, patch: { name?: string; price?: number | null; category?: MenuCategory }): Promise<Menu> {
  return unwrap(await supabase.from('menus').update(patch).eq('id', id).select().single())
}
