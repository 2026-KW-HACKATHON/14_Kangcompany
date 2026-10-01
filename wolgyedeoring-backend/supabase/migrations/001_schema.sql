-- =====================================================================
-- 월계더링 DB 스키마 (Supabase / PostgreSQL)
-- Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 한 번에 실행
-- 금액 단위: 원(integer), 시간: timestamptz
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 공통: updated_at 자동 갱신 트리거 함수
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. profiles : 로그인 사용자 + 역할 (Supabase auth.users 와 1:1)
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('group', 'owner')),  -- 단체 대표 / 사장님
  display_name  text not null,
  phone         text,
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. groups : 단체 (학생회, 동아리, 주민모임 등)
-- ---------------------------------------------------------------------
create table public.groups (
  id          bigint generated always as identity primary key,
  leader_id   uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  group_type  text not null default 'etc'
              check (group_type in ('student_council', 'club', 'residents', 'hobby', 'etc')),
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. stores : 가게
-- ---------------------------------------------------------------------
create table public.stores (
  id            bigint generated always as identity primary key,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  address       text,
  max_capacity  int  not null check (max_capacity > 0),   -- 단체석 최대 인원
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 4. menus : 가게 메뉴 마스터 (LLM 품목 매칭 기준)
-- ---------------------------------------------------------------------
create table public.menus (
  id          bigint generated always as identity primary key,
  store_id    bigint not null references public.stores(id) on delete cascade,
  name        text not null,
  price       int  check (price >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (store_id, name)
);


-- ---------------------------------------------------------------------
-- 5. slots : 가게가 먼저 연 날짜 (② 제안 흐름)
-- ---------------------------------------------------------------------
create table public.slots (
  id          bigint generated always as identity primary key,
  store_id    bigint not null references public.stores(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  capacity    int not null check (capacity > 0),
  status      text not null default 'open'
              check (status in ('open', 'booked', 'closed')),
  created_at  timestamptz not null default now(),
  check (end_at > start_at)
);


-- ---------------------------------------------------------------------
-- 6. requests : 단체가 보낸 요청 (① 요청 흐름)
--    가게가 정해지기 전 단계. 여러 가게가 응답할 수 있음
-- ---------------------------------------------------------------------
create table public.requests (
  id                  bigint generated always as identity primary key,
  group_id            bigint not null references public.groups(id) on delete cascade,
  event_type          text not null
                      check (event_type in ('opening_party', 'snack_event', 'after_party', 'closing_party', 'etc')),
  desired_at          timestamptz not null,
  flexible_days       int  not null default 0 check (flexible_days between 0 and 7),  -- 날짜 ±N일 조정 가능
  headcount           int  not null check (headcount > 0),
  budget_per_person   int  not null check (budget_per_person >= 0),
  note                text,
  status              text not null default 'open'
                      check (status in ('open', 'confirmed', 'cancelled', 'expired')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_requests_updated_at
before update on public.requests
for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 7. request_responses : 요청에 대한 가게별 응답 (수락/거절/조건 수정)
-- ---------------------------------------------------------------------
create table public.request_responses (
  id                  bigint generated always as identity primary key,
  request_id          bigint not null references public.requests(id) on delete cascade,
  store_id            bigint not null references public.stores(id)   on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending', 'accepted', 'declined', 'modify_requested')),
  deposit_amount      int  check (deposit_amount >= 0),     -- 가게가 제시한 예약금
  proposed_at         timestamptz,                          -- 조건 수정 시 제안 일시
  proposed_note       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (request_id, store_id)
);

create trigger trg_request_responses_updated_at
before update on public.request_responses
for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 8. reservations : 확정 대상 예약 (요청 수락 또는 슬롯 선택으로 생성)
--    행사 1건당 가게 1곳
-- ---------------------------------------------------------------------
create table public.reservations (
  id                    bigint generated always as identity primary key,
  group_id              bigint not null references public.groups(id) on delete cascade,
  store_id              bigint not null references public.stores(id) on delete cascade,
  source                text   not null check (source in ('request', 'slot')),
  request_id            bigint references public.requests(id) on delete set null,
  slot_id               bigint references public.slots(id)    on delete set null,
  event_type            text   not null
                        check (event_type in ('opening_party', 'snack_event', 'after_party', 'closing_party', 'etc')),
  start_at              timestamptz not null,
  headcount             int    not null check (headcount > 0),
  budget_per_person     int    check (budget_per_person >= 0),
  deposit_amount        int    not null default 0 check (deposit_amount >= 0),
  status                text   not null default 'awaiting_payment'
                        check (status in ('awaiting_payment', 'confirmed', 'completed', 'cancelled', 'no_show')),
  modify_request_used   boolean not null default false,       -- 조건 수정 요청 1회 제한
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (
    (source = 'request' and request_id is not null) or
    (source = 'slot'    and slot_id    is not null)
  )
);

create unique index uq_reservations_request on public.reservations(request_id) where request_id is not null;
create unique index uq_reservations_slot    on public.reservations(slot_id)    where slot_id    is not null;

create trigger trg_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 9. payments : 예약금 결제 (테스트 결제)
-- ---------------------------------------------------------------------
create table public.payments (
  id              bigint generated always as identity primary key,
  reservation_id  bigint not null references public.reservations(id) on delete cascade,
  amount          int    not null check (amount >= 0),
  status          text   not null default 'pending'
                  check (status in ('pending', 'paid', 'failed', 'refunded')),
  pg_provider     text,          -- 결제대행사 이름
  pg_tx_id        text,          -- 결제대행사 거래 ID
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 10. receipts : 영수증 (원본 이미지는 영구 보관하지 않음)
--     image_path 는 처리/보정 중 임시 경로. 완료 후 null 로 비우고 파일 삭제
-- ---------------------------------------------------------------------
create table public.receipts (
  id                bigint generated always as identity primary key,
  reservation_id    bigint not null references public.reservations(id) on delete cascade,
  uploaded_by       uuid   not null references public.profiles(id),
  status            text   not null default 'processing'
                    check (status in ('processing', 'done', 'needs_review', 'failed')),
  is_itemized       boolean,                 -- 품목이 인쇄된 영수증인지 (LLM 판단)
  receipt_at        timestamptz,             -- 영수증에 찍힌 일시
  store_name_raw    text,                    -- 영수증에 찍힌 가맹점명
  total_amount      int check (total_amount >= 0),
  validation_note   text,                    -- 검증 실패 사유 요약
  image_path        text,                    -- 임시 보관 경로 (완료 후 null)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_receipts_updated_at
before update on public.receipts
for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 11. receipt_items : 영수증 품목
-- ---------------------------------------------------------------------
create table public.receipt_items (
  id                bigint generated always as identity primary key,
  receipt_id        bigint not null references public.receipts(id) on delete cascade,
  raw_name          text   not null,                        -- 영수증 인쇄 원문
  menu_id           bigint references public.menus(id) on delete set null,  -- 매칭된 메뉴 (없으면 null)
  qty               int    check (qty > 0),
  unit_price        int    check (unit_price >= 0),
  amount            int    check (amount >= 0),
  confidence        text   check (confidence in ('high', 'medium', 'low')),
  is_corrected      boolean not null default false,         -- 사장님 보정 여부
  validation_error  text,                                   -- 예: 'qty*unit_price != amount'
  created_at        timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 12. 인덱스 (조회·집계용)
-- ---------------------------------------------------------------------
create index idx_groups_leader           on public.groups(leader_id);
create index idx_stores_owner            on public.stores(owner_id);
create index idx_menus_store             on public.menus(store_id);
create index idx_slots_store_start       on public.slots(store_id, start_at);
create index idx_requests_group          on public.requests(group_id);
create index idx_requests_status_date    on public.requests(status, desired_at);
create index idx_responses_request       on public.request_responses(request_id);
create index idx_responses_store         on public.request_responses(store_id);
create index idx_reservations_group      on public.reservations(group_id);
create index idx_reservations_store_date on public.reservations(store_id, start_at);
create index idx_payments_reservation    on public.payments(reservation_id);
create index idx_receipts_reservation    on public.receipts(reservation_id);
create index idx_items_receipt           on public.receipt_items(receipt_id);
create index idx_items_menu              on public.receipt_items(menu_id);


-- ---------------------------------------------------------------------
-- 13. 권한 판별 도우미 함수
-- ---------------------------------------------------------------------
create or replace function public.is_store_owner(p_store_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and owner_id = auth.uid()
  );
$$;

create or replace function public.is_group_leader(p_group_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and leader_id = auth.uid()
  );
$$;

create or replace function public.is_reservation_party(p_reservation_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id
      and (public.is_store_owner(r.store_id) or public.is_group_leader(r.group_id))
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;


-- ---------------------------------------------------------------------
-- 14. RLS (행 단위 접근 권한)
--     원칙: 사장님은 자기 가게 데이터만, 단체는 자기 단체 데이터만
--     Edge Function 에서 service_role 키로 접근하면 RLS 를 우회함
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.stores            enable row level security;
alter table public.menus             enable row level security;
alter table public.slots             enable row level security;
alter table public.requests          enable row level security;
alter table public.request_responses enable row level security;
alter table public.reservations      enable row level security;
alter table public.payments          enable row level security;
alter table public.receipts          enable row level security;
alter table public.receipt_items     enable row level security;

-- profiles : 본인만
create policy profiles_self_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_self_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid());

-- groups : 로그인 사용자 누구나 조회 (사장님이 요청·통계에서 단체명을 봐야 함), 관리는 대표만
create policy groups_read_all on public.groups
  for select to authenticated using (true);
create policy groups_leader_all on public.groups
  for all to authenticated
  using (leader_id = auth.uid()) with check (leader_id = auth.uid());

-- stores : 로그인 사용자 누구나 조회, 수정은 사장님 본인
create policy stores_read_all on public.stores
  for select to authenticated using (true);
create policy stores_owner_write on public.stores
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- menus : 누구나 조회, 수정은 가게 사장님
create policy menus_read_all on public.menus
  for select to authenticated using (true);
create policy menus_owner_write on public.menus
  for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

-- slots : 누구나 조회, 수정은 가게 사장님
create policy slots_read_all on public.slots
  for select to authenticated using (true);
create policy slots_owner_write on public.slots
  for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

-- requests : 단체 대표는 관리, 사장님은 열린 요청 조회
create policy requests_leader_all on public.requests
  for all to authenticated
  using (public.is_group_leader(group_id)) with check (public.is_group_leader(group_id));
create policy requests_owner_read_open on public.requests
  for select to authenticated using (status = 'open' and public.is_owner());

-- request_responses : 사장님은 자기 가게 응답 관리, 단체 대표는 자기 요청의 응답 조회
create policy responses_owner_all on public.request_responses
  for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy responses_leader_read on public.request_responses
  for select to authenticated
  using (exists (
    select 1 from public.requests q
    where q.id = request_id and public.is_group_leader(q.group_id)
  ));

-- reservations : 당사자(단체 대표, 가게 사장님)만
create policy reservations_party_read on public.reservations
  for select to authenticated
  using (public.is_group_leader(group_id) or public.is_store_owner(store_id));
create policy reservations_party_update on public.reservations
  for update to authenticated
  using (public.is_group_leader(group_id) or public.is_store_owner(store_id));
create policy reservations_leader_insert on public.reservations
  for insert to authenticated with check (public.is_group_leader(group_id));

-- payments : 당사자 조회만 (생성·갱신은 Edge Function 에서 service_role 로)
create policy payments_party_read on public.payments
  for select to authenticated using (public.is_reservation_party(reservation_id));

-- receipts : 당사자 조회·업로드
create policy receipts_party_read on public.receipts
  for select to authenticated using (public.is_reservation_party(reservation_id));
create policy receipts_party_insert on public.receipts
  for insert to authenticated
  with check (public.is_reservation_party(reservation_id) and uploaded_by = auth.uid());

-- receipt_items : 당사자 조회, 보정은 가게 사장님
create policy items_party_read on public.receipt_items
  for select to authenticated
  using (exists (
    select 1 from public.receipts rc
    where rc.id = receipt_id and public.is_reservation_party(rc.reservation_id)
  ));
create policy items_owner_update on public.receipt_items
  for update to authenticated
  using (exists (
    select 1 from public.receipts rc
    join public.reservations r on r.id = rc.reservation_id
    where rc.id = receipt_id and public.is_store_owner(r.store_id)
  ));


-- ---------------------------------------------------------------------
-- 15. 사장님 통계용 뷰 (검증 통과한 영수증만 집계)
--     security_invoker = true : 조회하는 사용자의 RLS 가 그대로 적용됨
-- ---------------------------------------------------------------------
create view public.v_store_item_stats
with (security_invoker = true)
as
select
  r.store_id,
  r.group_id,
  g.name                                   as group_name,
  g.group_type,
  r.event_type,
  date_trunc('day', r.start_at)            as event_date,
  coalesce(m.name, ri.raw_name)            as menu_name,
  ri.menu_id,
  sum(ri.qty)                              as total_qty,
  sum(ri.amount)                           as total_amount
from public.receipt_items ri
join public.receipts     rc on rc.id = ri.receipt_id
join public.reservations r  on r.id  = rc.reservation_id
join public.groups       g  on g.id  = r.group_id
left join public.menus   m  on m.id  = ri.menu_id
where rc.status = 'done'
group by r.store_id, r.group_id, g.name, g.group_type, r.event_type,
         date_trunc('day', r.start_at), coalesce(m.name, ri.raw_name), ri.menu_id;
