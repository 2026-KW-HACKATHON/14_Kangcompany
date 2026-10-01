-- =====================================================================
-- 월계더링 006: 참석 조사 (RSVP)
-- 001~005 실행 후 SQL Editor 에서 실행
--
-- 흐름
--  1) [단체 대표·앱] rpc('create_rsvp') → token 발급 → 링크 공유  https://<참석조사페이지>/?t=<token>
--  2) [구성원·웹, 로그인 없음] rpc('get_rsvp_public'), rpc('respond_rsvp')
--  3) 참석 응답 수 → reservations.headcount 자동 반영 (정원 초과 참석은 거절)
--  4) [단체 대표] rpc('close_rsvp') → 사장님에게 최종 인원 알림
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table public.rsvps (
  id              bigint generated always as identity primary key,
  reservation_id  bigint not null unique references public.reservations(id) on delete cascade,
  token           text   not null unique,              -- 링크용 추측 불가 문자열
  message         text   check (length(message) <= 300),
  deadline        timestamptz not null,
  is_closed       boolean not null default false,
  closed_at       timestamptz,
  created_at      timestamptz not null default now()
);

create table public.rsvp_responses (
  id              bigint generated always as identity primary key,
  rsvp_id         bigint not null references public.rsvps(id) on delete cascade,
  name            text   not null check (length(name) between 1 and 20),
  name_key        text   generated always as (lower(regexp_replace(name, '\s', '', 'g'))) stored,
  attending       boolean not null,
  note            text   check (length(note) <= 100),
  edit_key_hash   text   not null,                     -- 응답 수정용 키의 해시 (원문은 응답자 기기에만)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (rsvp_id, name_key)
);
create index idx_rsvp_responses_rsvp on public.rsvp_responses(rsvp_id, attending);

create trigger trg_rsvp_responses_updated_at
before update on public.rsvp_responses
for each row execute function public.set_updated_at();

alter table public.rsvps          enable row level security;
alter table public.rsvp_responses enable row level security;

-- 조사 정보: 예약 당사자(대표·사장님) 조회
create policy rsvps_party_read on public.rsvps
  for select to authenticated using (public.is_reservation_party(reservation_id));

-- 응답 명단(이름): 단체 대표만 조회. 사장님은 인원수만 (예약 headcount)
create policy rsvp_responses_leader_read on public.rsvp_responses
  for select to authenticated
  using (exists (
    select 1 from public.rsvps v join public.reservations r on r.id = v.reservation_id
     where v.id = rsvp_id and public.is_group_leader(r.group_id)
  ));

-- 대표 앱에서 응답을 실시간으로 보기 위해 Realtime 등록
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rsvp_responses;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. 내부 함수
-- ---------------------------------------------------------------------
-- 예약 정원: 슬롯 예약이면 슬롯 수용 인원, 아니면 가게 최대 인원
create or replace function public._reservation_capacity(p_res public.reservations)
returns int
language sql stable security definer set search_path = public
as $$
  select case when p_res.slot_id is not null
              then (select capacity from public.slots where id = p_res.slot_id)
              else (select max_capacity from public.stores where id = p_res.store_id) end;
$$;

-- 조사가 응답을 받을 수 있는 상태인지
create or replace function public._rsvp_open(p_rsvp public.rsvps, p_res public.reservations)
returns boolean
language sql stable
as $$
  select not p_rsvp.is_closed
     and now() < p_rsvp.deadline
     and p_res.status in ('awaiting_payment', 'confirmed');
$$;

-- 참석 인원 → 예약 인원 반영 (0명이면 기존 인원 유지: headcount 는 1 이상이어야 함)
create or replace function public._apply_rsvp_headcount(p_rsvp_id bigint)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_cnt int; v_res_id bigint;
begin
  select reservation_id into v_res_id from public.rsvps where id = p_rsvp_id;
  select count(*) into v_cnt from public.rsvp_responses where rsvp_id = p_rsvp_id and attending;
  if v_cnt > 0 then
    update public.reservations set headcount = v_cnt
     where id = v_res_id and headcount <> v_cnt and status in ('awaiting_payment', 'confirmed');
  end if;
  return v_cnt;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. [단체 대표] 참석 조사 만들기 (이미 있으면 그 조사를 반환, 마감된 조사는 다시 열기)
