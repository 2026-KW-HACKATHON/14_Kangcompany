// S-08 메뉴판 확인 (시안 25): 사진 → 인식 → 메뉴명·가격 확인 → 확정
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { menus, receipts } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Button, Check, Dock, Field, Input, Notice, Section, Select, UploadBox } from '../../components/ui'
import { MENU_CATEGORY_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'
import type { ExtractMenuResult, ExtractedMenuItem, MenuCategory } from '../../types/db'

const CATS = Object.entries(MENU_CATEGORY_LABEL).map(([value, label]) => ({ value: value as MenuCategory, label }))
const STATUS: Record<ExtractedMenuItem['status'], { label: string; tone: 'success' | 'warning' | 'muted' }> = {
  new: { label: '새 메뉴', tone: 'success' }, price_changed: { label: '가격 변경', tone: 'warning' },
  same: { label: '변경 없음', tone: 'muted' }, reactivate: { label: '다시 판매', tone: 'success' },
}
type Row = ExtractedMenuItem & { include: boolean }

export default function MenuScan() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const [result, setResult] = useState<ExtractMenuResult | null>(null)
  const [items, setItems] = useState<Row[]>([])
  const [deactivate, setDeactivate] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const scan = useAction()
  const save = useAction()

  const onFile = (file: File) => void scan.run(async () => {
    const b64 = await receipts.resizeImageToBase64(file, 2000)
    const r = await menus.extractMenu(store.id, b64)
    setResult(r); setConfirmed(false)
    // 메뉴판이 여러 장이면 결과를 이어 붙임 (같은 이름은 마지막 값)
    setItems((prev) => [...prev.filter((p) => !r.items.some((n) => n.name === p.name)), ...r.items.map((x) => ({ ...x, include: true }))])
  })
  const update = (i: number, patch: Partial<Row>) => { setConfirmed(false); setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x))) }
  const chosen = items.filter((m) => m.include)

  return (
    <Page title="메뉴판 확인" back={paths.ownerMenus}
      dock={<Dock>{save.error && <p className="note-error" role="alert">{save.error}</p>}
        <Button variant="primary" busy={save.busy} disabled={!chosen.length || !confirmed || chosen.some((m) => !m.name.trim())}
          onClick={() => void save.run(async () => {
            await menus.saveMenus(store.id, chosen.map((m) => ({ name: m.name.trim(), price: m.price, category: m.category })), deactivate)
            nav(paths.ownerMenus, { replace: true })
          })}>메뉴 목록 확정</Button></Dock>}>
      <Section>
        <UploadBox art="receipt" title={items.length ? '메뉴판 사진 더 올리기' : '메뉴판 사진'} help="메뉴명과 가격이 모두 나오게 찍어주세요. 여러 장이면 합쳐져요." onFile={onFile} disabled={scan.busy} />
      </Section>
      {scan.busy && <p className="meta" role="status">메뉴판을 읽는 중이에요 (10초 정도)</p>}
      {scan.error && <p className="note-error" role="alert">{scan.error}</p>}
      <Notice>인식 결과는 다를 수 있어요. 메뉴명과 가격을 직접 확인한 뒤 확정해 주세요.</Notice>
      {result?.note && <p className="meta">{result.note}</p>}

      {items.length > 0 && (
        <Section title={`인식한 메뉴 ${items.length}개`}>
          {items.map((m, i) => {
            const st = STATUS[m.status]
            const check = m.confidence === 'low' || m.price === null
            return (
              <div key={i} className="ocr-row">
                <div className="row">
                  <span className="btn-row"><Badge tone={st.tone}>{st.label}</Badge>{check && <Badge tone="warning">가격 확인</Badge>}</span>
                  <span className="meta">{m.status === 'price_changed' ? `${formatWon(m.existing_price)} → ${formatWon(m.price)}` : `항목 ${i + 1}`}</span>
                </div>
                <Field label="메뉴명"><Input value={m.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
                <div className="pair">
                  <Field label="가격 (원)"><Input type="number" min={0} step={500} value={m.price ?? ''} onChange={(e) => update(i, { price: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                  <Field label="분류"><Select title="분류" value={m.category} onChange={(category) => update(i, { category })} options={CATS} /></Field>
                </div>
                <Check label="이 메뉴 포함" checked={m.include} onChange={(v) => update(i, { include: v })} />
              </div>
            )
          })}
        </Section>
      )}
      {result && result.missing.length > 0 && (
        <Section title="메뉴판에 없는 기존 메뉴">
          <p className="meta">{result.missing.map((m) => m.name).join(', ')}</p>
          <Check label="이 메뉴들을 판매 중지할게요" checked={deactivate} onChange={setDeactivate} />
        </Section>
      )}
      {items.length > 0 && <Check label="메뉴명과 가격을 확인했어요" checked={confirmed} onChange={setConfirmed} />}
    </Page>
  )
}
