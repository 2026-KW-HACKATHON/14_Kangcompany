// S-07 메뉴 관리 (시안 24): 판매 중 / 판매 중지 · 직접 추가 · 수정 · 판매 중지 → 메뉴판 사진으로 등록(S-08)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { menus } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Art } from '../../components/icons'
import { Button, Dock, Empty, ErrorBox, Field, Input, Loading, Segmented, Select, Sheet } from '../../components/ui'
import { MENU_CATEGORY_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'
import type { Menu, MenuCategory } from '../../types/db'
import { integerInRange } from '../../lib/validation'

const CATS = Object.entries(MENU_CATEGORY_LABEL).map(([value, label]) => ({ value: value as MenuCategory, label }))
type Edit = { id: number | null; name: string; price: string; category: MenuCategory }

export default function OwnerMenus() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const q = useAsync(() => menus.listMenus(store.id, { includeInactive: true }), [store.id])
  const [filter, setFilter] = useState<'active' | 'inactive'>('active')
  const [edit, setEdit] = useState<Edit | null>(null)
  const act = useAction()
  const list = (q.data ?? []).filter((m) => (filter === 'active' ? m.is_active : !m.is_active))
  const priceValid = Boolean(edit && (edit.price === '' || integerInRange(edit.price)))

  const save = () => act.run(async () => {
    if (!edit?.name.trim() || !priceValid) return
    const price = edit.price === '' ? null : Number(edit.price)
    if (edit.id) await menus.updateMenu(edit.id, { name: edit.name.trim(), price, category: edit.category })
    else await menus.saveMenus(store.id, [{ name: edit.name.trim(), price, category: edit.category }])
    setEdit(null); await q.reload()
  })
  const open = (m?: Menu) => setEdit(m ? { id: m.id, name: m.name, price: String(m.price ?? ''), category: m.category } : { id: null, name: '', price: '', category: 'main' })

  return (
    <Page title="메뉴 관리" back={false} nav
      dock={<Dock><Button variant="primary" onClick={() => nav(paths.ownerMenuScan)}>메뉴판 사진으로 등록</Button></Dock>}
      overlay={
        <Sheet open={Boolean(edit)} title={edit?.id ? '메뉴 수정' : '메뉴 직접 추가'} confirmLabel="저장" busy={act.busy} onClose={() => setEdit(null)}
          onConfirm={edit?.name.trim() && priceValid ? () => void save() : undefined}>
          {edit && (
            <>
              <Field label="메뉴명"><Input value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="가격 (원)" hint="비우면 사전 주문에서 고를 수 없어요" error={!priceValid ? '가격은 0원 이상의 정수로 입력해 주세요.' : null}><Input type="number" inputMode="numeric" min={0} step={1} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
              <Field label="분류"><Select title="분류" value={edit.category} onChange={(category) => setEdit({ ...edit, category })} options={CATS} /></Field>
              {act.error && <p className="note-error">{act.error}</p>}
            </>
          )}
        </Sheet>
      }>
      <div className="section-heading"><h2>우리 가게 메뉴</h2><Button variant="text" onClick={() => open()}>직접 추가</Button></div>
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'active', label: '판매 중' }, { value: 'inactive', label: '판매 중지' }]} />
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !list.length ? (
        <Empty art="food">{filter === 'active' ? '메뉴판 사진 한 장이면 메뉴가 등록돼요.' : '판매 중지한 메뉴가 없어요.'}</Empty>
      ) : (
        <section>
          {list.map((m) => (
            <div key={m.id} className="menu-row">
              <Art name="food" />
              <div>
                <h3>{m.name}</h3>
                <p>{formatWon(m.price)} · {MENU_CATEGORY_LABEL[m.category]}</p>
                <div className="row">
                  <Button variant="text" onClick={() => open(m)}>수정</Button>
                  <Button variant={m.is_active ? 'danger' : 'text'} busy={act.busy} onClick={() => void act.run(async () => { await menus.setMenuActive(m.id, !m.is_active); await q.reload() })}>{m.is_active ? '판매 중지' : '다시 판매'}</Button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </Page>
  )
}
