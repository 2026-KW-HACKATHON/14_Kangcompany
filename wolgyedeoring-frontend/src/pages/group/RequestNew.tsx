// G-02 예약 요청 작성 (시안 9 · 승인 A2): 단체 유형 → 모임 · 일정 · 조건 · 메모 펼침 패널 → 확인 시트 → 요청
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { requests } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Icon, MiniArt, type IconName } from '../../components/icons'
import { Rows, Sheet } from '../../components/ui'
import { DatePicker, TimePicker } from '../../components/pickers'
import { todayKst } from '../../components/Calendar'
import { EVENT_CHOICES, composeNote, eventLabel, noteBody, type EventChoice } from '../../lib/status'
import { dayLabel, formatWon, hmLabel, kstDay } from '../../lib/format'
import type { Request, RequestReach } from '../../types/db'
import { integerInRange } from '../../lib/validation'

const BUDGETS = [20000, 25000, 30000]
const TIMES = ['18:00', '18:30', '19:00']
const PANELS: { title: string; step: string; icon: IconName }[] = [
  { title: '모임 종류', step: '모임', icon: 'gathering' },
  { title: '날짜와 시간', step: '일정', icon: 'calendar' },
  { title: '인원과 예산', step: '조건', icon: 'receipt' },
  { title: '요청 메모', step: '메모', icon: 'send' },
]

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00+09:00`); d.setDate(d.getDate() + n)
  return kstDay(d)
}

export default function RequestNew() {
  const { group } = useGroupSession()
  const nav = useNavigate()
  const state = useLocation().state as { from?: Request; day?: string } | null
  const prev = state?.from
  const prevKst = prev ? kstDay(prev.desired_at) : null

  const [student, setStudent] = useState(group.group_type === 'student_council')
  const initialChoice = useMemo(() => {
    if (!prev) return EVENT_CHOICES[0]
    const label = eventLabel(prev.event_type, prev.note)
    return EVENT_CHOICES.find((c) => c.label === label) ?? EVENT_CHOICES.find((c) => c.type === prev.event_type && !c.tag) ?? EVENT_CHOICES[0]
  }, [prev])
  const [choice, setChoice] = useState<EventChoice>(initialChoice)
  const [otherText, setOtherText] = useState(prev && initialChoice.key === 'other' ? eventLabel(prev.event_type, prev.note).replace('기타 모임', '') : '')
  const [day, setDay] = useState(state?.day ?? prevKst ?? addDays(todayKst(), 7))
  const [time, setTime] = useState(prev ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(prev.desired_at)) : '18:30')
  const [headcount, setHeadcount] = useState(prev?.headcount ?? 24)
  const [budget, setBudget] = useState(prev?.budget_per_person ?? 25000)
  const [custom, setCustom] = useState(prev ? !BUDGETS.includes(prev.budget_per_person) : false)
  const [memo, setMemo] = useState(noteBody(prev?.note))
  const [open, setOpen] = useState(0)
  const [review, setReview] = useState(false)
  const [reach, setReach] = useState<RequestReach | null>(null)
  const act = useAction()

  const desiredIso = `${day}T${time}:00+09:00`
  const past = new Date(desiredIso).getTime() < Date.now()
  const valid = integerInRange(headcount, 1, 200) && integerInRange(budget) && !past && Number.isFinite(Date.parse(desiredIso))
  const total = headcount * budget

  // 학생회용 모임을 고른 상태에서 일반 단체로 바꾸면 회식으로
  useEffect(() => { if (!student && choice.studentOnly) setChoice(EVENT_CHOICES[0]) }, [student, choice])
  useEffect(() => {
    if (!integerInRange(headcount, 1, 200) || !Number.isFinite(Date.parse(desiredIso))) { setReach(null); return }
    const t = setTimeout(() => { requests.requestReach(headcount, desiredIso).then(setReach).catch(() => setReach(null)) }, 400)
    return () => clearTimeout(t)
  }, [headcount, desiredIso])

  const summaries = [
    choice.key === 'other' && otherText.trim() ? otherText.trim() : choice.label,
    `${dayLabel(day)} · ${hmLabel(time)}`,
    `${headcount}명 · 1인 ${formatWon(budget)}`,
    memo.trim() || '없음',
  ]
  const submit = () => act.run(async () => {
    if (!valid || Date.parse(desiredIso) <= Date.now()) return
    const r = await requests.createRequest({
      group_id: group.id, event_type: choice.type, desired_at: desiredIso,
      headcount, budget_per_person: budget, note: composeNote(choice, otherText, memo),
    })
    nav(paths.groupRequest(r.id), { replace: true })
  })

  const panel = (i: number, content: React.ReactNode) => (
    <details className="flow-panel" open={open === i} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpen(i) }}>
      <summary onClick={(e) => { e.preventDefault(); setOpen(open === i ? -1 : i) }}>
        <span className="panel-sign"><Icon name={PANELS[i].icon} /></span>
        <span className="panel-summary"><span className="label">{PANELS[i].title}</span><strong>{summaries[i]}</strong></span>
        <svg className="icon summary-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
      </summary>
      <div className="panel-content">{content}</div>
    </details>
  )
  const next = (i: number, label: string) => (
    <button type="button" className="next-inline" onClick={() => setOpen(i)}>{label}<Icon name="chevron" /></button>
  )
  const choices = EVENT_CHOICES.filter((c) => student || !c.studentOnly)

  return (
    <Page title="예약 요청" a2 kind="request"
      dock={
        <footer className="dock">
          <div className="dock-meta"><span>예상 총액</span><strong>{formatWon(total)}</strong></div>
          <button className="primary" type="button" disabled={!valid} onClick={() => setReview(true)}>요청 보내기<Icon name="chevron" /></button>
        </footer>
      }
      overlay={
        <Sheet open={review} title="이 조건으로 요청할까요?" confirmLabel="요청 보내기" busy={act.busy} onClose={() => setReview(false)} onConfirm={() => void submit()}>
          <Rows rows={[['모임 종류', summaries[0]], ['방문 일시', summaries[1]], ['인원', `${headcount}명`], ['1인 예산', formatWon(budget)], ['예상 총액', formatWon(total)]]} />
          {reach && <p className="meta">{reach.available === 0 ? '이 시간대에 이 인원을 받을 수 있는 가게가 없어요. 그래도 요청은 보낼 수 있어요.' : `${reach.notified}곳에 요청이 전달돼요.`}</p>}
          {act.error && <p className="note-error" role="alert">{act.error}</p>}
        </Sheet>
      }>
      <div className="request-editor">
        <div className="app-intro"><div><h2>어떤 모임을 준비하세요?</h2><p className="muted">선택한 조건으로 가게에 요청해요.</p></div></div>
        <section className="group-type">
          <span className="group-type-label">예약하는 단체</span>
          <div className="group-type-switch" role="group" aria-label="단체 유형">
            <button type="button" aria-pressed={!student} onClick={() => setStudent(false)}>일반 단체</button>
            <button type="button" aria-pressed={student} onClick={() => setStudent(true)}>학생회</button>
          </div>
          <p className="group-type-note" role="status">{student ? '학생회는 총회·간식행사도 선택할 수 있어요.' : '회식·뒤풀이·기타를 선택할 수 있어요.'}</p>
        </section>
        <nav className="progress-nav" aria-label="예약 요청 입력 순서">
          {PANELS.map((p, i) => <button key={p.step} type="button" aria-current={open === i ? 'step' : undefined} onClick={() => setOpen(i)}>{p.step}</button>)}
        </nav>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) setReview(true) }}>
          {panel(0, <>
            <div className="event-preview">
              <span><MiniArt name={choice.art} /></span>
              <div><h3>{choice.label}</h3><p className="muted">함께 모이는 날</p></div>
            </div>
            <div className="event-grid" role="group" aria-label="모임 종류">
              {choices.map((c) => (
                <button key={c.key} type="button" className="event-option" aria-pressed={choice.key === c.key} onClick={() => setChoice(c)}
                  aria-label={c.studentOnly ? `${c.label} · 학생회용` : undefined}>
                  <MiniArt name={c.art} />
                  <span className="category-name">{c.label}</span>
                  {c.studentOnly && <span className="student-tag">학생회용</span>}
                </button>
              ))}
            </div>
            {choice.key === 'other' && (
              <div className="event-other-field">
                <label className="field-label" htmlFor="event-other">어떤 모임인가요? <span className="muted">선택</span></label>
                <input id="event-other" type="text" maxLength={30} value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="예: 생일 모임, 동호회 정기 모임" />
                <p className="hint">가게에 전할 모임 종류를 한 줄로 적어주세요.</p>
              </div>
            )}
            {next(1, '날짜와 시간 정하기')}
          </>)}
          {panel(1, <>
            <label className="field-label" htmlFor="req-date">희망 날짜</label>
            <DatePicker id="req-date" a2 className="date-control date-picker-trigger" title="희망 날짜" value={day} onChange={setDay} />
            <div className="spacing-top">
              <label className="field-label" htmlFor="req-time">희망 시간</label>
              <TimePicker id="req-time" a2 className="date-control time-picker-trigger" title="희망 시간" value={time} onChange={setTime} />
            </div>
            <div className="time-options" role="group" aria-label="희망 시간 빠른 선택">
              {TIMES.map((t) => <button key={t} type="button" className="choice" aria-pressed={time === t} onClick={() => setTime(t)}>{hmLabel(t)}</button>)}
            </div>
            {past && <p className="form-error" role="alert">지난 시간은 고를 수 없어요.</p>}
            {next(2, '인원과 예산 정하기')}
          </>)}
          {panel(2, <>
            <label className="field-label" htmlFor="headcount">예상 인원</label>
            <div className="people-control">
              <button type="button" className="round-button" aria-label="인원 줄이기" disabled={headcount <= 1} onClick={() => setHeadcount(Math.max(1, headcount - 1))}><span><Icon name="minus" /></span></button>
              <label className="people-value">
                <input id="headcount" type="number" min={1} max={200} value={headcount} onChange={(e) => setHeadcount(Math.min(200, Math.max(0, Number(e.target.value) || 0)))} />
                <span>명</span>
              </label>
              <button type="button" className="round-button" aria-label="인원 늘리기" disabled={headcount >= 200} onClick={() => setHeadcount(Math.min(200, headcount + 1))}><span><Icon name="plus" /></span></button>
            </div>
            <span className="field-label" id="budget-label">1인 예산</span>
            <div className="budget-options" role="group" aria-labelledby="budget-label">
              {BUDGETS.map((b) => <button key={b} type="button" className="choice" aria-pressed={!custom && budget === b} onClick={() => { setCustom(false); setBudget(b) }}>{formatWon(b)}</button>)}
              <button type="button" className="choice" aria-pressed={custom} onClick={() => setCustom(true)}>직접 입력</button>
            </div>
            {custom && (
              <div className="spacing-top custom-budget">
                <label className="field-label" htmlFor="custom-budget">직접 입력한 1인 예산</label>
                <div className="value-field">
                  <input id="custom-budget" type="number" min={0} step={1000} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} />
                  <span>원</span>
                </div>
              </div>
            )}
            <div className="money-preview"><span>예상 총액</span><strong>{formatWon(total)}</strong></div>
            {next(3, '요청 메모 확인하기')}
          </>)}
          {panel(3, <>
            <label className="field-label" htmlFor="memo">요청 메모 <span className="muted">선택</span></label>
            <textarea id="memo" rows={3} maxLength={300} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 고기 위주로, 단체석 한 공간이면 좋겠어요." />
            <p className="hint">가게에 전하고 싶은 내용을 적어주세요.</p>
          </>)}
          <p className="flow-note">
            <Icon name="info" />
            <span>{reach ? (reach.available === 0 ? '이 시간대에 받을 수 있는 가게가 아직 없어요. ' : `${reach.notified}곳에 요청이 전달돼요. `) : ''}가장 먼저 수락한 가게로 예약이 잡혀요.</span>
          </p>
        </form>
      </div>
    </Page>
  )
}
