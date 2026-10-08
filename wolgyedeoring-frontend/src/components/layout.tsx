// 화면 틀 (시안 .phone 구조): 상단 appbar → 스크롤 본문 → 하단 dock → 하단 탭
// 단체는 파랑, 사장님은 초록 (data-role=merchant → tokens.css 가 색을 바꾼다)
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { paths } from '../app/paths'
import { useSessionContext } from '../app/session'
import { useNotifications } from '../hooks/useNotifications'
import { Icon, type IconName } from './icons'
import { Toast } from './ui'

type Tab = { to: string; label: string; icon: IconName; primary?: boolean; match?: (p: string) => boolean }
const GROUP_TABS: Tab[] = [
  { to: paths.groupHome, label: '홈', icon: 'home', match: (p) => p === '/group' },
  { to: paths.groupReservations, label: '내 예약', icon: 'receipt', match: (p) => p.startsWith('/group/reservations') || p.startsWith('/group/requests/') && !p.endsWith('/new') },
  { to: paths.groupRequestNew, label: '예약하기', icon: 'calendar', primary: true },
  { to: paths.groupSlots, label: '캘린더', icon: 'calendar', match: (p) => p.startsWith('/group/slots') || p.startsWith('/group/layouts') },
  { to: paths.groupMe, label: '내 정보', icon: 'gathering', match: (p) => p.startsWith('/group/me') },
]
const OWNER_TABS: Tab[] = [
  { to: paths.ownerHome, label: '홈', icon: 'home', match: (p) => p === '/owner' },
  { to: paths.ownerMenus, label: '메뉴', icon: 'food', match: (p) => p.startsWith('/owner/menus') },
  { to: paths.ownerInbox, label: '요청', icon: 'gathering', primary: true },
  { to: paths.ownerStats, label: '분석', icon: 'chart', match: (p) => p.startsWith('/owner/stats') },
  { to: paths.ownerStore, label: '정보', icon: 'settings', match: (p) => p.startsWith('/owner/store') },
]

/** 안 읽은 알림 수 (홈 🔔 점). 구독은 RoleShell 한 곳에서만 */
const UnreadContext = createContext<{ unread: number; reload: () => Promise<void> }>({ unread: 0, reload: async () => {} })
export const useUnread = () => useContext(UnreadContext)

/** 로그인한 역할 화면 전체를 감싼다: 실시간 알림 → 토스트 */
export function RoleShell() {
  const { me } = useSessionContext()
  const [toast, setToast] = useState<string | null>(null)
  const { unread, reload } = useNotifications(me?.id, (n) => setToast(n.title))
  return (
    <UnreadContext.Provider value={{ unread, reload }}>
      <Outlet />
      <Toast message={toast} onClose={() => setToast(null)} />
    </UnreadContext.Provider>
  )
}
/** 이전 이름 호환 */
export const TabLayout = RoleShell

export function BottomNav({ role }: { role: 'group' | 'owner' }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const tabs = role === 'owner' ? OWNER_TABS : GROUP_TABS
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {tabs.map((t) => t.primary ? (
        <button key={t.to} type="button" className="nav-primary" aria-label={`${t.label} · ${role === 'owner' ? '요청 목록' : '새 예약 작성'} 열기`} onClick={() => nav(t.to)}>
          <span className="nav-action-content"><Icon name={t.icon} /><span className="nav-action-label">{t.label}</span></span>
        </button>
      ) : (
        <button key={t.to} type="button" aria-current={t.match?.(pathname) ? 'page' : undefined} onClick={() => nav(t.to)}>
          <span className="nav-symbol"><Icon name={t.icon} /></span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function useRole(): 'group' | 'owner' {
  const { me } = useSessionContext()
  const { pathname } = useLocation()
  if (pathname.startsWith('/owner')) return 'owner'
  if (pathname.startsWith('/group')) return 'group'
  return me?.role === 'owner' ? 'owner' : 'group'
}

/**
 * 화면 하나 (시안 article.phone).
 * back: true 면 이전 화면, 문자열이면 그 경로. bell: 알림 버튼. nav: 하단 탭. dock: 하단 고정 버튼 영역.
 * a2: 승인 A2 화면(예약 요청·예약 상세·받은 요청) 스타일 범위
 */
export function Page({ title, back = true, hideTitle = false, bell, nav, dock, children, a2, kind, role: roleProp, overlay, actions }: {
  title: string; back?: boolean | string; bell?: boolean; nav?: boolean; dock?: ReactNode; children: ReactNode
  /** 제목만 숨기고 기존 헤더 높이는 유지 */ hideTitle?: boolean
  a2?: boolean; kind?: string; role?: 'group' | 'owner'; overlay?: ReactNode; actions?: ReactNode
  /** 이전 버전 호환 (무시) */ tabRoot?: boolean
}) {
  const navigate = useNavigate()
  const ctxRole = useRole()
  const role = roleProp ?? ctxRole
  const { unread } = useUnread()
  const goBack = () => {
    if (typeof back === 'string') navigate(back)
    else if (window.history.length > 1) navigate(-1)
    else navigate(role === 'owner' ? paths.ownerHome : paths.groupHome)
  }
  return (
    <div className={`app${a2 ? ' a2' : ''}`} data-role={role === 'owner' ? 'merchant' : 'group'} data-kind={kind}>
      <header className="appbar">
        {back !== false && (
          <button type="button" className={a2 ? 'back' : 'icon-btn'} aria-label="뒤로" onClick={goBack}><Icon name="back" /></button>
        )}
        {a2 ? <h2 className={hideTitle ? 'appbar-title-hidden' : undefined}>{title}</h2> : <h1 className={hideTitle ? 'appbar-title-hidden' : undefined}>{title}</h1>}
        {actions}
        {bell && (
          <button type="button" className="icon-btn bell-button" aria-label={unread ? `알림 목록, 새 알림 ${unread}개` : '알림 목록'} onClick={() => navigate(paths.notifications)}>
            <Icon name="bell" />{unread > 0 && <i className="bell-dot" aria-hidden="true" />}
          </button>
        )}
      </header>
      <div className="app-body">{children}</div>
      {dock}
      {nav && <BottomNav role={role} />}
      {overlay}
    </div>
  )
}

/** 화면 틀 없이 가운데 로딩 (가드·지연 로딩용) */
export function FrameLoading() {
  return <div className="app"><div className="app-body"><div className="skeleton short" /><div className="skeleton" /></div></div>
}
