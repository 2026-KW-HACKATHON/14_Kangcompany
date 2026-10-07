// S-13 미충족 수요 (시안 32): 조건 맞는 가게를 못 찾고 끝난 요청 (단체 이름·연락처 없이)
import { useState } from 'react'
import { stats } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Empty, ErrorBox, FilterRow, Intro, Loading, Metric, Metrics, Section } from '../../components/ui'
import { EVENT_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'
import type { EventType } from '../../types/db'

export default function OwnerUnmet() {
  const q = useAsync(() => stats.getUnmetDemand(), [])
  const [view, setView] = useState<'event' | 'size' | 'week'>('event')
  const d = q.data
  const recent = d?.by_week.slice(-1)[0]?.count ?? 0
  const prev = d?.by_week.slice(-2, -1)[0]?.count ?? 0
  return (
    <Page title="미충족 수요" nav>
      <Intro title="아직 만나지 못한 모임." sub="최근 180일, 받아줄 가게를 못 찾고 끝난 요청을 모아 봐요." />
      {q.loading ? <Loading /> : q.error || !d ? <ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /> : !d.total_unmet ? <Empty art="gathering">최근 놓친 수요가 없어요.</Empty> : (
        <>
          <Metrics>
            <Metric label="놓친 요청" value={d.total_unmet} unit="건" />
            <Metric label="최근 주 (전주 대비)" value={`${recent}${recent - prev ? ` (${recent - prev > 0 ? '+' : ''}${recent - prev})` : ''}`} unit="건" />
          </Metrics>
          <FilterRow value={view} onChange={setView} options={[{ value: 'event', label: '모임 종류' }, { value: 'size', label: '규모' }, { value: 'week', label: '주별' }]} />
          <Section>
            {view === 'event' && d.by_event.map((e) => (
              <div key={e.event_type} className="card" style={{ marginBottom: 16 }}>
                <Badge>{EVENT_LABEL[e.event_type as EventType] ?? e.event_type}</Badge>
                <h3>{e.count}건 · 평균 {e.avg_headcount}명</h3>
                <p className="meta">1인 평균 예산 {formatWon(e.avg_budget)}</p>
                <div className="divider"><p className="meta">미성사 사유</p><p>조건에 맞는 가게 없음</p></div>
              </div>
            ))}
            {view === 'size' && d.by_size.map((s) => <div key={s.size} className="rank-row"><div><h3>{s.size.replace(/^\d\) /, '')}</h3></div><strong>{s.count}건</strong></div>)}
            {view === 'week' && d.by_week.map((w) => <div key={w.week_start} className="rank-row"><div><h3>{w.week_start} 주</h3></div><strong>{w.count}건</strong></div>)}
          </Section>
          <p className="meta">단체명과 담당자 연락처는 표시하지 않아요.</p>
        </>
      )}
    </Page>
  )
}
