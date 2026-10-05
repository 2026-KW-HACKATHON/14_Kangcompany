// C-01 알림 목록 → 누르면 관련 화면으로 바로 이동 (알림 상세 화면 없음)
import { useNavigate } from 'react-router-dom'
import { notifications } from '../../api'
import { useSessionContext } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Card, Empty, ErrorBox, Loading } from '../../components/ui'
import { formatDateTime } from '../../lib/format'

export default function Notifications() {
  const { me } = useSessionContext()
  const nav = useNavigate()
  const q = useAsync(() => notifications.listNotifications(), [])
  const open = async (id: number, to: string | null) => {
    await notifications.markRead([id])
    if (to) nav(to)
    else void q.reload()
  }
  return (
    <Page title="알림" back actions={<Button variant="text" onClick={() => void notifications.markRead().then(q.reload)}>모두 읽음</Button>}>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> :
        !q.data?.length ? <Empty>새 알림이 없어요</Empty> : (
          <ul className="list">
            {q.data.map((n) => (
              <Card as="li" key={n.id} onClick={() => void open(n.id, notifications.notificationTarget(n, me!.role))}>
                <div className="card-top">
                  <span className={n.is_read ? '' : 'strong'}>{n.is_read ? '' : '● '}{n.title}</span>
                  <span className="muted">{formatDateTime(n.created_at)}</span>
                </div>
                {n.body && <p className="muted">{n.body}</p>}
              </Card>
            ))}
          </ul>
        )}
    </Page>
  )
}
