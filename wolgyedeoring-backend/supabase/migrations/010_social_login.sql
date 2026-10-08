-- =====================================================================
-- 월계더링 010: 소셜 로그인(카카오·네이버) 지원
-- 001~009 실행 후 SQL Editor 에서 실행 (다시 실행해도 됨)
--
-- 이메일 가입은 signUp options.data 로 role·display_name 을 넘기지만,
-- 소셜 로그인(signInWithOAuth)은 넘길 수 없어 처음 들어온 사람은 'group' + '이름 없음' 이 된다.
--  1. 새 계정 이름: 소셜 제공자가 주는 이름(name·nickname 등)을 display_name 으로
--  2. choose_role: 단체·가게를 등록하기 전까지 본인 역할을 한 번 고를 수 있게
--     (008 에서 profiles.role 직접 수정 권한을 회수했으므로 RPC 로만)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 새 계정: 소셜 제공자 이름도 받는다 (008 의 phone 저장은 그대로)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, display_name, phone)
  values (
    new.id,
    case when m ->> 'role' in ('group', 'owner') then m ->> 'role' else 'group' end,
    coalesce(
      nullif(btrim(m ->> 'display_name'), ''),
      nullif(btrim(m ->> 'name'), ''),
      nullif(btrim(m ->> 'full_name'), ''),
      nullif(btrim(m ->> 'nickname'), ''),
      nullif(btrim(m ->> 'preferred_username'), ''),
      nullif(btrim(m #>> '{custom_claims,nickname}'), ''),
      '이름 없음'
    ),
    nullif(btrim(m ->> 'phone'), '')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. [로그인 사용자] 역할 고르기 — 단체·가게 등록 전까지만
-- ---------------------------------------------------------------------
create or replace function public.choose_role(p_role text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_role not in ('group', 'owner') then
    raise exception '역할은 group 또는 owner 입니다' using errcode = '22023';
  end if;
  if exists (select 1 from public.groups where leader_id = auth.uid())
     or exists (select 1 from public.stores where owner_id = auth.uid()) then
    raise exception '이미 단체나 가게를 등록해서 역할을 바꿀 수 없어요' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = auth.uid()
  returning * into v_profile;
  if not found then
    raise exception '프로필이 없습니다' using errcode = 'P0002';
  end if;
  return v_profile;
end;
$$;

revoke execute on function public.choose_role(text) from public, anon;
grant  execute on function public.choose_role(text) to authenticated;
