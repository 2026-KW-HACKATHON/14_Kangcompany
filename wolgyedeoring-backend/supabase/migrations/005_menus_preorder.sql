-- =====================================================================
-- 월계더링 005: 메뉴판 인식 저장 + 예약 시 메뉴 사전 선택(사전 주문)
-- 001~004 실행 후 SQL Editor 에서 실행
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 메뉴 분류
-- ---------------------------------------------------------------------
alter table public.menus
  add column if not exists category text not null default 'etc'
      check (category in ('main', 'side', 'meal', 'drink', 'etc')),
      -- main: 메인 요리 / side: 곁들임 / meal: 식사(공기밥·면 등) / drink: 주류·음료 / etc: 기타
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_menus_updated_at on public.menus;
create trigger trg_menus_updated_at
before update on public.menus
for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. [사장님] 메뉴 일괄 저장 (메뉴판 인식 결과를 수정·확정한 뒤 호출)
--    p_items: [{ "name": "삼겹살", "price": 15000, "category": "main" }, ...]
--    같은 이름이 있으면 가격·분류 갱신(판매 재개), 없으면 추가
--    p_deactivate_missing = true 면 목록에 없는 기존 메뉴를 판매 중지
--    (삭제하지 않음: 과거 영수증·사전 주문 기록 보존)
-- ---------------------------------------------------------------------
create or replace function public.save_menus(
  p_store_id           bigint,
  p_items              jsonb,
  p_deactivate_missing boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item     jsonb;
  v_name     text;
  v_price    int;
  v_cat      text;
  v_names    text[] := '{}';
  v_inserted int := 0;
  v_updated  int := 0;
  v_off      int := 0;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '저장할 메뉴가 없습니다';
  end if;
  if jsonb_array_length(p_items) > 300 then
    raise exception '메뉴는 한 번에 300개까지 저장할 수 있습니다';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name := btrim(v_item ->> 'name');
    if v_name is null or v_name = '' then
      raise exception '이름이 빈 메뉴가 있습니다';
    end if;
    if length(v_name) > 60 then
      raise exception '메뉴 이름이 너무 깁니다: %', left(v_name, 20);
    end if;
    if v_name = any(v_names) then
      raise exception '같은 이름의 메뉴가 두 번 있습니다: %', v_name;
    end if;
    v_names := v_names || v_name;

    begin
      v_price := nullif(v_item ->> 'price', '')::int;
    exception when others then
      raise exception '가격이 숫자가 아닙니다: %', v_name;
    end;
    if v_price is not null and v_price < 0 then
      raise exception '가격이 음수입니다: %', v_name;
    end if;
    v_cat := coalesce(nullif(v_item ->> 'category', ''), 'etc');
    if v_cat not in ('main', 'side', 'meal', 'drink', 'etc') then
      raise exception '알 수 없는 분류입니다: % (%)', v_cat, v_name;
    end if;

    if exists (select 1 from public.menus where store_id = p_store_id and name = v_name) then
      update public.menus set price = v_price, category = v_cat, is_active = true
       where store_id = p_store_id and name = v_name;
      v_updated := v_updated + 1;
    else
      insert into public.menus (store_id, name, price, category) values (p_store_id, v_name, v_price, v_cat);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  if p_deactivate_missing then
    update public.menus set is_active = false
     where store_id = p_store_id and is_active and not (name = any(v_names));
    get diagnostics v_off = row_count;
  end if;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deactivated', v_off);
end;
$$;


-- ---------------------------------------------------------------------
-- 3. 사전 주문 (예약에 딸린 기본 메뉴)
--    가격은 주문 시점 가격을 복사해 둠 (이후 메뉴 가격이 바뀌어도 유지)
-- ---------------------------------------------------------------------
create table public.reservation_items (
  id              bigint generated always as identity primary key,
  reservation_id  bigint not null references public.reservations(id) on delete cascade,
  menu_id         bigint references public.menus(id) on delete set null,
  name            text   not null,
  unit_price      int    not null check (unit_price >= 0),
  qty             int    not null check (qty between 1 and 999),
  subtotal        int    generated always as (unit_price * qty) stored,
  created_at      timestamptz not null default now(),
  unique (reservation_id, menu_id)
);
create index idx_reservation_items_res on public.reservation_items(reservation_id);

alter table public.reservations
  add column if not exists preorder_updated_at timestamptz;

alter table public.reservation_items enable row level security;
create policy reservation_items_party_read on public.reservation_items
  for select to authenticated using (public.is_reservation_party(reservation_id));
-- 쓰기는 set_preorder 함수로만


-- 사전 주문 수정 가능 시점: 결제 대기 중이거나, 확정 후 행사 24시간 전까지
create or replace function public._preorder_editable(p_res public.reservations)
returns boolean
language sql stable   -- now() 사용
as $$
  select p_res.status = 'awaiting_payment'
      or (p_res.status = 'confirmed' and p_res.start_at > now() + interval '24 hours');
$$;


-- ---------------------------------------------------------------------
-- 4. [단체] 사전 주문 설정 (전체 교체)
--    p_items: [{ "menu_id": 12, "qty": 20 }, ...]   빈 배열이면 사전 주문 비우기
--    반환: 합계·1인당 금액·예산 대비 여부
-- ---------------------------------------------------------------------
create or replace function public.set_preorder(p_reservation_id bigint, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res    public.reservations;
  v_item   jsonb;
  v_menu   public.menus;
  v_qty    int;
  v_ids    bigint[] := '{}';
  v_total  int;
  v_lines  int;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  if not public._preorder_editable(v_res) then
    raise exception '사전 주문을 바꿀 수 없는 예약입니다 (결제 대기 중이거나 행사 24시간 전까지만 가능)';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception '메뉴 목록 형식이 올바르지 않습니다';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception '사전 주문은 50개 메뉴까지 가능합니다';
  end if;

  delete from public.reservation_items where reservation_id = v_res.id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item ->> 'qty')::int;
      select * into v_menu from public.menus where id = (v_item ->> 'menu_id')::bigint;
    exception when others then
      raise exception '메뉴 번호나 수량이 숫자가 아닙니다';
    end;
    if v_menu.id is null or v_menu.store_id <> v_res.store_id then
      raise exception '이 가게의 메뉴가 아닙니다';
    end if;
    if not v_menu.is_active or v_menu.price is null then
      raise exception '주문할 수 없는 메뉴입니다: %', v_menu.name;
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 999 then
      raise exception '수량을 확인하세요: %', v_menu.name;
    end if;
    if v_menu.id = any(v_ids) then
      raise exception '같은 메뉴가 두 번 있습니다: %', v_menu.name;
    end if;
    v_ids := v_ids || v_menu.id;

    insert into public.reservation_items (reservation_id, menu_id, name, unit_price, qty)
    values (v_res.id, v_menu.id, v_menu.name, v_menu.price, v_qty);
    v_menu := null;
  end loop;

  update public.reservations set preorder_updated_at = now() where id = v_res.id;

  select coalesce(sum(subtotal), 0), count(*) into v_total, v_lines
    from public.reservation_items where reservation_id = v_res.id;

  -- 확정된 예약의 사전 주문이 바뀌면 사장님에게 알림 (준비량 변경)
  if v_res.status = 'confirmed' then
    perform public._notify(
      (select owner_id from public.stores where id = v_res.store_id),
      'preorder_changed', '사전 주문이 변경되었습니다',
      (select name from public.groups where id = v_res.group_id) || ' · ' || public._kst(v_res.start_at)
        || format(' · %s개 메뉴 %s원', v_lines, v_total),
      null, v_res.id);
  end if;

  return public._preorder_summary(v_res.id);
end;
$$;


-- 사전 주문 요약 (단체·사장님 화면 공용)
create or replace function public._preorder_summary(p_reservation_id bigint)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'reservation_id', r.id,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'menu_id', i.menu_id, 'name', i.name, 'qty', i.qty,
                'unit_price', i.unit_price, 'subtotal', i.subtotal) order by i.subtotal desc)
              from public.reservation_items i where i.reservation_id = r.id), '[]'::jsonb),
    'total',      coalesce((select sum(subtotal) from public.reservation_items where reservation_id = r.id), 0),
    'headcount',  r.headcount,
    'per_person', round(coalesce((select sum(subtotal) from public.reservation_items where reservation_id = r.id), 0)::numeric / r.headcount),
    'budget_per_person', r.budget_per_person,
    'over_budget', r.budget_per_person is not null and
                   coalesce((select sum(subtotal) from public.reservation_items where reservation_id = r.id), 0)
                   > r.budget_per_person * r.headcount,
    'editable', public._preorder_editable(r)
  )
  from public.reservations r where r.id = p_reservation_id;
