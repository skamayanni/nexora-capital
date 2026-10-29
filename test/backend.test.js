import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from '../server/index.js';
import { openStore, hashPassword } from '../server/store.js';

const origin='http://127.0.0.1:3000';
const directory=mkdtempSync(join(tmpdir(),'nexora-test-'));
const database=join(directory,'test.sqlite');
let db, server, base, userId;
const admin={}, customer={}, other={};
async function request(client, path, {method='GET',body,headers={}}={}) {
  const response=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(client.cookie?{Cookie:client.cookie}:{}),...(client.csrf?{'X-CSRF-Token':client.csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const cookie=response.headers.get('set-cookie');if(cookie) client.cookie=cookie.split(';')[0];
  const data=await response.json();if(data.csrfToken) client.csrf=data.csrfToken;
  return {status:response.status,data,headers:response.headers};
}
const registration=email=>({firstName:'Test',lastName:'Customer',email,password:'a-secure-test-password',role:'admin',balance:90000});
const adjustment=(amount,direction='credit',reason='External reference TEST-001')=>({amount,direction,reason});
const adjust=(body,key=randomUUID(),client=admin)=>request(client,`/api/admin/users/${userId}/adjustments`,{method:'POST',body,headers:{'Idempotency-Key':key}});
before(async()=>{
  db=openStore(database);
  db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),'admin@example.invalid','Test','Admin',await hashPassword('admin-test-password-123'),'admin',new Date().toISOString());
  server=createApp({db,origin});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});

