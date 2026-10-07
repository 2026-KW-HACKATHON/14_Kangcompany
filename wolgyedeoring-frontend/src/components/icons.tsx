// 아이콘·일러스트 (docs/ui-handoff/full-ui/app.js icon()·art(), approved-a2.html mini-art, design/icon-depth.js 이식)
import { useId } from 'react'

const PATHS = {
  back: 'm14 5-7 7 7 7', chevron: 'm9 5 7 7-7 7', close: 'm6 6 12 12M18 6 6 18', check: 'm5 12 4 4 10-10',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', info: 'M12 11v6M12 7h.01',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7', calendar: 'M3 6h18v15H3zM7 3v6M17 3v6M3 11h18', clock: 'M12 6v6l4 2',
  bell: 'M18 8a6 6 0 0 0-12 0v6l-2 3h16l-2-3zM10 21h4', gathering: 'M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6',
  store: 'M3 8h18l-2-5H5zM5 9v12h14V9M10 21v-6h4v6', food: 'M5 3v7M8 3v7M2 3v7h6M5 10v11M18 3c-4 4-4 8 0 8V3v18',
  chart: 'M4 21V11M10 21V4M16 21v-7M22 21V8', receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2zM8 7h8M8 11h8M8 15h5',
  link: 'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  search: 'm16 16 5 5', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 5l2-2 3 2h6l3-2 2 2-2 3v8l2 3-2 2-3-2H9l-3 2-2-2 2-3V8z',
  send: 'm3 3 19 9-19 9 4-9zM7 12h15',
} as const
export type IconName = keyof typeof PATHS

export function Icon({ name, className = 'icon' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {(name === 'info' || name === 'clock') && <circle cx="12" cy="12" r="9" />}
      {name === 'gathering' && <circle cx="9" cy="8" r="3" />}
      {name === 'search' && <circle cx="10" cy="10" r="7" />}
      <path d={PATHS[name]} />
    </svg>
  )
}

