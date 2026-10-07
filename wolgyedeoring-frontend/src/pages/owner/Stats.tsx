// S-12 가게 분석 (시안 30): 확정 영수증 기준 매출 · 요일별 흐름 · 많이 찾은 메뉴 · 예약 현황 → 미충족 수요(S-13)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { stats } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Empty, ErrorBox, LinkRow, Loading, Metric, Metrics, Section, Segmented } from '../../components/ui'
import { todayKst } from '../../components/Calendar'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'

function Chart({ labels, values, unit, title, legend }: { labels: string[]; values: number[]; unit: string; title: string; legend: string }) {
  const max = Math.max(1, ...values)
  return (
    <div className="chart">
      <p className="meta">{title}</p>
      <div className="chart-bars" role="img" aria-label={labels.map((l, i) => `${l} ${values[i]}${unit}`).join(', ')}>
        {labels.map((l, i) => (
          <div key={l} className="chart-bar"><div className="bar" style={{ height: `${Math.round((values[i] / max) * 100)}px` }} /><span className="meta">{l}</span></div>
        ))}
      </div>
      <div className="chart-legend"><span>단위: {unit}</span><span>{legend}</span></div>
    </div>
  )
}

export default function OwnerStats() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const [period, setPeriod] = useState<'month' | 'quarter'>('quarter')
  const q = useAsync(() => {
    if (period === 'quarter') return stats.getStoreStats(store.id)
    const t = todayKst()
    return stats.getStoreStats(store.id, `${t.slice(0, 7)}-01`, t)
  }, [store.id, period])
  const d = q.data
  return (
    <Page title="가게 분석" back={false} nav>
      <Segmented value={period} onChange={setPeriod} options={[{ value: 'month', label: '이번 달' }, { value: 'quarter', label: '최근 3개월' }]} />
      {q.loading ? <Loading /> : q.error || !d ? <ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /> : (
        <>
          <section>
            <p className="meta">확정된 소비 기록 기준 · {d.period.from} ~ {d.period.to}</p>
            <p className="big" style={{ marginTop: 8 }}>{formatWon(d.summary.revenue)}</p>
            <p className="subtitle">단체 방문이 우리 가게에 남긴 소비예요.</p>
          </section>
          <Metrics>
            <Metric label="예약" value={d.summary.reservations} unit="건" />
            <Metric label="1인 평균 소비" value={d.summary.guests ? Math.round(d.summary.revenue / d.summary.guests).toLocaleString('ko-KR') : 0} unit="원" />
          </Metrics>
          <Section title="요일별 예약">
            <Chart labels={d.by_weekday.map((x) => x.label)} values={d.by_weekday.map((x) => x.reservations)} unit="건" title="한산한 요일에 빈자리를 열어 보세요" legend="예약 기준" />
          </Section>
          <Section title="많이 찾은 메뉴">
            {d.by_menu.length ? d.by_menu.slice(0, 5).map((m, i) => (
              <div key={m.menu} className="rank-row"><span className="rank">{i + 1}</span><div><h3>{m.menu}</h3><p>{m.qty}개 판매</p></div><strong>{formatWon(m.amount)}</strong></div>
            )) : <Empty art="chart">확정된 영수증이 쌓이면 분석이 보여요.</Empty>}
          </Section>
          <Section title="예약 현황">
            <Metrics>
              <Metric label="완료" value={d.summary.completed} unit="건" />
              <Metric label="방문 인원" value={d.summary.guests} unit="명" />
              <Metric label="취소됨" value={d.summary.cancelled} unit="건" />
              <Metric label="노쇼" value={d.summary.no_show} unit="건" />
            </Metrics>
          </Section>
          {d.by_group.length > 0 && (
            <Section title="자주 찾은 단체">
              {d.by_group.slice(0, 5).map((g, i) => (
                <div key={g.group_id} className="rank-row"><span className="rank">{i + 1}</span><div><h3>{g.group_name}</h3><p>{GROUP_TYPE_LABEL[g.group_type]} · {g.visits}회 방문</p></div><strong>{formatWon(g.revenue)}</strong></div>
              ))}
            </Section>
          )}
          <LinkRow title="아직 연결되지 못한 수요" sub="익명 조건으로 동네 수요를 확인해요" art="gathering" onClick={() => nav(paths.ownerUnmet)} />
        </>
      )}
    </Page>
  )
}
