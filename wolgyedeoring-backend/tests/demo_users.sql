-- 로컬 테스트용: create-demo-users.mjs 가 하는 일을 흉내 냄
insert into auth.users (email, raw_user_meta_data) values
 ('owner1@wolgye.demo','{"role":"owner","display_name":"고기굽는집 사장님"}'),
 ('owner2@wolgye.demo','{"role":"owner","display_name":"월계치킨 사장님"}'),
 ('owner3@wolgye.demo','{"role":"owner","display_name":"광운분식 사장님"}'),
 ('sw@wolgye.demo','{"role":"group","display_name":"소프트웨어학부 학생회장"}'),
 ('ee@wolgye.demo','{"role":"group","display_name":"전자공학과 학생회장"}'),
 ('band@wolgye.demo','{"role":"group","display_name":"소리모아 회장"}'),
 ('fc@wolgye.demo','{"role":"group","display_name":"KW FC 주장"}'),
 ('town@wolgye.demo','{"role":"group","display_name":"월계1동 주민모임 총무"}');
