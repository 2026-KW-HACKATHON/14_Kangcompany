// 화면 틀: 상단 헤더(뒤로·제목·알림·설정) + 역할별 하단 탭 (IA 3장)
import { createContext, useContext, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { paths } from '../app/paths'
import { useSessionContext } from '../app/session'
import { useNotifications } from '../hooks/useNotifications'
import { Toast } from './ui'

const GROUP_TABS = [
  { to: paths.groupHome, label: '홈', icon: '⌂', end: true },
  { to: paths.groupReservations, label: '예약', icon: '☰', end: false },
  { to: paths.groupSlots, label: '가게 찾기', icon: '⌕', end: false }, // 이름은 #8 결정 대기
  { to: paths.groupMe, label: '내 정보', icon: '☺', end: false },
]
const OWNER_TABS = [
  { to: paths.ownerHome, label: '홈', icon: '⌂', end: true },
  { to: paths.ownerInbox, label: '요청·예약', icon: '☰', end: false },
  { to: paths.ownerMenus, label: '메뉴', icon: '≡', end: false },
  { to: paths.ownerStats, label: '분석', icon: '▤', end: false },
]

/** 안 읽은 알림 수 (헤더 🔔 점 표시용). 구독은 TabLayout 한 곳에서만 */
const UnreadContext = createContext<{ unread: number; reload: () => Promise<void> }>({ unread: 0, reload: async () => {} })
export const useUnread = () => useContext(UnreadContext)

/** 하단 탭이 있는 화면들의 틀. 탭 루트 화면은 이 안에 둔다 */
export function TabLayout({ role }: { role: 'group' | 'owner' }) {
  const tabs = role === 'group' ? GROUP_TABS : OWNER_TABS
  const { me } = useSessionContext()
  const [toast, setToast] = useState<string | null>(null)
  // 실시간 알림 → 토스트 (목록은 C-01 에서)
  const { unread, reload } = useNotifications(me?.id, (n) => setToast(n.title))
  return (
    <UnreadContext.Provider value={{ unread, reload }}>
    <div className="app-shell has-nav">
      <Outlet />
      <Toast message={toast} onClose={() => setToast(null)} />
      <nav className="bottom-nav" aria-label="주요 메뉴">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <span aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
    </UnreadContext.Provider>
  )
}

/** 화면 하나. back 이 있으면 뒤로 버튼, tabRoot 면 알림·설정 아이콘 */
export function Page({ title, back, tabRoot, actions, children }: {
  title: string; back?: boolean | string; tabRoot?: boolean; actions?: ReactNode; children: ReactNode
}) {
  const nav = useNavigate()
  const { me } = useSessionContext()
  const { unread } = useUnread()
  return (
    <div className="page">
      <header className="page-header">
        {back && (
          <button className="icon-btn" aria-label="뒤로" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}>←</button>
        )}
        <h1>{title}</h1>
        <div className="header-actions">
          {actions}
          {tabRoot && (
            <NavLink to={paths.notifications} className="icon-btn" aria-label={unread ? `알림, 새 알림 ${unread}개` : '알림'}>
              🔔{unread > 0 && <span className="dot" aria-hidden="true" />}
            </NavLink>
          )}
          {tabRoot && me?.role === 'owner' && (
            <NavLink to={paths.ownerStore} className="icon-btn" aria-label="가게 정보">⚙</NavLink>
          )}
        </div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  )
}