--    p_deadline 기본값: 행사 24시간 전 (이미 지났으면 행사 시작 시각)
-- ---------------------------------------------------------------------
create or replace function public.create_rsvp(
  p_reservation_id bigint,
  p_deadline       timestamptz default null,
  p_message        text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res  public.reservations;
  v_rsvp public.rsvps;
  v_dl   timestamptz;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  if v_res.status not in ('awaiting_payment', 'confirmed') then
    raise exception '진행 중인 예약에서만 참석 조사를 할 수 있습니다 (현재: %)', v_res.status;
  end if;
  if v_res.start_at <= now() then
    raise exception '이미 시작한 행사입니다';
  end if;

  v_dl := coalesce(p_deadline,
                   case when v_res.start_at - interval '24 hours' > now()
                        then v_res.start_at - interval '24 hours' else v_res.start_at end);
  if v_dl <= now() or v_dl > v_res.start_at then
    raise exception '마감 시각은 지금 이후, 행사 시작 전이어야 합니다';
  end if;

  select * into v_rsvp from public.rsvps where reservation_id = v_res.id;
  if found then
    update public.rsvps
       set deadline = v_dl, is_closed = false, closed_at = null,
           message = coalesce(p_message, message)
     where id = v_rsvp.id returning * into v_rsvp;
  else
    insert into public.rsvps (reservation_id, token, message, deadline)
    values (v_res.id, replace(gen_random_uuid()::text, '-', ''), p_message, v_dl)
    returning * into v_rsvp;
  end if;

  return jsonb_build_object('rsvp_id', v_rsvp.id, 'token', v_rsvp.token,
                            'deadline', v_rsvp.deadline, 'message', v_rsvp.message);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. [구성원, 로그인 없음] 조사 정보 보기 — 이름 명단은 주지 않음
-- ---------------------------------------------------------------------
create or replace function public.get_rsvp_public(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rsvp public.rsvps;
  v_res  public.reservations;
  v_att  int;
  v_cap  int;
begin
  select * into v_rsvp from public.rsvps where token = p_token;
  if not found then
    raise exception '참석 조사를 찾을 수 없습니다. 링크를 확인하세요';
  end if;
  select * into v_res from public.reservations where id = v_rsvp.reservation_id;
  select count(*) into v_att from public.rsvp_responses where rsvp_id = v_rsvp.id and attending;
  v_cap := public._reservation_capacity(v_res);

  return jsonb_build_object(
    'group_name',  (select name from public.groups where id = v_res.group_id),
    'store_name',  (select name from public.stores where id = v_res.store_id),
    'store_address', (select address from public.stores where id = v_res.store_id),
    'event_label', public._event_label(v_res.event_type),
    'start_at',    v_res.start_at,
    'message',     v_rsvp.message,
    'deadline',    v_rsvp.deadline,
    'is_open',     public._rsvp_open(v_rsvp, v_res),
    'cancelled',   v_res.status = 'cancelled',
    'attending',   v_att,
    'capacity',    v_cap,
    'full',        v_att >= v_cap
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 5. [구성원, 로그인 없음] 응답 / 수정
--    처음 응답: p_edit_key 없이 호출 → 반환된 edit_key 를 기기에 저장
--    수정: 같은 이름 + 저장해 둔 edit_key 로 다시 호출
-- ---------------------------------------------------------------------
create or replace function public.respond_rsvp(
  p_token     text,
  p_name      text,
  p_attending boolean,
  p_note      text default null,
  p_edit_key  text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rsvp  public.rsvps;
  v_res   public.reservations;
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_key   text;
  v_prev  public.rsvp_responses;
  v_att   int;
  v_cap   int;
  v_mode  text;
begin
  select * into v_rsvp from public.rsvps where token = p_token;
  if not found then
    raise exception '참석 조사를 찾을 수 없습니다. 링크를 확인하세요';
  end if;
  -- 같은 예약의 동시 응답을 줄 세움 (정원 계산 정확도)
  select * into v_res from public.reservations where id = v_rsvp.reservation_id for update;

  if not public._rsvp_open(v_rsvp, v_res) then
    raise exception '응답이 마감되었습니다';
  end if;
  if length(v_name) < 1 or length(v_name) > 20 then
    raise exception '이름은 1~20자로 입력하세요';
  end if;
  if p_attending is null then
    raise exception '참석 여부를 선택하세요';
  end if;
  if p_note is not null and length(p_note) > 100 then
    raise exception '메모는 100자까지 입력할 수 있습니다';
  end if;

  select * into v_prev from public.rsvp_responses
   where rsvp_id = v_rsvp.id and name_key = lower(regexp_replace(v_name, '\s', '', 'g'));

  if v_prev.id is not null then
    if p_edit_key is null or md5(p_edit_key) <> v_prev.edit_key_hash then
      raise exception '이미 같은 이름으로 응답했습니다. 처음 응답한 기기에서 수정하거나, 이름을 구분해서 입력하세요 (예: 홍길동B)';
    end if;
  end if;

  -- 정원: 새로 참석으로 바뀌는 경우만 검사
  if p_attending and coalesce(v_prev.attending, false) = false then
    select count(*) into v_att from public.rsvp_responses where rsvp_id = v_rsvp.id and attending;
    v_cap := public._reservation_capacity(v_res);
    if v_att + 1 > v_cap then
      raise exception '정원(%명)이 찼습니다. 단체 대표에게 문의하세요', v_cap;
    end if;
  end if;

  if v_prev.id is null then
    v_key := replace(gen_random_uuid()::text, '-', '');
    insert into public.rsvp_responses (rsvp_id, name, attending, note, edit_key_hash)
    values (v_rsvp.id, v_name, p_attending, nullif(btrim(p_note), ''), md5(v_key));
    v_mode := 'created';
  else
    v_key := p_edit_key;
    update public.rsvp_responses
       set attending = p_attending, note = nullif(btrim(p_note), ''), name = v_name
     where id = v_prev.id;
    v_mode := 'updated';
  end if;

  v_att := public._apply_rsvp_headcount(v_rsvp.id);

  return jsonb_build_object('result', v_mode, 'name', v_name, 'attending', p_attending,
                            'edit_key', v_key, 'attending_count', v_att);
end;
$$;


-- ---------------------------------------------------------------------
-- 6. [단체 대표] 응답 삭제 (장난 응답 등) / 마감
-- ---------------------------------------------------------------------
create or replace function public.delete_rsvp_response(p_response_id bigint)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_rsvp_id bigint; v_group bigint;
begin
  select r.rsvp_id, res.group_id into v_rsvp_id, v_group
    from public.rsvp_responses r
    join public.rsvps v on v.id = r.rsvp_id
    join public.reservations res on res.id = v.reservation_id
   where r.id = p_response_id;
  if v_rsvp_id is null or not public.is_group_leader(v_group) then
    raise exception '본인 단체의 참석 조사 응답이 아닙니다' using errcode = '42501';
  end if;
  perform 1 from public.reservations where id = (select reservation_id from public.rsvps where id = v_rsvp_id) for update;
  delete from public.rsvp_responses where id = p_response_id;
  return public._apply_rsvp_headcount(v_rsvp_id);
end;
$$;

create or replace function public.close_rsvp(p_reservation_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res  public.reservations;
  v_rsvp public.rsvps;
  v_att  int;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  select * into v_rsvp from public.rsvps where reservation_id = v_res.id;
  if not found then
    raise exception '참석 조사가 없습니다';
  end if;

  update public.rsvps set is_closed = true, closed_at = now() where id = v_rsvp.id;
  v_att := public._apply_rsvp_headcount(v_rsvp.id);
  select headcount into v_res.headcount from public.reservations where id = v_res.id;

  perform public._notify(
    (select owner_id from public.stores where id = v_res.store_id),
    'rsvp_closed', '참석 인원이 확정되었습니다',
    (select name from public.groups where id = v_res.group_id) || ' · ' || public._kst(v_res.start_at)
      || format(' · %s명', v_res.headcount),
    null, v_res.id);

  return jsonb_build_object('attending_count', v_att, 'headcount', v_res.headcount);
end;
$$;


-- ---------------------------------------------------------------------
-- 7. 권한: 조사 보기·응답은 비로그인(anon)도 가능 (토큰을 아는 사람만)
-- ---------------------------------------------------------------------
revoke execute on function
  public._reservation_capacity(public.reservations),
  public._apply_rsvp_headcount(bigint),
  public.create_rsvp(bigint, timestamptz, text),
  public.get_rsvp_public(text),
  public.respond_rsvp(text, text, boolean, text, text),
  public.delete_rsvp_response(bigint),
  public.close_rsvp(bigint)
from public, anon;

revoke execute on function
  public._reservation_capacity(public.reservations),
  public._apply_rsvp_headcount(bigint)
from authenticated;

grant execute on function
  public.get_rsvp_public(text),
  public.respond_rsvp(text, text, boolean, text, text)
to anon, authenticated;

grant execute on function
  public.create_rsvp(bigint, timestamptz, text),
  public.delete_rsvp_response(bigint),
  public.close_rsvp(bigint)
to authenticated;
