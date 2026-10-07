-- =====================================================================
-- 월계더링 009: 매장 좌석 배치도 (명세 7, #5) — 단순 게시형
-- 001~008 실행 후 SQL Editor 에서 실행. 다시 실행해도 됨
--
-- 흐름
--  - 사장님: 손그림·평면도·홀 사진 → LLM 이 테이블 후보 (Edge Function extract-layout, 저장 안 함)
--            또는 직접 그리기 → 확인·수정 → 게시 (save_store_layout)
--  - 손님:   가게를 골라 게시된 배치도 보기 (store_layouts 조회)
--  - 손님 수정 제안·임시 저장은 두지 않는다 (팀 결정, 10-07)
--
-- 좌표: 가로 100 기준, 세로 height(40~200). x,y 는 왼쪽 위. 규칙은
--      supabase/functions/extract-layout/layout.ts 와 같다 (프런트도 같은 파일을 사용)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 이전 시안(임시본·제안 포함)을 이미 실행한 DB 정리 — 시연 데이터만 있던 시점
-- ---------------------------------------------------------------------
drop function if exists public.suggest_layout_change(bigint, text);
drop function if exists public.list_layout_suggestions(bigint);
drop function if exists public.respond_layout_suggestion(bigint, boolean);
drop function if exists public.get_store_layout(bigint);
drop function if exists public.save_store_layout(bigint, jsonb, text, boolean);
drop table if exists public.layout_suggestions;
do $$
begin
  -- 이전 시안의 store_layouts 에는 kind 컬럼이 있었다 → 새 구조로 다시 만듦
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'store_layouts' and column_name = 'kind') then
    drop table public.store_layouts;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. 테이블: 가게당 게시된 배치도 1개
-- ---------------------------------------------------------------------
create table if not exists public.store_layouts (
  store_id      bigint primary key references public.stores(id) on delete cascade,
  layout        jsonb  not null,
  table_count   int    not null check (table_count > 0),
  total_seats   int    not null check (total_seats > 0),
  source        text   not null default 'manual' check (source in ('photo', 'manual')),
  updated_by    uuid   references public.profiles(id) on delete set null,
  published_at  timestamptz not null default now()
);

alter table public.store_layouts enable row level security;

-- 로그인 사용자 누구나 조회 (손님이 가게를 골라 봄)
drop policy if exists store_layouts_read on public.store_layouts;
create policy store_layouts_read on public.store_layouts
  for select to authenticated using (true);

-- 쓰기는 아래 함수로만
revoke insert, update, delete on public.store_layouts from authenticated, anon;


