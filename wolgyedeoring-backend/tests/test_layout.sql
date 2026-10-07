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

-- [게시] 사장A → 손님이 바로 조회
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '게시', table_count, total_seats, source from save_store_layout(:sa, :'L1'::jsonb, 'photo');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '손님 조회', s.name, l.table_count, l.total_seats from store_layouts l join stores s on s.id = l.store_id;

-- [다시 게시] 덮어쓰기
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select '다시 게시', table_count, total_seats, source from save_store_layout(:sa, :'L2'::jsonb);
select '행 수 (가게당 1개)', count(*) from store_layouts;

-- [권한] 남의 가게 게시 불가, 테이블 직접 쓰기 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 0
select save_store_layout(:sa, :'L1'::jsonb);
insert into store_layouts(store_id, layout, table_count, total_seats) values (:sb, :'L1'::jsonb, 1, 1);
update store_layouts set total_seats = 999;
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
\set ON_ERROR_STOP 0
select save_store_layout(:sa, :'L1'::jsonb);
\set ON_ERROR_STOP 1

-- [검증] 잘못된 배치도 거절
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 0
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":5,"y":5,"w":20,"h":10,"shape":"rect","seats":0}],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":90,"y":5,"w":20,"h":10,"shape":"rect","seats":2}],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"A","x":5,"y":5,"w":5,"h":5,"shape":"rect","seats":2},{"id":"t2","label":"a","x":20,"y":5,"w":5,"h":5,"shape":"rect","seats":2}],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":300,"tables":[],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[],"fixtures":[]}'::jsonb);
select save_store_layout(:sa, '{"width":100,"height":60,"tables":[{"id":"t1","label":"T1","x":5,"y":5,"w":20,"h":10,"shape":"star","seats":2}],"fixtures":[]}'::jsonb);
\set ON_ERROR_STOP 1
select '거절 후 게시본 유지', total_seats from store_layouts where store_id = :sa;

-- 권한
reset role;
select '[권한] anon 게시', has_function_privilege('anon', 'public.save_store_layout(bigint,jsonb,text)', 'execute');
select '[권한] 로그인 검증 함수 직접', has_function_privilege('authenticated', 'public._validate_layout(jsonb)', 'execute');
select '[권한] 로그인 직접 쓰기', has_table_privilege('authenticated', 'public.store_layouts', 'insert');
select '[정리] 제안 기능 없음', to_regclass('public.layout_suggestions') is null;
