// 로그인 사용자 + 내 단체/가게를 앱 전체에 제공
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, groups, stores } from '../api'
import type { Group, Profile, Store } from '../types/db'

interface SessionValue {
  loading: boolean
  me: Profile | null
  group: Group | null // 단체 대표일 때
  store: Store | null // 사장님일 때
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SessionValue, 'refresh'>>({ loading: true, me: null, group: null, store: null })

  const refresh = useCallback(async () => {
    try {
      const me = await auth.getMe()
      if (!me) return setState({ loading: false, me: null, group: null, store: null })
      const [group, store] = await Promise.all([
        me.role === 'group' ? groups.getMyGroup(me.id) : Promise.resolve(null),
        me.role === 'owner' ? stores.getMyStore(me.id) : Promise.resolve(null),
      ])
      setState({ loading: false, me, group, store })
    } catch {
      setState({ loading: false, me: null, group: null, store: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
    return auth.onAuthChange(() => { void refresh() })
  }, [refresh])

  return <SessionContext.Provider value={{ ...state, refresh }}>{children}</SessionContext.Provider>
}

export function useSessionContext(): SessionValue {
  const v = useContext(SessionContext)
  if (!v) throw new Error('SessionProvider 밖에서 useSessionContext 사용')
  return v
}

/** 가드를 통과한 화면에서 사용: 단체 */
export function useGroupSession() {
  const s = useSessionContext()
  return { me: s.me!, group: s.group!, refresh: s.refresh }
}

/** 가드를 통과한 화면에서 사용: 사장님 */
export function useOwnerSession() {
  const s = useSessionContext()
  return { me: s.me!, store: s.store!, refresh: s.refresh }
}
