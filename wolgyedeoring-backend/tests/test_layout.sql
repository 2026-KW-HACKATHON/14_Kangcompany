-- 009 좌석 배치도 테스트 (001~009 적용된 빈 DB)
\set ON_ERROR_STOP 1
\pset footer off
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"owner","display_name":"사장B"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게A',40) returning id as sa \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게B',20) returning id as sb \gset

\set L1 '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":5,"y":5,"w":20,"h":10,"shape":"rect","seats":4},{"id":"t2","label":"창가","x":40,"y":5,"w":10,"h":10,"shape":"round","seats":2}],"fixtures":[{"id":"f1","kind":"entrance","label":null,"x":0,"y":55,"w":10,"h":5}]}'
\set L2 '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":5,"y":5,"w":20,"h":10,"shape":"rect","seats":8}],"fixtures":[]}'

-- [아직 없음] 누구나 조회 가능, 게시본·임시본 없음
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '빈 배치도', get_store_layout(:sa) -> 'published' as published, get_store_layout(:sa) -> 'draft' as draft;

-- [사장A] 임시 저장 → 손님에게는 안 보임
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '임시 저장', r -> 'draft' ->> 'total_seats' as seats, r -> 'draft' ->> 'unpublished_changes' as changed, r -> 'published' as pub
  from (select save_store_layout(:sa, :'L1'::jsonb, 'photo', false) r) t;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '손님: 임시본 안 보임', get_store_layout(:sa) -> 'published' as pub, get_store_layout(:sa) -> 'draft' as draft;
select '손님: 테이블 직접 조회 (게시본만)', count(*) from store_layouts;

-- [사장A] 게시 → 손님에게 보임
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '게시', r -> 'published' ->> 'table_count' as tables, r -> 'published' ->> 'total_seats' as seats,
       r -> 'draft' ->> 'unpublished_changes' as changed
  from (select save_store_layout(:sa, :'L1'::jsonb, 'photo', true) r) t;
-- 임시 저장으로 바꾸면 게시본은 그대로, "게시하지 않은 변경 있음"
select '수정 후 임시 저장', r -> 'published' ->> 'total_seats' as pub_seats, r -> 'draft' ->> 'total_seats' as draft_seats,
       r -> 'draft' ->> 'unpublished_changes' as changed
  from (select save_store_layout(:sa, :'L2'::jsonb, 'manual', false) r) t;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '손님: 게시본만', get_store_layout(:sa) -> 'published' ->> 'total_seats' as seats, get_store_layout(:sa) ->> 'is_owner' as owner;

-- [권한] 남의 가게 저장 불가, 테이블 직접 쓰기 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
select save_store_layout(:sa, :'L1'::jsonb, 'manual', true);
insert into store_layouts(store_id, kind, layout, table_count, total_seats) values (:sb, 'published', :'L1'::jsonb, 1, 1);
\set ON_ERROR_STOP 1

-- [검증] 잘못된 배치도 거절
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 0
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":5,"y":5,"w":20,"h":10,"shape":"rect","seats":0}],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":90,"y":5,"w":20,"h":10,"shape":"rect","seats":2}],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"A","x":5,"y":5,"w":5,"h":5,"shape":"rect","seats":2},{"id":"t2","label":"a","x":20,"y":5,"w":5,"h":5,"shape":"rect","seats":2}],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":300,"tables":[],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[],"fixtures":[]}'::jsonb, 'manual', true);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":5,"y":5,"w":20,"h":10,"shape":"star","seats":2}],"fixtures":[]}'::jsonb);
\set ON_ERROR_STOP 1
select '거절 후 게시본 유지', get_store_layout(:sa) -> 'published' ->> 'total_seats';

-- [제안] 손님 제안 → 사장님 알림, 게시본은 그대로
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '제안', status from suggest_layout_change(:sa, '  창가 2인석이 하나 더 있어요  ');
select '제안2', status from suggest_layout_change(:sa, '입구 위치가 반대예요');
select '제안3', status from suggest_layout_change(:sa, '룸이 빠졌어요');
\set ON_ERROR_STOP 0
select suggest_layout_change(:sa, '네 번째');      -- 대기 중 3개 제한
select suggest_layout_change(:sa, '   ');          -- 빈 내용
select list_layout_suggestions(:sa);               -- 사장님만
\set ON_ERROR_STOP 1
select '내 제안만 보임', count(*) from layout_suggestions;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 0
select suggest_layout_change(:sa, '내 가게');      -- 본인 가게 제안 불가
\set ON_ERROR_STOP 1
select '사장님 알림', type, title, body from notifications where type = 'layout_suggested' order by id limit 1;
select '대기 중 제안 수', get_store_layout(:sa) ->> 'pending_suggestions';
select '제안 목록', note, status, suggester_name from list_layout_suggestions(:sa) order by id limit 1;
select id as sug from layout_suggestions where note like '창가%' \gset
select '응답', status from respond_layout_suggestion(:sug, true);
\set ON_ERROR_STOP 0
select respond_layout_suggestion(:sug, false);     -- 이미 답변
\set ON_ERROR_STOP 1
select '응답 후 게시본 그대로', get_store_layout(:sa) -> 'published' ->> 'total_seats';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
select respond_layout_suggestion((select max(id) from layout_suggestions), true); -- 남의 가게 (RLS 로 안 보여 null → 없음)
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '제안자 알림', type, title from notifications where type = 'layout_suggestion_answered';
select '제안 하나 답변 후 다시 제안 가능', status from suggest_layout_change(:sa, '화장실 위치 확인 부탁드려요');

-- 권한
reset role;
select '[권한] anon 조회', has_function_privilege('anon', 'public.get_store_layout(bigint)', 'execute');
select '[권한] 로그인 검증 함수 직접', has_function_privilege('authenticated', 'public._validate_layout(jsonb)', 'execute');
select '[권한] 로그인 직접 쓰기', has_table_privilege('authenticated', 'public.store_layouts', 'insert');
