-- =====================================================================
-- 월계더링 002: 상태 전이 함수(RPC) + 권한 정리
-- 001_schema.sql 실행 후 SQL Editor 에서 실행
--
-- 원칙
--  - 예약·결제·영수증 품목의 "상태 변경"은 앱이 테이블을 직접 수정하지 않고
--    아래 함수만 호출한다 (supabase.rpc('함수명', {...}))
--  - 각 함수는 호출자(auth.uid())가 당사자인지, 현재 상태에서 가능한 전이인지 검사한다
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 스키마 보완
-- ---------------------------------------------------------------------
-- 슬롯에도 예약금을 둔다 (가게가 먼저 연 날짜를 단체가 고르면 이 금액으로 예약 생성)
alter table public.slots
  add column if not exists deposit_amount int not null default 0 check (deposit_amount >= 0);

-- 앱이 예약·품목 상태를 직접 바꾸지 못하도록 기존 쓰기 정책 제거 (조회 정책은 유지)
drop policy if exists reservations_party_update  on public.reservations;
drop policy if exists reservations_leader_insert on public.reservations;
drop policy if exists items_owner_update         on public.receipt_items;
drop policy if exists receipts_party_insert      on public.receipts;  -- 영수증 생성은 Edge Function 전담


-- ---------------------------------------------------------------------
-- 1. 회원가입 시 profiles 자동 생성
--    앱에서 가입할 때 options.data 에 { role: 'group'|'owner', display_name: '...' } 전달
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'group'),
    coalesce(new.raw_user_meta_data ->> 'display_name', '이름 없음')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 2. [사장님] 요청에 응답 (수락 / 거절)
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
  v_req  public.requests;
  v_resp public.request_responses;
  v_cap  int;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.status <> 'open' then
    raise exception '응답할 수 없는 요청입니다 (마감 또는 없음)';
  end if;

  if p_accept then
    select max_capacity into v_cap from public.stores where id = p_store_id;
    if v_req.headcount > v_cap then
      raise exception '가게 최대 인원(%)을 초과한 요청입니다', v_cap;
    end if;
  end if;

  insert into public.request_responses (request_id, store_id, status, deposit_amount)
  values (p_request_id, p_store_id,
          case when p_accept then 'accepted' else 'declined' end,
          case when p_accept then greatest(p_deposit_amount, 0) else null end)
  on conflict (request_id, store_id) do update
    set status = excluded.status,
        deposit_amount = excluded.deposit_amount
  returning * into v_resp;

  return v_resp;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. [단체] 수락한 가게 중 하나를 골라 예약 생성 → 결제 대기
