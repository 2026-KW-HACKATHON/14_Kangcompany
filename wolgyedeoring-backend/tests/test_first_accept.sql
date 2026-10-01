-- 007 선착순 확정 테스트 (001~007 적용된 빈 DB)
\set ON_ERROR_STOP 1
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"owner","display_name":"사장B"}'),
 ('00000000-0000-0000-0000-00000000000e', '{"role":"owner","display_name":"작은가게"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게A',40) returning id as sa \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게B',40) returning id as sb \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'작은가게',10) returning id as se \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name) values (auth.uid(),'학생회') returning id as g \gset

-- [기한 계산] 8일 뒤 행사 → 24시간, 5일 뒤 → 12시간
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g,'opening_party',now()+interval '8 day',20,15000) returning id, desired_at, response_deadline, (response_deadline-created_at) as gap \gset r8_
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g,'closing_party',now()+interval '5 day',20,15000) returning id, (response_deadline-created_at) as gap \gset r5_
select '8일 뒤 기한', :'r8_gap';
select '5일 뒤 기한', :'r5_gap';

-- [선착순] 가게A, 가게B 동시 경쟁 → 먼저 수락한 쪽만 확정, 나머지는 마감
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A 수락', status from respond_to_request(:r8_id, :sa, true, 30000);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
select respond_to_request(:r8_id, :sb, true, 10000);
\set ON_ERROR_STOP 1
select 'B 알림(마감)', title from notifications where user_id = (select owner_id from stores where id = :sb) and type = 'request_closed';
select 'A 알림(마감 없음)', count(*) from notifications where user_id = (select owner_id from stores where id = :sa) and type = 'request_closed';
reset role;
select '요청 상태', status from requests where id = :r8_id;
select '예약 생성', count(*), store_id = :sa as is_store_a from reservations where request_id = :r8_id group by store_id;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '단체 알림', title, body from notifications where type='reservation_new' order by id desc limit 1;

-- [인원 초과] 작은가게(10명)에는 20명 요청 수락 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
\set ON_ERROR_STOP 0
select respond_to_request(:r5_id, :se, true, 0);
\set ON_ERROR_STOP 1

-- [동시간대 합산] 가게A, 같은 시간대에 15명 추가 예약 요청 → 기존 20명+15명=35명은 40명 이하라 통과, 다시 10명 더 추가하면 45명으로 초과
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name) values ('00000000-0000-0000-0000-00000000000c','학생회2') returning id as g2 \gset
-- (같은 리더로 두번째 단체를 만들 수 없으므로 새 리더 사용)
reset role;
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000d', '{"role":"group","display_name":"동아리장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into groups(leader_id,name) values (auth.uid(),'동아리') returning id as g3 \gset
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person)
  values (:g3,'after_party', :'r8_desired_at', 15, 10000) returning id as r2 \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '합산 35명 통과', status from respond_to_request(:r2, :sa, true, 10000);

reset role;
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000f', '{"role":"group","display_name":"동호회장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
insert into groups(leader_id,name) values (auth.uid(),'동호회') returning id as g4 \gset
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person)
  values (:g4,'etc', :'r8_desired_at', 10, 10000) returning id as r3 \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 0
select respond_to_request(:r3, :sa, true, 10000);
\set ON_ERROR_STOP 1

-- [응답 기한] 기한 지난 요청은 수락 불가, 자동 만료
reset role;
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000009', '{"role":"group","display_name":"급한단체"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000009';
insert into groups(leader_id,name) values (auth.uid(),'급한모임') returning id as g5 \gset
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g5,'etc',now()+interval '10 day',5,5000) returning id as r4 \gset
reset role;
update requests set response_deadline = now() - interval '1 minute' where id = :r4;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
select respond_to_request(:r4, :sb, true, 0);
\set ON_ERROR_STOP 1
reset role;
select '자동 만료 처리', expire_old_requests();
select '만료 후 상태', status from requests where id = :r4;

-- [24시간 이내 동시간대 중복 요청 차단]
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g,'etc',now()+interval '20 hour',8,8000) returning id as rsoon \gset
\set ON_ERROR_STOP 0
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g,'etc',(select desired_at from requests where id=:rsoon),8,8000);
\set ON_ERROR_STOP 1
-- 같은 단체, 24시간 넘게 남은 시간대는 중복 허용
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g,'etc',(select desired_at from requests where id=:rsoon) + interval '10 day',8,8000) returning id as rfar \gset
select 'OK: 24h 이내 중복 차단, 24h 밖은 허용' as note;

-- [수정 가능 시한] 24시간 이내 행사는 조건 수정 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select respond_to_request(:rsoon, :sa, true, 0);
reset role;
select id as rsoon_res from reservations where request_id = :rsoon \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
\set ON_ERROR_STOP 0
select request_modification(:rsoon_res, null, 9, null);
\set ON_ERROR_STOP 1

-- [choose_response 제거 확인]
\set ON_ERROR_STOP 0
select choose_response(1);
\set ON_ERROR_STOP 1
