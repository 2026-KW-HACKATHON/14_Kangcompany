-- 009 이후 실행. 일괄 빈자리 공개의 원자성/재시도, 지난 시간 차단,
-- 참석 조사 인원 반영 시점을 마감으로 통일한다.
begin;

create table public.slot_publish_batches (
  id uuid primary key,
  store_id bigint not null references public.stores(id) on delete cascade,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.slot_publish_batches enable row level security;
revoke all on public.slot_publish_batches from public, anon, authenticated;

create or replace function public.publish_slots(p_store_id bigint, p_batch_id uuid, p_slots jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_max int; v_batch public.slot_publish_batches; v_item jsonb;
  v_slot public.slots; v_result jsonb := '[]'::jsonb;
begin
  if p_batch_id is null or not public.is_store_owner(p_store_id) then
    raise exception '본인 가게의 빈자리만 공개할 수 있습니다' using errcode = '42501';
  end if;
  -- 같은 가게의 동시 재시도를 직렬화한다. 등록/응답 기록은 한 트랜잭션이다.
  select max_capacity into v_max from public.stores where id = p_store_id for update;
  select * into v_batch from public.slot_publish_batches where id = p_batch_id;
  if found then
    if v_batch.store_id <> p_store_id or v_batch.payload <> p_slots then
      raise exception '공개 요청 키가 다른 조건에 사용되었습니다';
    end if;
    return v_batch.result;
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception '공개할 일정을 배열로 보내 주세요';
  end if;
  if jsonb_array_length(p_slots) not between 1 and 1000 then
    raise exception '한 번에 1~1000개 일정을 공개할 수 있습니다';
  end if;
  if exists (select 1 from jsonb_array_elements(p_slots) s
             group by s->>'start_at', s->>'end_at' having count(*) > 1) then
    raise exception '같은 시간대가 중복 선택되었습니다';
  end if;
  for v_item in select * from jsonb_array_elements(p_slots) loop
    if (v_item->>'start_at') is null or (v_item->>'end_at') is null
       or (v_item->>'capacity') is null or (v_item->>'deposit_amount') is null
       or (v_item->>'start_at')::timestamptz <= now()
       or (v_item->>'end_at')::timestamptz <= (v_item->>'start_at')::timestamptz
       or (v_item->>'capacity')::int not between 1 and v_max
       or (v_item->>'deposit_amount')::int < 0 then
      raise exception '날짜·시간·인원·예약금을 확인해 주세요';
    end if;
    insert into public.slots (store_id, start_at, end_at, capacity, deposit_amount)
    values (p_store_id, (v_item->>'start_at')::timestamptz, (v_item->>'end_at')::timestamptz,
            (v_item->>'capacity')::int, (v_item->>'deposit_amount')::int)
    returning * into v_slot;
    v_result := v_result || jsonb_build_array(to_jsonb(v_slot));
  end loop;
  insert into public.slot_publish_batches (id, store_id, payload, result)
  values (p_batch_id, p_store_id, p_slots, v_result);
  return v_result;
end;
$$;
revoke execute on function public.publish_slots(bigint, uuid, jsonb) from public, anon;
grant execute on function public.publish_slots(bigint, uuid, jsonb) to authenticated;

-- 기존 단건 공개/다시 공개 경로도 같은 미래 시각 규칙을 적용한다.
create or replace function public._slots_guard_future()
returns trigger language plpgsql as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open' or new.start_at <> old.start_at)
     and new.start_at <= now() then
    raise exception '이미 지난 시작 시간은 공개할 수 없습니다';
  end if;
  return new;
end;
$$;
create trigger trg_slots_guard_future before insert or update on public.slots
for each row execute function public._slots_guard_future();
revoke execute on function public._slots_guard_future() from public, anon, authenticated;

alter table public.rsvps add column expected_headcount int;
-- 과거 응답으로 이미 덮인 인원은 추측하여 복원하지 않는다. 현재 예약 인원으로 초기화.
update public.rsvps v set expected_headcount = r.headcount from public.reservations r where r.id = v.reservation_id;
alter table public.rsvps alter column expected_headcount set not null;
alter table public.rsvps add constraint rsvps_expected_headcount_positive check (expected_headcount > 0);

create or replace function public._rsvps_capture_headcount()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select headcount into new.expected_headcount from public.reservations where id = new.reservation_id;
  end if;
  return new;
end;
$$;
create trigger trg_rsvps_capture_headcount before insert on public.rsvps
for each row execute function public._rsvps_capture_headcount();
revoke execute on function public._rsvps_capture_headcount() from public, anon, authenticated;

-- 006의 respond/delete에서 호출하는 함수는 인원만 반환. 예약은 close_rsvp에서만 갱신.
create or replace function public._apply_rsvp_headcount(p_rsvp_id bigint)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.rsvp_responses where rsvp_id = p_rsvp_id and attending;
$$;

create or replace function public.close_rsvp(p_reservation_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res public.reservations; v_rsvp public.rsvps; v_att int;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  select * into v_rsvp from public.rsvps where reservation_id = v_res.id;
  if not found then raise exception '참석 조사가 없습니다'; end if;
  v_att := public._apply_rsvp_headcount(v_rsvp.id);
  if v_rsvp.is_closed then
    return jsonb_build_object('attending_count', v_att, 'headcount', v_res.headcount);
  end if;
  if v_res.status not in ('awaiting_payment', 'confirmed') then
    raise exception '진행 중인 예약에서만 참석 조사를 마감할 수 있습니다';
  end if;
  update public.rsvps set is_closed = true, closed_at = now() where id = v_rsvp.id;
  if v_att > 0 then
    update public.reservations set headcount = v_att where id = v_res.id;
    v_res.headcount := v_att;
  end if;
  perform public._notify((select owner_id from public.stores where id = v_res.store_id),
    'rsvp_closed', '참석 조사가 마감되었습니다',
    (select name from public.groups where id = v_res.group_id) || ' · ' || public._kst(v_res.start_at)
      || format(' · 예약 %s명 / 참석 응답 %s명', v_res.headcount, v_att), null, v_res.id);
  return jsonb_build_object('attending_count', v_att, 'headcount', v_res.headcount);
end;
$$;
revoke execute on function public._apply_rsvp_headcount(bigint) from public, anon, authenticated;
revoke execute on function public.close_rsvp(bigint) from public, anon;
grant execute on function public.close_rsvp(bigint) to authenticated;
commit;
