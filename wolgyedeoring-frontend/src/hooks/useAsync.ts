import { useCallback, useEffect, useRef, useState } from 'react'
import { toApiError, type ApiError } from '../lib/errors'

/** 화면 진입 시 데이터 불러오기. deps 가 바뀌면 다시 불러옴 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const v = await fn()
      if (my === seq.current) setData(v)
    } catch (e) {
      if (my === seq.current) setError(toApiError(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { void reload() }, [reload])
  return { data, error, loading, reload, setData }
}

/** 버튼 동작: 실행 중 중복 클릭 방지 + 오류 메시지 */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(toApiError(e).message)
      return undefined
    } finally {
      setBusy(false)
    }
  }, [busy])
  return { busy, error, setError, run }
}
