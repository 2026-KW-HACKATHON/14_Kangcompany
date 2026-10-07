// 가게 정보 입력 (A-05 등록 · S-14 수정 공용, 시안 5·27 storeForm). 제출 버튼은 화면 dock 에서 form="store-form"
import { useState } from 'react'
import { Field, Input, Textarea, UploadBox } from '../../components/ui'
import { geocodeAddress, mapEnabled } from '../../components/map/kakao'
import type { StoreInput } from '../../api/stores'
import type { Store } from '../../types/db'

export function storeFormValid(f: { name: string; phone: string; max_capacity: string }) {
  const cap = Number(f.max_capacity)
  return Boolean(f.name.trim() && f.phone.trim() && Number.isInteger(cap) && cap > 0)
}

export function StoreForm({ initial, onSubmit, onPhoto, onValid, photoBusy }: {
  initial?: Store | null; onSubmit: (input: StoreInput) => void; onPhoto?: (file: File) => void; onValid?: (v: boolean) => void; photoBusy?: boolean
}) {
  const [f, setF] = useState({
    name: initial?.name ?? '', address: initial?.address ?? '', max_capacity: String(initial?.max_capacity ?? ''),
    phone: initial?.phone ?? '', intro: initial?.intro ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = { ...f, [k]: e.target.value }
    setF(next); onValid?.(storeFormValid(next))
  }
  return (
    <form id="store-form" onSubmit={(e) => {
      e.preventDefault()
      if (!storeFormValid(f)) return
      // 주소 → 좌표 (지도 키가 있을 때만, 실패해도 저장은 진행). 주소가 그대로면 기존 좌표 유지
      const address = f.address.trim() || null
      void (async () => {
        const same = initial && (initial.address ?? null) === address && initial.lat != null
        const geo = same ? null : address ? await geocodeAddress(address) : null
        onSubmit({
          name: f.name.trim(), address, max_capacity: Number(f.max_capacity), phone: f.phone.trim(), intro: f.intro.trim() || null,
          ...(geo ? { lat: geo.lat, lng: geo.lng } : !address ? { lat: null, lng: null } : {}),
        })
      })()
    }}>
      <Field label="가게명"><Input value={f.name} onChange={set('name')} required /></Field>
      <Field label="주소" hint={mapEnabled ? '지도에 표시할 위치를 주소로 찾아요' : undefined}><Input value={f.address} onChange={set('address')} placeholder="서울 노원구 광운로 20" /></Field>
      <Field label="전화번호" hint="예약한 단체에게 보여요"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="02-123-4567" required /></Field>
      <Field label="단체석 최대 인원"><Input type="number" inputMode="numeric" min={1} max={200} value={f.max_capacity} onChange={set('max_capacity')} required /></Field>
      <Field label="가게 소개" hint="60자 이내 · 단체가 가게를 고를 때 보여요"><Textarea value={f.intro} onChange={set('intro')} maxLength={60} placeholder="함께 앉아 즐기는 고기와 따뜻한 식사" /></Field>
      {onPhoto && (
        <>
          {initial?.photo_url && <img className="store-photo" src={initial.photo_url} alt="가게 대표 사진" />}
          <UploadBox art="store" title="대표 사진" help={initial?.photo_url ? '새 사진을 고르면 바로 바뀌어요.' : '단체석이나 가게 분위기를 보여주세요.'} onFile={onPhoto} disabled={photoBusy} />
        </>
      )}
    </form>
  )
}
