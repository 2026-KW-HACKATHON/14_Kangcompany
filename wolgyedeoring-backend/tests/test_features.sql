-- 003 기능 테스트 (001, 002, 003 적용된 빈 DB)
\set ON_ERROR_STOP 1
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"owner","display_name":"사장B"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게A',40) returning id as s_a \gset
insert into menus(store_id,name,price) values (:s_a,'삼겹살',15000),(:s_a,'소주',5000);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'작은가게B',20) returning id as s_b \gset

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name,group_type) values (auth.uid(),'소프트웨어학부 학생회','student_council') returning id as g \gset
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values (:g,'opening_party',now()+interval '7 day',32,15000) returning id as rq \gset

-- 알림: 32명 요청 → 40석 가게A 사장만 받음
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A 알림', type, title, body from notifications;
select 'A 맞춤요청', count(*) from open_requests_for_store(:s_a);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B 알림 수', count(*) from notifications;
select 'B 맞춤요청', count(*) from open_requests_for_store(:s_b);

-- 수락 → 단체 알림
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select id as resp from respond_to_request(:rq,:s_a,true,50000) \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '단체 알림', title from notifications order by id;
select id as res from reservations where request_id = :rq \gset

-- 조건 수정: 요청 → 결제 차단 → 재요청 차단 → 인원초과 수락 차단 → 수정 후 재요청 불가 확인
select 'modify', modify_status, modify_headcount from request_modification(:res, null, 38, '인원 늘었어요');
\set ON_ERROR_STOP 0
select pay_deposit_test(:res);
select request_modification(:res, null, 30, null);
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A 수정요청 알림', title, body from notifications where type='modify_requested';
select 'modify accept', start_at is not null, headcount, modify_status from respond_modification(:res, true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'pay', status from pay_deposit_test(:res);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'finish', status from finish_reservation(:res);
select '사장A 알림 목록', type from notifications order by id;
select '읽음 처리', mark_notifications_read();
select '안읽은 알림', count(*) from notifications where not is_read;

-- 영수증 → 통계
reset role;
insert into receipts(reservation_id,uploaded_by,status,total_amount) values (:res,'00000000-0000-0000-0000-00000000000a','processing',170000) returning id as rc \gset
insert into receipt_items(receipt_id,raw_name,menu_id,qty,unit_price,amount,confidence) values (:rc,'삼겹살',1,8,15000,120000,'high'),(:rc,'소주',2,10,5000,50000,'high');
update receipts set status='needs_review' where id=:rc;
set role authenticated;
select '영수증 알림', title from notifications where type='receipt_review';
select 'confirm', status from confirm_receipt(:rc);
select 'stats', store_stats(:s_a)->'summary', store_stats(:s_a)->'by_menu', store_stats(:s_a)->'by_group';
-- 다른 사장 조회 차단
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
select store_stats(:s_a);
\set ON_ERROR_STOP 1

-- 미충족 수요: 과거 날짜 요청 2개 (하나는 수락만 받고 선택 안 됨)
reset role;
insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values
 (:g,'after_party',now()-interval '3 day',70,20000),(:g,'snack_event',now()-interval '10 day',25,5000) ;
insert into request_responses(request_id,store_id,status,deposit_amount) select max(id),:s_a,'accepted',0 from requests;
set role authenticated;
select 'unmet', jsonb_pretty(unmet_demand_stats());
-- 단체 계정은 조회 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
\set ON_ERROR_STOP 0
select unmet_demand_stats();
