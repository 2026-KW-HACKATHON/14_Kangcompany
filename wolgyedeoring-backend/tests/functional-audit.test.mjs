// 실제 PostgreSQL 엔진을 메모리에서 실행. Supabase/운영 DB에 접속하지 않는다.
import { PGlite } from '@electric-sql/pglite'
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
const db = new PGlite()
const owner='00000000-0000-0000-0000-000000000001'
const leader='00000000-0000-0000-0000-000000000002'
let store, group
const sql = (text,params=[]) => db.query(text,params)
const as = (id) => sql("select set_config('request.jwt.claim.sub',$1,false)",[id])
const payload=(offset=7,capacity=24)=>({start_at:new Date(Date.now()+offset*864e5).toISOString(),end_at:new Date(Date.now()+offset*864e5+7200000).toISOString(),capacity,deposit_amount:100000})
const publish=(key,items)=>sql('select publish_slots($1,$2,$3::jsonb) as value',[store,key,JSON.stringify(items)])
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;
 alter default privileges in schema public grant all on tables to authenticated;
 alter default privileges in schema public grant all on sequences to authenticated;`)
 const dir=new URL('../supabase/migrations/',import.meta.url)
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'))
 await sql("insert into auth.users values($1,'{\"role\":\"owner\",\"display_name\":\"로컬 사장님\"}'),($2,'{\"role\":\"group\",\"display_name\":\"로컬 대표\"}')",[owner,leader])
 store=(await sql("insert into stores(owner_id,name,max_capacity) values($1,'로컬 가게',30) returning id",[owner])).rows[0].id
 group=(await sql("insert into groups(leader_id,name,group_type) values($1,'로컬 단체','club') returning id",[leader])).rows[0].id
})
after(()=>db.close())
test('일괄 공개: 부분 실패 전체 롤백, 성공 재시도 중복 없음',async()=>{
 await as(owner)
 await db.exec('set role authenticated')
 const key=crypto.randomUUID(), good=payload(), bad=payload(8,31)
 const before=(await sql('select count(*)::int as n from slots')).rows[0].n
 await assert.rejects(publish(key,[good,bad]))
 assert.equal((await sql('select count(*)::int as n from slots')).rows[0].n,before)
 const input=[good,payload(8)]
 const a=(await publish(key,input)).rows[0].value
 const b=(await publish(key,input)).rows[0].value
 assert.equal(a.length,2); assert.deepEqual(a,b)
 assert.equal((await sql('select count(*)::int as n from slots')).rows[0].n,before+2)
 await assert.rejects(publish(key,[payload(9)]))
 await db.exec('reset role')
})
test('공개 요청은 소유자만, anon 함수 실행/기록 조회 불가',async()=>{
 await as(leader);await assert.rejects(publish(crypto.randomUUID(),[payload()]))
 await db.exec('set role anon')
 await assert.rejects(publish(crypto.randomUUID(),[payload()]))
 await assert.rejects(sql('select * from slot_publish_batches'))
 await db.exec('reset role')
})
test('과거 공개/재공개, 중복/소수/누락 조건 거절',async()=>{
 await as(owner)
 for(const items of [[payload(-1)],[payload(),payload()],[payload(7,1.5)],[{...payload(),deposit_amount:-1}],[{...payload(),capacity:null}]]) {
  // 중복 사례는 완전히 동일한 시각을 사용한다.
  if(items.length===2)items[1]={...items[0]}
  await assert.rejects(publish(crypto.randomUUID(),items))
 }
 await assert.rejects(sql('insert into slots(store_id,start_at,end_at,capacity,deposit_amount) values($1,now()-interval \'1 hour\',now()+interval \'1 hour\',10,0)',[store]))
 const s=(await sql("insert into slots(store_id,start_at,end_at,capacity,deposit_amount,status) values($1,now()-interval '1 hour',now()+interval '1 hour',10,0,'closed') returning id",[store])).rows[0].id
 await assert.rejects(sql("update slots set status='open' where id=$1",[s]))
})
async function survey(){
 await as(leader)
 const request=(await sql("insert into requests(group_id,event_type,desired_at,headcount,budget_per_person) values($1,'etc',now()+interval '7 days',24,25000) returning id",[group])).rows[0].id
 const r=(await sql("insert into reservations(group_id,store_id,request_id,source,event_type,start_at,headcount,deposit_amount,status) values($1,$2,$3,'request','etc',now()+interval '7 days',24,0,'confirmed') returning id",[group,store,request])).rows[0].id
 const rv=(await sql('select create_rsvp($1) as value',[r])).rows[0].value
 return {r,...rv}
}
test('참석 응답/수정/삭제는 예약 24명 유지, 마감에만 반영',async()=>{
 const v=await survey()
 await db.exec('set role anon')
 const one=(await sql("select respond_rsvp($1,'참석1',true) as value",[v.token])).rows[0].value
 await sql("select respond_rsvp($1,'참석2',true)",[v.token])
 await db.exec('reset role')
 assert.equal((await sql('select headcount from reservations where id=$1',[v.r])).rows[0].headcount,24)
 assert.equal((await sql('select expected_headcount from rsvps where id=$1',[v.rsvp_id])).rows[0].expected_headcount,24)
 await db.exec('set role anon')
 await sql("select respond_rsvp($1,'참석1',false,null,$2)",[v.token,one.edit_key])
 await db.exec('reset role');await as(leader)
 assert.equal((await sql('select headcount from reservations where id=$1',[v.r])).rows[0].headcount,24)
 const del=(await sql("select id from rsvp_responses where rsvp_id=$1 and name='참석1'",[v.rsvp_id])).rows[0].id
 await sql('select delete_rsvp_response($1)',[del])
 assert.equal((await sql('select headcount from reservations where id=$1',[v.r])).rows[0].headcount,24)
 const close=(await sql('select close_rsvp($1) as value',[v.r])).rows[0].value
 assert.deepEqual(close,{attending_count:1,headcount:1})
 const first=(await sql("select count(*)::int as n from notifications where type='rsvp_closed' and reservation_id=$1",[v.r])).rows[0].n
 await sql('select close_rsvp($1)',[v.r])
 assert.equal((await sql("select count(*)::int as n from notifications where type='rsvp_closed' and reservation_id=$1",[v.r])).rows[0].n,first)
})
test('참석 0명 마감은 기존 인원 유지, 조사 재개해도 모집 인원 유지',async()=>{
 const v=await survey()
 assert.deepEqual((await sql('select close_rsvp($1) as value',[v.r])).rows[0].value,{attending_count:0,headcount:24})
 await sql('select create_rsvp($1)',[v.r])
 assert.equal((await sql('select expected_headcount from rsvps where id=$1',[v.rsvp_id])).rows[0].expected_headcount,24)
})
