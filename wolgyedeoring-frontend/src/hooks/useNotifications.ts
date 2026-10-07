import { useEffect, useState, useCallback } from 'react'
import { notifications } from '../api'
import type { AppNotification } from '../types/db'

/** 알림 목록 + 실시간 수신. onNew 로 토스트를 띄우면 됨 */
export function useNotifications(userId: string | null | undefined, onNew?: (n: AppNotification) => void) {
  const [items, setItems] = useState<AppNotification[]>([])
  const unread = items.filter((n) => !n.is_read).length

  const reload = useCallback(async () => {
    if (!userId) return setItems([])
    setItems(await notifications.listNotifications())
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void reload()
    return notifications.subscribeNotifications(userId, (n) => {
      setItems((prev) => [n, ...prev])
      onNew?.(n)
    })
    // onNew 는 의존성에서 제외 (매 렌더마다 재구독 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reload])

  const markAllRead = useCallback(async () => {
    await notifications.markRead()
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }, [])

  return { items, unread, reload, markAllRead }
}
