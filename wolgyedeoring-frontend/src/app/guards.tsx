// 역할별 접근 제어: 로그인 → 역할 → 단체/가게 등록 여부 순서로 확인
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessionContext } from './session'
import { homeFor, paths } from './paths'
import { FrameLoading as Loading } from '../components/layout'
import type { Role } from '../types/db'

export function RequireRole({ role }: { role: Role }) {
  const { loading, me, group, store } = useSessionContext()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!me) return <Navigate to={paths.start} replace state={{ from: loc.pathname }} />
  if (me.role !== role) return <Navigate to={homeFor(me.role)} replace />
  if (role === 'group' && !group) return <Navigate to={paths.onboardingGroup} replace />
  if (role === 'owner' && !store) return <Navigate to={paths.onboardingStore} replace />
  return <Outlet />
}

/** 로그인만 필요 (알림 등 공통 화면) */
export function RequireLogin() {
  const { loading, me } = useSessionContext()
  if (loading) return <Loading />
  if (!me) return <Navigate to={paths.start} replace />
  return <Outlet />
}

/** 로그인한 사람이 시작·로그인 화면에 오면 홈으로 */
export function RedirectIfLoggedIn() {
  const { loading, me, group, store } = useSessionContext()
  if (loading) return <Loading />
  if (me) {
    if (me.role === 'group' && !group) return <Navigate to={paths.onboardingGroup} replace />
    if (me.role === 'owner' && !store) return <Navigate to={paths.onboardingStore} replace />
    return <Navigate to={homeFor(me.role)} replace />
  }
  return <Outlet />
}
