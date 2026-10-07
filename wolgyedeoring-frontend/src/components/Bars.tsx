// 간단한 가로 막대 (차트 라이브러리 없이). 색만으로 구분하지 않도록 숫자를 함께 표시
export function Bars({ data }: { data: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="list">
      {data.map((d) => (
        <li key={d.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 8, alignItems: 'center' }}>
          <span className="muted">{d.label}</span>
          <span style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-subtle)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(d.value / max) * 100}%`, background: 'var(--color-brand)' }} />
          </span>
          <span style={{ fontSize: 'var(--text-body2-size)' }}>{d.text}</span>
        </li>
      ))}
    </ul>
  )
}
