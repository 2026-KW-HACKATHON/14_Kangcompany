// 가게 정보 입력 (A-05 등록 · S-14 수정 공용, 시안 5·27 storeForm). 제출 버튼은 화면 dock 에서 form="store-form"
// 시안 순서: 가게명 → (등록: 대표자명·업종) → 주소·상세주소 → 전화번호 → 최대 인원 → 소개 → 영업시간 → 대표 사진 → (등록: 사업자·통신판매 번호)
import { useState, type ReactNode } from 'react'
import { Field, Input, Select, Textarea, UploadBox } from '../../components/ui'
import { geocodeAddress, mapEnabled } from '../../components/map/kakao'
import type { StoreInput } from '../../api/stores'
import { STORE_CATEGORY_LABEL } from '../../lib/status'
import type { Store, StoreCategory } from '../../types/db'

export function storeFormValid(f: { name: string; phone: string; max_capacity: string }) {
  const cap = Number(f.max_capacity)
  return Boolean(f.name.trim() && f.phone.trim() && Number.isInteger(cap) && cap > 0)
}

const CATEGORIES = Object.entries(STORE_CATEGORY_LABEL).map(([value, label]) => ({ value: value as StoreCategory, label }))
// 011 칸: 비어 있고 원래도 없던 칸은 보내지 않는다 (011 실행 전 DB 에서도 저장되도록)
const EXTRA = ['category', 'address_detail', 'hours', 'business_no', 'commerce_no'] as const

export function StoreForm({ initial, onSubmit, onPhoto, onValid, photoBusy, register, afterName, photo }: {
  initial?: Store | null; onSubmit: (input: StoreInput) => void; onPhoto?: (file: File) => void; onValid?: (v: boolean) => void; photoBusy?: boolean
  /** 가게 등록(A-05): 업종·사업자등록번호·통신판매신고번호도 받는다 */
  register?: boolean
  /** 가게명 바로 아래 (등록 화면의 대표자명) */
  afterName?: ReactNode
  /** 대표 사진 자리를 화면이 직접 채울 때 (등록 화면: 고른 뒤 등록할 때 올림) */
  photo?: ReactNode
}) {
  const [f, setF] = useState({
    name: initial?.name ?? '', address: initial?.address ?? '', max_capacity: String(initial?.max_capacity ?? ''),
    phone: initial?.phone ?? '', intro: initial?.intro ?? '',
    category: initial?.category ?? 'restaurant', address_detail: initial?.address_detail ?? '', hours: initial?.hours ?? '',
    business_no: initial?.business_no ?? '', commerce_no: initial?.commerce_no ?? '',
  })
  const update = (patch: Partial<typeof f>) => { const next = { ...f, ...patch }; setF(next); onValid?.(storeFormValid(next)) }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update({ [k]: e.target.value })
  const extras = () => {
    const out: Partial<StoreInput> = {}
    for (const k of EXTRA) {
      const v = String(f[k]).trim()
      const known = initial != null && initial[k] !== undefined // 011 이 적용된 DB 에서 읽은 가게
      if (k === 'category' ? v !== 'restaurant' || known : v || known) (out as Record<string, unknown>)[k] = v || null
    }
    return out
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
          ...extras(),
        })
      })()
    }}>
      <Field label="가게명"><Input value={f.name} onChange={set('name')} required /></Field>
      {afterName}
      {register && <Field label="업종"><Select title="업종" value={f.category} onChange={(category) => update({ category })} options={CATEGORIES} /></Field>}
      <Field label="주소" hint={mapEnabled ? '지도에 표시할 위치를 주소로 찾아요' : undefined}><Input value={f.address} onChange={set('address')} placeholder="서울 노원구 광운로 20" /></Field>
      <Field label="상세주소 (선택)"><Input value={f.address_detail} onChange={set('address_detail')} maxLength={60} placeholder="2층" /></Field>
      <Field label="전화번호" hint="예약한 단체에게 보여요"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="02-123-4567" required /></Field>
      <Field label="단체석 최대 인원"><Input type="number" inputMode="numeric" min={1} max={200} value={f.max_capacity} onChange={set('max_capacity')} required /></Field>
      <Field label="가게 소개" hint="60자 이내 · 단체가 가게를 고를 때 보여요"><Textarea value={f.intro} onChange={set('intro')} maxLength={60} placeholder="함께 앉아 즐기는 고기와 따뜻한 식사" /></Field>
      <Field label="영업시간 안내 (선택)"><Input value={f.hours} onChange={set('hours')} maxLength={80} placeholder="월~금 10:00–22:00 / 토·일 11:00–23:00" /></Field>
      {photo ?? (onPhoto && (
        <>
          {initial?.photo_url && <img className="store-photo" src={initial.photo_url} alt="가게 대표 사진" />}
          <UploadBox art="store" title="대표 사진" help={initial?.photo_url ? '새 사진을 고르면 바로 바뀌어요.' : '단체석이나 가게 분위기를 보여주세요.'} onFile={onPhoto} disabled={photoBusy} />
        </>
      ))}
      {register && (
        <>
          <Field label="사업자등록번호 (선택)"><Input value={f.business_no} onChange={set('business_no')} maxLength={20} inputMode="numeric" placeholder="000-00-00000" /></Field>
          <Field label="통신판매신고번호 (선택)"><Input value={f.commerce_no} onChange={set('commerce_no')} maxLength={40} /></Field>
        </>
      )}
    </form>
  )
}
