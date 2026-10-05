// S-08 메뉴판 사진 인식·확인: 인식 → 수정·추가·삭제 → "메뉴판에 없는 기존 메뉴 판매 중지" 확인 → 저장
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { menus, receipts } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, Field, Input, Section, Select } from '../../components/ui'
import { MENU_CATEGORY_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'
import type { ExtractMenuResult, ExtractedMenuItem, MenuCategory } from '../../types/db'

const CATS = Object.entries(MENU_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))
const STATUS: Record<ExtractedMenuItem['status'], { label: string; tone: 'success' | 'warning' | 'muted' }> = {
  new: { label: '새 메뉴', tone: 'success' }, price_changed: { label: '가격 변경', tone: 'warning' },
  same: { label: '변경 없음', tone: 'muted' }, reactivate: { label: '다시 판매', tone: 'success' },
}

export default function MenuScan() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const [result, setResult] = useState<ExtractMenuResult | null>(null)
  const [items, setItems] = useState<ExtractedMenuItem[]>([])
  const [deactivate, setDeactivate] = useState(false)
  const scan = useAction()
  const save = useAction()

  const onFile = (file: File) => scan.run(async () => {
    const b64 = await receipts.resizeImageToBase64(file, 2000)
    const r = await menus.extractMenu(store.id, b64)
    setResult(r)
    // 메뉴판이 여러 장이면 결과를 이어 붙임 (같은 이름은 마지막 값)
    setItems((prev) => [...prev.filter((p) => !r.items.some((n) => n.name === p.name)), ...r.items])
  })
  const update = (i: number, patch: Partial<ExtractedMenuItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <Page title="메뉴판 인식" back={paths.ownerMenus}>
      <Field label={items.length ? '메뉴판 사진 더 올리기' : '메뉴판 사진'} hint="여러 장이면 한 장씩 올리면 합쳐져요">
        <input type="file" accept="image/*" capture="environment" disabled={scan.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
      </Field>
      {scan.busy && <p className="muted" role="status">메뉴판을 읽는 중이에요 (10초 정도)</p>}
      {scan.error && <p className="inline-error" role="alert">{scan.error}</p>}
      {result?.note && <p className="muted">{result.note}</p>}

      {items.length > 0 && (
        <Section title={`인식한 메뉴 ${items.length}개`}>
          <ul className="list">
            {items.map((m, i) => {
              const st = STATUS[m.status]
              const check = m.confidence === 'low' || m.price === null
              return (
                <li key={i} className="card">
                  <div className="btn-row"><Badge tone={st.tone}>{st.label}</Badge>{check && <Badge tone="warning">확인 필요</Badge>}
                    {m.status === 'price_changed' && <span className="muted">{formatWon(m.existing_price)} → {formatWon(m.price)}</span>}</div>
                  <Input value={m.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="메뉴 이름" />
                  <div className="btn-row">
                    <Input type="number" min={0} step={500} value={m.price ?? ''} placeholder="가격" aria-label="가격" style={{ maxWidth: 140 }}
                      onChange={(e) => update(i, { price: e.target.value === '' ? null : Number(e.target.value) })} />
                    <Select value={m.category} onChange={(e) => update(i, { category: e.target.value as MenuCategory })} options={CATS} aria-label="분류" style={{ maxWidth: 160 }} />
                    <Button variant="danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>빼기</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}
      {result && result.missing.length > 0 && (
        <Section title="메뉴판에 없는 기존 메뉴">
          <p className="muted">{result.missing.map((m) => m.name).join(', ')}</p>
          <label className="btn-row"><input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} /> 이 메뉴들을 판매 중지할게요</label>
        </Section>
      )}
      {save.error && <p className="inline-error" role="alert">{save.error}</p>}
      {items.length > 0 && (
        <BottomAction>
          <Button variant="primary" busy={save.busy} disabled={items.some((m) => !m.name.trim())}
            onClick={() => void save.run(async () => {
              await menus.saveMenus(store.id, items.map((m) => ({ name: m.name.trim(), price: m.price, category: m.category })), deactivate)
              nav(paths.ownerMenus, { replace: true })
            })}>메뉴 {items.length}개 저장하기</Button>
        </BottomAction>
      )}
    </Page>
  )
}
