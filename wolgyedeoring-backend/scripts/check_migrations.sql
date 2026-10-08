-- 001~010 적용 확인: SQL Editor 에서 실행 → ok 열이 모두 true 면 정상
with expected_fn(name) as (values
  ('respond_to_request'), ('book_slot'), ('pay_deposit_test'), ('cancel_reservation'),
  ('finish_reservation'), ('correct_receipt_item'), ('add_receipt_item'), ('delete_receipt_item'), ('confirm_receipt'),
  ('mark_notifications_read'), ('request_modification'), ('respond_modification'), ('open_requests_for_store'),
  ('store_stats'), ('unmet_demand_stats'), ('prepare_deposit_payment'), ('confirm_zero_deposit'),
  ('finalize_toss_payment'), ('save_menus'), ('set_preorder'), ('get_preorder'),
  ('book_slot_with_menu'),
  ('create_rsvp'), ('get_rsvp_public'), ('respond_rsvp'), ('delete_rsvp_response'), ('close_rsvp'),
  ('expire_old_requests'), ('_store_committed_headcount'),
  ('reservation_contacts'), ('cancel_request'), ('request_reach'), ('reservation_actions'),
  ('save_store_layout'), ('_validate_layout')
),
checks(no, item, expected, actual) as (
  select 1, '테이블 수', '16',  -- 009 에서 store_layouts 추가
         (select count(*)::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
  union all
  select 2, 'RLS 꺼진 테이블', '없음',
         coalesce((select string_agg(relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '없음')
  union all
  select 3, '없는 함수', '없음',
         coalesce((select string_agg(e.name, ', ') from expected_fn e
                    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                       where n.nspname = 'public' and p.proname = e.name)), '없음')
  union all
  select 4, '통계 뷰', 'v_store_item_stats',
         coalesce((select table_name from information_schema.views where table_schema = 'public' and table_name = 'v_store_item_stats'), '없음')
  union all
  select 5, '가입 시 프로필 트리거', 'on_auth_user_created',
         coalesce((select tgname from pg_trigger where tgname = 'on_auth_user_created'), '없음')
  union all
  select 6, '알림 트리거 수 (008 에서 trg_response_changed 제거)', '3',
         (select count(*)::text from pg_trigger where tgname in
           ('trg_request_created', 'trg_response_changed', 'trg_reservation_changed', 'trg_receipt_changed'))
  union all
  select 7, '실시간(Realtime) 등록', 'notifications, rsvp_responses',
         coalesce((select string_agg(tablename::text, ', ' order by tablename) from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename in ('notifications', 'rsvp_responses')), '없음')
  union all
  select 8, '추가 컬럼 (slots.deposit_amount, reservations.modify_status, payments.order_id, menus.category)', '4',
         (select count(*)::text from information_schema.columns where table_schema = 'public' and
           ((table_name, column_name) in (('slots', 'deposit_amount'), ('reservations', 'modify_status'),
                                          ('payments', 'order_id'), ('menus', 'category'))))
  union all
  select 9, '비로그인(anon) 결제 함수 실행 가능?', 'false',
         has_function_privilege('anon', 'public.pay_deposit_test(bigint)', 'execute')::text
  union all
  select 10, '로그인 사용자가 결제 확정 함수 실행 가능?', 'false',
         has_function_privilege('authenticated', 'public.finalize_toss_payment(text,text,int,text,text,timestamptz)', 'execute')::text
  union all
  select 11, '서버(service_role) 결제 확정 함수 실행 가능?', 'true',
         has_function_privilege('service_role', 'public.finalize_toss_payment(text,text,int,text,text,timestamptz)', 'execute')::text
  union all
  select 12, '비로그인(anon) 참석 응답 가능?', 'true',
         has_function_privilege('anon', 'public.respond_rsvp(text,text,boolean,text,text)', 'execute')::text
  union all
  select 13, '비로그인(anon) 조사 생성 가능?', 'false',
         has_function_privilege('anon', 'public.create_rsvp(bigint,timestamptz,text)', 'execute')::text
  union all
  select 14, 'choose_response 제거됨 (선착순 즉시 확정으로 대체)', '없음',
         coalesce((select string_agg(proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname in ('choose_response', 'choose_response_with_menu')), '없음')
  union all
  select 15, 'requests.response_deadline 컬럼', '1',
         (select count(*)::text from information_schema.columns
           where table_schema = 'public' and table_name = 'requests' and column_name = 'response_deadline')
  union all
  select 16, '가게 정보 컬럼 (phone, photo_url, intro, lat, lng)', '5',
         (select count(*)::text from information_schema.columns
           where table_schema = 'public' and table_name = 'stores'
             and column_name in ('phone', 'photo_url', 'intro', 'lat', 'lng'))
  union all
  select 17, 'open_requests_for_store 에 response_deadline 반환', 'true',
         (select (pg_get_function_result(p.oid) like '%response_deadline%')::text
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'open_requests_for_store')
  union all
  select 18, '로그인 사용자가 profiles.role 수정 가능?', 'false',
         has_column_privilege('authenticated', 'public.profiles', 'role', 'update')::text
  union all
  select 19, '로그인 사용자가 request_responses 직접 쓰기 가능?', 'false',
         has_table_privilege('authenticated', 'public.request_responses', 'insert')::text
  union all
  select 20, '빈 날짜 직접 수정 보호 트리거', 'trg_slots_guard_direct_update',
         coalesce((select tgname from pg_trigger where tgname = 'trg_slots_guard_direct_update'), '없음')
  union all
  select 21, '좌석 배치도 테이블 store_layouts (제안 테이블 없음)', 'store_layouts',
         coalesce((select string_agg(table_name::text, ', ') from information_schema.tables
           where table_schema = 'public' and table_name in ('store_layouts', 'layout_suggestions')), '없음')
  union all
  select 22, '로그인 사용자가 배치도 직접 쓰기 가능?', 'false',
         has_table_privilege('authenticated', 'public.store_layouts', 'insert')::text
  union all
  select 23, '소셜 로그인 역할 고르기 choose_role (010)', 'true',
         coalesce((select has_function_privilege('authenticated', p.oid, 'execute')::text
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'choose_role'), 'false')
)
select no, item as "확인 항목", expected as "기대값", actual as "실제값", expected = actual as ok
from checks order by no;