test('registration creates isolated fresh profiles and protected sessions',async()=>{
  const result=await request(customer,'/api/register',{method:'POST',body:registration('New@Example.invalid')});
  assert.equal(result.status,201);userId=result.data.user.id;
  assert.equal(result.data.user.role,'user');assert.equal(result.data.user.email,'new@example.invalid');
  assert.equal(result.data.user.password_hash,undefined);
  assert.match(result.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const account=await request(customer,'/api/account');
  assert.equal(account.data.portfolio.cashBalance,0);assert.deepEqual(account.data.portfolio.holdings,[]);assert.deepEqual(account.data.transactions,[]);
  assert.equal((await request({},'/api/account')).status,401);
  assert.equal((await request(customer,'/api/admin/users')).status,403);
  assert.equal((await request(customer,'/api/register',{method:'POST',body:registration('new@example.invalid')})).status,409);
  assert.equal((await request(other,'/api/register',{method:'POST',body:registration('other@example.invalid')})).status,201);
});
test('authentication validates passwords, CSRF, origin, and logout revocation',async()=>{
  assert.equal((await request({},'/api/login',{method:'POST',body:{email:'admin@example.invalid',password:'wrong-password'}})).status,401);
  assert.equal((await request(admin,'/api/login',{method:'POST',body:{email:'admin@example.invalid',password:'admin-test-password-123'}})).status,200);
  assert.equal((await request(admin,'/api/logout',{method:'POST',body:{},headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await request(admin,'/api/logout',{method:'POST',body:{},headers:{'X-CSRF-Token':'invalid'}})).status,403);
  const separate={};await request(separate,'/api/login',{method:'POST',body:{email:'new@example.invalid',password:'a-secure-test-password'}});
  const oldCookie=separate.cookie;assert.equal((await request(separate,'/api/logout',{method:'POST',body:{}})).status,200);
  assert.equal((await request({cookie:oldCookie},'/api/account')).status,401);
  const saved=db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId).password_hash;
  assert.notEqual(saved,'a-secure-test-password');assert.match(saved,/^[a-f0-9]+:[a-f0-9]+$/);
  assert.equal(db.prepare('SELECT token_hash FROM sessions LIMIT 1').get().token_hash.length,64);
});
test('balance updates are atomic, exact, idempotent and visible only to the right user',async()=>{
  const key=randomUUID();
  assert.equal((await adjust(adjustment('100.10'),key)).status,200);
  assert.equal((await adjust(adjustment('100.10'),key)).status,200);
  assert.equal((await adjust(adjustment('100.11'),key)).status,409);
  assert.equal((await request(customer,'/api/account')).data.portfolio.cashBalance,100.10);
  assert.equal((await request(other,'/api/account')).data.portfolio.cashBalance,0);
  assert.equal((await adjust(adjustment('0.10','debit'))).status,200);
  assert.equal((await request(customer,'/api/account')).data.portfolio.cashBalance,100);
  assert.equal((await adjust(adjustment('100.01','debit'))).status,409);
  for(const amount of ['-1','NaN','0','1.001','1e2','1000000000']) assert.equal((await adjust(adjustment(amount))).status,400);
  assert.equal((await adjust(adjustment('1','credit',' '))).status,400);
  assert.equal((await adjust(adjustment('1'),randomUUID(),customer)).status,403);
  assert.equal((await request(customer,'/api/account',{method:'PATCH',body:{balance:999999}})).status,404);
  const entries=(await request(customer,'/api/account')).data.transactions;
  assert.equal(entries.length,2);assert.equal(entries[0].balanceAfter,100);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit WHERE action=?').get('BALANCE_ADJUSTMENT').n,2);
  assert.throws(()=>db.prepare('UPDATE ledger SET reason=?').run('tamper'),/immutable/);
  assert.throws(()=>db.exec('DELETE FROM ledger'),/immutable/);
});
test('concurrent debits cannot overdraw and duplicate retries apply once',async()=>{
  const outcomes=await Promise.all([adjust(adjustment('60','debit')),adjust(adjustment('60','debit'))]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  const key=randomUUID();await Promise.all([adjust(adjustment('0.01'),key),adjust(adjustment('0.01'),key)]);
  assert.equal((await request(customer,'/api/account')).data.portfolio.cashBalance,40.01);
  assert.equal(db.prepare('SELECT count(*) AS n FROM ledger WHERE request_key=?').get(key).n,1);
});
test('profile management handles conflicts, session revocation, and suspension',async()=>{
  const before=(await request(admin,`/api/admin/users/${userId}`)).data.user;
  const body={...before,firstName:'Updated',status:'suspended'};
  assert.equal((await request(admin,`/api/admin/users/${userId}`,{method:'PATCH',body})).status,200);
  assert.equal((await request(customer,'/api/account')).status,401);
  assert.equal((await request({},'/api/login',{method:'POST',body:{email:before.email,password:'a-secure-test-password'}})).status,401);
  assert.equal((await adjust(adjustment('1'))).status,409);
  assert.equal((await request(admin,`/api/admin/users/${userId}`,{method:'PATCH',body})).status,409);
  const suspended=(await request(admin,`/api/admin/users/${userId}`)).data.user;
  assert.equal((await request(admin,`/api/admin/users/${userId}`,{method:'PATCH',body:{...suspended,status:'active'}})).status,200);
  assert.equal((await request(customer,'/api/login',{method:'POST',body:{email:before.email,password:'a-secure-test-password'}})).status,200);
  assert.equal((await request(customer,'/api/account')).data.user.firstName,'Updated');
  const current=(await request(admin,`/api/admin/users/${userId}`)).data.user;
  assert.equal((await request(admin,`/api/admin/users/${userId}`,{method:'PATCH',body:{...current,email:'other@example.invalid'}})).status,409);
  assert.equal((await request(admin,`/api/admin/users/${userId}`,{method:'PATCH',body:{...current,email:'changed@example.invalid'}})).status,200);
  assert.equal((await request(customer,'/api/account')).status,401);
});
test('database survives reopening and ledger reconciles with balances',()=>{
  const reopened=openStore(database);
  const user=reopened.prepare('SELECT * FROM users WHERE id=?').get(userId);
  assert.equal(user.email,'changed@example.invalid');assert.equal(user.balance_cents,4001);
  assert.equal(reopened.prepare('SELECT sum(delta_cents) AS total FROM ledger WHERE user_id=?').get(userId).total,user.balance_cents);
  reopened.close();
});
test('private source and database files are not served, public pages load',async()=>{
  for(const path of ['/server/index.js','/.data/nexora.sqlite','/package.json','/js/../server/store.js','/js/..%2fserver%2fstore.js','/.git/config']) assert.equal((await fetch(base+path)).status,404);
  for(const path of ['/','/login.html','/admin.html','/profile.html','/portfolio.html','/transactions.html','/css/accounts.css','/js/admin.js']) assert.equal((await fetch(base+path)).status,200);
});
test('login throttling rejects repeated attempts',async()=>{
  let status;
  for(let index=0;index<12;index++) status=(await request({},'/api/login',{method:'POST',body:{email:'unknown@example.invalid',password:'wrong'}})).status;
  assert.equal(status,429);
});

test('admin provisioning creates a hashed account and refuses existing emails',()=>{
  const cliDatabase=join(directory,'cli.sqlite');
  const env={...process.env,DATABASE_PATH:cliDatabase,ADMIN_EMAIL:'cli-admin@example.invalid',ADMIN_PASSWORD:'cli-admin-test-password-123'};
  const output=execFileSync(process.execPath,['server/create-admin.js'],{env,encoding:'utf8'});
  assert.match(output,/Admin created/);assert.doesNotMatch(output,/cli-admin-test-password/);
  const cliStore=openStore(cliDatabase);
  const row=cliStore.prepare('SELECT * FROM users').get();
  assert.equal(row.role,'admin');assert.notEqual(row.password_hash,env.ADMIN_PASSWORD);cliStore.close();
  assert.throws(()=>execFileSync(process.execPath,['server/create-admin.js'],{env,stdio:'pipe'}));
  assert.throws(()=>execFileSync(process.execPath,['server/create-admin.js'],{env:{...env,ADMIN_PASSWORD:''},stdio:'pipe'}));
});
test('production requires HTTPS and applies Secure session cookies',async()=>{
  assert.throws(()=>createApp({db,production:true,origin}),/HTTPS/);
  const secureServer=createApp({db,production:true,origin:'https://invest.example.invalid'});
  secureServer.listen(0,'127.0.0.1');await once(secureServer,'listening');
  try {
    const result=await fetch(`http://127.0.0.1:${secureServer.address().port}/api/login`,{method:'POST',headers:{Origin:'https://invest.example.invalid','Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.invalid',password:'admin-test-password-123'})});
    assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/; Secure/);
    assert.ok(result.headers.get('strict-transport-security'));
  } finally {await new Promise(resolve=>secureServer.close(resolve));}
});
