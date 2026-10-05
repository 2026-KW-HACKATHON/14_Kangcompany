// 사전 주문 메뉴 선택 (G-05, G-07 공용). 금액 미리보기는 프런트 계산, 저장 결과는 서버 값 사용
import { Button } from '../../components/ui'
import { formatWon } from '../../lib/format'
import { MENU_CATEGORY_LABEL } from '../../lib/status'
import type { Menu } from '../../types/db'

export type Qty = Record<number, number>

export function MenuPicker({ menus, qty, onChange }: { menus: Menu[]; qty: Qty; onChange: (q: Qty) => void }) {
  const orderable = menus.filter((m) => m.is_active && m.price !== null)
  if (!orderable.length) return <p className="muted">주문할 수 있는 메뉴가 없어요</p>
  const set = (id: number, n: number) => {
    const next = { ...qty }
    if (n <= 0) delete next[id]; else next[id] = Math.min(n, 999)
    onChange(next)
  }
  return (
    <ul className="list">
      {orderable.map((m) => (
        <li key={m.id} className="card">
          <div className="card-top">
            <span><span className="strong">{m.name}</span> <span className="muted">{MENU_CATEGORY_LABEL[m.category]}</span></span>
            <span>{formatWon(m.price)}</span>
          </div>
          <div className="qty">
            <Button aria-label={`${m.name} 빼기`} onClick={() => set(m.id, (qty[m.id] ?? 0) - 1)} disabled={!qty[m.id]}>−</Button>
            <input className="input" style={{ width: 80, textAlign: 'center' }} type="number" inputMode="numeric" min={0} max={999}
              aria-label={`${m.name} 수량`} value={qty[m.id] ?? 0} onChange={(e) => set(m.id, Number(e.target.value) || 0)} />
            <Button aria-label={`${m.name} 더하기`} onClick={() => set(m.id, (qty[m.id] ?? 0) + 1)}>+</Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function preorderTotal(menus: Menu[], qty: Qty) {
  return menus.reduce((sum, m) => sum + (qty[m.id] ?? 0) * (m.price ?? 0), 0)
}
export const toItems = (qty: Qty) => Object.entries(qty).map(([menu_id, n]) => ({ menu_id: Number(menu_id), qty: n }))
