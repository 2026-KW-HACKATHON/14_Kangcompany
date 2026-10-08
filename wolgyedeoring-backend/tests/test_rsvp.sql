-- 참석 조사 수동 테스트 (001~010 적용된 빈 DB, 응답 중 예약 인원 유지)
\set ON_ERROR_STOP 1
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}'),
 ('00000000-0000-0000-0000-00000000000d', '{"role":"group","display_name":"다른단체장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,address,max_capacity) values (auth.uid(),'가게A','월계1동',40) returning id as s \gset
insert into slots(store_id,start_at,end_at,capacity,deposit_amount) values (:s, now()+interval '5 day', now()+interval '5 day 3 hour', 3, 0);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name) values (auth.uid(),'밴드부') returning id as g \gset
select id as r from book_slot(1, :g, 'after_party', 2) \gset

-- 다른 단체장은 조사 생성 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
\set ON_ERROR_STOP 0
select create_rsvp(:r);
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select create_rsvp(:r, null, '금요일 공연 뒤풀이! 참석 여부 알려주세요')->>'token' as tok \gset
select 'token length', length(:'tok');
select 'create again same token', create_rsvp(:r)->>'token' = :'tok';

-- 비로그인 구성원
reset role; set role anon;
select 'public', get_rsvp_public(:'tok') - 'start_at' - 'deadline';
select respond_rsvp(:'tok', ' 김 철수 ', true)->>'edit_key' as k1 \gset
select 'r2', respond_rsvp(:'tok', '이영희', true, '늦게 도착')->>'attending_count';
select 'r3 불참', respond_rsvp(:'tok', '박민수', false)->>'attending_count';
reset role; select 'headcount stays 2 before closing', headcount from reservations where id = :r; set role anon;
select 'r4', respond_rsvp(:'tok', '최지훈', true)->>'attending_count';
\set ON_ERROR_STOP 0
select respond_rsvp(:'tok', '정원초과', true);
select respond_rsvp(:'tok', '김철수', false);
select respond_rsvp(:'tok', '김철수', false, null, 'wrongkey');
select respond_rsvp(:'tok', '', true);
select respond_rsvp('없는토큰', '누구', true);
select create_rsvp(:r);
select * from rsvp_responses;
\set ON_ERROR_STOP 1
select '정원초과자 불참 응답은 가능', respond_rsvp(:'tok', '정원초과', false)->>'result';
-- 원래 기기(edit_key)로 김철수 불참 변경 → 자리 생김
select 'edit', respond_rsvp(:'tok', '김철수', false, null, :'k1')->>'attending_count';
reset role; select 'headcount', headcount from reservations where id = :r; set role anon;
select 'full flag', get_rsvp_public(:'tok')->>'full';

-- 대표: 명단 조회, 장난 응답 삭제 / 사장: 명단 못 봄, 인원만
reset role; set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'leader list', string_agg(name || case when attending then '(O)' else '(X)' end, ', ' order by id) from rsvp_responses;
select id as junk from rsvp_responses where name = '최지훈' \gset
select 'delete junk → attending', delete_rsvp_response(:junk);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'owner sees names?', count(*) from rsvp_responses;
select 'owner sees rsvp', count(*) from rsvps;
\set ON_ERROR_STOP 0
select delete_rsvp_response(1);
\set ON_ERROR_STOP 1

-- 마감 → 사장 알림, 마감 후 응답 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'close', close_rsvp(:r);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'owner notif', title, body from notifications where type = 'rsvp_closed';
reset role; set role anon;
\set ON_ERROR_STOP 0
select respond_rsvp(:'tok', '늦은사람', true);
\set ON_ERROR_STOP 1
select 'is_open after close', get_rsvp_public(:'tok')->>'is_open';
-- anon 은 테이블 직접 조회 불가 / 대표 전용 함수 불가
\set ON_ERROR_STOP 0
select count(*) from rsvp_responses;
select close_rsvp(:r);
\set ON_ERROR_STOP 1
-- 예약 취소되면 응답 불가
reset role; set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'reopen', create_rsvp(:r)->>'token' = :'tok';
select 'cancel', status from cancel_reservation(:r);
reset role; set role anon;
select 'cancelled view', get_rsvp_public(:'tok')->>'is_open', get_rsvp_public(:'tok')->>'cancelled';
