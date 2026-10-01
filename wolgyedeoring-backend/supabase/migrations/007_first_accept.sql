-- =====================================================================
-- 월계더링 007: PRD 반영 — 선착순 확정, 가게 응답 기한, 동시간대 제한
-- 001~006 실행 후 SQL Editor 에서 실행
--
-- PRD 변경 요지 (요구사항 2, 정책 '예약금 및 취소 처리')
--  - 여러 가게가 수락 → 단체가 선택  ❌ 더 이상 없음
--  - 가장 먼저 수락한 가게로 즉시 확정 (선착순). 이후 수락은 받지 않음 ✅
--  - 가게 응답 기한: 행사까지 3~7일 → 12시간, 7일 초과 → 24시간
--    (3일 미만은 PRD에 명시 없음. 더 임박한 만큼 더 짧은 기한이 자연스러워
--     12시간으로 처리. 실제 정책이 정해지면 숫자만 바꾸면 됨)
--  - 기한 내 수락 없으면 요청 자동 종료 (기존 expire_old_requests 재사용)
--  - 가게는 같은 시간대 확정+결제대기 합산 인원이 수용 인원을 넘으면 수락 불가
--  - 단체는 행사 24시간 이내면 동시간대 다른 가게에 새 요청을 낼 수 없다
--  - 단체는 행사 24시간 전까지만 예약 날짜·인원 수정 가능 (기존 1회 제한 유지)
--
-- 이 마이그레이션은 choose_response / choose_response_with_menu 를 삭제한다:
-- 수락 즉시 예약이 만들어지므로 단체가 "고르는" 단계 자체가 없어진다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 요청에 응답 기한 추가 (생성 시 자동 계산)
-- ---------------------------------------------------------------------
alter table public.requests
  add column if not exists response_deadline timestamptz;

-- 같은 단체가 24시간 이내로 임박한 시간대에 이미 다른 건(요청·예약)을
-- 진행 중이면 새 요청을 막는다. desired_at 이 24시간보다 먼 경우는 제한 없음
create or replace function public._requests_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_hours_left numeric;
  v_conflict   boolean;
begin
  v_hours_left := extract(epoch from (new.desired_at - now())) / 3600;

  -- 가게 응답 기한: 7일 초과 남았으면 24시간, 그 이하(3~7일 및 그 미만)면 12시간
  new.response_deadline := now() + case
    when new.desired_at - now() > interval '7 days' then interval '24 hours'
    else interval '12 hours'
  end;
  -- 응답 기한이 행사 시작보다 늦을 수는 없다 (너무 임박한 요청 보정)
  if new.response_deadline > new.desired_at then
    new.response_deadline := new.desired_at;
  end if;

  if v_hours_left <= 24 then
    select exists (
      select 1 from public.requests
       where group_id = new.group_id and status = 'open' and desired_at = new.desired_at
      union all
      select 1 from public.reservations
       where group_id = new.group_id and start_at = new.desired_at
         and status in ('awaiting_payment', 'confirmed')
    ) into v_conflict;
    if v_conflict then
      raise exception '행사 24시간 이내에는 같은 시간대에 다른 가게 예약을 진행할 수 없습니다';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_requests_before_insert on public.requests;
create trigger trg_requests_before_insert
before insert on public.requests
for each row execute function public._requests_before_insert();


-- ---------------------------------------------------------------------
-- 2. 가게의 같은 시간대 합산 인원 (수락 가능 여부 판단용)
-- ---------------------------------------------------------------------
create or replace function public._store_committed_headcount(p_store_id bigint, p_start_at timestamptz)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(headcount), 0)::int
    from public.reservations
   where store_id = p_store_id and start_at = p_start_at
     and status in ('awaiting_payment', 'confirmed');
$$;


