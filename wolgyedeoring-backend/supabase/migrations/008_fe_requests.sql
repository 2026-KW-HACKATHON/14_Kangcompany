-- =====================================================================
-- 월계더링 008: FE 화면 설계 기반 BE 요청 반영 (#10) + 권한 보강
-- 001~007 실행 후 SQL Editor 에서 실행
--
-- 반영 항목 (이슈 #10 / content-inventory 7장 / state-definitions 10장)
--  B-01  예약 당사자 연락처 조회 (reservation_contacts) + 가입 시 phone 저장
--  B-02  가게 전화번호·대표 사진·한 줄 소개 컬럼 + 사진 저장소(store-photos)
--  B-04  응답 대기 중 요청 철회 (cancel_request)              = R-05
--  B-05  요청 조건을 받을 수 있는 가게 수 (request_reach)
--  B-07① open_requests_for_store 결과에 응답 기한·같은 시간대 남은 자리
--  B-07③ 빈 날짜 닫기: slots 직접 update 허용, 단 열림↔닫힘만
--  B-09  예약별 가능한 행동 플래그 (reservation_actions)       = R-06
--  B-10  가게 좌표(lat, lng) 컬럼 (변환 위치·지도 서비스는 #8 결정 후)
--  R-01  가게 수락 시 단체 알림을 1건으로 통합 + 문구 수정
--  R-03  행사 시작 전에는 완료·노쇼 처리 불가
--
-- 권한 보강 (점검 중 발견)
--  - profiles: 본인이 role 을 바꿀 수 있던 문제 → display_name, phone 만 수정 가능
--  - requests: 단체가 status·response_deadline 등을 직접 바꿀 수 있던 문제
--              → 생성은 입력 컬럼만, 수정은 note 만, 삭제 불가 (철회는 cancel_request)
--  - request_responses: 사장님이 테이블에 직접 'accepted' 를 쓸 수 있던 문제
--              → 쓰기는 respond_to_request 로만
--  - slots: 예약된(booked) 빈 날짜를 직접 수정할 수 있던 문제 → 차단
--
-- 팀 결정 대기라 이번에 바꾸지 않은 것: B-06(flexible_days), B-08(환불 규정 문구),
--  R-02(취소 시간 제한), #2 마감 알림 대상, #3 조건 수정 주체, #6 응답 기한 숫자
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 권한 보강
--    Supabase 는 public 테이블 권한을 authenticated 에 기본 부여하므로
--    컬럼 단위로 다시 준다 (RLS 는 그대로 유지)
-- ---------------------------------------------------------------------
revoke update on public.profiles from authenticated, anon;
grant  update (display_name, phone) on public.profiles to authenticated;

revoke insert, update, delete on public.requests from authenticated, anon;
grant  insert (group_id, event_type, desired_at, flexible_days, headcount, budget_per_person, note)
  on public.requests to authenticated;
grant  update (note) on public.requests to authenticated;

revoke insert, update, delete on public.request_responses from authenticated, anon;

-- 빈 날짜: 앱에서 직접 수정할 때는 열림↔닫힘 전환과 예약 전 정보 수정만 허용
-- (예약 생성·취소에 따른 booked/open 전환은 book_slot·cancel_reservation 이 처리)
create or replace function public._slots_guard_direct_update()
returns trigger
language plpgsql
as $$
begin
  -- security definer 함수 안에서는 current_user 가 함수 소유자이므로 이 검사를 건너뜀
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.status = 'booked' then
    raise exception '예약이 잡힌 날짜는 수정할 수 없습니다. 예약을 먼저 취소하세요';
  end if;
  if new.status = 'booked' then
    raise exception '예약됨 상태는 직접 지정할 수 없습니다';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_slots_guard_direct_update on public.slots;
create trigger trg_slots_guard_direct_update
before update on public.slots
for each row execute function public._slots_guard_direct_update();


-- ---------------------------------------------------------------------
-- 2. 가게 정보 (B-02) · 좌표 (B-10)
-- ---------------------------------------------------------------------
alter table public.stores
  add column if not exists phone     text check (phone is null or phone ~ '^[0-9+\-() ]{7,20}$'),
  add column if not exists photo_url text,
  add column if not exists intro     text check (intro is null or length(intro) <= 60),
  add column if not exists lat       double precision check (lat is null or lat between -90 and 90),
  add column if not exists lng       double precision check (lng is null or lng between -180 and 180);
-- 전화번호·사진은 "필수"(D-05)지만 기존 가게가 있어 DB 에서는 null 허용.
-- 가게 등록 화면(A-05)에서 필수 입력으로 받는다.

-- 대표 사진 저장소: 공개 읽기, 쓰기는 본인 가게 폴더만 ( store-photos/<store_id>/파일명 )
-- 로컬 테스트처럼 storage 스키마가 없으면 건너뜀
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('store-photos', 'store-photos', true)
    on conflict (id) do nothing;

    execute 'drop policy if exists store_photos_owner_insert on storage.objects';
    execute 'drop policy if exists store_photos_owner_update on storage.objects';
    execute 'drop policy if exists store_photos_owner_delete on storage.objects';
    execute $p$create policy store_photos_owner_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'store-photos'
                  and (storage.foldername(name))[1] ~ '^[0-9]+$'
                  and public.is_store_owner(((storage.foldername(name))[1])::bigint))$p$;
    execute $p$create policy store_photos_owner_update on storage.objects
      for update to authenticated
      using (bucket_id = 'store-photos'
             and (storage.foldername(name))[1] ~ '^[0-9]+$'
             and public.is_store_owner(((storage.foldername(name))[1])::bigint))$p$;
    execute $p$create policy store_photos_owner_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'store-photos'
             and (storage.foldername(name))[1] ~ '^[0-9]+$'
             and public.is_store_owner(((storage.foldername(name))[1])::bigint))$p$;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. 가입 시 phone 도 저장 (B-01)
--    signUp options.data 에 { role, display_name, phone } 전달
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'group'),
    coalesce(new.raw_user_meta_data ->> 'display_name', '이름 없음'),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. [단체·사장님] 예약 당사자 연락처 (B-01, D-06)
