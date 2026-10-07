// 알림 (API.md 5장)
import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { AppNotification, Role } from '../types/db'
import { paths } from '../app/paths'

export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  return unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit))
}

export async function countUnread(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  return count ?? 0
}

/** ids 없으면 전체 읽음 */
export async function markRead(ids?: number[]): Promise<number> {
  return unwrap(await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null })) as number
}

/** 새 알림 실시간 수신. 반환값을 호출하면 구독 해제 */
export function subscribeNotifications(userId: string, onInsert: (n: AppNotification) => void): () => void {
  const ch = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new as AppNotification))
    .subscribe()
  return () => { void supabase.removeChannel(ch) }
}

/** 알림 → 이동할 화면 경로 (content-inventory C-01 표). 경로 자체는 app/paths.ts */
export function notificationTarget(n: AppNotification, role: Role): string | null {
  switch (n.type) {
    case 'request_new': return n.request_id ? paths.ownerRequest(n.request_id) : null // S-03
    case 'request_closed': return paths.ownerInbox // S-02
    case 'receipt_review': return n.receipt_id ? paths.ownerReceipt(n.receipt_id) : null // S-11
    case 'layout_suggested': return paths.ownerLayout // S-15
    case 'layout_suggestion_answered': return null // 알림만
    default:
      if (!n.reservation_id) return null
      return role === 'owner' ? paths.ownerReservation(n.reservation_id) : paths.groupReservation(n.reservation_id) // S-05 / G-06
  }
}
