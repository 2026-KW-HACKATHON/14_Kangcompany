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

test('통합 조건: 날짜별 최소 인원·금액·안내 저장과 재시도 보존',async()=>{
 await as(owner); await db.exec('set role authenticated')
 const items=[{...payload(12,30),min_headcount:10,price_per_person:25000,note:'단체석 한 공간'},
              {...payload(13,20),min_headcount:12,price_per_person:0,note:'  카페 모임  '}]
 const key=crypto.randomUUID()
 const rows=(await publish(key,items)).rows[0].value
 assert.deepEqual(rows.map(s=>[s.capacity,s.min_headcount,s.price_per_person,s.note]),[[30,10,25000,'단체석 한 공간'],[20,12,0,'카페 모임']])
 assert.deepEqual((await publish(key,items)).rows[0].value,rows)
 assert.deepEqual((await sql('select min_headcount,price_per_person,note from slots where id=$1',[rows[1].id])).rows[0],{min_headcount:12,price_per_person:0,note:'카페 모임'})
 await db.exec('reset role')
})
test('잘못된 새 조건은 날짜 묶음 전체와 재시도 기록 모두 롤백',async()=>{
 await as(owner)
 for(const extra of [{min_headcount:31},{min_headcount:0},{min_headcount:1.5},{price_per_person:-1},{price_per_person:1.5},{price_per_person:2147483648},{note:'가'.repeat(101)}]) {
  const key=crypto.randomUUID(),before=(await sql('select count(*)::int n from slots')).rows[0].n
  await assert.rejects(publish(key,[{...payload(14,30),min_headcount:10,price_per_person:25000},{...payload(15,30),...extra}]))
  assert.equal((await sql('select count(*)::int n from slots')).rows[0].n,before)
  assert.equal((await sql('select count(*)::int n from slot_publish_batches where id=$1',[key])).rows[0].n,0)
 }
})
test('최소 인원 미달 최초 예약 거절, 마감 보류 후 정원 충족 시만 반영',async()=>{
 await as(owner)
 const slot=(await publish(crypto.randomUUID(),[{...payload(17,30),deposit_amount:0,min_headcount:10,price_per_person:25000}])).rows[0].value[0]
 await as(leader)
 await assert.rejects(sql("select book_slot($1,$2,'etc',9,25000)",[slot.id,group]),/10명 이상/)
 const booking=(await sql("select to_jsonb(book_slot($1,$2,'etc',24,25000)) value",[slot.id,group])).rows[0].value
 const r=booking.id ?? booking.reservation_id
 assert.ok(r)
 const rv=(await sql('select create_rsvp($1) value',[r])).rows[0].value
 for(let n=0;n<2;n++) {
  if(n===1) await sql("select respond_rsvp($1,'첫 참석',true)",[rv.token])
  await assert.rejects(sql('select close_rsvp($1)',[r]),/최소 10명/)
  assert.equal((await sql('select is_closed from rsvps where id=$1',[rv.rsvp_id])).rows[0].is_closed,false)
  assert.equal((await sql('select headcount from reservations where id=$1',[r])).rows[0].headcount,24)
  assert.equal((await sql("select count(*)::int n from notifications where type='rsvp_closed' and reservation_id=$1",[r])).rows[0].n,0)
 }
 for(let i=2;i<=10;i++) await sql('select respond_rsvp($1,$2,true)',[rv.token,`참석${i}`])
 assert.deepEqual((await sql('select close_rsvp($1) value',[r])).rows[0].value,{attending_count:10,headcount:10})
 assert.equal((await sql('select is_closed from rsvps where id=$1',[rv.rsvp_id])).rows[0].is_closed,true)
 await assert.rejects(sql("select respond_rsvp($1,'마감 후 참석',true)",[rv.token]),/마감/)
 const response=(await sql('select id from rsvp_responses where rsvp_id=$1 limit 1',[rv.rsvp_id])).rows[0].id
 await assert.rejects(sql('select delete_rsvp_response($1)',[response]),/마감/)
})
test('소셜 프로필 이름·등록 전 역할 선택·등록 후 변경 차단',async()=>{
 const newcomer='00000000-0000-0000-0000-000000000003'
 await sql("insert into auth.users values($1,'{\"nickname\":\"새로운 사용자\"}')",[newcomer])
 assert.equal((await sql('select display_name from profiles where id=$1',[newcomer])).rows[0].display_name,'새로운 사용자')
 await as(newcomer)
 assert.equal((await sql("select (choose_role('owner')).role role")).rows[0].role,'owner')
 await as(leader);await assert.rejects(sql("select choose_role('owner')"),/이미 단체나 가게/)
})
test('추가 입력 칸·사전 주문 메모 저장 및 권한 확인',async()=>{
 await as(owner)
 await sql("update stores set category='cafe',address_detail='2층',hours='10시~22시',business_no='000-00-00000' where id=$1",[store])
 await sql("update groups set affiliation='광운대',region='월계동',usual_size=24,description='독서 모임' where id=$1",[group])
 const v=await survey()
 await sql("select set_preorder_note($1,'견과류 알레르기')",[v.r])
 assert.equal((await sql('select preorder_note from reservations where id=$1',[v.r])).rows[0].preorder_note,'견과류 알레르기')
 await as(owner);await assert.rejects(sql("select set_preorder_note($1,'변경')",[v.r]),/본인 단체/)
 await as(leader);await sql("select set_preorder_note($1,'')",[v.r])
 assert.equal((await sql('select preorder_note from reservations where id=$1',[v.r])).rows[0].preorder_note,null)
})
test('001~012 확인 스크립트: Realtime 제외 전체 통합 검사 통과',async()=>{
 const checks=(await sql(await readFile(new URL('../scripts/check_migrations.sql',import.meta.url),'utf8'))).rows
 assert.equal(checks.length,27)
 assert.deepEqual(checks.filter(x=>x.no!==7&&!x.ok),[])
 const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql'))
 assert.equal(new Set(files.map(f=>f.split('_')[0])).size,files.length)
})

test('시연 데이터 재생성도 참석 마감 전 예약 인원을 유지',async()=>{
 await db.exec('reset role; alter table auth.users add column email text')
 for(const [i,email] of ['owner1','owner2','owner3','sw','ee','band','fc','town'].entries()) {
  const id=`00000000-0000-0000-0000-${String(100+i).padStart(12,'0')}`
  await sql('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${email}@wolgye.demo`,JSON.stringify({role:i<3?'owner':'group',display_name:email})])
 }
 const seed=await readFile(new URL('../scripts/seed_demo.sql',import.meta.url),'utf8')
 for(let run=0;run<2;run++) {
  await db.exec(seed)
  const rows=(await sql(`select r.headcount,rv.expected_headcount,rv.is_closed,
   (select count(*)::int from rsvp_responses rr where rr.rsvp_id=rv.id and rr.attending) yes
   from rsvps rv join reservations r on r.id=rv.reservation_id join groups g on g.id=r.group_id
   join auth.users u on u.id=g.leader_id where u.email='fc@wolgye.demo'`)).rows
  assert.deepEqual(rows,[{headcount:22,expected_headcount:22,is_closed:false,yes:15}])
  assert.equal((await sql("select count(*)::int n from stores s join auth.users u on u.id=s.owner_id where u.email like 'owner%@wolgye.demo'")).rows[0].n,3)
 }
})
