// C-02 알림 상세 (시안 7·35): 내용 확인 → 관련 화면으로
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { notifications } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page, useUnread } from '../../components/layout'
import { Badge, Button, Dock, Empty, Loading, Notice } from '../../components/ui'
import { dateLabel, timeLabel } from '../../lib/format'
import type { Tone } from '../../lib/status'
import type { AppNotification } from '../../types/db'

function view(n: AppNotification): { badge: string; tone: Tone; cta: string } {
  switch (n.type) {
    case 'request_new': return { badge: '새 요청', tone: 'neutral', cta: '요청 조건 확인' }
    case 'request_accepted': return { badge: '결제 대기', tone: 'warning', cta: '예약 상세 보기' }
    case 'request_closed': return { badge: '마감', tone: 'muted', cta: '요청 목록 보기' }
    case 'receipt_review': return { badge: '확인 필요', tone: 'warning', cta: '영수증 확인' }
    case 'reservation_new': return { badge: '새 예약', tone: 'neutral', cta: '예약 확인' }
    case 'reservation_confirmed': return { badge: '확정', tone: 'success', cta: '예약 상세 보기' }
    case 'reservation_cancelled': return { badge: '취소', tone: 'muted', cta: '예약 상세 보기' }
    case 'reservation_completed': return { badge: '방문 완료', tone: 'success', cta: '예약 상세 보기' }
    case 'reservation_no_show': return { badge: '노쇼', tone: 'danger', cta: '예약 상세 보기' }
    case 'modify_requested': return { badge: '수정 요청', tone: 'warning', cta: '요청 확인' }
    case 'modify_accepted': return { badge: '수정 반영', tone: 'success', cta: '예약 상세 보기' }
    case 'modify_rejected': return { badge: '수정 거절', tone: 'muted', cta: '예약 상세 보기' }
    case 'preorder_changed': return { badge: '사전 주문', tone: 'neutral', cta: '주문 확인' }
    default: return { badge: '알림', tone: 'neutral', cta: '관련 화면 보기' }
  }
}

export default function NotificationDetail() {
  const id = Number(useParams().id)
  const { me } = useSessionContext()
  const nav = useNavigate()
  const { reload } = useUnread()
  const q = useAsync(async () => (await notifications.listNotifications(100)).find((n) => n.id === id) ?? null, [id])
  const n = q.data
  useEffect(() => { if (n && !n.is_read) void notifications.markRead([n.id]).then(reload) }, [n, reload])
  const role = me?.role === 'owner' ? 'owner' : 'group'
  if (q.loading) return <Page title="알림 상세" role={role}><Loading /></Page>
  if (!n) return <Page title="알림 상세" role={role}><Empty art="calendar" title="알림을 찾을 수 없어요." /></Page>
  const v = view(n)
  const to = notifications.notificationTarget(n, me!.role)
  return (
    <Page title="알림 상세" role={role} back={paths.notifications}
      dock={to ? <Dock><Button variant="primary" onClick={() => nav(to)}>{v.cta}</Button></Dock> : undefined}>
      <p className="meta">{dateLabel(n.created_at).replace(/\(.\)/, '')} · {timeLabel(n.created_at)}</p>
      <Badge tone={v.tone}>{v.badge}</Badge>
      <section className="notification-detail"><h2>{n.title}</h2>{n.body && <p className="subtitle">{n.body}</p>}</section>
      <Notice>이 알림의 관련 화면에서 자세한 조건을 확인할 수 있어요.</Notice>
    </Page>
  )
}
