// 가짜 Supabase 게이트웨이 (로컬 통합 테스트용): /rest/v1 → PostgREST(3001), /auth/v1 → 최소 GoTrue 흉내 (비밀번호 demo1234!)
// 실제 Supabase 에는 필요 없음
import http from 'node:http'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
const SECRET = process.env.JWT_SECRET ?? 'local-test-jwt-secret-at-least-32-characters'
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const sign = (payload) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload)
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())
const sql = (q) => execFileSync('psql', ['-d', process.env.PGDATABASE ?? 'wgd_itest', '-Atc', q]).toString().trim()
const user = (id, email) => ({ id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
const anonKey = sign({ role: 'anon', iss: 'supabase', exp: 9999999999 })
console.log('ANON_KEY=' + anonKey)

http.createServer(async (req, res) => {
  const body = await new Promise((r) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => r(d)) })
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)) }
  if (req.url.startsWith('/auth/v1/token')) {
    const { email, password } = JSON.parse(body || '{}')
    const id = /^[a-z0-9@.]+$/.test(email ?? '') ? sql(`select id from auth.users where email='${email}'`) : ''
    if (!id || password !== 'demo1234!') return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' })
    const exp = Math.floor(Date.now() / 1000) + 3600
    return send(200, { access_token: sign({ sub: id, role: 'authenticated', aud: 'authenticated', email, exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + id, user: user(id, email) })
  }
  if (req.url.startsWith('/auth/v1/user')) {
    const t = (req.headers.authorization ?? '').replace('Bearer ', '')
    try { const p = decode(t); return send(200, user(p.sub, p.email)) } catch { return send(401, { msg: 'no' }) }
  }
  if (req.url.startsWith('/auth/v1/logout')) { res.writeHead(204, CORS); return res.end() }
  if (req.url.startsWith('/rest/v1')) {
    const r = await fetch('http://127.0.0.1:3001' + req.url.slice('/rest/v1'.length), {
      method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'content-length'].includes(k))),
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    })
    const buf = Buffer.from(await r.arrayBuffer())
    res.writeHead(r.status, { ...Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(k))), ...CORS })
    return res.end(buf)
  }
  send(404, { msg: 'not mocked: ' + req.url })
}).listen(54321, () => console.log('proxy on 54321'))
