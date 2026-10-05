-- 008 FE 요청 반영 테스트 (001~008 적용된 빈 DB)
\set ON_ERROR_STOP 1
\pset footer off
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A","phone":"010-1111-2222"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"owner","display_name":"사장B"}'),
 ('00000000-0000-0000-0000-00000000000e', '{"role":"owner","display_name":"작은가게"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장","phone":"010-3333-4444"}'),
 ('00000000-0000-0000-0000-00000000000d', '{"role":"group","display_name":"남의단체"}');
select '[B-01] 가입 시 phone 저장', display_name, phone from profiles order by display_name;

set role authenticated;

-- [권한] profiles: role 변경 불가, 이름·전화번호는 수정 가능
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
\set ON_ERROR_STOP 0
update profiles set role = 'owner' where id = auth.uid();
\set ON_ERROR_STOP 1
update profiles set phone = '010-3333-5555' where id = auth.uid();
select '[권한] 내 프로필', role, phone from profiles;

-- 가게 (B-02, B-10 컬럼)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity,phone,intro,lat,lng)
  values (auth.uid(),'가게A',40,'02-940-0000','단체석 40석',37.6195,127.0590) returning id as sa \gset
\set ON_ERROR_STOP 0
insert into stores(owner_id,name,max_capacity,phone) values (auth.uid(),'잘못된번호',10,'전화없음');
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게B',40) returning id as sb \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'작은가게',10) returning id as se \gset

-- [B-05] 받을 수 있는 가게 수
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name) values (auth.uid(),'학생회') returning id as g \gset
select '[B-05] 20명', request_reach(20);
select '[B-05] 5명', request_reach(5);

-- [권한] requests: 상태·기한 직접 조작 불가, 메모 수정은 가능, 삭제 불가
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person)
  values (:g,'opening_party',now()+interval '8 day',20,15000) returning id as r1 \gset
\set ON_ERROR_STOP 0
update requests set status = 'confirmed' where id = :r1;
update requests set response_deadline = now() + interval '30 day' where id = :r1;
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person,status)
  values (:g,'etc',now()+interval '9 day',5,5000,'confirmed');
delete from requests where id = :r1;
\set ON_ERROR_STOP 1
update requests set note = '21시 이후 입장' where id = :r1;
select '[권한] 요청 유지', status, note from requests where id = :r1;

-- [권한] 사장님이 request_responses 에 직접 수락 기록 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
insert into request_responses(request_id,store_id,status,deposit_amount) values (:r1,:sb,'accepted',0);
\set ON_ERROR_STOP 1

-- [B-07①] 받은 요청 목록: 응답 기한·남은 자리·수락 가능 여부
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '[B-07] 가게A 목록', request_id = :r1 as is_r1, response_deadline is not null as has_deadline,
       committed_headcount, remaining_capacity, can_accept
  from open_requests_for_store(:sa);

-- [R-01] 가게A 수락 → 단체 알림 1건(request_accepted, 예약 id 포함), 사장A 본인 알림 없음
select '[R-01] 수락', status from respond_to_request(:r1, :sa, true, 50000);
select '[R-01] 사장A 알림 수 (0이어야 함)', count(*) from notifications where type in ('reservation_new','request_accepted');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '[R-01] 단체 알림', type, title, body, request_id = :r1 as req, reservation_id is not null as res
  from notifications order by id;
select id as res1, start_at as res1_at from reservations where request_id = :r1 \gset

-- 같은 시간대 두 번째 요청 → 가게A 남은 자리 20 으로 보임
reset role;
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000f', '{"role":"group","display_name":"동아리장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
insert into groups(leader_id,name) values (auth.uid(),'동아리') returning id as g2 \gset
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person)
  values (:g2,'after_party',:'res1_at',25,10000) returning id as r2 \gset
select '[B-05] 같은 시간 25명 (A는 자리 부족)', request_reach(25, (select desired_at from requests where id = :r2));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '[B-07] 25명 요청: 잡힌 20, 남은 20, 수락 불가', committed_headcount, remaining_capacity, can_accept
  from open_requests_for_store(:sa) where request_id = :r2;

-- [B-04] 요청 철회: 본인만, 열린 요청만. 가게들에 마감 알림
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
\set ON_ERROR_STOP 0
select cancel_request(:r2);           -- 남의 요청
select cancel_request(:r1);           -- 이미 확정된 요청
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
select '[B-04] 철회', status from cancel_request(:r2);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select '[B-04] 가게B 마감 알림', title from notifications where request_id = :r2 and type = 'request_closed';
\set ON_ERROR_STOP 0
select respond_to_request(:r2, :sb, true, 0);
\set ON_ERROR_STOP 1

