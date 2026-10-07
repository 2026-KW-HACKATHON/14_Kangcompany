// 좌석 배치도 (009, 명세 7) — 사장님 게시, 손님 보기
import { supabase } from '../lib/supabase'
import { unwrap, unwrapFunction } from '../lib/errors'
import { stripForSave, normalizeLayout } from '../lib/layout'
import type { ExtractLayoutResult, Layout, PublishedLayout } from '../types/db'

const SELECT = 'store_id, layout, table_count, total_seats, source, published_at, stores(name, address, max_capacity)'

/** 배치도를 게시한 가게 목록 (손님 G-15 가게 선택) */
export async function listPublishedLayouts(): Promise<PublishedLayout[]> {
  return unwrap(await supabase.from('store_layouts').select(SELECT).order('published_at', { ascending: false })) as unknown as PublishedLayout[]
}

/** 한 가게의 게시된 배치도. 없으면 null */
export async function getPublishedLayout(storeId: number): Promise<PublishedLayout | null> {
  return unwrap(await supabase.from('store_layouts').select(SELECT).eq('store_id', storeId).maybeSingle()) as unknown as PublishedLayout | null
}

/** [사장님] 게시 (바로 손님에게 보임, 다시 게시하면 덮어씀) */
export async function publishStoreLayout(storeId: number, layout: Layout, source: 'photo' | 'manual' = 'manual') {
  const clean = stripForSave(normalizeLayout(layout as unknown as Record<string, unknown>))
  return unwrap(await supabase.rpc('save_store_layout', { p_store_id: storeId, p_layout: clean, p_source: source }))
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

/** [사장님] 손그림·평면도·홀 사진 → 테이블 후보 (저장 안 함, 원본 사진도 저장 안 함) */
export async function extractLayout(storeId: number, file: File): Promise<ExtractLayoutResult> {
  const img = await resizeImage(file)
  return unwrapFunction(await supabase.functions.invoke<ExtractLayoutResult>('extract-layout', {
    body: { store_id: storeId, image_base64: img.base64, media_type: 'image/jpeg', image_width: img.width, image_height: img.height },
  }))
}
