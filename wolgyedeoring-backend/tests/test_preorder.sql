-- 005 메뉴 저장·사전 주문 테스트 (001~005 적용된 빈 DB)
\set ON_ERROR_STOP 1
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '{"role":"owner","display_name":"사장A"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"owner","display_name":"사장B"}'),
 ('00000000-0000-0000-0000-00000000000c', '{"role":"group","display_name":"학생회장"}');
set role authenticated;

-- 사장A: 메뉴판 인식 결과 저장
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게A',40) returning id as s \gset
select 'save1', save_menus(:s, '[{"name":"삼겹살","price":15000,"category":"main"},{"name":"목살","price":16000,"category":"main"},{"name":"소주","price":5000,"category":"drink"},{"name":"시가 메뉴","price":null,"category":"etc"}]');
-- 다시 인식: 삼겹살 가격 인상, 소주 빠짐, 된장찌개 추가, 목록에 없는 메뉴 판매 중지
select 'save2', save_menus(:s, '[{"name":"삼겹살","price":16000,"category":"main"},{"name":"목살","price":16000,"category":"main"},{"name":"된장찌개","price":8000,"category":"side"}]', true);
select 'menus', name, price, category, is_active from menus order by id;
\set ON_ERROR_STOP 0
select save_menus(:s, '[{"name":"A","price":1},{"name":"A","price":2}]');
select save_menus(:s, '[{"name":"B","category":"dessert"}]');
select save_menus(:s, '[{"name":"C","price":"만원"}]');
\set ON_ERROR_STOP 1
insert into slots(store_id,start_at,end_at,capacity,deposit_amount) values
 (:s, now()+interval '5 day', now()+interval '5 day 3 hour', 40, 50000),
 (:s, now()+interval '12 hour', now()+interval '15 hour', 40, 0);
-- 사장B 는 A 메뉴 저장 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into stores(owner_id,name,max_capacity) values (auth.uid(),'가게B',40) returning id as sb \gset
select save_menus(:sb, '[{"name":"치킨","price":20000,"category":"main"}]') is not null as b_menu;
\set ON_ERROR_STOP 0
select save_menus(:s, '[{"name":"해킹","price":1}]');
\set ON_ERROR_STOP 1

-- 학생회: 메뉴 고르고 슬롯 예약 (한 번에)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into groups(leader_id,name) values (auth.uid(),'학생회') returning id as g \gset
select 'book+menu', book_slot_with_menu(1, :g, 'after_party', 20, '[{"menu_id":1,"qty":20},{"menu_id":2,"qty":5}]', 20000);
reset role;
select 'reservations', count(*), max(id) from reservations;
set role authenticated;
select max(id) as r from reservations \gset

-- 실패 시 예약도 만들어지지 않아야 함 (다른 가게 메뉴 / 판매 중지 메뉴 / 가격 없는 메뉴)
\set ON_ERROR_STOP 0
select book_slot_with_menu(2, :g, 'etc', 10, '[{"menu_id":6,"qty":3}]');   -- 다른 가게(B) 메뉴
select book_slot_with_menu(2, :g, 'etc', 10, '[{"menu_id":3,"qty":3}]');
select book_slot_with_menu(2, :g, 'etc', 10, '[{"menu_id":4,"qty":1}]');
select book_slot_with_menu(2, :g, 'etc', 10, '[{"menu_id":1,"qty":0}]');
\set ON_ERROR_STOP 1
reset role;
select 'after failures: reservations', count(*), '슬롯2 상태', (select status from slots where id=2) from reservations;
set role authenticated;

-- 수정: 예산 초과 표시
select 'edit', set_preorder(:r, '[{"menu_id":1,"qty":30},{"menu_id":2,"qty":10}]')->>'over_budget' as over;
select 'edit total', get_preorder(:r)->>'total';

-- 사장A 조회 가능, 사장B 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'owner sees', get_preorder(:r)->>'total', (select count(*) from reservation_items where reservation_id = :r);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B rows', count(*) from reservation_items;
\set ON_ERROR_STOP 0
select get_preorder(:r);
-- 사장은 사전 주문 수정 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select set_preorder(:r, '[]');
\set ON_ERROR_STOP 1

-- 가격 변경 후에도 주문 시점 가격 유지
select save_menus(:s, '[{"name":"삼겹살","price":99000,"category":"main"}]') is not null;
select 'price snapshot', unit_price from reservation_items where menu_id = 1;

-- 확정 후 수정 → 사장 알림 / 24시간 이내 행사는 수정 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select status from pay_deposit_test(:r);
select 'edit confirmed', set_preorder(:r, '[{"menu_id":2,"qty":20}]')->>'total';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'owner notif', title, body from notifications where type = 'preorder_changed';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select (book_slot_with_menu(2, :g, 'etc', 10, '[]')->>'reservation_id')::bigint as r2 \gset
select 'r2 zero', status from confirm_zero_deposit(:r2);
\set ON_ERROR_STOP 0
select set_preorder(:r2, '[{"menu_id":2,"qty":1}]');
