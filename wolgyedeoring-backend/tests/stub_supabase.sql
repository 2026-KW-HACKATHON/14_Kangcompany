-- 로컬 테스트용: Supabase 의 auth 스키마·역할을 흉내 냄 (실제 Supabase 에서는 실행하지 말 것)
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role anon;          exception when others then null; end $$;
do $$ begin create role service_role;  exception when others then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}', email text unique);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
