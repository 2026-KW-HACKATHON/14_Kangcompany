// G-02 예약 요청 작성: 행사 종류 · 일시 · 인원 · 1인 예산 → 받을 수 있는 가게 수 미리보기
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { requests } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, Field, Input, Rows, Select } from '../../components/ui'
import { EVENT_LABEL } from '../../lib/status'
import { formatWon, localInputToIso } from '../../lib/format'
import type { EventType, Request, RequestReach } from '../../types/db'

export default function RequestNew() {
  const { group } = useGroupSession()
  const nav = useNavigate()
  // G-03 만료 → "조건 바꿔 다시 요청" 시 이전 값 채움
  const prev = (useLocation().state as { from?: Request } | null)?.from
  const [f, setF] = useState({
    event_type: (prev?.event_type ?? 'opening_party') as EventType,
    when: '', headcount: prev ? String(prev.headcount) : '', budget: prev ? String(prev.budget_per_person) : '', note: prev?.note ?? '',
  })
  const [reach, setReach] = useState<RequestReach | null>(null)
  const act = useAction()
  const hc = Number(f.headcount)
  const budget = Number(f.budget)
  const valid = f.when && Number.isInteger(hc) && hc > 0 && Number.isInteger(budget) && budget >= 0 && f.budget !== ''

  useEffect(() => {
    if (!(Number.isInteger(hc) && hc > 0)) { setReach(null); return }
    const t = setTimeout(() => {
      requests.requestReach(hc, f.when ? localInputToIso(f.when) : undefined).then(setReach).catch(() => setReach(null))
    }, 400)
    return () => clearTimeout(t)
  }, [hc, f.when])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const submit = () => act.run(async () => {
    const r = await requests.createRequest({
      group_id: group.id, event_type: f.event_type, desired_at: localInputToIso(f.when),
      headcount: hc, budget_per_person: budget, note: f.note.trim() || null,
    })
    nav(paths.groupRequest(r.id), { replace: true })
  })

  const noStore = reach && reach.available === 0
  return (
    <Page title="예약 요청" back>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="행사 종류">
          <Select value={f.event_type} onChange={set('event_type')} options={Object.entries(EVENT_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="날짜와 시간"><Input type="datetime-local" value={f.when} onChange={set('when')} required /></Field>
        <Field label="인원"><Input type="number" inputMode="numeric" min={1} value={f.headcount} onChange={set('headcount')} required /></Field>
        <Field label="1인 예산 (원)"><Input type="number" inputMode="numeric" min={0} step={1000} value={f.budget} onChange={set('budget')} required /></Field>
        <Field label="요청 사항 (선택)"><Input value={f.note} onChange={set('note')} placeholder="예: 21시 이후 입장 가능한 곳" /></Field>
        {valid && <Rows rows={[['예상 총액', formatWon(hc * budget)]]} />}
        {reach && (
          <p className={noStore ? 'inline-error' : 'muted'}>
            {noStore ? '이 시간대에 이 인원을 받을 수 있는 가게가 없어요. 날짜나 인원을 바꿔 보세요.'
              : `${reach.notified}곳에 요청이 전달돼요${f.when ? ` (이 시간대 자리 있는 곳 ${reach.available}곳)` : ''}`}
          </p>
        )}
        <p className="muted">가장 먼저 수락한 가게로 바로 정해지고, 예약금을 결제하면 확정돼요.</p>
        {act.error && <p className="inline-error" role="alert">{act.error}</p>}
        <BottomAction hint={!valid ? '날짜·인원·예산을 입력해 주세요' : null}>
          <Button variant="primary" type="submit" busy={act.busy} disabled={!valid}>요청 보내기</Button>
        </BottomAction>
      </form>
    </Page>
  )
}
