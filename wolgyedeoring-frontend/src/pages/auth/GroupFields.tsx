// 단체 추가 정보 (시안 4·8 groupForm, 011): 기타 단체 한 줄 설명 · 소속 · 활동 지역 · 평소 인원 규모
import { Field, Input } from '../../components/ui'
import type { GroupExtra } from '../../api/groups'
import type { Group, GroupType } from '../../types/db'
import { integerInRange } from '../../lib/validation'

export type GroupExtraForm = { description: string; affiliation: string; region: string; usual_size: string }
export const groupExtraValid = (f: GroupExtraForm) => f.usual_size === '' || integerInRange(f.usual_size, 1, 200)

export const groupExtraForm = (g?: Group | null): GroupExtraForm => ({
  description: g?.description ?? '', affiliation: g?.affiliation ?? '', region: g?.region ?? '', usual_size: g?.usual_size ? String(g.usual_size) : '',
})

/** 저장할 값. 기타가 아니면 한 줄 설명은 비운다 */
export function groupExtraInput(f: GroupExtraForm, type: GroupType): GroupExtra {
  const size = Number(f.usual_size)
  return {
    description: type === 'etc' ? f.description.trim() || null : null,
    affiliation: f.affiliation.trim() || null,
    region: f.region.trim() || null,
    usual_size: Number.isInteger(size) && size > 0 ? size : null,
  }
}

export function GroupTypeOther({ type, value, onChange }: { type: GroupType; value: GroupExtraForm; onChange: (v: GroupExtraForm) => void }) {
  if (type !== 'etc') return null
  return <Field label="어떤 단체인가요?"><Input value={value.description} maxLength={40} onChange={(e) => onChange({ ...value, description: e.target.value })} placeholder="예: 독서 모임, 가족 모임" /></Field>
}

/** 소속·활동 지역 (단체 유형 다음) */
export function GroupMoreFields({ value, onChange }: { value: GroupExtraForm; onChange: (v: GroupExtraForm) => void }) {
  const set = (k: keyof GroupExtraForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <Field label="소속·학교·학과 (선택)"><Input value={value.affiliation} maxLength={40} onChange={set('affiliation')} placeholder="예: 광운대 소프트웨어학부" /></Field>
      <Field label="활동 지역 (선택)" hint="가게가 모임 위치를 가늠하는 데 써요"><Input value={value.region} maxLength={40} onChange={set('region')} placeholder="예: 월계1동" /></Field>
    </>
  )
}

/** 평소 인원 규모 (담당자 연락처 다음) */
export function GroupSizeField({ value, onChange }: { value: GroupExtraForm; onChange: (v: GroupExtraForm) => void }) {
  return <Field label="평소 인원 규모 (선택)" error={!groupExtraValid(value) ? '1~200명의 정수로 입력해 주세요.' : null}><Input type="number" inputMode="numeric" min={1} max={200} value={value.usual_size} onChange={(e) => onChange({ ...value, usual_size: e.target.value })} placeholder="예: 24" /></Field>
}