-- ---------------------------------------------------------------------
-- 2. 내부: 배치도 JSON 검증 (형식이 틀리면 예외, 맞으면 집계값 반환)
--    프런트는 layout.ts 의 normalizeLayout 으로 정리해서 보내므로, 여기서는 고치지 않고 거절만 한다
-- ---------------------------------------------------------------------
create or replace function public._validate_layout(p jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  v_h      numeric;
  v_t      jsonb;
  v_f      jsonb;
  v_ids    text[] := '{}';
  v_labels text[] := '{}';
  v_seats  int := 0;
  v_count  int := 0;
  v_x numeric; v_y numeric; v_w numeric; v_hh numeric; v_s int; v_label text; v_id text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception '배치도 형식이 올바르지 않습니다';
  end if;
  if (p ->> 'width') is distinct from '100' then
    raise exception '배치도 가로 기준은 100이어야 합니다';
  end if;
  begin
    v_h := (p ->> 'height')::numeric;
  exception when others then
    raise exception '배치도 세로 길이가 숫자가 아닙니다';
  end;
  if v_h is null or v_h < 40 or v_h > 200 then
    raise exception '배치도 세로 길이는 40~200 이어야 합니다';
  end if;
  if jsonb_typeof(p -> 'tables') <> 'array' or jsonb_typeof(p -> 'fixtures') <> 'array' then
    raise exception '테이블·시설 목록 형식이 올바르지 않습니다';
  end if;
  if jsonb_array_length(p -> 'tables') > 100 then
    raise exception '테이블은 100개까지 등록할 수 있습니다';
  end if;
  if jsonb_array_length(p -> 'fixtures') > 50 then
    raise exception '시설은 50개까지 등록할 수 있습니다';
  end if;

  for v_t in select * from jsonb_array_elements(p -> 'tables') loop
    begin
      v_x := (v_t ->> 'x')::numeric; v_y := (v_t ->> 'y')::numeric;
      v_w := (v_t ->> 'w')::numeric; v_hh := (v_t ->> 'h')::numeric;
      v_s := (v_t ->> 'seats')::int;
    exception when others then
      raise exception '테이블 위치·크기·좌석 수가 숫자가 아닙니다';
    end;
    v_id := v_t ->> 'id';
    v_label := btrim(coalesce(v_t ->> 'label', ''));
    if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,20}$' or v_id = any(v_ids) then
      raise exception '테이블 id 가 비었거나 중복입니다';
    end if;
    if v_label = '' or length(v_label) > 10 or lower(v_label) = any(v_labels) then
      raise exception '테이블 이름은 1~10자, 서로 달라야 합니다: %', coalesce(nullif(v_label, ''), '(빈 이름)');
    end if;
    if v_x is null or v_y is null or v_w is null or v_hh is null
       or v_w < 3 or v_hh < 3 or v_x < 0 or v_y < 0 or v_x + v_w > 100.05 or v_y + v_hh > v_h + 0.05 then
      raise exception '테이블 %의 위치가 배치도 밖이거나 너무 작습니다', v_label;
    end if;
    if v_s is null or v_s < 1 or v_s > 30 then
      raise exception '테이블 %의 좌석 수는 1~30 이어야 합니다', v_label;
    end if;
    if coalesce(v_t ->> 'shape', '') not in ('rect', 'round') then
      raise exception '테이블 %의 모양이 올바르지 않습니다', v_label;
    end if;
    v_ids := v_ids || v_id;
    v_labels := v_labels || lower(v_label);
    v_seats := v_seats + v_s;
    v_count := v_count + 1;
  end loop;

  for v_f in select * from jsonb_array_elements(p -> 'fixtures') loop
    begin
      v_x := (v_f ->> 'x')::numeric; v_y := (v_f ->> 'y')::numeric;
      v_w := (v_f ->> 'w')::numeric; v_hh := (v_f ->> 'h')::numeric;
    exception when others then
      raise exception '시설 위치·크기가 숫자가 아닙니다';
    end;
    if coalesce(v_f ->> 'kind', '') not in ('entrance', 'counter', 'kitchen', 'restroom', 'window', 'other') then
      raise exception '시설 종류가 올바르지 않습니다';
    end if;
    if v_x is null or v_y is null or v_w is null or v_hh is null
       or v_w < 3 or v_hh < 3 or v_x < 0 or v_y < 0 or v_x + v_w > 100.05 or v_y + v_hh > v_h + 0.05 then
      raise exception '시설 위치가 배치도 밖이거나 너무 작습니다';
    end if;
    if length(coalesce(v_f ->> 'label', '')) > 10 then
      raise exception '시설 이름은 10자 이내여야 합니다';
    end if;
  end loop;

  return jsonb_build_object('table_count', v_count, 'total_seats', v_seats);
end;
$$;


-- ---------------------------------------------------------------------
-- 3. [사장님] 게시 (바로 손님에게 보임). 다시 게시하면 덮어씀
-- ---------------------------------------------------------------------
create or replace function public.save_store_layout(
  p_store_id bigint,
  p_layout   jsonb,
  p_source   text default 'manual'
)
returns public.store_layouts
language plpgsql security definer set search_path = public
as $$
declare
  v_sum jsonb;
  v_row public.store_layouts;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;
  v_sum := public._validate_layout(p_layout);
  if (v_sum ->> 'table_count')::int = 0 then
    raise exception '테이블이 하나도 없는 배치도는 게시할 수 없습니다';
  end if;

  insert into public.store_layouts (store_id, layout, table_count, total_seats, source, updated_by, published_at)
  values (p_store_id, p_layout, (v_sum ->> 'table_count')::int, (v_sum ->> 'total_seats')::int,
          case when p_source = 'photo' then 'photo' else 'manual' end, auth.uid(), now())
  on conflict (store_id) do update
    set layout = excluded.layout, table_count = excluded.table_count, total_seats = excluded.total_seats,
        source = excluded.source, updated_by = excluded.updated_by, published_at = now()
  returning * into v_row;
  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public._validate_layout(jsonb),
  public.save_store_layout(bigint, jsonb, text)
from public, anon;

revoke execute on function public._validate_layout(jsonb) from authenticated;

grant execute on function public.save_store_layout(bigint, jsonb, text) to authenticated;
