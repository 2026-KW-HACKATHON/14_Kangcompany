// S-12 분석 대시보드 (확정 영수증 기준) → S-13 미충족 수요
import { useNavigate } from 'react-router-dom'
import { stats } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Bars } from '../../components/Bars'
import { Button, Empty, ErrorBox, Loading, Rows, Section } from '../../components/ui'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import { formatWon } from '../../lib/format'

export default function OwnerStats() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const q = useAsync(() => stats.getStoreStats(store.id), [store.id])
  return (
    <Page title="분석" tabRoot>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !q.data ? null : (
        <>
          <p className="muted">{q.data.period.from} ~ {q.data.period.to} · 매출은 확정한 영수증 기준</p>
          <Rows rows={[
            ['예약', `${q.data.summary.reservations}건`], ['완료', `${q.data.summary.completed}건`],
            ['노쇼', `${q.data.summary.no_show}건`], ['취소', `${q.data.summary.cancelled}건`],
            ['방문 인원', `${q.data.summary.guests}명`], ['매출', formatWon(q.data.summary.revenue)],
          ]} />
          <Section title="요일별 예약 (한산한 날에 빈 날짜를 열어 보세요)">
            <Bars data={q.data.by_weekday.map((d) => ({ label: d.label, value: d.reservations, text: `${d.reservations}건` }))} />
          </Section>
          <Section title="많이 나간 메뉴">
            {q.data.by_menu.length ? <Bars data={q.data.by_menu.slice(0, 8).map((m) => ({ label: m.menu, value: m.amount, text: `${m.qty}개 · ${formatWon(m.amount)}` }))} />
              : <Empty>확정된 영수증이 쌓이면 분석이 보여요</Empty>}
          </Section>
          <Section title="단체별">
            {q.data.by_group.length ? (
              <ul className="list">{q.data.by_group.map((g) => (
                <li key={g.group_id} className="row"><span>{g.group_name} <span className="muted">{GROUP_TYPE_LABEL[g.group_type]}</span></span><span>{g.visits}회 · {formatWon(g.revenue)}</span></li>
              ))}</ul>
            ) : <p className="muted">아직 없어요</p>}
          </Section>
          <Section title="월별">
            <Bars data={q.data.by_month.map((m) => ({ label: m.month, value: m.reservations, text: `${m.reservations}건 · ${m.guests}명` }))} />
          </Section>
          <Button variant="secondary" onClick={() => nav(paths.ownerUnmet)}>놓친 단체 수요 보기</Button>
        </>
      )}
    </Page>
  )
}
