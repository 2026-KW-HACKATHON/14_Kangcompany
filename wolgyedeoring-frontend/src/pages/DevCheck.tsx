// 데이터 연결 확인 페이지 (/dev) — 디자인 없는 개발용 화면
// 시연 계정으로 로그인해서 BE 함수들이 실제로 응답하는지 확인한다
import { useEffect, useState, type ReactNode } from 'react'
import { auth, groups, notifications, requests, reservations, stores } from '../api'
import { useSession } from '../hooks/useSession'
import { isSupabaseConfigured } from '../lib/supabase'
import { toApiError } from '../lib/errors'
import { formatDateTime, formatWon, timeLeft } from '../lib/format'
import { EVENT_LABEL, RESERVATION_STATUS, myResponseView } from '../lib/status'
import type { OpenRequestForStore, ReservationActions } from '../types/db'
import type { ReservationRow } from '../api/reservations'

const DEMO = [
  { email: 'owner1@wolgye.demo', label: '고기굽는집 사장님' },
  { email: 'owner2@wolgye.demo', label: '월계치킨 사장님' },
  { email: 'sw@wolgye.demo', label: '소프트웨어학부 학생회' },
  { email: 'band@wolgye.demo', label: '밴드 동아리' },
]
const DEMO_PASSWORD = 'demo1234!'

interface Row { name: string; ok: boolean; detail: string }

export default function DevCheck() {
  const { me, loading } = useSession()
  const [rows, setRows] = useState<Row[]>([])
  const [resList, setResList] = useState<(ReservationRow & { actions?: ReservationActions })[]>([])
  const [openReqs, setOpenReqs] = useState<OpenRequestForStore[]>([])
  const [error, setError] = useState<string | null>(null)

  async function check(name: string, fn: () => Promise<string>) {
    try {
      const detail = await fn()
      setRows((r) => [...r, { name, ok: true, detail }])
    } catch (e) {
      setRows((r) => [...r, { name, ok: false, detail: toApiError(e).message }])
    }
  }

  useEffect(() => {
    if (!me) return
    setRows([]); setResList([]); setOpenReqs([])
    void (async () => {
      await check('프로필', async () => `${me.display_name} (${me.role}) · 전화 ${me.phone ?? '없음'}`)
      await check('알림', async () => `안 읽은 알림 ${await notifications.countUnread()}개`)
      await check('예약 목록', async () => {
        const list = await reservations.listMyReservations()
        const withActions = await Promise.all(list.map(async (r) => ({ ...r, actions: await reservations.getActions(r.id) })))
        setResList(withActions)
        return `${list.length}건 (행동 플래그 포함)`
      })
      if (me.role === 'owner') {
        await check('내 가게', async () => {
          const s = await stores.getMyStore(me.id)
          if (!s) return '가게 없음'
          const list = await requests.listOpenRequestsForStore(s.id)
          setOpenReqs(list)
          return `${s.name} · ${s.max_capacity}석 · 받은 요청 ${list.length}건`
        })
      } else {
        await check('내 단체', async () => {
          const g = await groups.getMyGroup(me.id)
          if (!g) return '단체 없음'
          const list = await requests.listMyRequests(g.id)
          return `${g.name} · 요청 ${list.length}건`
        })
        await check('가게 수 미리보기 (24명)', async () => {
          const r = await requests.requestReach(24)
          return `알림 받는 가게 ${r.notified}곳 · 자리 있는 가게 ${r.available}곳`
        })
      }
    })()
  }, [me])

  async function login(email: string) {
    setError(null)
    try { await auth.signIn(email, DEMO_PASSWORD) } catch (e) { setError(toApiError(e).message) }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontSize: 17, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 24 }}>데이터 연결 확인</h1>

      {!isSupabaseConfigured && (
        <p role="alert" style={{ color: '#B42318' }}>
          .env.local 이 없습니다. <code>.env.example</code> 을 복사해 Supabase URL·키를 넣고 <code>npm run dev</code> 를 다시 실행하세요.
        </p>
      )}

      <Section title="로그인">
        {loading ? <p>확인 중</p> : me ? (
          <p>
            {me.display_name}으로 로그인됨{' '}
            <button onClick={() => void auth.signOut()} style={btn}>로그아웃</button>
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DEMO.map((d) => (
              <button key={d.email} onClick={() => void login(d.email)} style={btn}>{d.label}</button>
            ))}
          </div>
        )}
        {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
      </Section>

      {me && (
        <>
          <Section title="호출 결과">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} style={{ borderTop: '1px solid #ddd' }}>
                    <td style={{ padding: 8, width: 32 }}>{r.ok ? '✅' : '❌'}</td>
                    <td style={{ padding: 8, width: 180 }}>{r.name}</td>
                    <td style={{ padding: 8 }}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {openReqs.length > 0 && (
            <Section title="받은 요청 (open_requests_for_store)">
              {openReqs.map((q) => {
                const left = timeLeft(q.response_deadline)
                return (
                  <p key={q.request_id}>
                    {q.group_name} · {EVENT_LABEL[q.event_type]} · {formatDateTime(q.desired_at)} · {q.headcount}명 ·
                    1인 {formatWon(q.budget_per_person)} · 남은 자리 {q.remaining_capacity} ·
                    응답 기한 {left ? `${left.text} 남음` : '지남'} · {myResponseView(q.my_response).label} ·
                    {q.can_accept ? ' 수락 가능' : ' 수락 불가'}
                  </p>
                )
              })}
            </Section>
          )}

          {resList.length > 0 && (
            <Section title="내 예약 (reservations + reservation_actions)">
              {resList.map((r) => (
                <div key={r.id} style={{ borderTop: '1px solid #ddd', padding: '8px 0' }}>
                  <strong>{RESERVATION_STATUS[r.status].label}</strong> · {me.role === 'owner' ? r.groups.name : r.stores.name} ·{' '}
                  {formatDateTime(r.start_at)} · {r.headcount}명 · 예약금 {formatWon(r.deposit_amount)}
                  {r.actions && (
                    <div style={{ fontSize: 15, color: '#555' }}>
                      가능한 행동: {Object.entries(r.actions)
                        .filter(([k, v]) => k.startsWith('can_') && v === true)
                        .map(([k]) => k.replace('can_', ''))
                        .join(', ') || '없음'}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 19 }}>{title}</h2>
      {children}
    </section>
  )
}

const btn: React.CSSProperties = { minHeight: 48, padding: '0 16px', fontSize: 17, cursor: 'pointer' }
