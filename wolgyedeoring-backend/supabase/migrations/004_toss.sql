-- =====================================================================
-- 월계더링 004: 토스페이먼츠 예약금 결제
-- 001~003 실행 후 SQL Editor 에서 실행
--
-- 흐름
--  1) 앱: rpc('prepare_deposit_payment')  → 주문번호·금액 받음 (DB 가 금액 결정)
--  2) 앱: 토스 결제창 → 성공 시 paymentKey, orderId, amount 받음
--  3) 앱: Edge Function 'toss-payment' (action: confirm) 호출
--  4) Edge Function: 금액 검증 → 토스 승인 API → finalize_toss_payment → 예약 확정
--     승인 후 DB 반영이 실패하면 즉시 토스 결제 취소(환불)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. payments 컬럼 추가
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists order_id    text unique,   -- 토스 orderId (우리가 생성)
  add column if not exists method      text,          -- 카드, 간편결제 등 (토스 응답)
  add column if not exists receipt_url text;          -- 토스 영수증 링크

create index if not exists idx_payments_order on public.payments(order_id);


-- ---------------------------------------------------------------------
-- 2. [단체] 결제 준비: 주문번호 발급
--    같은 예약에 이전 미완료 주문이 있으면 failed 로 닫고 새로 발급
-- ---------------------------------------------------------------------
create or replace function public.prepare_deposit_payment(p_reservation_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res   public.reservations;
  v_store text;
  v_order text;
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
  if v_res.deposit_amount <= 0 then
    raise exception '예약금이 없는 예약입니다. confirm_zero_deposit 을 호출하세요';
  end if;

  update public.payments set status = 'failed'
   where reservation_id = v_res.id and status = 'pending';

  -- 토스 orderId: 영문·숫자·-·_ 6~64자
  v_order := 'WGD-' || v_res.id || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);

  insert into public.payments (reservation_id, amount, status, pg_provider, order_id)
  values (v_res.id, v_res.deposit_amount, 'pending', 'toss', v_order);

  select name into v_store from public.stores where id = v_res.store_id;

  return jsonb_build_object(
    'order_id',   v_order,
    'amount',     v_res.deposit_amount,
    'order_name', '월계더링 예약금 · ' || v_store
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 3. [단체] 예약금 0원 예약 확정 (결제 없이)
-- ---------------------------------------------------------------------
create or replace function public.confirm_zero_deposit(p_reservation_id bigint)
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
  if v_res.deposit_amount > 0 then
    raise exception '예약금 결제가 필요한 예약입니다';
  end if;

  update public.reservations set status = 'confirmed' where id = v_res.id returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. [Edge Function 전용] 토스 승인 성공 후 확정
--    service_role 만 호출 가능. 조건이 안 맞으면 예외 → Edge Function 이 환불 처리
-- ---------------------------------------------------------------------
create or replace function public.finalize_toss_payment(
  p_order_id     text,
  p_payment_key  text,
  p_amount       int,
  p_method       text,
  p_receipt_url  text,
  p_approved_at  timestamptz
)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.payments;
  v_res public.reservations;
begin
  select * into v_pay from public.payments where order_id = p_order_id for update;
  if not found then
    raise exception '주문번호가 없습니다';
  end if;
  if v_pay.status <> 'pending' then
    raise exception '이미 처리된 주문입니다 (현재: %)', v_pay.status;
  end if;
  if v_pay.amount <> p_amount then
    raise exception '결제 금액이 주문 금액과 다릅니다';
  end if;

  select * into v_res from public.reservations where id = v_pay.reservation_id for update;
  if v_res.status <> 'awaiting_payment' then
    raise exception '결제 대기 상태가 아닌 예약입니다 (현재: %)', v_res.status;
  end if;
  if v_res.modify_status = 'pending' then
    raise exception '조건 수정 요청 대기 중인 예약입니다';
  end if;

  update public.payments
     set status = 'paid', pg_tx_id = p_payment_key, method = p_method,
         receipt_url = p_receipt_url, paid_at = coalesce(p_approved_at, now())
   where id = v_pay.id;

  update public.reservations set status = 'confirmed' where id = v_res.id returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. 취소 보호: 토스로 결제된 예약은 환불을 거치는 Edge Function 으로만 취소
--    (002 의 cancel_reservation 대체)
-- ---------------------------------------------------------------------
create or replace function public.cancel_reservation(p_reservation_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not (public.is_group_leader(v_res.group_id) or public.is_store_owner(v_res.store_id)) then
    raise exception '예약 당사자가 아닙니다' using errcode = '42501';
  end if;
  if v_res.status not in ('awaiting_payment', 'confirmed') then
    raise exception '취소할 수 없는 상태입니다 (현재: %)', v_res.status;
  end if;
  if exists (select 1 from public.payments
              where reservation_id = v_res.id and status = 'paid' and pg_provider = 'toss') then
    raise exception '결제된 예약은 환불과 함께 취소해야 합니다 (toss-payment cancel 사용)';
  end if;

  update public.payments set status = 'refunded'
   where reservation_id = v_res.id and status = 'paid';          -- 테스트 결제분
  update public.payments set status = 'failed'
   where reservation_id = v_res.id and status = 'pending';       -- 미완료 주문

  if v_res.slot_id is not null then
    update public.slots set status = 'open' where id = v_res.slot_id and start_at > now();
  end if;

  update public.reservations set status = 'cancelled' where id = v_res.id returning * into v_res;
  return v_res;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public.prepare_deposit_payment(bigint),
  public.confirm_zero_deposit(bigint),
  public.cancel_reservation(bigint),
  public.finalize_toss_payment(text, text, int, text, text, timestamptz)
from public, anon;

revoke execute on function
  public.finalize_toss_payment(text, text, int, text, text, timestamptz)
from authenticated;

grant execute on function
  public.prepare_deposit_payment(bigint),
  public.confirm_zero_deposit(bigint),
  public.cancel_reservation(bigint)
to authenticated;

grant execute on function
  public.finalize_toss_payment(text, text, int, text, text, timestamptz)
to service_role;