-- [B-09] 행동 플래그: 결제 대기
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '[B-09] 단체·결제대기', a->>'role' role, a->>'can_pay' pay, a->>'pay_method' method, a->>'can_cancel' cancel,
       a->>'cancel_via' via, a->>'can_modify' modify, a->>'can_edit_preorder' preorder, a->>'can_rsvp' rsvp,
       a->>'can_finish' finish, a->>'can_view_contacts' contacts
  from (select reservation_actions(:res1) a) t;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '[B-09] 사장·결제대기', a->>'role' role, a->>'can_pay' pay, a->>'can_cancel' cancel, a->>'can_finish' finish,
       a->>'can_upload_receipt' receipt
  from (select reservation_actions(:res1) a) t;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
\set ON_ERROR_STOP 0
select reservation_actions(:res1);    -- 제3자
select reservation_contacts(:res1);   -- 제3자
\set ON_ERROR_STOP 1

-- [B-01] 연락처: 당사자끼리
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '[B-01] 사장이 보는 연락처', reservation_contacts(:res1) -> 'group';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '[B-01] 단체가 보는 연락처', reservation_contacts(:res1) -> 'store';

-- 결제 → 확정. [R-03] 행사 전 완료 불가, [B-09] 확정 후 플래그
select 'pay', status from pay_deposit_test(:res1);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 0
select finish_reservation(:res1);
\set ON_ERROR_STOP 1
select '[B-09] 사장·확정·행사 전', a->>'can_finish' finish, a->>'can_upload_receipt' receipt
  from (select reservation_actions(:res1) a) t;
reset role;
update reservations set start_at = now() - interval '1 hour' where id = :res1;
set role authenticated;
select '[B-09] 사장·확정·행사 후', a->>'can_finish' finish from (select reservation_actions(:res1) a) t;
select '[R-03] 완료', status from finish_reservation(:res1);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '[B-09] 단체·완료', a->>'can_pay' pay, a->>'can_cancel' cancel, a->>'can_edit_preorder' preorder,
       a->>'can_view_contacts' contacts
  from (select reservation_actions(:res1) a) t;

-- [B-07③] 빈 날짜 닫기: 열림↔닫힘만 직접 가능, 예약된 날짜는 수정 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into slots(store_id,start_at,end_at,capacity,deposit_amount)
  values (:sb, now()+interval '5 day', now()+interval '5 day 3 hour', 30, 0) returning id as sl1 \gset
insert into slots(store_id,start_at,end_at,capacity,deposit_amount)
  values (:sb, now()+interval '6 day', now()+interval '6 day 3 hour', 30, 0) returning id as sl2 \gset
update slots set status = 'closed' where id = :sl1;
update slots set status = 'open', capacity = 25 where id = :sl1;
\set ON_ERROR_STOP 0
update slots set status = 'booked' where id = :sl1;
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '[B-07] 슬롯 예약', status from book_slot(:sl2, :g, 'after_party', 20, 10000);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select '[B-07] 슬롯 예약 → 사장 알림', type, title from notifications where type = 'reservation_new';
\set ON_ERROR_STOP 0
update slots set status = 'closed' where id = :sl2;
update slots set capacity = 10 where id = :sl2;
\set ON_ERROR_STOP 1
select '[B-07] 슬롯 상태', id = :sl1 as is_sl1, status, capacity from slots where store_id = :sb order by id;
-- 예약 취소(함수)는 여전히 booked → open 전환 가능
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'cancel', status from cancel_reservation((select id from reservations where slot_id = :sl2));
reset role;
select '[B-07] 취소 후 슬롯 재개방', status from slots where id = :sl2;

-- 권한 확인
select '[권한] anon 연락처 함수', has_function_privilege('anon', 'public.reservation_contacts(bigint)', 'execute');
select '[권한] anon 요청 철회', has_function_privilege('anon', 'public.cancel_request(bigint)', 'execute');
select '[권한] 로그인 행동 플래그', has_function_privilege('authenticated', 'public.reservation_actions(bigint)', 'execute');
select '[권한] 수락 알림 트리거 제거', count(*) from pg_trigger where tgname = 'trg_response_changed';
