// S-13 미충족 수요: 조건 맞는 가게를 못 찾고 만료된 요청 (단체 이름 없이 집계)
import { stats } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Bars } from '../../components/Bars'
import { Empty, ErrorBox, Loading, Rows, Section } from '../../components/ui'
import { EVENT_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'
import type { EventType } from '../../types/db'

export default function OwnerUnmet() {
  const q = useAsync(() => stats.getUnmetDemand(), [])
  return (
    <Page title="놓친 단체 수요" back>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !q.data ? null : !q.data.total_unmet ? <Empty>최근 놓친 수요가 없어요</Empty> : (
        <>
          <p className="muted">최근 180일, 월계1동에서 받아줄 가게를 못 찾고 끝난 요청이에요.</p>
          <Rows rows={[['놓친 요청', `${q.data.total_unmet}건`]]} />
          <Section title="행사별">
            <ul className="list">{q.data.by_event.map((e) => (
              <li key={e.event_type} className="row"><span>{EVENT_LABEL[e.event_type as EventType] ?? e.event_type}</span><span>{e.count}건 · 평균 {e.avg_headcount}명 · 1인 {formatWon(e.avg_budget)}</span></li>
            ))}</ul>
          </Section>
          <Section title="규모별"><Bars data={q.data.by_size.map((s) => ({ label: s.size.replace(/^\d\) /, ''), value: s.count, text: `${s.count}건` }))} /></Section>
          <Section title="주별"><Bars data={q.data.by_week.map((w) => ({ label: w.week_start.slice(5), value: w.count, text: `${w.count}건` }))} /></Section>
        </>
      )}
    </Page>
  )
}
