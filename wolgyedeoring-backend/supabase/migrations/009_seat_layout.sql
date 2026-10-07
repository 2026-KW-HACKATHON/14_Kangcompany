-- =====================================================================
-- 월계더링 009: 매장 좌석 배치도 (명세 7, #5)
-- 001~008 실행 후 SQL Editor 에서 실행
--
-- 결정한 작성 방식
--  - 사진(평면도·손그림·실내 사진) → LLM 이 테이블·시설 후보를 만들고 (Edge Function extract-layout, 저장 안 함)
--  - 사장님이 편집 화면(끌어서 옮기기·좌석 수 수정)에서 확인·보정 → 임시 저장 / 게시
--  - 직접 그리기도 같은 저장 함수 사용
--
-- 명세 7 수용 기준
--  1. 매장 상세에서 점주가 게시한 공식 배치도를 우선 조회 → get_store_layout (게시본만 공개)
--  2. 사장님은 생성·수정 후 공식 정보로 게시 → save_store_layout(p_publish)
--  3. 일반 사용자의 제안은 점주 확인 전 공식 배치도를 바꾸지 않음
--     → layout_suggestions 는 글로만 남고, 반영은 사장님이 직접 편집·게시
--
-- 좌표: 가로 100 기준, 세로 height(40~200). x,y 는 왼쪽 위. 규칙은
--      supabase/functions/extract-layout/layout.ts 와 같다 (프런트도 같은 파일을 사용)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
-- 가게당 임시본(draft) 1개 + 게시본(published) 1개
create table public.store_layouts (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references public.stores(id) on delete cascade,
  kind          text   not null check (kind in ('draft', 'published')),
  layout        jsonb  not null,
  table_count   int    not null check (table_count >= 0),
  total_seats   int    not null check (total_seats >= 0),
  source        text   not null default 'manual' check (source in ('photo', 'manual')),
  updated_by    uuid   references public.profiles(id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, kind)
);

create trigger trg_store_layouts_updated_at
before update on public.store_layouts
for each row execute function public.set_updated_at();

-- 일반 사용자의 배치도 수정 제안 (글). 공식 배치도는 바꾸지 않는다
create table public.layout_suggestions (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references public.stores(id) on delete cascade,
  user_id       uuid   not null references public.profiles(id) on delete cascade,
  note          text   not null check (length(btrim(note)) between 1 and 300),
  status        text   not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_layout_suggestions_store on public.layout_suggestions(store_id, status);

alter table public.store_layouts      enable row level security;
alter table public.layout_suggestions enable row level security;

-- 게시본: 로그인 사용자 누구나 / 임시본: 그 가게 사장님만
create policy store_layouts_read on public.store_layouts
  for select to authenticated
  using (kind = 'published' or public.is_store_owner(store_id));

-- 제안: 그 가게 사장님 + 제안한 본인
create policy layout_suggestions_read on public.layout_suggestions
  for select to authenticated
  using (user_id = auth.uid() or public.is_store_owner(store_id));

-- 쓰기는 아래 함수로만
revoke insert, update, delete on public.store_layouts, public.layout_suggestions from authenticated, anon;


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
-- 3. [사장님] 저장 / 게시
--    p_publish = false: 임시본만 저장 (손님에게 안 보임)
--    p_publish = true : 임시본 저장 + 같은 내용을 게시본으로 (손님에게 보임)
-- ---------------------------------------------------------------------
create or replace function public.save_store_layout(
  p_store_id bigint,
  p_layout   jsonb,
  p_source   text default 'manual',
  p_publish  boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sum jsonb;
  v_src text := case when p_source = 'photo' then 'photo' else 'manual' end;
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;
  v_sum := public._validate_layout(p_layout);

  insert into public.store_layouts (store_id, kind, layout, table_count, total_seats, source, updated_by)
  values (p_store_id, 'draft', p_layout, (v_sum ->> 'table_count')::int, (v_sum ->> 'total_seats')::int, v_src, auth.uid())
  on conflict (store_id, kind) do update
    set layout = excluded.layout, table_count = excluded.table_count, total_seats = excluded.total_seats,
        source = excluded.source, updated_by = excluded.updated_by;

  if p_publish then
    if (v_sum ->> 'table_count')::int = 0 then
      raise exception '테이블이 하나도 없는 배치도는 게시할 수 없습니다';
    end if;
    insert into public.store_layouts (store_id, kind, layout, table_count, total_seats, source, updated_by, published_at)
    values (p_store_id, 'published', p_layout, (v_sum ->> 'table_count')::int, (v_sum ->> 'total_seats')::int, v_src, auth.uid(), now())
    on conflict (store_id, kind) do update
      set layout = excluded.layout, table_count = excluded.table_count, total_seats = excluded.total_seats,
          source = excluded.source, updated_by = excluded.updated_by, published_at = now();
  end if;

  return public.get_store_layout(p_store_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. 조회: 게시본(누구나) + 임시본·대기 중 제안 수(사장님만)
-- ---------------------------------------------------------------------
create or replace function public.get_store_layout(p_store_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_owner boolean := public.is_store_owner(p_store_id);
  v_pub   public.store_layouts;
  v_draft public.store_layouts;
begin
  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception '가게를 찾을 수 없습니다';
  end if;
  select * into v_pub from public.store_layouts where store_id = p_store_id and kind = 'published';
  if v_owner then
    select * into v_draft from public.store_layouts where store_id = p_store_id and kind = 'draft';
  end if;

  return jsonb_build_object(
    'store_id', p_store_id,
    'is_owner', v_owner,
    'published', case when v_pub.id is null then null else jsonb_build_object(
      'layout', v_pub.layout, 'table_count', v_pub.table_count, 'total_seats', v_pub.total_seats,
      'source', v_pub.source, 'published_at', v_pub.published_at) end,
    'draft', case when v_draft.id is null then null else jsonb_build_object(
      'layout', v_draft.layout, 'table_count', v_draft.table_count, 'total_seats', v_draft.total_seats,
      'source', v_draft.source, 'updated_at', v_draft.updated_at,
      -- 임시본이 게시본과 다르면 "게시하지 않은 변경 있음"
      'unpublished_changes', v_pub.id is null or v_pub.layout is distinct from v_draft.layout) end,
    'pending_suggestions', case when v_owner then
      (select count(*) from public.layout_suggestions where store_id = p_store_id and status = 'pending') end
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 5. [일반 사용자] 배치도 수정 제안 (공식 배치도는 바꾸지 않음)
--    본인 가게에는 제안 불가, 한 가게에 대기 중 제안은 1인당 3개까지
-- ---------------------------------------------------------------------
create or replace function public.suggest_layout_change(p_store_id bigint, p_note text)
returns public.layout_suggestions
language plpgsql security definer set search_path = public
as $$
declare
  v_note  text := btrim(coalesce(p_note, ''));
  v_row   public.layout_suggestions;
  v_store public.stores;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  select * into v_store from public.stores where id = p_store_id;
  if not found then
    raise exception '가게를 찾을 수 없습니다';
  end if;
  if v_store.owner_id = auth.uid() then
    raise exception '본인 가게는 배치도 화면에서 직접 고칠 수 있습니다';
  end if;
  if length(v_note) < 1 or length(v_note) > 300 then
    raise exception '제안 내용은 1~300자로 입력하세요';
  end if;
  if (select count(*) from public.layout_suggestions
       where store_id = p_store_id and user_id = auth.uid() and status = 'pending') >= 3 then
    raise exception '이 가게에 답변을 기다리는 제안이 이미 3개 있습니다';
  end if;

  insert into public.layout_suggestions (store_id, user_id, note) values (p_store_id, auth.uid(), v_note)
  returning * into v_row;

  perform public._notify(v_store.owner_id, 'layout_suggested', '좌석 배치도 수정 제안이 왔어요',
                         left(v_note, 80));
  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. [사장님] 제안 목록 / 응답
--    수락 = "확인했고 반영하겠다"는 표시. 배치도 반영은 사장님이 편집·게시해야 일어난다 (기준 3)
-- ---------------------------------------------------------------------
create or replace function public.list_layout_suggestions(p_store_id bigint)
returns table (id bigint, note text, status text, created_at timestamptz, responded_at timestamptz, suggester_name text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_store_owner(p_store_id) then
    raise exception '본인 가게가 아닙니다' using errcode = '42501';
  end if;
  return query
  select s.id, s.note, s.status, s.created_at, s.responded_at, p.display_name
    from public.layout_suggestions s
    join public.profiles p on p.id = s.user_id
   where s.store_id = p_store_id
   order by (s.status = 'pending') desc, s.created_at desc
   limit 50;
end;
$$;

create or replace function public.respond_layout_suggestion(p_suggestion_id bigint, p_accept boolean)
returns public.layout_suggestions
language plpgsql security definer set search_path = public
as $$
declare
  v_row   public.layout_suggestions;
  v_store text;
begin
  select * into v_row from public.layout_suggestions where id = p_suggestion_id for update;
  if not found or not public.is_store_owner(v_row.store_id) then
    raise exception '본인 가게의 제안이 아닙니다' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception '이미 답변한 제안입니다';
  end if;

  update public.layout_suggestions
     set status = case when p_accept then 'accepted' else 'rejected' end, responded_at = now()
   where id = v_row.id
  returning * into v_row;

  select name into v_store from public.stores where id = v_row.store_id;
  perform public._notify(v_row.user_id, 'layout_suggestion_answered',
    case when p_accept then v_store || '이(가) 배치도 제안을 반영하기로 했어요'
         else v_store || '이(가) 배치도 제안을 확인했어요' end,
    left(v_row.note, 80));
  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. 권한
-- ---------------------------------------------------------------------
revoke execute on function
  public._validate_layout(jsonb),
  public.save_store_layout(bigint, jsonb, text, boolean),
  public.get_store_layout(bigint),
  public.suggest_layout_change(bigint, text),
  public.list_layout_suggestions(bigint),
  public.respond_layout_suggestion(bigint, boolean)
from public, anon;

revoke execute on function public._validate_layout(jsonb) from authenticated;

grant execute on function
  public.save_store_layout(bigint, jsonb, text, boolean),
  public.get_store_layout(bigint),
  public.suggest_layout_change(bigint, text),
  public.list_layout_suggestions(bigint),
  public.respond_layout_suggestion(bigint, boolean)
to authenticated;
