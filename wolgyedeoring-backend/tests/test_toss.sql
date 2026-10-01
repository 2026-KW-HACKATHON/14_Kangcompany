-- 004 토스 결제 흐름 테스트 (Edge Function 이 하는 DB 부분)
\set ON_ERROR_STOP 1
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게A',40) returning id as s \gset
insert into slots(store_id,start_at,end_at,capacity,deposit_amount) values (:s, now()+interval '5 day', now()+interval '5 day 3 hour', 40, 50000), (:s, now()+interval '6 day', now()+interval '6 day 3 hour', 40, 0);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name) values (auth.uid(),'학생회') returning id as g \gset
select id as r1 from book_slot(1,:g,'after_party',30) \gset
select id as r0 from book_slot(2,:g,'after_party',30) \gset

-- 예약금 0원: prepare 거절, confirm_zero_deposit 성공
\set ON_ERROR_STOP 0
select prepare_deposit_payment(:r0);
\set ON_ERROR_STOP 1
select 'zero', status from confirm_zero_deposit(:r0);

-- 결제 준비 두 번 → 앞 주문은 failed
select prepare_deposit_payment(:r1)->>'order_id' as old_order \gset
select prepare_deposit_payment(:r1) as prep \gset
select 'prepare', :'prep'::jsonb->>'amount', :'prep'::jsonb->>'order_name', length(:'prep'::jsonb->>'order_id') between 6 and 64;
select (:'prep'::jsonb)->>'order_id' as ord \gset
reset role;
select 'orders', status, count(*) from payments where reservation_id = :r1 group by status order by status;

-- 로그인 사용자는 finalize 호출 불가
set role authenticated;
\set ON_ERROR_STOP 0
select finalize_toss_payment(:'ord', 'pk', 50000, '카드', null, now());
\set ON_ERROR_STOP 1

-- service_role: 금액 불일치 거절 / 옛 주문 거절 / 정상 확정 / 중복 거절
set role service_role;
\set ON_ERROR_STOP 0
select finalize_toss_payment(:'ord', 'pk_test', 49000, '카드', null, now());
select finalize_toss_payment(:'old_order', 'pk_old', 50000, '카드', null, now());
\set ON_ERROR_STOP 1
select 'finalize', status from finalize_toss_payment(:'ord', 'pk_test_123', 50000, '카드', 'https://receipt', now());
\set ON_ERROR_STOP 0
select finalize_toss_payment(:'ord', 'pk_test_123', 50000, '카드', null, now());
\set ON_ERROR_STOP 1
reset role;
select 'paid row', status, pg_provider, pg_tx_id, method from payments where order_id = :'ord';

-- 토스 결제된 예약은 일반 취소 불가 → (Edge Function 이 환불 후 refunded 로 바꾼 뒤) 취소 가능
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
\set ON_ERROR_STOP 0
select cancel_reservation(:r1);
\set ON_ERROR_STOP 1
reset role;
update payments set status='refunded' where order_id = :'ord';
set role authenticated;
select 'cancel after refund', status from cancel_reservation(:r1);
reset role;
select 'slot reopened', status from slots where id = 1;