$$;

-- [단체·사장님] 사전 주문 조회
create or replace function public.get_preorder(p_reservation_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_reservation_party(p_reservation_id) then
    raise exception '예약 당사자가 아닙니다' using errcode = '42501';
  end if;
  return public._preorder_summary(p_reservation_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 5. "메뉴 고르고 예약"을 한 번에 (예약 생성 + 사전 주문, 둘 중 하나라도 실패하면 전체 취소)
-- ---------------------------------------------------------------------
create or replace function public.book_slot_with_menu(
  p_slot_id           bigint,
  p_group_id          bigint,
  p_event_type        text,
  p_headcount         int,
  p_items             jsonb,
  p_budget_per_person int default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_res public.reservations;
begin
  v_res := public.book_slot(p_slot_id, p_group_id, p_event_type, p_headcount, p_budget_per_person);
  return public.set_preorder(v_res.id, coalesce(p_items, '[]'::jsonb));
end;
$$;

create or replace function public.choose_response_with_menu(p_response_id bigint, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_res public.reservations;
begin
  v_res := public.choose_response(p_response_id);
  return public.set_preorder(v_res.id, coalesce(p_items, '[]'::jsonb));
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public.save_menus(bigint, jsonb, boolean),
  public.set_preorder(bigint, jsonb),
  public.get_preorder(bigint),
  public.book_slot_with_menu(bigint, bigint, text, int, jsonb, int),
  public.choose_response_with_menu(bigint, jsonb),
  public._preorder_summary(bigint)
from public, anon;

revoke execute on function public._preorder_summary(bigint) from authenticated;

grant execute on function
  public.save_menus(bigint, jsonb, boolean),
  public.set_preorder(bigint, jsonb),
  public.get_preorder(bigint),
  public.book_slot_with_menu(bigint, bigint, text, int, jsonb, int),
  public.choose_response_with_menu(bigint, jsonb)
to authenticated;
