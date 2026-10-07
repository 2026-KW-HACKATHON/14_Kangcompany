// 사전 주문 메뉴 선택 (G-05, G-07 공용 · 시안 13 menuQuantity). 금액 미리보기는 프런트 계산, 저장 결과는 서버 값
import { Art } from '../../components/icons'
import { Quantity } from '../../components/ui'
import { formatWon } from '../../lib/format'
import type { Menu } from '../../types/db'

export type Qty = Record<number, number>

export function MenuPicker({ menus, qty, onChange }: { menus: Menu[]; qty: Qty; onChange: (q: Qty) => void }) {
  const orderable = menus.filter((m) => m.is_active && m.price !== null)
  if (!orderable.length) return <p className="meta">주문할 수 있는 메뉴가 없어요.</p>
  const set = (id: number, n: number) => {
    const next = { ...qty }
    if (n <= 0) delete next[id]; else next[id] = Math.min(n, 999)
    onChange(next)
  }
  return (
    <section className="menu-list">
      {orderable.map((m) => (
        <div key={m.id} className="menu-row">
          <Art name="food" />
          <div>
            <h3>{m.name}</h3>
            <p>{formatWon(m.price)}</p>
            <Quantity value={qty[m.id] ?? 0} onChange={(n) => set(m.id, n)} label={m.name} max={999} />
          </div>
        </div>
      ))}
    </section>
  )
}

export function preorderTotal(menus: Menu[], qty: Qty) {
  return menus.reduce((sum, m) => sum + (qty[m.id] ?? 0) * (m.price ?? 0), 0)
}
export const toItems = (qty: Qty) => Object.entries(qty).map(([menu_id, n]) => ({ menu_id: Number(menu_id), qty: n }))
