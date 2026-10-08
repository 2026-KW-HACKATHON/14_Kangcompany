-- =====================================================================
-- 월계더링 011: 시안(4.12.1) 입력 칸 중 DB 에 없던 것 추가
-- 001~010 실행 후 SQL Editor 에서 실행 (다시 실행해도 됨)
--
--  1. 가게(A-05·S-14): 업종, 상세주소, 영업시간 안내, 사업자등록번호, 통신판매신고번호
--  2. 단체(A-04·G-14): 소속·학교·학과, 활동 지역, 평소 인원 규모, 기타 단체 한 줄 설명
--  3. 빈자리(S-06): 최소 인원, 1인 금액, 안내 — 최소 인원은 예약할 때 서버도 확인
--  4. 사전 주문(G-07): 알레르기·식이 제한 메모 (set_preorder_note)
-- 모두 선택 칸이라 기존 데이터·앱에 영향 없음 (업종만 기본값 '음식점')
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 가게
-- ---------------------------------------------------------------------
alter table public.stores
  add column if not exists category       text not null default 'restaurant'
                                          check (category in ('restaurant', 'cafe', 'venue')),  -- 음식점 / 카페 / 행사·공간
  add column if not exists address_detail text check (address_detail is null or length(address_detail) <= 60),
  add column if not exists hours          text check (hours is null or length(hours) <= 80),
  add column if not exists business_no    text check (business_no is null or length(business_no) <= 20),
  add column if not exists commerce_no    text check (commerce_no is null or length(commerce_no) <= 40);


-- ---------------------------------------------------------------------
-- 2. 단체
-- ---------------------------------------------------------------------
alter table public.groups
  add column if not exists affiliation text check (affiliation is null or length(affiliation) <= 40),
  add column if not exists region      text check (region is null or length(region) <= 40),
  add column if not exists usual_size  int  check (usual_size is null or usual_size between 1 and 200),
  add column if not exists description text check (description is null or length(description) <= 40);


-- ---------------------------------------------------------------------
-- 3. 빈자리
-- ---------------------------------------------------------------------
alter table public.slots
  add column if not exists min_headcount    int  check (min_headcount is null or min_headcount > 0),
  add column if not exists price_per_person int  check (price_per_person is null or price_per_person >= 0),
  add column if not exists note             text check (note is null or length(note) <= 100);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'slots_min_le_capacity') then
    alter table public.slots
      add constraint slots_min_le_capacity check (min_headcount is null or min_headcount <= capacity);
  end if;
end $$;

-- 빈자리로 예약할 때 최소 인원 확인 (book_slot 은 그대로 두고 예약 생성 직전에 검사)
create or replace function public._reservation_slot_min_headcount()
returns trigger
language plpgsql
as $$
declare
  v_min int;
begin
  if new.slot_id is not null then
    select min_headcount into v_min from public.slots where id = new.slot_id;
    if v_min is not null and new.headcount < v_min then
      raise exception '이 빈자리는 %명 이상부터 예약할 수 있어요', v_min using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservation_slot_min_headcount on public.reservations;
create trigger trg_reservation_slot_min_headcount
before insert on public.reservations
for each row execute function public._reservation_slot_min_headcount();


-- ---------------------------------------------------------------------
-- 4. 사전 주문 메모 (알레르기·식이 제한)
--    메뉴와 같은 기간에만 바꿀 수 있다 (결제 대기 중이거나 행사 24시간 전까지, _preorder_editable)
-- ---------------------------------------------------------------------
alter table public.reservations
  add column if not exists preorder_note text check (preorder_note is null or length(preorder_note) <= 200);

create or replace function public.set_preorder_note(p_reservation_id bigint, p_note text)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_group_leader(v_res.group_id) then
    raise exception '본인 단체의 예약이 아닙니다' using errcode = '42501';
  end if;
  if not public._preorder_editable(v_res) then
    raise exception '사전 주문을 바꿀 수 없는 예약입니다 (결제 대기 중이거나 행사 24시간 전까지만 가능)';
  end if;

  update public.reservations
     set preorder_note = nullif(btrim(p_note), '')
   where id = v_res.id
  returning * into v_res;
  return v_res;
end;
$$;

revoke execute on function public.set_preorder_note(bigint, text) from public, anon;
grant  execute on function public.set_preorder_note(bigint, text) to authenticated;
