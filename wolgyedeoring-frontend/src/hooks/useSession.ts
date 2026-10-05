import { useEffect, useState, useCallback } from 'react'
import { auth } from '../api'
import type { Profile } from '../types/db'

/** 로그인 사용자 프로필. loading 동안은 null 이 "로그인 안 함"을 뜻하지 않음 */
export function useSession() {
  const [me, setMe] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setMe(await auth.getMe()) } catch { setMe(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void refresh()
    return auth.onAuthChange(() => { void refresh() })
  }, [refresh])

  return { me, loading, refresh }
}