-- ---------------------------------------------------------------------
create or replace function public.choose_response(p_response_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_resp public.request_responses;
  v_req  public.requests;
  v_res  public.reservations;
begin
  select * into v_resp from public.request_responses where id = p_response_id;
  if not found or v_resp.status <> 'accepted' then
    raise exception '수락된 응답이 아닙니다';
  end if;

  select * into v_req from public.requests where id = v_resp.request_id for update;
  if not public.is_group_leader(v_req.group_id) then
    raise exception '본인 단체의 요청이 아닙니다' using errcode = '42501';
  end if;
  if v_req.status <> 'open' then
    raise exception '이미 확정되었거나 취소된 요청입니다';
  end if;

  insert into public.reservations
    (group_id, store_id, source, request_id, event_type, start_at,
     headcount, budget_per_person, deposit_amount, status)
  values
    (v_req.group_id, v_resp.store_id, 'request', v_req.id, v_req.event_type, v_req.desired_at,
     v_req.headcount, v_req.budget_per_person, coalesce(v_resp.deposit_amount, 0), 'awaiting_payment')
  returning * into v_res;

  update public.requests set status = 'confirmed' where id = v_req.id;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. [단체] 가게가 먼저 연 날짜(슬롯) 예약 → 결제 대기
-- ---------------------------------------------------------------------
create or replace function public.book_slot(
  p_slot_id           bigint,
  p_group_id          bigint,
  p_event_type        text,
  p_headcount         int,
  p_budget_per_person int default null
)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_slot public.slots;
  v_res  public.reservations;
begin
  if not public.is_group_leader(p_group_id) then
    raise exception '본인 단체가 아닙니다' using errcode = '42501';
  end if;

  select * into v_slot from public.slots where id = p_slot_id for update;
  if not found or v_slot.status <> 'open' then
    raise exception '예약할 수 없는 날짜입니다';
  end if;
  if v_slot.start_at < now() then
    raise exception '이미 지난 날짜입니다';
  end if;
  if p_headcount > v_slot.capacity then
    raise exception '수용 인원(%)을 초과했습니다', v_slot.capacity;
  end if;

  insert into public.reservations
    (group_id, store_id, source, slot_id, event_type, start_at,
     headcount, budget_per_person, deposit_amount, status)
  values
    (p_group_id, v_slot.store_id, 'slot', v_slot.id, p_event_type, v_slot.start_at,
     p_headcount, p_budget_per_person, v_slot.deposit_amount, 'awaiting_payment')
  returning * into v_res;

  update public.slots set status = 'booked' where id = v_slot.id;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. [단체] 예약금 테스트 결제 → 확정
--    실제 결제대행사 연동 전 시연용. 연동 시 Edge Function 의 결제 승인 콜백으로 대체
-- ---------------------------------------------------------------------
create or replace function public.pay_deposit_test(p_reservation_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  if v_res.status <> 'awaiting_payment' then
    raise exception '결제 대기 상태가 아닙니다 (현재: %)', v_res.status;
  end if;

  insert into public.payments (reservation_id, amount, status, pg_provider, pg_tx_id, paid_at)
  values (v_res.id, v_res.deposit_amount, 'paid', 'test', 'TEST-' || v_res.id || '-' || extract(epoch from now())::bigint, now());

  update public.reservations set status = 'confirmed' where id = v_res.id
  returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. [단체·사장님] 예약 취소
--    결제된 예약금은 refunded 로 표시 (실제 환불 처리는 결제 연동 시 구현)
-- ---------------------------------------------------------------------
create or replace function public.cancel_reservation(p_reservation_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not (public.is_group_leader(v_res.group_id) or public.is_store_owner(v_res.store_id)) then
    raise exception '예약 당사자가 아닙니다' using errcode = '42501';
  end if;
  if v_res.status not in ('awaiting_payment', 'confirmed') then
    raise exception '취소할 수 없는 상태입니다 (현재: %)', v_res.status;
  end if;

  update public.payments set status = 'refunded'
   where reservation_id = v_res.id and status = 'paid';

  if v_res.slot_id is not null then
    update public.slots set status = 'open' where id = v_res.slot_id and start_at > now();
  end if;

  update public.reservations set status = 'cancelled' where id = v_res.id
  returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. [사장님] 행사 완료 / 노쇼 처리
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

  update public.reservations
     set status = case when p_no_show then 'no_show' else 'completed' end
   where id = v_res.id
  returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. 영수증 보정 (사장님)
-- ---------------------------------------------------------------------
-- 내부용: 영수증 상태가 보정 가능한지 + 호출자가 해당 가게 사장님인지
create or replace function public._assert_receipt_owner(p_receipt_id bigint)
returns public.receipts
language plpgsql security definer set search_path = public
as $$
declare
  v_rc    public.receipts;
  v_store bigint;
begin
  select * into v_rc from public.receipts where id = p_receipt_id for update;
  if not found then
    raise exception '영수증이 없습니다';
  end if;
  select store_id into v_store from public.reservations where id = v_rc.reservation_id;
  if not public.is_store_owner(v_store) then
    raise exception '본인 가게의 영수증이 아닙니다' using errcode = '42501';
  end if;
  if v_rc.status not in ('needs_review', 'done') then
    raise exception '보정할 수 없는 상태입니다 (현재: %)', v_rc.status;
  end if;
  return v_rc;
end;
$$;

-- 품목 수정: 메뉴 매칭·수량·단가 수정. 금액은 수량×단가로 재계산
create or replace function public.correct_receipt_item(
  p_item_id    bigint,
  p_menu_id    bigint,
  p_qty        int,
  p_unit_price int
)
returns public.receipt_items
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.receipt_items;
  v_rc   public.receipts;
begin
  select * into v_item from public.receipt_items where id = p_item_id;
  if not found then
    raise exception '품목이 없습니다';
  end if;
  v_rc := public._assert_receipt_owner(v_item.receipt_id);

  if p_menu_id is not null and not exists (
    select 1 from public.menus m
    join public.reservations r on r.store_id = m.store_id
    where m.id = p_menu_id and r.id = v_rc.reservation_id
  ) then
    raise exception '이 가게의 메뉴가 아닙니다';
  end if;
  if p_qty is null or p_qty <= 0 or p_unit_price is null or p_unit_price < 0 then
    raise exception '수량과 단가를 확인하세요';
  end if;

  update public.receipt_items
     set menu_id = p_menu_id, qty = p_qty, unit_price = p_unit_price,
         amount = p_qty * p_unit_price, is_corrected = true, validation_error = null
   where id = p_item_id
  returning * into v_item;

  update public.receipts set status = 'needs_review' where id = v_rc.id;  -- 확정 전까지 검토 중
  return v_item;
end;
$$;

-- 품목 추가: 품목이 인쇄되지 않은 영수증이거나 누락된 품목을 직접 입력
create or replace function public.add_receipt_item(
  p_receipt_id bigint,
  p_menu_id    bigint,
  p_qty        int,
  p_unit_price int
)
returns public.receipt_items
language plpgsql security definer set search_path = public
as $$
declare
  v_rc   public.receipts;
  v_name text;
  v_item public.receipt_items;
begin
  v_rc := public._assert_receipt_owner(p_receipt_id);

  select m.name into v_name from public.menus m
  join public.reservations r on r.store_id = m.store_id
  where m.id = p_menu_id and r.id = v_rc.reservation_id;
  if v_name is null then
    raise exception '이 가게의 메뉴가 아닙니다';
  end if;
  if p_qty is null or p_qty <= 0 or p_unit_price is null or p_unit_price < 0 then
    raise exception '수량과 단가를 확인하세요';
  end if;

  insert into public.receipt_items
    (receipt_id, raw_name, menu_id, qty, unit_price, amount, confidence, is_corrected)
  values
    (p_receipt_id, v_name, p_menu_id, p_qty, p_unit_price, p_qty * p_unit_price, 'high', true)
  returning * into v_item;

  update public.receipts set status = 'needs_review' where id = v_rc.id;
  return v_item;
end;
$$;

-- 품목 삭제: 잘못 인식된 줄 제거
create or replace function public.delete_receipt_item(p_item_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.receipt_items;
  v_rc   public.receipts;
begin
  select * into v_item from public.receipt_items where id = p_item_id;
  if not found then
    raise exception '품목이 없습니다';
  end if;
  v_rc := public._assert_receipt_owner(v_item.receipt_id);
  delete from public.receipt_items where id = p_item_id;
  update public.receipts set status = 'needs_review' where id = v_rc.id;
end;
$$;

-- 보정 확정: 검증 오류가 남아 있지 않으면 done 으로 전환 → 통계에 반영
create or replace function public.confirm_receipt(p_receipt_id bigint)
returns public.receipts
language plpgsql security definer set search_path = public
as $$
declare
  v_rc     public.receipts;
  v_errors int;
  v_count  int;
  v_sum    int;
begin
  v_rc := public._assert_receipt_owner(p_receipt_id);

  select count(*) filter (where validation_error is not null or menu_id is null or qty is null),
         count(*), coalesce(sum(amount), 0)
    into v_errors, v_count, v_sum
    from public.receipt_items where receipt_id = p_receipt_id;

  if v_count = 0 then
    raise exception '품목이 하나도 없습니다. 품목을 추가하세요';
  end if;
  if v_errors > 0 then
    raise exception '확인이 필요한 품목이 %개 남아 있습니다 (메뉴 미매칭 또는 오류)', v_errors;
  end if;

  update public.receipts
     set status = 'done',
         validation_note = case
           when total_amount is not null and total_amount <> v_sum
             then format('사장님 확정: 품목 합계 %s원, 영수증 총액 %s원 (차이는 할인·봉사료 등)', v_sum, total_amount)
           else null end
   where id = p_receipt_id
  returning * into v_rc;
  return v_rc;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. 함수 실행 권한: 로그인 사용자만 (비로그인·내부 함수 차단)
-- ---------------------------------------------------------------------
revoke execute on function
  public.respond_to_request(bigint, bigint, boolean, int),
  public.choose_response(bigint),
  public.book_slot(bigint, bigint, text, int, int),
  public.pay_deposit_test(bigint),
  public.cancel_reservation(bigint),
  public.finish_reservation(bigint, boolean),
  public.correct_receipt_item(bigint, bigint, int, int),
  public.add_receipt_item(bigint, bigint, int, int),
  public.delete_receipt_item(bigint),
  public.confirm_receipt(bigint),
  public._assert_receipt_owner(bigint),
  public.handle_new_user()
from public, anon;

-- 내부용 함수는 로그인 사용자도 직접 호출 불가
revoke execute on function
  public._assert_receipt_owner(bigint),
  public.handle_new_user()
from authenticated;

grant execute on function
  public.respond_to_request(bigint, bigint, boolean, int),
  public.choose_response(bigint),
  public.book_slot(bigint, bigint, text, int, int),
  public.pay_deposit_test(bigint),
  public.cancel_reservation(bigint),
  public.finish_reservation(bigint, boolean),
  public.correct_receipt_item(bigint, bigint, int, int),
  public.add_receipt_item(bigint, bigint, int, int),
  public.delete_receipt_item(bigint),
  public.confirm_receipt(bigint)
to authenticated;