-- ---------------------------------------------------------------------
-- 3. 요청 응답 재작성: 수락 = 즉시 확정 (선착순)
--    같은 요청에 대한 동시 수락은 요청 행 잠금(for update)으로 한 건만 통과한다
-- ---------------------------------------------------------------------
create or replace function public.respond_to_request(
  p_request_id     bigint,
  p_store_id       bigint,
  p_accept         boolean,
  p_deposit_amount int default 0
)
returns public.request_responses
language plpgsql security definer set search_path = public
as $$
declare
  v_req     public.requests;
  v_resp    public.request_responses;
  v_cap     int;
  v_committed int;
  v_res     public.reservations;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.status <> 'open' then
    raise exception '이미 마감되었거나 없는 요청입니다';
  end if;

  if not p_accept then
    insert into public.request_responses (request_id, store_id, status, deposit_amount)
    values (p_request_id, p_store_id, 'declined', null)
    on conflict (request_id, store_id) do update set status = 'declined', deposit_amount = null
    returning * into v_resp;
    return v_resp;
  end if;

  -- 이 시점 이후는 수락(확정) 처리. 응답 기한이 지났으면 거절
  if now() > v_req.response_deadline then
    raise exception '응답 기한이 지났습니다 (마감: %)', v_req.response_deadline;
  end if;

  select max_capacity into v_cap from public.stores where id = p_store_id;
  if v_req.headcount > v_cap then
    raise exception '가게 최대 인원(%)을 초과한 요청입니다', v_cap;
  end if;

  v_committed := public._store_committed_headcount(p_store_id, v_req.desired_at);
  if v_committed + v_req.headcount > v_cap then
    raise exception '해당 시간대 수용 인원을 초과합니다 (이미 %명 예정, 최대 %명)', v_committed, v_cap;
  end if;

  -- 선착순 확정: 응답 기록 + 예약 생성 + 요청 마감을 한 번에
  insert into public.request_responses (request_id, store_id, status, deposit_amount)
  values (p_request_id, p_store_id, 'accepted', greatest(p_deposit_amount, 0))
  on conflict (request_id, store_id) do update
    set status = 'accepted', deposit_amount = greatest(p_deposit_amount, 0)
  returning * into v_resp;

  insert into public.reservations
    (group_id, store_id, source, request_id, event_type, start_at,
     headcount, budget_per_person, deposit_amount, status)
  values
    (v_req.group_id, p_store_id, 'request', v_req.id, v_req.event_type, v_req.desired_at,
     v_req.headcount, v_req.budget_per_person, greatest(p_deposit_amount, 0), 'awaiting_payment')
  returning * into v_res;

  update public.requests set status = 'confirmed' where id = v_req.id;

  -- 단체에게 확정 알림 (이미 있는 request_accepted 알림과 별개로, 바로 이 예약을 가리킴)
  perform public._notify(
    (select leader_id from public.groups where id = v_req.group_id),
    'reservation_new', '예약이 확정되었습니다 (결제 대기)',
    (select name from public.stores where id = p_store_id) || ' · ' || public._kst(v_req.desired_at),
    null, v_res.id);

  -- 같은 요청을 받을 수 있었던 다른 가게들에 마감 알림
  insert into public.notifications (user_id, type, title, body, request_id)
  select s.owner_id, 'request_closed', '다른 가게가 먼저 수락해 요청이 마감되었습니다',
         format('%s · %s명', public._event_label(v_req.event_type), v_req.headcount), v_req.id
    from public.stores s
   where s.max_capacity >= v_req.headcount and s.id <> p_store_id;

  return v_resp;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. 자동 만료: desired_at+flexible_days 대신 response_deadline 기준
-- ---------------------------------------------------------------------
create or replace function public.expire_old_requests()
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.requests set status = 'expired'
   where status = 'open' and response_deadline < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. 조건 수정: 행사 24시간 전까지만 (기존 1회 제한은 유지)
-- ---------------------------------------------------------------------
create or replace function public.request_modification(
  p_reservation_id bigint,
  p_start_at       timestamptz default null,
  p_headcount      int default null,
  p_note           text default null
)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  if v_res.status <> 'awaiting_payment' then
    raise exception '결제 전에만 조건 수정을 요청할 수 있습니다';
  end if;
  if v_res.start_at - now() < interval '24 hours' then
    raise exception '행사 24시간 전까지만 수정할 수 있습니다';
  end if;
  if v_res.modify_request_used then
    raise exception '조건 수정 요청은 1회만 가능합니다';
  end if;
  if p_start_at is null and p_headcount is null then
    raise exception '바꿀 날짜 또는 인원을 입력하세요';
  end if;
  if v_res.source = 'slot' and p_start_at is not null then
    raise exception '가게가 연 날짜로 잡은 예약은 날짜를 바꿀 수 없습니다. 취소 후 다른 날짜를 선택하세요';
  end if;

  update public.reservations
     set modify_request_used = true, modify_status = 'pending',
         modify_start_at = coalesce(p_start_at, start_at),
         modify_headcount = coalesce(p_headcount, headcount),
         modify_note = p_note
   where id = v_res.id
  returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 더 이상 쓰지 않는 "단체가 고르기" 함수 제거
--    (수락 = 즉시 확정이라 고르는 단계가 없어짐)
-- ---------------------------------------------------------------------
drop function if exists public.choose_response(bigint);
drop function if exists public.choose_response_with_menu(bigint, jsonb);


-- ---------------------------------------------------------------------
-- 7. 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public._requests_before_insert(),
  public._store_committed_headcount(bigint, timestamptz)
from public, anon, authenticated;
