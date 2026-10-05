// 가게 정보 입력 (A-05 등록, S-14 수정 공용)
import { useState } from 'react'
import { Button, Field, Input } from '../../components/ui'
import { geocodeAddress, mapEnabled } from '../../components/map/kakao'
import type { StoreInput } from '../../api/stores'
import type { Store } from '../../types/db'

export function StoreForm({ initial, submitLabel, busy, error, onSubmit, onPhoto }: {
  initial?: Store | null; submitLabel: string; busy: boolean; error: string | null
  onSubmit: (input: StoreInput) => void; onPhoto?: (file: File) => void
}) {
  const [f, setF] = useState({
    name: initial?.name ?? '', address: initial?.address ?? '', max_capacity: String(initial?.max_capacity ?? ''),
    phone: initial?.phone ?? '', intro: initial?.intro ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const cap = Number(f.max_capacity)
  const valid = f.name.trim() && f.phone.trim() && Number.isInteger(cap) && cap > 0
  return (
    <form className="form" onSubmit={(e) => {
      e.preventDefault()
      // 주소 → 좌표 (지도 키가 있을 때만, 실패해도 저장은 진행). 주소가 그대로면 기존 좌표 유지
      const address = f.address.trim() || null
      void (async () => {
        const same = initial && (initial.address ?? null) === address && initial.lat != null
        const geo = same ? null : address ? await geocodeAddress(address) : null
        onSubmit({
          name: f.name.trim(), address, max_capacity: cap, phone: f.phone.trim(), intro: f.intro.trim() || null,
          ...(geo ? { lat: geo.lat, lng: geo.lng } : !address ? { lat: null, lng: null } : {}),
        })
      })()
    }}>
      <Field label="가게 이름"><Input value={f.name} onChange={set('name')} required /></Field>
      <Field label="전화번호 (필수)" hint="예약한 단체에게 보여요"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="02-123-4567" required /></Field>
      <Field label="주소" hint={mapEnabled ? '지도에 표시할 위치를 주소로 찾아요' : undefined}><Input value={f.address} onChange={set('address')} placeholder="서울 노원구 월계1동 …" /></Field>
      <Field label="단체석 최대 인원"><Input type="number" inputMode="numeric" min={1} value={f.max_capacity} onChange={set('max_capacity')} required /></Field>
      <Field label="한 줄 소개 (선택)" hint="60자 이내"><Input value={f.intro} onChange={set('intro')} maxLength={60} /></Field>
      {initial?.photo_url && <img className="store-photo" src={initial.photo_url} alt="가게 대표 사진" />}
      {onPhoto && (
        <Field label="대표 사진 (필수)" hint={initial?.photo_url ? '새 사진을 고르면 바로 바뀌어요' : '가게를 고를 때 보여요'}>
          <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) onPhoto(file) }} />
        </Field>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <Button variant="primary" type="submit" busy={busy} disabled={!valid}>{submitLabel}</Button>
    </form>
  )
}
