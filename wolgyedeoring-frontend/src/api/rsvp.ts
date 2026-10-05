// 참석 조사 (API.md 4-1). 구성원 화면은 로그인 없이 /r/:token
import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import type { Rsvp, RsvpPublic, RsvpRespondResult, RsvpResponse } from '../types/db'

/** 공유 링크 (형식은 /r/:token 으로 통일) */
export const rsvpLink = (token: string) => `${location.origin}/r/${token}`

// ---------------- 단체 대표 ----------------

export async function createRsvp(reservationId: number, opts: { deadline?: string; message?: string } = {}) {
  return unwrap(await supabase.rpc('create_rsvp', {
    p_reservation_id: reservationId, p_deadline: opts.deadline ?? null, p_message: opts.message ?? null,
  })) as { rsvp_id: number; token: string; deadline: string; message: string | null }
}

export async function getRsvpForReservation(reservationId: number): Promise<Rsvp | null> {
  return unwrap(await supabase.from('rsvps').select('*').eq('reservation_id', reservationId).maybeSingle())
}

/** 응답 명단 (대표만 조회 가능) */
export async function listRsvpResponses(rsvpId: number): Promise<RsvpResponse[]> {
  return unwrap(await supabase.from('rsvp_responses').select('id, rsvp_id, name, attending, note, created_at, updated_at')
    .eq('rsvp_id', rsvpId).order('created_at')) as RsvpResponse[]
}

export async function deleteRsvpResponse(responseId: number): Promise<number> {
  return unwrap(await supabase.rpc('delete_rsvp_response', { p_response_id: responseId })) as number
}

export async function closeRsvp(reservationId: number) {
  return unwrap(await supabase.rpc('close_rsvp', { p_reservation_id: reservationId })) as { attending_count: number; headcount: number }
}

// ---------------- 구성원 (로그인 없음) ----------------

export async function getRsvpPublic(token: string): Promise<RsvpPublic> {
  return unwrap(await supabase.rpc('get_rsvp_public', { p_token: token })) as RsvpPublic
}

const editKeyStorage = (token: string) => `rsvp-edit-key:${token}`

/** 응답/수정. 처음 응답 때 받은 edit_key 는 이 기기에 저장해 두었다가 수정 때 자동으로 보냄 */
export async function respondRsvp(token: string, name: string, attending: boolean, note?: string): Promise<RsvpRespondResult> {
  const saved = localStorage.getItem(editKeyStorage(token))
  const res = unwrap(await supabase.rpc('respond_rsvp', {
    p_token: token, p_name: name, p_attending: attending, p_note: note ?? null, p_edit_key: saved,
  })) as RsvpRespondResult
  localStorage.setItem(editKeyStorage(token), res.edit_key)
  return res
}
