import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { Group, GroupType } from '../types/db'

/** 내 단체 (대표 1명당 보통 1개) */
export async function getMyGroup(leaderId: string): Promise<Group | null> {
  return unwrap(await supabase.from('groups').select('*').eq('leader_id', leaderId).order('id').limit(1).maybeSingle())
}

export async function createGroup(leaderId: string, name: string, groupType: GroupType = 'etc'): Promise<Group> {
  return unwrap(await supabase.from('groups').insert({ leader_id: leaderId, name, group_type: groupType }).select().single())
}

export async function updateGroup(id: number, patch: { name?: string; group_type?: GroupType }): Promise<Group> {
  return unwrap(await supabase.from('groups').update(patch).eq('id', id).select().single())
}
