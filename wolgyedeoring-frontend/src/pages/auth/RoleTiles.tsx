// 역할 선택 타일 (시안 1·3 roleTile)
import { Art } from '../../components/icons'
import type { Role } from '../../types/db'

export function RoleTiles({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const tile = (r: Role, label: string, desc: string, art: 'gathering' | 'store') => (
    <button type="button" className="option role-tile" data-role={r === 'owner' ? 'merchant' : 'group'} aria-pressed={role === r} onClick={() => onChange(r)}>
      <Art name={art} /><span>{label}</span><small className="meta">{desc}</small>
    </button>
  )
  return (
    <div className="option-grid" aria-label="이용 역할">
      {tile('group', '단체 담당자', '모임 예약과 참석 관리', 'gathering')}
      {tile('owner', '가게 사장님', '단체 손님과 가게 운영', 'store')}
    </div>
  )
}