--    결제 대기·확정·완료·노쇼 예약의 당사자만. 취소된 예약은 공개하지 않음
-- ---------------------------------------------------------------------
create or replace function public.reservation_contacts(p_reservation_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found or not (public.is_group_leader(v_res.group_id) or public.is_store_owner(v_res.store_id)) then
    raise exception '예약 당사자가 아닙니다' using errcode = '42501';
  end if;
  if v_res.status not in ('awaiting_payment', 'confirmed', 'completed', 'no_show') then
    raise exception '연락처는 진행 중이거나 끝난 예약에서만 볼 수 있습니다 (현재: %)', v_res.status;
  end if;

  return (
    select jsonb_build_object(
      'store', jsonb_build_object(
        'name', s.name, 'phone', s.phone, 'address', s.address,
        'owner_name', po.display_name, 'owner_phone', po.phone),
      'group', jsonb_build_object(
        'name', g.name, 'leader_name', pl.display_name, 'leader_phone', pl.phone)
    )
    from public.stores s
    join public.profiles po on po.id = s.owner_id
    join public.groups g    on g.id = v_res.group_id
    join public.profiles pl on pl.id = g.leader_id
    where s.id = v_res.store_id
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 5. [사장님] 받은 요청 목록 재정의 (B-07①)
--    반환 컬럼이 바뀌므로 drop 후 재생성
-- ---------------------------------------------------------------------
drop function if exists public.open_requests_for_store(bigint);

create function public.open_requests_for_store(p_store_id bigint)
returns table (
  request_id bigint, group_name text, group_type text, event_type text,
  desired_at timestamptz, flexible_days int, headcount int, budget_per_person int,
  note text, my_response text, my_deposit int, created_at timestamptz,
  response_deadline timestamptz,   -- 응답 기한 (카운트다운용)
  committed_headcount int,         -- 같은 시간대에 이미 잡힌 인원 (결제 대기+확정)
  remaining_capacity int,          -- 같은 시간대 남은 자리 = 최대 인원 - 잡힌 인원
  can_accept boolean               -- 지금 수락 가능한지 (기한 전 + 남은 자리 충분)
)
language plpgsql security definer set search_path = public
as $$
declare v_cap int;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;
  perform public.expire_old_requests();
  select max_capacity into v_cap from public.stores where id = p_store_id;

  return query
  select q.id, g.name, g.group_type, q.event_type, q.desired_at, q.flexible_days,
         q.headcount, q.budget_per_person, q.note, rr.status, rr.deposit_amount, q.created_at,
         q.response_deadline,
         c.committed,
         v_cap - c.committed,
         (now() <= q.response_deadline and c.committed + q.headcount <= v_cap)
    from public.requests q
    join public.groups g on g.id = q.group_id
    left join public.request_responses rr on rr.request_id = q.id and rr.store_id = p_store_id
    cross join lateral (select public._store_committed_headcount(p_store_id, q.desired_at) as committed) c
   where q.status = 'open'
     and q.headcount <= v_cap
   order by q.response_deadline, q.desired_at;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. [단체] 응답 대기 중 요청 철회 (B-04 / R-05)
--    요청 알림을 받았던 가게들에 마감 알림 (request_closed, S-02 마감 표시와 동일)
-- ---------------------------------------------------------------------
create or replace function public.cancel_request(p_request_id bigint)
returns public.requests
language plpgsql security definer set search_path = public
as $$
declare v_req public.requests;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or not public.is_group_leader(v_req.group_id) then
    raise exception '본인 단체의 요청이 아닙니다' using errcode = '42501';
  end if;
  if v_req.status <> 'open' then
    raise exception '응답 대기 중인 요청만 취소할 수 있습니다 (현재: %)', v_req.status;
  end if;

  update public.requests set status = 'cancelled' where id = v_req.id
  returning * into v_req;

  insert into public.notifications (user_id, type, title, body, request_id)
  select s.owner_id, 'request_closed', '단체가 요청을 취소했습니다',
         format('%s · %s명 · %s', public._event_label(v_req.event_type), v_req.headcount, public._kst(v_req.desired_at)),
         v_req.id
    from public.stores s
   where s.max_capacity >= v_req.headcount;

  return v_req;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. [단체] 요청 조건을 받을 수 있는 가게 수 (B-05)
--    notified : 요청 알림을 받는 가게 수 (최대 인원 >= 인원)  → 제출 후 "N곳에 전달됨"
--    available: 그중 그 시간대에 자리가 남은 가게 수            → 제출 전 미리보기 (일시 입력 시)
-- ---------------------------------------------------------------------
create or replace function public.request_reach(p_headcount int, p_desired_at timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_headcount is null or p_headcount <= 0 then
    raise exception '인원을 입력하세요';
  end if;
  return jsonb_build_object(
    'notified', (select count(*) from public.stores where max_capacity >= p_headcount),
    'available', (select count(*) from public.stores s
                   where s.max_capacity >= p_headcount
                     and (p_desired_at is null
                          or public._store_committed_headcount(s.id, p_desired_at) + p_headcount <= s.max_capacity))
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 8. [단체·사장님] 예약별 가능한 행동 (B-09 / R-06)
--    state-definitions.md 2-1 행동 매트릭스와 같은 규칙. 화면은 이 값으로 버튼을 켜고 끈다
-- ---------------------------------------------------------------------
create or replace function public.reservation_actions(p_reservation_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res     public.reservations;
  v_leader  boolean;
  v_owner   boolean;
  v_active  boolean;
  v_toss    boolean;
  v_rsvp    public.rsvps;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    raise exception '예약 당사자가 아닙니다' using errcode = '42501';
  end if;
  v_leader := public.is_group_leader(v_res.group_id);
  v_owner  := public.is_store_owner(v_res.store_id);
  if not (v_leader or v_owner) then
    raise exception '예약 당사자가 아닙니다' using errcode = '42501';
  end if;

  v_active := v_res.status in ('awaiting_payment', 'confirmed');
  v_toss := exists (select 1 from public.payments
                     where reservation_id = v_res.id and status = 'paid' and pg_provider = 'toss');
  select * into v_rsvp from public.rsvps where reservation_id = v_res.id;

  return jsonb_build_object(
    'reservation_id', v_res.id,
    'role', case when v_leader then 'group' else 'owner' end,
    'status', v_res.status,
    -- 결제: 0원이면 confirm_zero_deposit, 아니면 prepare_deposit_payment → 토스
    'can_pay', v_leader and v_res.status = 'awaiting_payment'
               and v_res.modify_status is distinct from 'pending',
    'pay_method', case when v_res.deposit_amount > 0 then 'toss' else 'zero' end,
    -- 취소: 토스 결제분이 있으면 toss-payment(cancel), 아니면 cancel_reservation
    'can_cancel', v_active,
    'cancel_via', case when v_toss then 'toss' else 'rpc' end,
    -- 조건 수정 요청: 결제 전, 1회, 행사 24시간 전까지 (#3 결정에 따라 바뀔 수 있음)
    'can_modify', v_leader and v_res.status = 'awaiting_payment' and not v_res.modify_request_used
                  and v_res.start_at - now() >= interval '24 hours',
    'can_respond_modify', v_owner and v_res.modify_status = 'pending',
    'can_edit_preorder', v_leader and public._preorder_editable(v_res),
    'preorder_deadline', case when v_res.status = 'confirmed' then v_res.start_at - interval '24 hours' end,
    -- 참석 조사: 진행 중 예약 + 행사 전 + (조사가 없거나 열려 있음)
    'can_rsvp', v_leader and v_active and v_res.start_at > now(),
    'rsvp_open', v_rsvp.id is not null and public._rsvp_open(v_rsvp, v_res),
    -- 완료·노쇼: 확정 + 행사 시작 이후 (R-03)
    'can_finish', v_owner and v_res.status = 'confirmed' and v_res.start_at <= now(),
    -- 영수증 등록: 사장님, 확정·완료 (Edge Function 은 단체도 허용하지만 화면 기준은 사장님)
    'can_upload_receipt', v_owner and v_res.status in ('confirmed', 'completed'),
    -- 연락처: 결제 대기 이상 (B-01)
    'can_view_contacts', v_res.status in ('awaiting_payment', 'confirmed', 'completed', 'no_show')
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 9. [사장님] 행사 완료 / 노쇼는 행사 시작 이후에만 (R-03)
-- ---------------------------------------------------------------------
create or replace function public.finish_reservation(p_reservation_id bigint, p_no_show boolean default false)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_store_owner(v_res.store_id) then
    raise exception '본인 가게의 예약이 아닙니다' using errcode = '42501';
  end if;
  if v_res.status <> 'confirmed' then
    raise exception '확정된 예약만 완료/노쇼 처리할 수 있습니다 (현재: %)', v_res.status;
  end if;
  if v_res.start_at > now() then
    raise exception '행사 시작(%) 이후에 완료·노쇼 처리할 수 있습니다', public._kst(v_res.start_at);
  end if;

  update public.reservations
     set status = case when p_no_show then 'no_show' else 'completed' end
   where id = v_res.id
  returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 10. 가게 수락 알림 정리 (R-01)
--     전: 단체가 request_accepted("OO이(가) 요청을 수락했습니다") +
--         reservation_new("예약이 확정되었습니다 (결제 대기)") 2건,
--         수락한 사장님 본인도 "새 예약 (결제 대기)" 1건
--     후: 단체에게 request_accepted 1건 (request_id + reservation_id 포함), 사장님 본인 알림 없음
-- ---------------------------------------------------------------------
drop trigger if exists trg_response_changed on public.request_responses;
drop function if exists public._trg_response_changed();

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
  v_req       public.requests;
  v_resp      public.request_responses;
  v_cap       int;
  v_committed int;
  v_res       public.reservations;
  v_store     text;
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

  if now() > v_req.response_deadline then
    raise exception '응답 기한이 지났습니다 (마감: %)', public._kst(v_req.response_deadline);
  end if;

  select max_capacity, name into v_cap, v_store from public.stores where id = p_store_id;
  if v_req.headcount > v_cap then
    raise exception '가게 최대 인원(%)을 초과한 요청입니다', v_cap;
  end if;

  v_committed := public._store_committed_headcount(p_store_id, v_req.desired_at);
  if v_committed + v_req.headcount > v_cap then
    raise exception '해당 시간대 수용 인원을 초과합니다 (이미 %명 예정, 최대 %명)', v_committed, v_cap;
  end if;

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

  -- 단체에게 1건: "결제하면 확정" (state-definitions 원칙 1 — 결제 전은 '확정'이라 부르지 않음)
  perform public._notify(
    (select leader_id from public.groups where id = v_req.group_id),
    'request_accepted',
    v_store || '이(가) 수락했어요',
    case when greatest(p_deposit_amount, 0) > 0
         then format('예약금 %s원을 결제하면 확정돼요 · %s', to_char(greatest(p_deposit_amount, 0), 'FM999,999,999'), public._kst(v_req.desired_at))
         else format('예약금 없이 확정할 수 있어요 · %s', public._kst(v_req.desired_at)) end,
    v_req.id, v_res.id);

  -- 같은 요청을 받을 수 있었던 다른 가게들에 마감 알림 (대상 범위는 #2 결정 대기)
  insert into public.notifications (user_id, type, title, body, request_id)
  select s.owner_id, 'request_closed', '다른 가게가 먼저 수락해 요청이 마감되었습니다',
         format('%s · %s명', public._event_label(v_req.event_type), v_req.headcount), v_req.id
    from public.stores s
   where s.max_capacity >= v_req.headcount and s.id <> p_store_id;

  return v_resp;
end;
$$;

-- 예약 생성 알림: 요청 수락으로 생긴 예약은 수락한 사장님 본인에게 알리지 않음
create or replace function public._trg_reservation_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid; v_leader uuid; v_store text; v_group text; v_when text;
begin
  select s.owner_id, s.name into v_owner, v_store from public.stores s where s.id = new.store_id;
  select g.leader_id, g.name into v_leader, v_group from public.groups g where g.id = new.group_id;
  v_when := public._kst(new.start_at);

  if tg_op = 'INSERT' then
    if new.status = 'awaiting_payment' and new.source = 'slot' then
      perform public._notify(v_owner, 'reservation_new', '새 예약 (결제 대기)',
        format('%s · %s · %s명', v_group, v_when, new.headcount), null, new.id);
    elsif new.status = 'confirmed' then
      perform public._notify(v_owner, 'reservation_confirmed', '예약 확정',
        format('%s · %s · %s명', v_group, v_when, new.headcount), null, new.id);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'confirmed' then
        perform public._notify(v_owner, 'reservation_confirmed', '예약금 결제 완료 · 예약 확정',
          format('%s · %s · %s명', v_group, v_when, new.headcount), null, new.id);
      when 'cancelled' then
        perform public._notify(v_owner,  'reservation_cancelled', '예약이 취소되었습니다', format('%s · %s', v_group, v_when), null, new.id);
        perform public._notify(v_leader, 'reservation_cancelled', '예약이 취소되었습니다', format('%s · %s', v_store, v_when), null, new.id);
      when 'completed' then
        perform public._notify(v_leader, 'reservation_completed', '행사가 완료 처리되었습니다', format('%s · %s', v_store, v_when), null, new.id);
      when 'no_show' then
        perform public._notify(v_leader, 'reservation_no_show', '노쇼로 처리되었습니다', format('%s · %s', v_store, v_when), null, new.id);
      else null;
    end case;
  end if;

  if new.modify_status is distinct from old.modify_status then
    if new.modify_status = 'pending' then
      perform public._notify(v_owner, 'modify_requested', '조건 수정 요청',
        v_group || ' · ' ||
        case when new.modify_start_at is distinct from new.start_at
             then v_when || ' → ' || public._kst(new.modify_start_at) else v_when end ||
        case when new.modify_headcount is distinct from new.headcount
             then format(' · %s명 → %s명', new.headcount, new.modify_headcount) else '' end ||
        coalesce(' · ' || new.modify_note, ''), null, new.id);
    elsif new.modify_status in ('accepted', 'rejected') then
      perform public._notify(v_leader, 'modify_' || new.modify_status,
        case when new.modify_status = 'accepted' then '조건 수정이 수락되었습니다' else '조건 수정이 거절되었습니다' end,
        v_store, null, new.id);
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 11. 함수 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public._slots_guard_direct_update(),
  public.reservation_contacts(bigint),
  public.open_requests_for_store(bigint),
  public.cancel_request(bigint),
  public.request_reach(int, timestamptz),
  public.reservation_actions(bigint),
  public.finish_reservation(bigint, boolean),
  public.respond_to_request(bigint, bigint, boolean, int),
  public._trg_reservation_changed(),
  public.handle_new_user()
from public, anon;

revoke execute on function
  public._slots_guard_direct_update(),
  public._trg_reservation_changed(),
  public.handle_new_user()
from authenticated;

grant execute on function
  public.reservation_contacts(bigint),
  public.open_requests_for_store(bigint),
  public.cancel_request(bigint),
  public.request_reach(int, timestamptz),
  public.reservation_actions(bigint),
  public.finish_reservation(bigint, boolean),
  public.respond_to_request(bigint, bigint, boolean, int)
to authenticated;
