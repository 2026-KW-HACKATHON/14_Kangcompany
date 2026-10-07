// 영수증 (API.md 4장)
import { supabase } from '../lib/supabase'
import { unwrap, unwrapFunction } from '../lib/errors'
import type { ProcessReceiptResult, Receipt, ReceiptItem } from '../types/db'

/** 업로드 전 긴 변 1500px 정도로 줄이고 JPEG 로 압축하는 것을 권장 (resizeImageToBase64 참고) */
export async function processReceipt(reservationId: number, imageBase64: string, mediaType = 'image/jpeg'): Promise<ProcessReceiptResult> {
  return unwrapFunction(await supabase.functions.invoke<ProcessReceiptResult>('process-receipt', {
    body: { reservation_id: reservationId, image_base64: imageBase64, media_type: mediaType },
  }))
}

export type ReceiptWithItems = Receipt & { receipt_items: (ReceiptItem & { menus: { name: string } | null })[] }

export async function getReceipt(id: number): Promise<ReceiptWithItems> {
  return unwrap(await supabase.from('receipts').select('*, receipt_items(*, menus(name))').eq('id', id).single()) as ReceiptWithItems
}

export async function listReceiptsForReservation(reservationId: number): Promise<Receipt[]> {
  return unwrap(await supabase.from('receipts').select('*').eq('reservation_id', reservationId).order('created_at', { ascending: false }))
}

export async function correctItem(itemId: number, menuId: number | null, qty: number, unitPrice: number) {
  return unwrap(await supabase.rpc('correct_receipt_item', { p_item_id: itemId, p_menu_id: menuId, p_qty: qty, p_unit_price: unitPrice }))
}
export async function addItem(receiptId: number, menuId: number, qty: number, unitPrice: number) {
  return unwrap(await supabase.rpc('add_receipt_item', { p_receipt_id: receiptId, p_menu_id: menuId, p_qty: qty, p_unit_price: unitPrice }))
}
export async function deleteItem(itemId: number) {
  return unwrap(await supabase.rpc('delete_receipt_item', { p_item_id: itemId }))
}
/** 메뉴 미매칭·오류 품목이 남아 있으면 서버가 거절 */
export async function confirmReceipt(receiptId: number): Promise<Receipt> {
  return unwrap(await supabase.rpc('confirm_receipt', { p_receipt_id: receiptId })) as Receipt
}

/** 이미지 파일 → 긴 변 maxSide 로 줄인 JPEG base64 (data: 접두어 없음) */
export async function resizeImageToBase64(file: File, maxSide = 1500, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality).split(',')[1]
}

/** [사장님] 확인이 필요한 영수증 (S-01 홈 요약) */
export async function listReceiptsNeedingReview(): Promise<(Receipt & { reservations: { id: number; start_at: string; groups: { name: string } } })[]> {
  return unwrap(await supabase.from('receipts')
    .select('*, reservations(id, start_at, groups(name))')
    .eq('status', 'needs_review').order('created_at', { ascending: false })) as never
}
