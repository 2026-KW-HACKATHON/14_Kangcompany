// 카카오맵 JS SDK 로더 + 주소 → 좌표 변환 (#8 지도 서비스가 카카오맵으로 정해질 때를 대비한 선택 기능)
// VITE_KAKAO_MAP_KEY 가 없으면 모든 지도는 자리 표시로 대체되고, 좌표 변환은 null 을 돌려준다
// 다른 지도 서비스로 정해지면 이 파일과 StoreMap.tsx 만 바꾸면 된다

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { kakao?: any } }

export const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
export const mapEnabled = Boolean(KAKAO_KEY)

let loading: Promise<any> | null = null

/** SDK 를 한 번만 불러온다 (services 라이브러리 포함: 주소 검색) */
export function loadKakao(): Promise<any> {
  if (!KAKAO_KEY) return Promise.reject(new Error('VITE_KAKAO_MAP_KEY 없음'))
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY)}&autoload=false&libraries=services`
    s.async = true
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao))
    s.onerror = () => { loading = null; reject(new Error('지도를 불러오지 못했어요 (키·등록 도메인 확인)')) }
    document.head.appendChild(s)
  })
  return loading
}

/** 주소 → 좌표. 키가 없거나 못 찾으면 null (가게 등록은 좌표 없이도 진행) */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_KEY || !address.trim()) return null
  try {
    const kakao = await loadKakao()
    const geocoder = new kakao.maps.services.Geocoder()
    return await new Promise((resolve) => {
      geocoder.addressSearch(address, (result: any[], status: string) => {
        if (status === kakao.maps.services.Status.OK && result[0]) resolve({ lat: Number(result[0].y), lng: Number(result[0].x) })
        else resolve(null)
      })
    })
  } catch {
    return null
  }
}

/** 길찾기 링크 (카카오맵 웹/앱). 좌표가 없으면 주소 검색 링크 */
export function directionsUrl(name: string, lat?: number | null, lng?: number | null, address?: string | null): string | null {
  if (lat != null && lng != null) return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
  if (address) return `https://map.kakao.com/link/search/${encodeURIComponent(address)}`
  return null
}
