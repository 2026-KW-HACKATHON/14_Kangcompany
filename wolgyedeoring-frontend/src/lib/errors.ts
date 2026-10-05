// BE 오류를 화면용 문구로 바꾼다 (state-definitions.md 9장 공통 처리)
// 원칙: 서버가 준 한글 error.message 를 그대로 보여준다. 권한·네트워크만 별도 문구

export class ApiError extends Error {
  readonly code?: string
  readonly kind: 'forbidden' | 'network' | 'closed' | 'server'
  constructor(message: string, kind: ApiError['kind'], code?: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.code = code
  }
}

interface RawError {
  message?: string
  code?: string
  details?: string
  hint?: string
  name?: string
  context?: unknown
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const err = (e ?? {}) as RawError
  const msg = err.message ?? String(e)

  if (err.code === '42501' || /permission denied/i.test(msg)) {
    return new ApiError('볼 수 없는 예약이에요', 'forbidden', err.code)
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return new ApiError('연결을 확인해 주세요', 'network', err.code)
  }
  // 선착순에서 늦게 수락한 경우 등 → 토스트 + 목록 새로고침
  if (msg.includes('이미 마감되었거나 없는 요청')) {
    return new ApiError(msg, 'closed', err.code)
  }
  return new ApiError(msg, 'server', err.code)
}

/** supabase 응답 { data, error } 에서 data 를 꺼내고, error 면 ApiError 로 던진다 */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toApiError(res.error)
  return res.data as T
}

/**
 * Edge Function 오류는 본문 JSON 의 error 필드에 한글 사유가 있다.
 * supabase-js 는 FunctionsHttpError 로 감싸므로 본문을 다시 읽어 꺼낸다.
 */
export async function unwrapFunction<T>(res: { data: T | null; error: unknown }): Promise<T> {
  if (!res.error) return res.data as T
  const err = res.error as RawError & { context?: Response }
  if (err.context && typeof (err.context as Response).json === 'function') {
    try {
      const body = (await (err.context as Response).clone().json()) as { error?: string; detail?: string }
      if (body?.error) throw new ApiError(body.error, 'server')
    } catch (e) {
      if (e instanceof ApiError) throw e
    }
  }
  throw toApiError(res.error)
}
