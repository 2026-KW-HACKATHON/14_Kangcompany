import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { Group, GroupType } from '../types/db'

/** 011 단체 추가 정보. 비운 칸은 보내지 않는다 (011 실행 전 DB 에서도 동작하도록) */
export type GroupExtra = Partial<Pick<Group, 'affiliation' | 'region' | 'usual_size' | 'description'>>
const filled = (x: GroupExtra) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null && v !== undefined && v !== ''))

/** 내 단체 (대표 1명당 보통 1개) */
export async function getMyGroup(leaderId: string): Promise<Group | null> {
  return unwrap(await supabase.from('groups').select('*').eq('leader_id', leaderId).order('id').limit(1).maybeSingle())
}

export async function createGroup(leaderId: string, name: string, groupType: GroupType = 'etc', extra: GroupExtra = {}): Promise<Group> {
  return unwrap(await supabase.from('groups').insert({ leader_id: leaderId, name, group_type: groupType, ...filled(extra) }).select().single())
}

/** extra 는 원래 값이 있던 칸이면 비워도 보낸다 (지우기) */
export async function updateGroup(id: number, patch: { name?: string; group_type?: GroupType } & GroupExtra): Promise<Group> {
  return unwrap(await supabase.from('groups').update(patch).eq('id', id).select().single())
}
