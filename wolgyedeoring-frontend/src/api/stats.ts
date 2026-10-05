// 사장님 통계 (API.md 6장)
import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { StoreStats } from '../types/db'

export async function getStoreStats(storeId: number, from?: string, to?: string): Promise<StoreStats> {
  const args: Record<string, unknown> = { p_store_id: storeId }
  if (from) args.p_from = from
  if (to) args.p_to = to
  return unwrap(await supabase.rpc('store_stats', args)) as StoreStats
}

/** 미충족 수요 (사장님 계정). accepted_but_not_chosen 은 선착순 이후 항상 0 */
export async function getUnmetDemand(from?: string, to?: string) {
  const args: Record<string, unknown> = {}
  if (from) args.p_from = from
  if (to) args.p_to = to
  return unwrap(await supabase.rpc('unmet_demand_stats', args)) as {
    total_unmet: number; no_store_accepted: number; accepted_but_not_chosen: number
    by_event: { event_type: string; count: number; avg_headcount: number; avg_budget: number }[]
    by_size: { size: string; count: number }[]
    by_week: { week_start: string; count: number }[]
  }
}
