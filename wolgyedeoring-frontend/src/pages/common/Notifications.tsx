// C-01 알림 목록 (시안 33·34): 날짜별 묶음 · 전체/안 읽음 · 모두 읽음 → 누르면 알림 상세(C-02)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notifications } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page, useUnread } from '../../components/layout'
import { Icon } from '../../components/icons'
import { Button, Empty, ErrorBox, Loading, Segmented } from '../../components/ui'
import { dateLabel, kstDay, timeLabel } from '../../lib/format'

export default function Notifications() {
  const { me } = useSessionContext()
  const nav = useNavigate()
  const { reload: reloadUnread } = useUnread()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const q = useAsync(() => notifications.listNotifications(), [])
  const list = (q.data ?? []).filter((n) => filter === 'all' || !n.is_read)
  const unread = (q.data ?? []).filter((n) => !n.is_read).length
  const readAll = async () => { await notifications.markRead(); await q.reload(); await reloadUnread() }

  return (
    <Page title="알림" role={me?.role === 'owner' ? 'owner' : 'group'}>
      <div className="section-heading"><p className="meta">읽지 않은 알림 {unread}개</p><Button variant="text" disabled={!unread} onClick={() => void readAll()}>모두 읽음</Button></div>
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: '전체' }, { value: 'unread', label: '안 읽음' }]} />
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !list.length ? (
        <Empty art="calendar">{filter === 'unread' ? '읽지 않은 알림이 없어요.' : '아직 알림이 없어요.'}</Empty>
      ) : (
        <section className="notification-list">
          {list.map((n, i) => (
            <div key={n.id}>
              {(i === 0 || kstDay(list[i - 1].created_at) !== kstDay(n.created_at)) && <h2 className="notification-date">{dateLabel(n.created_at)}</h2>}
              <button type="button" className={`notification-row ${n.is_read ? 'is-read' : 'is-unread'}`} onClick={() => nav(paths.notification(n.id))}>
                <div className="notification-heading"><h3>{n.title}</h3>{!n.is_read && <i className="unread-dot" aria-label="읽지 않음" />}</div>
                {n.body && <p>{n.body}</p>}
                <span className="meta">{dateLabel(n.created_at).replace(/\(.\)/, '')} · {timeLabel(n.created_at)} · {n.is_read ? '읽음' : '안 읽음'}</span>
                <Icon name="chevron" />
              </button>
            </div>
          ))}
        </section>
      )}
    </Page>
  )
}
