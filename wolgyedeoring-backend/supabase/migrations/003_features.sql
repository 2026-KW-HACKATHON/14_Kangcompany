-- =====================================================================
-- 월계더링 003: 알림 / 요청 매칭·만료 / 조건 수정 / 통계
-- 001, 002 실행 후 SQL Editor 에서 실행
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 앱 내 알림
--    앱은 notifications 를 조회하고, Realtime 구독으로 새 알림을 즉시 받는다
--    (푸시 알림은 앱 형태 결정 후 이 테이블을 기반으로 연결)
-- ---------------------------------------------------------------------
create table public.notifications (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null,
  title           text not null,
  body            text,
  request_id      bigint references public.requests(id)     on delete cascade,
  reservation_id  bigint references public.reservations(id) on delete cascade,
  receipt_id      bigint references public.receipts(id)     on delete cascade,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_self_read on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- Supabase Realtime 에 등록 (로컬 등 publication 이 없는 환경에서는 건너뜀)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 읽음 처리 (id 없으면 전체)
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.notifications set is_read = true
   where user_id = auth.uid() and is_read = false
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 내부용: 알림 생성
create or replace function public._notify(
  p_user uuid, p_type text, p_title text, p_body text,
  p_request bigint default null, p_reservation bigint default null, p_receipt bigint default null
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, request_id, reservation_id, receipt_id)
  select p_user, p_type, p_title, p_body, p_request, p_reservation, p_receipt
  where p_user is not null;
$$;

-- 내부용: 표시용 문자열
create or replace function public._event_label(p text) returns text
language sql immutable as $$
  select case p
    when 'opening_party' then '개강총회' when 'snack_event' then '간식행사'
    when 'after_party'   then '뒤풀이'   when 'closing_party' then '종강총회'
    else '기타 행사' end;
$$;

create or replace function public._kst(p timestamptz) returns text
language sql immutable as $$
  select to_char(p at time zone 'Asia/Seoul', 'MM/DD HH24:MI');
$$;

-- 새 요청 → 인원 조건이 맞는 가게 사장님들에게
create or replace function public._trg_request_created() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_group text;
begin
  if new.status <> 'open' then return new; end if;
  select name into v_group from public.groups where id = new.group_id;
  insert into public.notifications (user_id, type, title, body, request_id)
  select s.owner_id, 'request_new',
         '새 단체 예약 요청',
         format('%s %s · %s명 · 1인 %s원', v_group, public._event_label(new.event_type),
                new.headcount, new.budget_per_person) || ' · ' || public._kst(new.desired_at),
         new.id
    from public.stores s
   where s.max_capacity >= new.headcount;
  return new;
end;
$$;
create trigger trg_request_created after insert on public.requests
for each row execute function public._trg_request_created();

-- 가게 응답(수락) → 단체 대표에게
create or replace function public._trg_response_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_leader uuid; v_store text;
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    select g.leader_id into v_leader
      from public.requests q join public.groups g on g.id = q.group_id where q.id = new.request_id;
    select name into v_store from public.stores where id = new.store_id;
    perform public._notify(v_leader, 'request_accepted', v_store || '이(가) 요청을 수락했습니다',
                           format('예약금 %s원', coalesce(new.deposit_amount, 0)), new.request_id);
  end if;
  return new;
end;
$$;
create trigger trg_response_changed after insert or update on public.request_responses
for each row execute function public._trg_response_changed();

-- 예약 생성·상태 변경 → 상대방에게
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
    if new.status = 'awaiting_payment' then
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

  -- 조건 수정 요청 / 응답
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
-- 주의: 트리거는 아래 2절에서 modify_* 컬럼을 추가한 뒤 생성


-- 영수증 확인 필요 → 사장님에게
create or replace function public._trg_receipt_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_group text;
begin
  if new.status = 'needs_review' and old.status = 'processing' then
    select s.owner_id, g.name into v_owner, v_group
      from public.reservations r
      join public.stores s on s.id = r.store_id
      join public.groups g on g.id = r.group_id
     where r.id = new.reservation_id;
    perform public._notify(v_owner, 'receipt_review', '영수증 확인이 필요합니다', v_group, null, new.reservation_id, new.id);
  end if;
  return new;
end;
$$;
create trigger trg_receipt_changed after update on public.receipts
for each row execute function public._trg_receipt_changed();


-- ---------------------------------------------------------------------
-- 2. 조건 수정 요청 (결제 전 1회, 단체 → 사장님)
-- ---------------------------------------------------------------------
alter table public.reservations
  add column if not exists modify_start_at  timestamptz,
  add column if not exists modify_headcount int check (modify_headcount > 0),
  add column if not exists modify_note      text,
  add column if not exists modify_status    text check (modify_status in ('pending', 'accepted', 'rejected'));

create trigger trg_reservation_changed after insert or update on public.reservations
for each row execute function public._trg_reservation_changed();

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

create or replace function public.respond_modification(p_reservation_id bigint, p_accept boolean)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare v_res public.reservations; v_cap int;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_store_owner(v_res.store_id) then
    raise exception '본인 가게의 예약이 아닙니다' using errcode = '42501';
  end if;
  if v_res.modify_status is distinct from 'pending' then
    raise exception '대기 중인 조건 수정 요청이 없습니다';
  end if;

  if p_accept then
    v_cap := case when v_res.slot_id is not null
                  then (select capacity from public.slots where id = v_res.slot_id)
                  else (select max_capacity from public.stores where id = v_res.store_id) end;
    if v_res.modify_headcount > v_cap then
      raise exception '수용 인원(%)을 초과해 수락할 수 없습니다', v_cap;
    end if;
    update public.reservations
       set start_at = modify_start_at, headcount = modify_headcount, modify_status = 'accepted'
     where id = v_res.id returning * into v_res;
  else
    update public.reservations set modify_status = 'rejected'
     where id = v_res.id returning * into v_res;
  end if;
  return v_res;
end;
$$;

-- 결제: 조건 수정 대기 중이면 결제 불가 (002 의 함수를 대체)
create or replace function public.pay_deposit_test(p_reservation_id bigint)
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
    raise exception '결제 대기 상태가 아닙니다 (현재: %)', v_res.status;
  end if;
  if v_res.modify_status = 'pending' then
    raise exception '조건 수정 요청에 대한 가게 응답을 기다리는 중입니다';
  end if;

  insert into public.payments (reservation_id, amount, status, pg_provider, pg_tx_id, paid_at)
  values (v_res.id, v_res.deposit_amount, 'paid', 'test',
          'TEST-' || v_res.id || '-' || extract(epoch from now())::bigint, now());

  update public.reservations set status = 'confirmed' where id = v_res.id returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. 요청 자동 만료 + 가게별 맞춤 요청 목록
-- ---------------------------------------------------------------------
-- 희망일 + 조정 가능 일수가 지난 열린 요청을 expired 로
create or replace function public.expire_old_requests()
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.requests set status = 'expired'
   where status = 'open'
     and desired_at + make_interval(days => flexible_days) < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- [사장님] 내 가게가 받을 수 있는 열린 요청 (인원 조건 충족, 내 응답 상태 포함)
create or replace function public.open_requests_for_store(p_store_id bigint)
returns table (
  request_id bigint, group_name text, group_type text, event_type text,
  desired_at timestamptz, flexible_days int, headcount int, budget_per_person int,
  note text, my_response text, my_deposit int, created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;
  perform public.expire_old_requests();

  return query
  select q.id, g.name, g.group_type, q.event_type, q.desired_at, q.flexible_days,
         q.headcount, q.budget_per_person, q.note, rr.status, rr.deposit_amount, q.created_at
    from public.requests q
    join public.groups g  on g.id = q.group_id
    join public.stores s  on s.id = p_store_id
    left join public.request_responses rr on rr.request_id = q.id and rr.store_id = p_store_id
   where q.status = 'open'
     and q.headcount <= s.max_capacity
   order by q.desired_at;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. [사장님] 통계 한 번에 (대시보드용 JSON)
-- ---------------------------------------------------------------------
create or replace function public.store_stats(
  p_store_id bigint,
  p_from     date default (now() at time zone 'Asia/Seoul')::date - 90,
  p_to       date default (now() at time zone 'Asia/Seoul')::date + 60   -- 다가오는 확정 예약 포함
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;

  with res as (
    select r.*, (r.start_at at time zone 'Asia/Seoul') as local_at
      from public.reservations r
     where r.store_id = p_store_id
       and (r.start_at at time zone 'Asia/Seoul')::date between p_from and p_to
  ),
  items as (
    select res.group_id, coalesce(m.name, ri.raw_name) as menu_name, ri.qty, ri.amount
      from res
      join public.receipts rc      on rc.reservation_id = res.id and rc.status = 'done'
      join public.receipt_items ri on ri.receipt_id = rc.id
      left join public.menus m     on m.id = ri.menu_id
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'summary', (select jsonb_build_object(
        'reservations', count(*),
        'completed',    count(*) filter (where status = 'completed'),
        'no_show',      count(*) filter (where status = 'no_show'),
        'cancelled',    count(*) filter (where status = 'cancelled'),
        'guests',       coalesce(sum(headcount) filter (where status = 'completed'), 0),
        'revenue',      (select coalesce(sum(amount), 0) from items)
      ) from res),
    'by_group', coalesce((select jsonb_agg(x order by x->>'revenue' desc) from (
        select jsonb_build_object(
          'group_id', g.id, 'group_name', g.name, 'group_type', g.group_type,
          'visits', count(distinct res.id),
          'revenue', coalesce((select sum(i.amount) from items i where i.group_id = g.id), 0)
        ) as x
          from res join public.groups g on g.id = res.group_id
         where res.status = 'completed'
         group by g.id, g.name, g.group_type) t), '[]'::jsonb),
    'by_menu', coalesce((select jsonb_agg(jsonb_build_object('menu', menu_name, 'qty', qty, 'amount', amount) order by amount desc)
        from (select menu_name, sum(qty) as qty, sum(amount) as amount from items group by menu_name) t), '[]'::jsonb),
    'by_weekday', (select jsonb_agg(jsonb_build_object('dow', d, 'label', lbl, 'reservations', coalesce(c, 0)) order by d)
        from (select d, (array['일','월','화','수','목','금','토'])[d + 1] as lbl from generate_series(0, 6) d) w
        left join (select extract(dow from local_at)::int as dw, count(*) as c
                     from res where status in ('confirmed', 'completed') group by 1) k on k.dw = w.d),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', mon, 'reservations', c, 'guests', gsum) order by mon)
        from (select to_char(local_at, 'YYYY-MM') as mon, count(*) as c, sum(headcount) as gsum
                from res where status in ('confirmed', 'completed') group by 1) t), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. 미충족 수요 (조건 맞는 가게를 못 찾고 만료된 요청) — 단체 정보 없이 집계만
--    사장님: 어떤 날·규모의 수요를 놓치고 있는지 / 발표: 지역 데이터 근거
-- ---------------------------------------------------------------------
create or replace function public.unmet_demand_stats(
  p_from date default (now() at time zone 'Asia/Seoul')::date - 180,
  p_to   date default (now() at time zone 'Asia/Seoul')::date
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_owner() then
    raise exception '사장님 계정만 조회할 수 있습니다' using errcode = '42501';
  end if;
  perform public.expire_old_requests();

  with unmet as (
    select q.*, (q.desired_at at time zone 'Asia/Seoul') as local_at,
           exists (select 1 from public.request_responses rr
                    where rr.request_id = q.id and rr.status = 'accepted') as had_accept
      from public.requests q
     where q.status = 'expired'
       and (q.desired_at at time zone 'Asia/Seoul')::date between p_from and p_to
  )
  select jsonb_build_object(
    'total_unmet', (select count(*) from unmet),
    'accepted_but_not_chosen', (select count(*) from unmet where had_accept),
    'no_store_accepted',       (select count(*) from unmet where not had_accept),
    'by_event', coalesce((select jsonb_agg(jsonb_build_object('event_type', event_type, 'count', c, 'avg_headcount', ah, 'avg_budget', ab))
        from (select event_type, count(*) c, round(avg(headcount)) ah, round(avg(budget_per_person)) ab
                from unmet group by 1) t), '[]'::jsonb),
    'by_size', coalesce((select jsonb_agg(jsonb_build_object('size', sz, 'count', c) order by sz)
        from (select case when headcount < 20 then '1) 20명 미만' when headcount < 40 then '2) 20~39명'
                          when headcount < 60 then '3) 40~59명' else '4) 60명 이상' end as sz, count(*) c
                from unmet group by 1) t), '[]'::jsonb),
    'by_week', coalesce((select jsonb_agg(jsonb_build_object('week_start', wk, 'count', c) order by wk)
        from (select date_trunc('week', local_at)::date as wk, count(*) c from unmet group by 1) t), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 함수 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public.mark_notifications_read(bigint[]),
  public.request_modification(bigint, timestamptz, int, text),
  public.respond_modification(bigint, boolean),
  public.pay_deposit_test(bigint),
  public.expire_old_requests(),
  public.open_requests_for_store(bigint),
  public.store_stats(bigint, date, date),
  public.unmet_demand_stats(date, date),
  public._notify(uuid, text, text, text, bigint, bigint, bigint),
  public._trg_request_created(),
  public._trg_response_changed(),
  public._trg_reservation_changed(),
  public._trg_receipt_changed()
from public, anon;

revoke execute on function
  public._notify(uuid, text, text, text, bigint, bigint, bigint),
  public.expire_old_requests()
from authenticated;

grant execute on function
  public.mark_notifications_read(bigint[]),
  public.request_modification(bigint, timestamptz, int, text),
  public.respond_modification(bigint, boolean),
  public.pay_deposit_test(bigint),
  public.open_requests_for_store(bigint),
  public.store_stats(bigint, date, date),
  public.unmet_demand_stats(date, date)
to authenticated;


-- ---------------------------------------------------------------------
-- (선택) 매시간 자동 만료: 대시보드 → Database → Extensions 에서 pg_cron 활성화 후 실행
--   select cron.schedule('expire-requests', '0 * * * *', 'select public.expire_old_requests()');
-- pg_cron 없이도 open_requests_for_store / unmet_demand_stats 호출 시 만료 처리됨
-- ---------------------------------------------------------------------
