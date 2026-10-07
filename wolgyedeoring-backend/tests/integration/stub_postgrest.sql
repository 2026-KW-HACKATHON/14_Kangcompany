-- 통합 테스트용 스텁: PostgREST 는 request.jwt.claims(JSON)로 sub 를 넘김 (실제 Supabase auth.uid 와 같은 방식)
do $$ begin create role authenticated nologin; exception when others then null; end $$;
do $$ begin create role anon nologin;          exception when others then null; end $$;
do $$ begin create role service_role nologin;  exception when others then null; end $$;
do $$ begin create role authenticator login password 'auth' noinherit; exception when others then null; end $$;
grant anon, authenticated, service_role to authenticator;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}', email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
