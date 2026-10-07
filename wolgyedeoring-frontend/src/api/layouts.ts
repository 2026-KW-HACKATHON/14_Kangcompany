// 좌석 배치도 (009, 명세 7)
import { supabase } from '../lib/supabase'
import { unwrap, unwrapFunction } from '../lib/errors'
import { stripForSave, normalizeLayout } from '../lib/layout'
import type { ExtractLayoutResult, Layout, LayoutSuggestion, StoreLayoutInfo } from '../types/db'

/** 게시본(누구나) + 임시본·대기 중 제안 수(사장님만) */
export async function getStoreLayout(storeId: number): Promise<StoreLayoutInfo> {
  return unwrap(await supabase.rpc('get_store_layout', { p_store_id: storeId })) as StoreLayoutInfo
}

/** [사장님] 저장. publish=true 면 게시본도 같은 내용으로 (손님에게 보임) */
export async function saveStoreLayout(storeId: number, layout: Layout, opts: { publish?: boolean; source?: 'photo' | 'manual' } = {}): Promise<StoreLayoutInfo> {
  const clean = stripForSave(normalizeLayout(layout as unknown as Record<string, unknown>))
  return unwrap(await supabase.rpc('save_store_layout', {
    p_store_id: storeId, p_layout: clean, p_source: opts.source ?? 'manual', p_publish: opts.publish ?? false,
  })) as StoreLayoutInfo
}

/** 이미지 → 긴 변 maxSide 로 줄인 JPEG (base64, data: 접두어 없음) + 줄인 뒤 크기 */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return { base64: canvas.toDataURL('image/jpeg', quality).split(',')[1], width: canvas.width, height: canvas.height }
}

/** [사장님] 평면도·손그림·실내 사진 → 테이블 후보 (저장 안 함, 원본 사진도 저장 안 함) */
export async function extractLayout(storeId: number, file: File): Promise<ExtractLayoutResult> {
  const img = await resizeImage(file)
  return unwrapFunction(await supabase.functions.invoke<ExtractLayoutResult>('extract-layout', {
    body: { store_id: storeId, image_base64: img.base64, media_type: 'image/jpeg', image_width: img.width, image_height: img.height },
  }))
}

/** [손님] 수정 제안 (공식 배치도는 바뀌지 않음) */
export async function suggestLayoutChange(storeId: number, note: string) {
  return unwrap(await supabase.rpc('suggest_layout_change', { p_store_id: storeId, p_note: note }))
}

/** [사장님] 제안 목록 (대기 중 먼저) */
export async function listLayoutSuggestions(storeId: number): Promise<LayoutSuggestion[]> {
  return unwrap(await supabase.rpc('list_layout_suggestions', { p_store_id: storeId })) as LayoutSuggestion[]
}

/** [사장님] 제안 답변. accept=true: "반영하기로 했어요" 알림 (반영은 직접 편집·게시) */
export async function respondLayoutSuggestion(id: number, accept: boolean) {
  return unwrap(await supabase.rpc('respond_layout_suggestion', { p_suggestion_id: id, p_accept: accept }))
}
