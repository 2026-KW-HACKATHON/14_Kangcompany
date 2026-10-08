-- =====================================================================
-- 월계더링 시연용 데모 데이터
-- 전제: 001~009 실행 완료 + scripts/create-demo-users.mjs 로 데모 계정 생성 완료
-- SQL Editor 에서 실행. 여러 번 실행해도 데모 계정의 기존 데이터를 지우고 다시 만든다
-- 날짜는 실행 시점 기준 (지난 8주 이력 + 앞으로 2주 일정)
-- =====================================================================
do $$
declare
  u_o1 uuid; u_o2 uuid; u_o3 uuid;
  u_sw uuid; u_ee uuid; u_band uuid; u_fc uuid; u_town uuid;
  s_meat bigint; s_chicken bigint; s_snack bigint;
  g_sw bigint; g_ee bigint; g_band bigint; g_fc bigint; g_town bigint;
  v_groups bigint[]; v_stores bigint[]; v_events text[];
  i int; v_g bigint; v_s bigint; v_ev text; v_at timestamptz; v_hc int; v_budget int;
  v_req bigint; v_res bigint; v_rc bigint; v_status text; v_total int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  m record;
  v_layout jsonb; v_sum jsonb;
begin
  perform setseed(0.42);  -- 매번 같은 데이터

  select id into u_o1   from auth.users where email = 'owner1@wolgye.demo';
  select id into u_o2   from auth.users where email = 'owner2@wolgye.demo';
  select id into u_o3   from auth.users where email = 'owner3@wolgye.demo';
  select id into u_sw   from auth.users where email = 'sw@wolgye.demo';
  select id into u_ee   from auth.users where email = 'ee@wolgye.demo';
  select id into u_band from auth.users where email = 'band@wolgye.demo';
  select id into u_fc   from auth.users where email = 'fc@wolgye.demo';
  select id into u_town from auth.users where email = 'town@wolgye.demo';
  if u_o1 is null or u_town is null then
    raise exception '데모 계정이 없습니다. scripts/create-demo-users.mjs 를 먼저 실행하세요';
  end if;

  -- 기존 데모 데이터 정리 (연쇄 삭제)
  delete from public.stores where owner_id in (u_o1, u_o2, u_o3);
  delete from public.groups where leader_id in (u_sw, u_ee, u_band, u_fc, u_town);
  delete from public.notifications where user_id in (u_o1, u_o2, u_o3, u_sw, u_ee, u_band, u_fc, u_town);

  -- 가게 · 메뉴
  -- 전화번호·좌표는 시연용 가상 값 (좌표는 광운대 인근 임의 지점, 실제 가게 위치 아님)
  insert into public.stores (owner_id, name, address, max_capacity, phone, intro, lat, lng)
  values (u_o1, '고기굽는집', '서울 노원구 월계1동', 60, '02-0000-0001', '단체석 60석, 개강·종강총회 전문', 37.6188, 127.0581) returning id into s_meat;
  insert into public.stores (owner_id, name, address, max_capacity, phone, intro, lat, lng)
  values (u_o2, '월계치킨', '서울 노원구 월계1동', 40, '02-0000-0002', '뒤풀이 단골집, 생맥주 단체 할인', 37.6201, 127.0569) returning id into s_chicken;
  insert into public.stores (owner_id, name, address, max_capacity, phone, intro, lat, lng)
  values (u_o3, '광운분식', '서울 노원구 월계1동', 30, '02-0000-0003', '간식행사 대량 포장 가능', 37.6179, 127.0602) returning id into s_snack;

  -- 데모 계정 연락처 (B-01, 가상 번호)
  update public.profiles set phone = '010-0000-0' || lpad(n::text, 3, '0')
    from (values (u_o1, 1), (u_o2, 2), (u_o3, 3), (u_sw, 11), (u_ee, 12), (u_band, 13), (u_fc, 14), (u_town, 15)) v(uid, n)
   where id = v.uid;

  insert into public.menus (store_id, name, price) values
    (s_meat, '삼겹살', 15000), (s_meat, '목살', 16000), (s_meat, '된장찌개', 8000),
    (s_meat, '공기밥', 1000), (s_meat, '소주', 5000), (s_meat, '맥주', 5000), (s_meat, '음료수', 2000),
    (s_chicken, '후라이드치킨', 20000), (s_chicken, '양념치킨', 21000), (s_chicken, '반반치킨', 21000),
    (s_chicken, '치즈볼', 5000), (s_chicken, '생맥주 500cc', 4500), (s_chicken, '콜라 1.25L', 3000),
    (s_snack, '떡볶이', 5000), (s_snack, '순대', 5000), (s_snack, '튀김세트', 6000),
    (s_snack, '김밥', 3500), (s_snack, '컵떡볶이', 3000), (s_snack, '음료', 1500);

  -- 메뉴 분류 (005)
  update public.menus set category = case
      when name in ('삼겹살', '목살', '후라이드치킨', '양념치킨', '반반치킨', '떡볶이', '순대') then 'main'
      when name in ('된장찌개', '치즈볼', '튀김세트') then 'side'
      when name in ('공기밥', '김밥', '컵떡볶이') then 'meal'
      when name in ('소주', '맥주', '음료수', '생맥주 500cc', '콜라 1.25L', '음료') then 'drink'
      else 'etc' end
   where store_id in (s_meat, s_chicken, s_snack);

  -- 단체
  insert into public.groups (leader_id, name, group_type) values (u_sw,   '소프트웨어학부 학생회', 'student_council') returning id into g_sw;
  insert into public.groups (leader_id, name, group_type) values (u_ee,   '전자공학과 학생회',     'student_council') returning id into g_ee;
  insert into public.groups (leader_id, name, group_type) values (u_band, '밴드 동아리 소리모아',  'club')            returning id into g_band;
  insert into public.groups (leader_id, name, group_type) values (u_fc,   '축구 동아리 KW FC',     'club')            returning id into g_fc;
  insert into public.groups (leader_id, name, group_type) values (u_town, '월계1동 주민모임',      'residents')       returning id into g_town;

  v_groups := array[g_sw, g_ee, g_band, g_fc, g_town];
  v_stores := array[s_meat, s_chicken, s_snack];
  v_events := array['opening_party', 'after_party', 'after_party', 'snack_event', 'etc'];

  -- ----------------------------------------------------------------
  -- 지난 8주: 완료된 행사 20건 (+ 노쇼 2, 취소 2)
  -- ----------------------------------------------------------------
  for i in 1..24 loop
    v_g  := v_groups[1 + floor(random() * 5)::int];
    v_ev := case when v_g = g_town then 'etc' else v_events[1 + floor(random() * 5)::int] end;
    v_s  := case when v_ev = 'snack_event' then s_snack
                 else v_stores[1 + floor(random() * 2)::int] end;          -- 행사는 고기집·치킨집
    -- 화~목 저녁에 몰리도록
    v_at := (date_trunc('week', (v_today - (3 + floor(random() * 53))::int)::timestamp)
             + make_interval(days => (array[1,2,2,3,3,4,0])[1 + floor(random() * 7)::int])
             + interval '19 hours') at time zone 'Asia/Seoul';
    if v_at > now() - interval '1 day' then v_at := v_at - interval '7 day'; end if;
    v_hc := least(15 + floor(random() * 30)::int, (select max_capacity from public.stores where id = v_s));
    v_budget := case when v_ev = 'snack_event' then 5000 else 15000 + 5000 * floor(random() * 2)::int end;
    v_status := case when i in (5, 17) then 'no_show' when i in (9, 21) then 'cancelled' else 'completed' end;

    insert into public.requests (group_id, event_type, desired_at, headcount, budget_per_person, status, created_at)
    values (v_g, v_ev, v_at, v_hc, v_budget, 'confirmed', v_at - interval '10 day') returning id into v_req;
    insert into public.request_responses (request_id, store_id, status, deposit_amount)
    values (v_req, v_s, 'accepted', case when v_s = s_snack then 0 else 50000 end);
    insert into public.reservations (group_id, store_id, source, request_id, event_type, start_at,
                                     headcount, budget_per_person, deposit_amount, status, created_at)
    values (v_g, v_s, 'request', v_req, v_ev, v_at, v_hc, v_budget,
            case when v_s = s_snack then 0 else 50000 end, v_status, v_at - interval '9 day')
    returning id into v_res;
    if v_s <> s_snack and v_status <> 'cancelled' then
      insert into public.payments (reservation_id, amount, status, pg_provider, pg_tx_id, paid_at)
      values (v_res, 50000, 'paid', 'test', 'TEST-SEED-' || v_res, v_at - interval '8 day');
    elsif v_s <> s_snack then
      insert into public.payments (reservation_id, amount, status, pg_provider, pg_tx_id, paid_at)
      values (v_res, 50000, 'refunded', 'test', 'TEST-SEED-' || v_res, v_at - interval '8 day');
    end if;

    -- 완료된 행사: 영수증 + 품목 (인원에 비례한 주문량)
    if v_status = 'completed' then
      insert into public.receipts (reservation_id, uploaded_by, status, is_itemized, receipt_at,
                                   store_name_raw, total_amount)
      values (v_res, (select owner_id from public.stores where id = v_s), 'done', true,
              v_at + interval '2 hour 30 minute', (select name from public.stores where id = v_s), 0)
      returning id into v_rc;

      for m in select id, name, price from public.menus where store_id = v_s loop
        insert into public.receipt_items (receipt_id, raw_name, menu_id, qty, unit_price, amount, confidence)
        select v_rc, m.name, m.id, q, m.price, q * m.price, 'high'
          from (select greatest(1, round(v_hc * case
                  when m.name in ('삼겹살', '목살')              then 0.45 + random() * 0.3
                  when m.name in ('소주', '맥주', '생맥주 500cc') then 0.5 + random() * 0.6
                  when m.name like '%치킨'                       then 0.12 + random() * 0.12
                  when m.name in ('떡볶이', '컵떡볶이', '김밥')    then 0.6 + random() * 0.5
                  else 0.1 + random() * 0.25 end)::int) as q) t
         where random() < 0.85 or m.name in ('삼겹살', '후라이드치킨', '떡볶이');
      end loop;

      select coalesce(sum(amount), 0) into v_total from public.receipt_items where receipt_id = v_rc;
      update public.receipts set total_amount = v_total where id = v_rc;
    end if;
  end loop;

  -- 보정 시연용: 가장 최근 완료 행사 하나를 '확인 필요' 영수증으로
  select r.id into v_res from public.reservations r
   where r.store_id = s_meat and r.status = 'completed' order by r.start_at desc limit 1;
  if v_res is not null then
    delete from public.receipts where reservation_id = v_res;
    insert into public.receipts (reservation_id, uploaded_by, status, is_itemized, receipt_at, store_name_raw,
                                 total_amount, validation_note)
    values (v_res, u_o1, 'needs_review', true,
            (select start_at from public.reservations where id = v_res) + interval '2 hour',
            '고기굽는집', 473000, E'확인이 필요한 품목 2개\n품목 합계 468000원과 총액 473000원이 다릅니다 (할인·봉사료 가능성).')
    returning id into v_rc;
    insert into public.receipt_items (receipt_id, raw_name, menu_id, qty, unit_price, amount, confidence, validation_error) values
      (v_rc, '삼겹살(국내산', (select id from public.menus where store_id = s_meat and name = '삼겹살'), 16, 15000, 240000, 'high', null),
      (v_rc, '된장찌개',      (select id from public.menus where store_id = s_meat and name = '된장찌개'), 6, 8000, 48000, 'high', null),
      (v_rc, '소주',          (select id from public.menus where store_id = s_meat and name = '소주'), 24, 5000, 120000, 'medium', null),
      (v_rc, '맥 주',         (select id from public.menus where store_id = s_meat and name = '맥주'), 10, 5000, 5000, 'medium', 'qty*unit_price != amount'),
      (v_rc, '공기밥추가?',   null, 12, 1000, 12000, 'low', 'menu not matched; low confidence');
  end if;

  -- ----------------------------------------------------------------
  -- 미충족 수요: 가게를 못 찾고 만료된 요청 6건
  -- ----------------------------------------------------------------
  insert into public.requests (group_id, event_type, desired_at, headcount, budget_per_person, status, created_at)
  select g, ev, ((v_today - d) + time '19:00') at time zone 'Asia/Seoul', hc, b, 'expired',
         ((v_today - d - 7) + time '12:00') at time zone 'Asia/Seoul'
    from (values (g_sw, 'opening_party', 50, 80, 15000), (g_ee, 'closing_party', 20, 75, 15000),
                 (g_band, 'after_party', 12, 35, 10000), (g_fc, 'after_party', 26, 65, 12000),
                 (g_sw, 'snack_event', 33, 120, 3000), (g_town, 'etc', 40, 25, 10000)) v(g, ev, d, hc, b);
  -- (007 선착순 이후 "수락했지만 단체가 선택하지 않음"은 생길 수 없어 해당 데이터 삭제)

  -- 과거 이력 알림은 지움 (아래 앞으로 일정만 알림으로 남김)
  delete from public.notifications where user_id in (u_o1, u_o2, u_o3, u_sw, u_ee, u_band, u_fc, u_town);

  -- ----------------------------------------------------------------
  -- 앞으로 2주 일정
  -- ----------------------------------------------------------------
  -- 확정된 예약 2건
  insert into public.requests (group_id, event_type, desired_at, headcount, budget_per_person, status)
  values (g_ee, 'after_party', ((v_today + 5) + time '19:00') at time zone 'Asia/Seoul', 34, 15000, 'confirmed') returning id into v_req;
  insert into public.request_responses (request_id, store_id, status, deposit_amount) values (v_req, s_meat, 'accepted', 50000);
  insert into public.reservations (group_id, store_id, source, request_id, event_type, start_at, headcount, budget_per_person, deposit_amount, status)
  values (g_ee, s_meat, 'request', v_req, 'after_party', ((v_today + 5) + time '19:00') at time zone 'Asia/Seoul', 34, 15000, 50000, 'confirmed') returning id into v_res;
  insert into public.payments (reservation_id, amount, status, pg_provider, pg_tx_id, paid_at) values (v_res, 50000, 'paid', 'test', 'TEST-SEED-' || v_res, now());
  insert into public.reservation_items (reservation_id, menu_id, name, unit_price, qty)
  select v_res, id, name, price, q from public.menus
    join (values ('삼겹살', 24), ('목살', 10), ('된장찌개', 4), ('소주', 20)) v(n, q) on v.n = name
   where store_id = s_meat;
  update public.reservations set preorder_updated_at = now() where id = v_res;

  insert into public.slots (store_id, start_at, end_at, capacity, deposit_amount, status)
  values (s_chicken, ((v_today + 8) + time '18:30') at time zone 'Asia/Seoul', ((v_today + 8) + time '21:30') at time zone 'Asia/Seoul', 36, 30000, 'booked');
  insert into public.reservations (group_id, store_id, source, slot_id, event_type, start_at, headcount, budget_per_person, deposit_amount, status)
  values (g_fc, s_chicken, 'slot', currval(pg_get_serial_sequence('public.slots', 'id')), 'after_party',
          ((v_today + 8) + time '18:30') at time zone 'Asia/Seoul', 22, 20000, 30000, 'confirmed') returning id into v_res;
  insert into public.payments (reservation_id, amount, status, pg_provider, pg_tx_id, paid_at) values (v_res, 30000, 'paid', 'test', 'TEST-SEED-' || v_res, now());
  insert into public.reservation_items (reservation_id, menu_id, name, unit_price, qty)
  select v_res, id, name, price, q from public.menus
    join (values ('후라이드치킨', 4), ('양념치킨', 4), ('치즈볼', 3), ('생맥주 500cc', 22)) v(n, q) on v.n = name
   where store_id = s_chicken;
  update public.reservations set preorder_updated_at = now() where id = v_res;

  -- 참석 조사 (006): 응답 18명 중 참석 15명 → 예약 인원 15명으로 반영된 상태
  insert into public.rsvps (reservation_id, token, message, deadline)
  values (v_res, 'demo' || replace(gen_random_uuid()::text, '-', ''), '토요일 경기 끝나고 치킨! 참석 여부 알려주세요',
          ((v_today + 7) + time '18:30') at time zone 'Asia/Seoul');
  insert into public.rsvp_responses (rsvp_id, name, attending, note, edit_key_hash)
  select currval(pg_get_serial_sequence('public.rsvps', 'id')), nm, t.ord <= 15,
         case when t.ord = 3 then '30분 늦어요' end, md5(gen_random_uuid()::text)
    from unnest(array['김민준','이서준','박도윤','최예준','정시우','강하준','조주원','윤지호','장지후','임준서',
                      '한건우','오현우','서우진','신선우','권연우','황유준','안정우','송승우']) with ordinality t(nm, ord);
  update public.reservations set headcount = 15 where id = v_res;

  -- 결제 대기 1건
  insert into public.requests (group_id, event_type, desired_at, headcount, budget_per_person, status)
  values (g_sw, 'snack_event', ((v_today + 10) + time '12:00') at time zone 'Asia/Seoul', 30, 3000, 'confirmed') returning id into v_req;
  insert into public.request_responses (request_id, store_id, status, deposit_amount) values (v_req, s_snack, 'accepted', 0);
  insert into public.reservations (group_id, store_id, source, request_id, event_type, start_at, headcount, budget_per_person, deposit_amount, status)
  values (g_sw, s_snack, 'request', v_req, 'snack_event', ((v_today + 10) + time '12:00') at time zone 'Asia/Seoul', 30, 3000, 0, 'awaiting_payment')
  returning id into v_res;
  insert into public.reservation_items (reservation_id, menu_id, name, unit_price, qty)
  select v_res, id, name, price, 30 from public.menus where store_id = s_snack and name = '컵떡볶이';
  update public.reservations set preorder_updated_at = now() where id = v_res;

  -- 가게가 연 빈 날짜 3건
  insert into public.slots (store_id, start_at, end_at, capacity, deposit_amount) values
    (s_meat,    ((v_today + 6)  + time '18:00') at time zone 'Asia/Seoul', ((v_today + 6)  + time '21:00') at time zone 'Asia/Seoul', 50, 50000),
    (s_meat,    ((v_today + 13) + time '18:00') at time zone 'Asia/Seoul', ((v_today + 13) + time '21:00') at time zone 'Asia/Seoul', 45, 50000),
    (s_chicken, ((v_today + 12) + time '19:00') at time zone 'Asia/Seoul', ((v_today + 12) + time '22:00') at time zone 'Asia/Seoul', 40, 30000);

  -- 열린 요청 2건 → 사장님에게 새 요청 알림. 시연에서 사장님이 직접 수락 (선착순)
  --  (007 이전에는 '수락됐지만 열린 요청'을 넣었으나, 선착순에서는 수락 = 즉시 예약이라 제거)
  insert into public.requests (group_id, event_type, desired_at, flexible_days, headcount, budget_per_person, note)
  values (g_band, 'after_party', ((v_today + 9) + time '20:00') at time zone 'Asia/Seoul', 2, 28, 15000, '공연 끝나고 21시 이후 입장 가능한 곳')
  returning id into v_req;

  insert into public.requests (group_id, event_type, desired_at, flexible_days, headcount, budget_per_person)
  values (g_town, 'etc', ((v_today + 11) + time '18:30') at time zone 'Asia/Seoul', 1, 18, 20000);

  -- ----------------------------------------------------------------
  -- 좌석 배치도 (009): 고기굽는집 게시본 60석
  -- ----------------------------------------------------------------
  v_layout := jsonb_build_object('width', 100, 'height', 70,
    'tables', jsonb_build_array(
      jsonb_build_object('id','t1','label','T1','x',6, 'y',6, 'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t2','label','T2','x',26,'y',6, 'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t3','label','T3','x',46,'y',6, 'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t4','label','T4','x',66,'y',6, 'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t5','label','T5','x',6, 'y',24,'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t6','label','T6','x',26,'y',24,'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t7','label','T7','x',46,'y',24,'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t8','label','T8','x',66,'y',24,'w',14,'h',10,'shape','rect','seats',4),
      jsonb_build_object('id','t9','label','단체1','x',6, 'y',42,'w',40,'h',10,'shape','rect','seats',12),
      jsonb_build_object('id','t10','label','단체2','x',52,'y',42,'w',28,'h',10,'shape','rect','seats',10),
      jsonb_build_object('id','t11','label','바','x',86,'y',6,'w',8,'h',32,'shape','rect','seats',6)),
    'fixtures', jsonb_build_array(
      jsonb_build_object('id','f1','kind','window','label',null,'x',6,'y',0,'w',74,'h',3),
      jsonb_build_object('id','f2','kind','entrance','label',null,'x',40,'y',66,'w',16,'h',4),
      jsonb_build_object('id','f3','kind','counter','label',null,'x',84,'y',58,'w',12,'h',10),
      jsonb_build_object('id','f4','kind','kitchen','label',null,'x',84,'y',42,'w',12,'h',12),
      jsonb_build_object('id','f5','kind','restroom','label',null,'x',4,'y',58,'w',12,'h',10)));
  v_sum := public._validate_layout(v_layout);
  insert into public.store_layouts (store_id, layout, table_count, total_seats, source, updated_by)
  values (s_meat, v_layout, (v_sum ->> 'table_count')::int, (v_sum ->> 'total_seats')::int, 'photo', u_o1);

  -- ----------------------------------------------------------------
  -- 011 시안 입력 칸 (011 을 실행한 DB 에서만 채움)
  -- ----------------------------------------------------------------
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'slots' and column_name = 'price_per_person') then
    execute 'update public.stores set category = $1, hours = $2 where id = $3' using 'restaurant', '매일 11:00–23:00 · 단체석 예약 시 17시부터', s_meat;
    execute 'update public.stores set category = $1, hours = $2 where id = $3' using 'restaurant', '매일 16:00–02:00', s_chicken;
    execute 'update public.stores set category = $1, hours = $2 where id = $3' using 'cafe', '평일 09:00–21:00 · 주말 10:00–20:00', s_snack;
    execute 'update public.groups set affiliation = $1, region = $2, usual_size = $3 where id = $4' using '광운대 소프트웨어학부', '월계1동', 40, g_sw;
    execute 'update public.groups set affiliation = $1, region = $2, usual_size = $3 where id = $4' using '광운대 전자공학과', '월계1동', 30, g_ee;
    execute 'update public.groups set affiliation = $1, region = $2, usual_size = $3 where id = $4' using '광운대 중앙동아리', '월계동', 20, g_band;
    execute 'update public.groups set affiliation = $1, region = $2, usual_size = $3 where id = $4' using '광운대 중앙동아리', '월계동', 25, g_fc;
    execute 'update public.groups set region = $1, usual_size = $2 where id = $3' using '월계1동', 15, g_town;
    execute 'update public.slots set min_headcount = 10, price_per_person = 25000, note = $1 where store_id = $2 and status = $3' using '단체석 한 공간 · 모둠구이 세트', s_meat, 'open';
    execute 'update public.slots set min_headcount = 10, price_per_person = 20000, note = $1 where store_id = $2 and status = $3' using '생맥주 단체 할인', s_chicken, 'open';
  end if;

  raise notice '데모 데이터 생성 완료';
end $;
