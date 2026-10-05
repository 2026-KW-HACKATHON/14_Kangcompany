// 가게 위치 지도. 키가 없으면 자리 표시 (G-04 지도 탭, G-06 위치)
import { useEffect, useRef, useState } from 'react'
import { loadKakao, mapEnabled } from './kakao'

export interface MapMarker { id: number | string; lat: number; lng: number; title: string; onClick?: () => void }

const WOLGYE1 = { lat: 37.6195, lng: 127.0590 } // 기본 중심: 광운대 인근 (근사값)

export function StoreMap({ markers, height = 240, level = 4 }: { markers: MapMarker[]; height?: number; level?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(markers)
  latest.current = markers
  // 렌더마다 새 배열이 와도 좌표가 같으면 지도를 다시 만들지 않음
  const key = markers.map((m) => `${m.id}:${m.lat},${m.lng}`).join('|')

  useEffect(() => {
    if (!mapEnabled || !ref.current) return
    let cancelled = false
    loadKakao().then((kakao) => {
      if (cancelled || !ref.current) return
      const markers = latest.current
      const center = markers[0] ?? WOLGYE1
      const map = new kakao.maps.Map(ref.current, { center: new kakao.maps.LatLng(center.lat, center.lng), level })
      const bounds = new kakao.maps.LatLngBounds()
      markers.forEach((m) => {
        const pos = new kakao.maps.LatLng(m.lat, m.lng)
        const marker = new kakao.maps.Marker({ map, position: pos, title: m.title, clickable: Boolean(m.onClick) })
        if (m.onClick) kakao.maps.event.addListener(marker, 'click', m.onClick)
        bounds.extend(pos)
      })
      if (markers.length > 1) map.setBounds(bounds)
    }).catch((e: Error) => setError(e.message))
    return () => { cancelled = true }
  }, [key, level])

  if (!mapEnabled) return <div className="map-placeholder" style={{ minHeight: height }}>지도 자리 — 지도 서비스(#8) 키를 넣으면 표시돼요 (VITE_KAKAO_MAP_KEY)</div>
  if (error) return <div className="map-placeholder" style={{ minHeight: height }}>{error}</div>
  return <div ref={ref} style={{ height, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }} role="region" aria-label="가게 위치 지도" />
}
