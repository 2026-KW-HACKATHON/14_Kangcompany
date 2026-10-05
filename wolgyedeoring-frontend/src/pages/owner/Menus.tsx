// S-07 메뉴 관리: 목록(분류별) · 직접 추가 · 가격 수정 · 판매 중지 → 메뉴판 사진 인식(S-08)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { menus } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Section, Select } from '../../components/ui'
import { MENU_CATEGORY_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'
import type { MenuCategory } from '../../types/db'

const CATS = Object.entries(MENU_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))

export default function OwnerMenus() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const q = useAsync(() => menus.listMenus(store.id, { includeInactive: true }), [store.id])
  const [add, setAdd] = useState({ name: '', price: '', category: 'main' as MenuCategory })
  const [editing, setEditing] = useState<{ id: number; price: string } | null>(null)
  const act = useAction()

  const addMenu = () => act.run(async () => {
    await menus.saveMenus(store.id, [{ name: add.name.trim(), price: add.price === '' ? null : Number(add.price), category: add.category }])
    setAdd({ ...add, name: '', price: '' })
    await q.reload()
  })

  return (
    <Page title="메뉴" tabRoot>
      <Button variant="secondary" onClick={() => nav(paths.ownerMenuScan)}>메뉴판 사진으로 등록</Button>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !q.data!.length ? (
        <Empty>메뉴판 사진 한 장이면 메뉴가 등록돼요</Empty>
      ) : (
        CATS.map((c) => {
          const list = q.data!.filter((m) => m.category === c.value)
          if (!list.length) return null
          return (
            <Section key={c.value} title={c.label}>
              <ul className="list">
                {list.map((m) => (
                  <li key={m.id} className="card">
                    <div className="card-top">
                      <span className="strong">{m.name}</span>
                      {m.is_active ? <span>{formatWon(m.price)}</span> : <Badge tone="muted">판매 중지</Badge>}
                    </div>
                    {editing?.id === m.id ? (
                      <div className="btn-row">
                        <Input type="number" min={0} step={500} value={editing.price} onChange={(e) => setEditing({ id: m.id, price: e.target.value })} aria-label={`${m.name} 가격`} style={{ maxWidth: 160 }} />
                        <Button variant="secondary" busy={act.busy} onClick={() => void act.run(async () => { await menus.updateMenu(m.id, { price: editing.price === '' ? null : Number(editing.price) }); setEditing(null); await q.reload() })}>저장</Button>
                        <Button variant="text" onClick={() => setEditing(null)}>취소</Button>
                      </div>
                    ) : (
                      <div className="btn-row">
                        <Button variant="text" onClick={() => setEditing({ id: m.id, price: String(m.price ?? '') })}>가격 수정</Button>
                        <Button variant={m.is_active ? 'danger' : 'text'} busy={act.busy} onClick={() => void act.run(async () => { await menus.setMenuActive(m.id, !m.is_active); await q.reload() })}>
                          {m.is_active ? '판매 중지' : '다시 판매'}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )
        })
      )}
      <Section title="직접 추가">
        <form className="form" onSubmit={(e) => { e.preventDefault(); void addMenu() }}>
          <Field label="이름"><Input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} maxLength={60} /></Field>
          <Field label="가격 (원)" hint="비우면 사전 주문에서 고를 수 없어요"><Input type="number" min={0} step={500} value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} /></Field>
          <Field label="분류" error={act.error}><Select value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value as MenuCategory })} options={CATS} /></Field>
          <Button variant="secondary" type="submit" busy={act.busy} disabled={!add.name.trim()}>추가하기</Button>
        </form>
      </Section>
    </Page>
  )
}