// 일러스트 (96×96). art-main/back/muted 는 icon-depth 그라데이션을 입힌다
const ART: Record<string, string> = {
  gathering: '<path d="M20 68c0-12 10-19 23-19s23 7 23 19v7H20z" class="art-back"/><circle cx="43" cy="34" r="14" class="art-back"/><path d="M36 73c0-12 9-19 21-19s21 7 21 19v5H36z" class="art-main"/><circle cx="57" cy="40" r="13" class="art-main"/><path d="M48 33c3-5 8-6 12-4M43 65c4-5 9-7 15-7" class="art-line"/>',
  store: '<rect x="22" y="36" width="53" height="40" rx="7" class="art-muted"/><path d="M19 37h59l-7-16H26zM24 40v8c0 8 10 8 10 0 0 8 11 8 11 0 0 8 11 8 11 0 0 8 11 8 11 0 0 8 10 8 10 0v-8" class="art-main"/><rect x="32" y="56" width="14" height="20" rx="3" class="art-back"/><rect x="53" y="56" width="14" height="12" rx="3" class="art-white"/>',
  calendar: '<rect x="20" y="24" width="56" height="52" rx="13" class="art-muted"/><path d="M20 39h56V34c0-7-4-10-11-10H31c-7 0-11 3-11 10z" class="art-main"/><path d="M34 17v13M62 17v13" class="art-dark"/><path d="m34 57 9 9 20-22" class="art-dark"/>',
  send: '<path d="m14 40 67-20-24 59-13-24z" class="art-main"/><path d="m44 55 27-25" class="art-line"/><path d="m30 63-9 7M23 55l-9 1" class="art-dark"/>',
  check: '<rect x="18" y="23" width="60" height="52" rx="18" class="art-muted"/><circle cx="49" cy="43" r="24" class="art-main"/><path d="m36 43 9 9 18-19" class="art-line"/>',
  receipt: '<path d="M27 15h42v64l-10-6-11 6-10-6-11 6z" class="art-muted"/><path d="M35 30h26M35 42h26M35 54h15" class="art-dark"/><circle cx="70" cy="66" r="15" class="art-main"/><path d="m63 66 5 5 9-11" class="art-line"/>',
  food: '<ellipse cx="48" cy="55" rx="34" ry="20" class="art-muted"/><ellipse cx="48" cy="51" rx="29" ry="15" class="art-white"/><path d="m27 45 17-8 13 8-17 10z" class="art-main"/><path d="m43 51 14-6 13 8-15 9z" class="art-back"/><path d="M36 15c-8 7 8 10 0 18M55 12c-8 7 8 10 0 18" class="art-dark"/>',
  cup: '<path d="M24 29h41v31c0 21-41 21-41 0z" class="art-main"/><path d="M66 35h7c18 0 14 26-7 26" class="art-dark"/><path d="M36 15v8M53 13v10" class="art-dark"/><path d="M28 74h44" class="art-dark"/>',
  chart: '<rect x="21" y="46" width="13" height="28" rx="5" class="art-back"/><rect x="42" y="27" width="13" height="47" rx="5" class="art-main"/><rect x="63" y="38" width="13" height="36" rx="5" class="art-back"/>',
  link: '<rect x="16" y="26" width="42" height="23" rx="11" transform="rotate(-30 37 37)" class="art-main"/><rect x="40" y="44" width="42" height="23" rx="11" transform="rotate(-30 61 55)" class="art-back"/><path d="m35 55 27-18" class="art-line"/>',
  // A2 mini-art
  m_gathering: '<path d="M20 68c0-12 10-19 23-19s23 7 23 19v7H20z" class="art-back"/><circle cx="43" cy="34" r="14" class="art-back"/><path d="M36 73c0-12 9-19 21-19s21 7 21 19v5H36z" class="art-main"/><circle cx="57" cy="40" r="13" class="art-main"/><path d="M48 33c3-5 8-6 12-4" class="art-light-line"/><path d="M43 65c4-5 9-7 15-7" class="art-light-line"/>',
  m_cheers: '<path d="m18 23 27 5-6 24c-3 9-14 9-18 1z" class="art-back"/><path d="m50 27 27-5-3 31c-4 9-15 9-18 0z" class="art-main"/><path d="m27 62-2 12-10-2M66 62l2 12 10-2" class="art-dark-line"/><path d="m24 32 15 3M56 35l15-3" class="art-light-line"/><path d="M48 11v7M38 15l4 6M57 15l-4 6" class="art-accent-line"/>',
  m_celebration: '<path d="m26 73 9-41 30 29z" class="art-main"/><path d="m29 59 27 10M32 46l18 19" class="art-light-line"/><path d="M55 16c-9 7 4 14-5 21M75 35c-7-3-9 8-18 3M33 14l2 9M74 15l-7 8" class="art-accent-line"/><circle cx="68" cy="51" r="5" class="art-back"/><circle cx="23" cy="29" r="4" class="art-main"/>',
  m_snack: '<path d="m24 43 24-13 24 13-24 14z" class="art-main"/><path d="m24 43 24 14v22L24 64z" class="art-back"/><path d="m48 57 24-14v21L48 79z" class="art-main"/><path d="M48 33v19M34 38l25 15" class="art-light-line"/><path d="m61 27 7-11M75 35l10-3M28 30l-7-9" class="art-accent-line"/>',
  m_other: '<rect x="20" y="24" width="56" height="50" rx="19" class="art-main"/><path d="m29 67-6 14 20-8" class="art-main"/><circle cx="34" cy="48" r="4" class="art-white"/><circle cx="48" cy="48" r="4" class="art-white"/><circle cx="62" cy="48" r="4" class="art-white"/>',
  m_card: '<rect x="18" y="31" width="61" height="44" rx="12" class="art-main"/><path d="M18 43h61" class="art-light-line"/><rect x="27" y="54" width="16" height="10" rx="3" class="art-white"/><circle cx="66" cy="26" r="17" class="art-back"/><path d="m58 26 5 5 10-11" class="art-light-line"/>',
  m_store: '<rect x="22" y="36" width="53" height="40" rx="7" class="art-muted"/><path d="M19 37h59l-7-16H26z" class="art-main"/><path d="M24 40v8c0 8 10 8 10 0 0 8 11 8 11 0 0 8 11 8 11 0 0 8 11 8 11 0 0 8 10 8 10 0v-8" class="art-main"/><rect x="32" y="56" width="14" height="20" rx="3" class="art-back"/><rect x="53" y="56" width="14" height="12" rx="3" class="art-white"/>',
}
export type ArtName = 'gathering' | 'store' | 'calendar' | 'send' | 'check' | 'receipt' | 'food' | 'cup' | 'chart' | 'link'
export type MiniArtName = 'gathering' | 'cheers' | 'celebration' | 'snack' | 'other' | 'card' | 'store'

function DepthSvg({ className, body, shadowY }: { className: string; body: string; shadowY: number }) {
  const id = `wd${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const grads: [string, string, string][] = [['main', '--icon-main-top', '--icon-main-bottom'], ['back', '--icon-back-top', '--icon-back-bottom'], ['muted', '--icon-muted-top', '--icon-muted-bottom']]
  const style = Object.fromEntries(grads.map(([n]) => [`--icon-${n}-paint`, `url(#${id}-${n})`])) as React.CSSProperties
  return (
    <svg className={className} viewBox="0 0 96 96" aria-hidden="true" data-depth-icon="ready" style={style}>
      <defs>
        {grads.map(([n, top, bottom]) => (
          <linearGradient key={n} id={`${id}-${n}`} x1="15%" y1="0%" x2="75%" y2="100%">
            <stop offset="0%" style={{ stopColor: `var(${top})` }} />
            <stop offset="100%" style={{ stopColor: `var(${bottom})` }} />
          </linearGradient>
        ))}
      </defs>
      <ellipse cx="48" cy={shadowY} rx="31" ry={shadowY === 80 ? 6 : 7} className="art-shadow" />
      <g dangerouslySetInnerHTML={{ __html: body }} />
    </svg>
  )
}

export function Art({ name }: { name: ArtName }) {
  return <DepthSvg className="art" body={ART[name] ?? ART.calendar} shadowY={80} />
}
export function MiniArt({ name }: { name: MiniArtName }) {
  return <DepthSvg className="mini-art" body={ART[`m_${name}`] ?? ART.m_other} shadowY={78} />
}
