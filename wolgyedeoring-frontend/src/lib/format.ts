// 표시 형식 (state-definitions.md 8장: 모든 시각은 KST, `10/13(월) 19:00`)

const KST = 'Asia/Seoul'
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function kstParts(iso: string) {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const dow = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`).getUTCDay()
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour') === '24' ? '00' : get('hour'), mm: get('minute'), dow }
}

/** 10/13(월) 19:00 */
export function formatDateTime(iso: string): string {
  const p = kstParts(iso)
  return `${Number(p.m)}/${Number(p.d)}(${WEEKDAY[p.dow]}) ${p.hh}:${p.mm}`
}

/** 10/13(월) */
export function formatDate(iso: string): string {
  const p = kstParts(iso)
  return `${Number(p.m)}/${Number(p.d)}(${WEEKDAY[p.dow]})`
}

/** 50,000원 */
export function formatWon(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  return `${n.toLocaleString('ko-KR')}원`
}

/** 남은 시간: "11시간 20분", 지났으면 null */
export function timeLeft(iso: string, now = Date.now()): { text: string; hours: number } | null {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return null
  const min = Math.floor(ms / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  const text = h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`
  return { text, hours: ms / 3600000 }
}

/** <input type="datetime-local"> 값(KST 기준) → ISO (+09:00) */
export function localInputToIso(value: string): string {
  // value: "2026-10-14T18:30"
  return `${value}:00+09:00`
}

/** 10월 14일(수) — 시안 표기 */
export function dateLabel(iso: string): string {
  const p = kstParts(iso)
  return `${Number(p.m)}월 ${Number(p.d)}일(${WEEKDAY[p.dow]})`
}
/** 오후 6:30 — 시안 표기 */
export function timeLabel(iso: string): string {
  const p = kstParts(iso)
  const h = Number(p.hh)
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${p.mm}`
}
/** 10월 14일(수) · 오후 6:30 */
export function dateTimeLabel(iso: string): string {
  return `${dateLabel(iso)} · ${timeLabel(iso)}`
}
/** YYYY-MM-DD (KST) */
export function kstDay(iso: string | Date): string {
  const p = kstParts(typeof iso === 'string' ? iso : iso.toISOString())
  return `${p.y}-${p.m}-${p.d}`
}
/** 'YYYY-MM-DD' → 10월 14일(수) */
export function dayLabel(day: string): string {
  return dateLabel(`${day}T12:00:00+09:00`)
}
/** 'HH:MM' → 오후 6:30 */
export function hmLabel(hm: string): string {
  const [h, m] = hm.split(':').map(Number)
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`
}
