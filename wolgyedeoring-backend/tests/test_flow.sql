-- 로컬 시나리오 테스트
\set ON_ERROR_STOP 1
\pset footer off
-- 가입 (트리거로 profiles 자동 생성)
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"owner","display_name":"사장B"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}');
select 'profiles', count(*) from profiles;

set role authenticated;
-- 사장A: 가게·메뉴 등록 / 사장B: 가게·슬롯
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게A',40);
insert into menus(store_id,name,price) values (1,'삼겹살',15000),(1,'소주',5000),(1,'된장찌개',8000);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게B',30);
insert into slots(store_id,start_at,end_at,capacity,deposit_amount) values (2, now()+interval '10 day', now()+interval '10 day 3 hour', 30, 30000);

-- 학생회: 단체 생성·요청
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name,group_type) values (auth.uid(),'소프트웨어학부 학생회','student_council');
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (1,'opening_party',now()+interval '7 day',32,15000);
-- 앱이 예약을 직접 만들 수 없어야 함
do $$ begin
  insert into reservations(group_id,store_id,source,request_id,event_type,start_at,headcount) values (1,1,'request',1,'etc',now(),1);
  raise exception 'FAIL: 직접 insert 가 허용됨';
exception when insufficient_privilege then raise notice 'OK: 예약 직접 생성 차단';
end $$;

-- 사장A 수락, 사장B 인원 초과로 수락 실패
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A 응답', status, deposit_amount from respond_to_request(1,1,true,50000);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin perform respond_to_request(1,2,true,0); raise exception 'FAIL';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK: 인원 초과 수락 차단 (%)', sqlerrm; end $$;
-- 사장B 가 A 가게 이름으로 응답 시도
do $$ begin perform respond_to_request(1,1,false,0); raise exception 'FAIL';
exception when insufficient_privilege then raise notice 'OK: 타 가게 대리 응답 차단'; end $$;

-- 학생회: 가게A 수락 시 이미 예약이 만들어져 있어야 함 (선착순 즉시 확정) → 결제
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select id as res1 from reservations where request_id = 1 \gset
select '즉시 확정된 예약', id, status, deposit_amount from reservations where id = :res1;
select 'pay', id, status from pay_deposit_test(:res1);
select 'payment', amount, status, pg_provider from payments;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform respond_to_request(1,1,true,10000); raise exception 'FAIL';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK: 중복 확정 차단 (%)', sqlerrm; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';

-- 학생회: 가게B 슬롯도 예약 후 취소 → 슬롯 다시 open
select id as res2 from book_slot(1,1,'after_party',25,20000) \gset
select 'cancel', id, status from cancel_reservation(:res2);
set role postgres;
select 'slot after cancel', status from slots where id=1;
set role authenticated;

-- 사장A: 완료 처리
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'finish', id, status from finish_reservation(:res1);

-- Edge Function 이 저장했다고 가정한 영수증 (service_role 대신 postgres 로 삽입)
set role postgres;
insert into receipts(reservation_id,uploaded_by,status,is_itemized,total_amount) values (:res1,'00000000-0000-0000-0000-00000000000a','needs_review',true,190000);
insert into receipt_items(receipt_id,raw_name,menu_id,qty,unit_price,amount,confidence,validation_error) values
 (1,'삼겹살(국내',1,8,15000,120000,'high',null),
 (1,'소주',2,10,5000,5000,'medium','qty*unit_price != amount'),
 (1,'된장찌개??',null,5,8000,40000,'low','menu not matched');
set role authenticated;

-- 사장A: 확정 시도 → 오류 남아 실패
do $$ begin perform confirm_receipt(1); raise exception 'FAIL';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK: 미보정 확정 차단 (%)', sqlerrm; end $$;
select 'fix2', amount, is_corrected from correct_receipt_item(2,2,10,5000);
select 'fix3', amount, is_corrected from correct_receipt_item(3,3,5,8000);
select 'confirm', status, validation_note from confirm_receipt(1);
select 'stats', menu_name, total_qty, total_amount from v_store_item_stats order by total_amount desc;

-- 학생회는 품목 수정 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform correct_receipt_item(1,1,1,1); raise exception 'FAIL';
exception when insufficient_privilege then raise notice 'OK: 단체의 품목 수정 차단'; end $$;
-- 사장B 는 통계에서 A 데이터 안 보임
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B stats rows', count(*) from v_store_item_stats;

-- anon 은 함수 호출 불가
reset role; set role anon;
do $$ begin perform pay_deposit_test(1); raise exception 'FAIL';
exception when insufficient_privilege then raise notice 'OK: 비로그인 호출 차단'; end $$;
