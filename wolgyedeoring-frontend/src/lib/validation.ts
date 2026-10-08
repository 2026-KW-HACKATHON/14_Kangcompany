/** PostgreSQL int 범위 안의 인원·수량·원 단위 금액. 빈 입력도 0으로 취급하지 않는다. */
export function integerInRange(value: string | number, min = 0, max = 2147483647): boolean {
  if (typeof value === 'string' && !value.trim()) return false
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= min && n <= max
}
