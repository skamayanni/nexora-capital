import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore,hashPassword } from '../server/store.js';
import { createApp } from '../server/index.js';
import { createProxyHandler } from '../deployment/proxy.js';
const origin='https://nexoracapitalinc.vercel.app';
let passwordHash;
before(async()=>{passwordHash=await hashPassword('allocation-test-password-123');});
async function harness(t,path=':memory:') {
  const db=openStore(path),ids={admin:randomUUID(),customer:randomUUID(),other:randomUUID()};
  const insert=db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)');
  for(const [name,id] of Object.entries(ids)) insert.run(id,`${name}@example.invalid`,name,'Allocation',passwordHash,name==='admin'?'admin':'user',new Date().toISOString());
  const backend=createApp({db,origin});backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const handler=createProxyHandler({backendOrigin:`http://127.0.0.1:${backend.address().port}`,allowLocalHttp:true});
  const rule=JSON.parse(readFileSync('vercel.json','utf8')).rewrites[0];
  const proxy=createServer((req,res)=>{
    const original=new URL(req.url,origin),destination=new URL(rule.destination.replace(':path*',original.pathname.slice('/api/'.length)),origin);
    for(const [key,value] of original.searchParams) destination.searchParams.append(key,value);
    req.url=destination.pathname+destination.search;handler(req,res);
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');const base=`http://127.0.0.1:${proxy.address().port}`;
  t.after(async()=>{await new Promise(resolve=>proxy.close(resolve));await new Promise(resolve=>backend.close(resolve));db.close();});
  const clients={admin:{},customer:{},other:{}};
  async function request(client,path,method='GET',body,headers={}) {
    const response=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(client.cookie?{Cookie:client.cookie}:{}),...(client.csrf?{'X-CSRF-Token':client.csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    if(response.headers.get('set-cookie')) client.cookie=response.headers.get('set-cookie').split(';')[0];
    const data=await response.json();if(data.csrfToken) client.csrf=data.csrfToken;return {status:response.status,data};
  }
  for(const [name,client] of Object.entries(clients)) assert.equal((await request(client,'/api/login','POST',{email:`${name}@example.invalid`,password:'allocation-test-password-123'})).status,200);
  const credit=(amount='1000')=>request(clients.admin,`/api/admin/users/${ids.customer}/adjustments`,'POST',{amount,direction:'credit',reason:'Allocation test reference'},{'Idempotency-Key':randomUUID()});
  assert.equal((await credit()).status,200);
  const allocate=(amount='100.10',symbol='AAPL',key=randomUUID(),client=clients.customer)=>request(client,'/api/trading/allocations','POST',{amount,symbol,acknowledgement:'purchase_not_verified'},{'Idempotency-Key':key});
  const release=(id,client=clients.customer)=>request(client,`/api/trading/allocations/${id}/release`,'POST',{});
  const account=()=>request(clients.customer,'/api/account');
  return {db,ids,clients,request,credit,allocate,release,account};
}
test('records exact USD allocation with an atomic ledger debit and explicit verification status',async t=>{
  const h=await harness(t);const result=await h.allocate('165.01','BTCUSD');
  assert.equal(result.status,200);assert.equal(result.data.allocation.amount,165.01);
  assert.equal(result.data.allocation.status,'recorded');assert.equal(result.data.allocation.verificationStatus,'purchase_not_verified');
  assert.equal(result.data.allocation.label,'Recorded allocation — purchase not verified');
  assert.deepEqual(result.data.summary,{availableBalance:834.99,allocatedBalance:165.01,totalRecordedBalance:1000,currency:'USD'});
  const account=(await h.account()).data;
  assert.equal(account.portfolio.cashBalance,834.99);assert.equal(account.portfolio.allocatedBalance,165.01);assert.equal(account.portfolio.totalRecordedBalance,1000);
  assert.deepEqual(account.portfolio.holdings,[]);assert.equal(account.transactions[0].type,'ALLOCATION');assert.equal(account.transactions[0].symbol,'BTCUSD');
  assert.equal(h.db.prepare('SELECT sum(delta_cents) AS n FROM ledger WHERE user_id=?').get(h.ids.customer).n,83499);
  const admin=(await h.request(h.clients.admin,`/api/admin/users/${h.ids.customer}`)).data;
  assert.equal(admin.recordedAllocations.length,1);assert.equal(admin.audit[0].action,'ALLOCATION_RECORDED');
});
test('duplicates and simultaneous allocations cannot double charge or overdraw',async t=>{
  const h=await harness(t),key=randomUUID();
  const duplicate=await Promise.all([h.allocate('100.10','AAPL',key),h.allocate('100.10','AAPL',key)]);
  assert.equal(duplicate[0].data.allocation.id,duplicate[1].data.allocation.id);
  assert.equal((await h.account()).data.portfolio.cashBalance,899.90);
  assert.equal((await h.allocate('100.11','AAPL',key)).status,409);
  const outcomes=await Promise.all([h.allocate('600','ETHUSD'),h.allocate('600','MSFT')]);
  assert.deepEqual(outcomes.map(result=>result.status).sort(),[200,409]);
  assert.equal((await h.account()).data.portfolio.cashBalance,299.90);
  assert.equal(h.db.prepare("SELECT count(*) AS n FROM allocation_events WHERE kind='ALLOCATION'").get().n,2);
});
test('releases return the original amount once and preserve allocation/history records',async t=>{
  const h=await harness(t),key=randomUUID(),allocation=(await h.allocate('0.10','AAPL',key)).data.allocation;
  const released=await Promise.all([h.release(allocation.id),h.release(allocation.id)]);
  for(const result of released) {assert.equal(result.status,200);assert.equal(result.data.allocation.status,'released');assert.equal(result.data.summary.availableBalance,1000);assert.equal(result.data.summary.allocatedBalance,0);}
  const retry=await h.allocate('0.10','AAPL',key);assert.equal(retry.data.allocation.status,'released');
  const account=(await h.account()).data;
  assert.equal(account.portfolio.cashBalance,1000);assert.equal(account.transactions[0].type,'RELEASE');assert.equal(account.transactions.length,3);
  assert.equal(h.db.prepare("SELECT count(*) AS n FROM allocation_events WHERE kind='RELEASE'").get().n,1);
  assert.throws(()=>h.db.exec('DELETE FROM recorded_allocations'),/immutable/);
  assert.throws(()=>h.db.exec('UPDATE recorded_allocations SET amount_cents=1'),/immutable/);
  assert.throws(()=>h.db.exec('DELETE FROM allocation_events'),/immutable/);
});
test('ownership, roles, CSRF and acknowledgement protect recorded allocations',async t=>{
  const h=await harness(t),allocation=(await h.allocate()).data.allocation;
  assert.equal((await h.release(allocation.id,h.clients.other)).status,404);
  assert.equal((await h.request(h.clients.other,'/api/trading')).data.recordedAllocations.length,0);
  assert.equal((await h.allocate('1','AAPL',randomUUID(),h.clients.admin)).status,403);
  const body={symbol:'AAPL',amount:'10',userId:h.ids.customer};
  assert.equal((await h.request(h.clients.customer,'/api/trading/allocations','POST',body,{'Idempotency-Key':randomUUID()})).status,400);
  assert.equal((await h.request(h.clients.customer,'/api/trading/allocations','POST',{...body,acknowledgement:'purchase_not_verified'},{'Idempotency-Key':randomUUID(),'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await h.allocate('10','AAPL',randomUUID(),h.clients.other)).status,409);
  assert.equal((await h.account()).data.portfolio.cashBalance,899.90);
  const user=(await h.request(h.clients.admin,`/api/admin/users/${h.ids.customer}`)).data.user;
  assert.equal((await h.request(h.clients.admin,`/api/admin/users/${h.ids.customer}`,'PATCH',{...user,status:'suspended'})).status,200);
  assert.equal((await h.release(allocation.id)).status,401);
});
test('invalid amounts and symbols fail without ledger or allocation changes',async t=>{
  const h=await harness(t);
  for(const amount of ['0','-1','1.001','NaN','1e2','100000001','1000.01',1]) {
    const result=await h.allocate(amount);assert.ok([400,409].includes(result.status));
  }
  assert.equal((await h.allocate('1','INVALID')).status,400);
  assert.equal((await h.account()).data.portfolio.cashBalance,1000);assert.equal(h.db.prepare('SELECT count(*) AS n FROM recorded_allocations').get().n,0);
  assert.equal((await h.request(h.clients.customer,'/api/trading/orders','POST',{symbol:'AAPL',amount:'10'})).status,409);
});
test('audit failure rolls back allocation, debit, ledger and event together',async t=>{
  const h=await harness(t);
  h.db.exec("CREATE TEMP TRIGGER fail_allocation_audit BEFORE INSERT ON audit WHEN NEW.action='ALLOCATION_RECORDED' BEGIN SELECT RAISE(ABORT,'Test audit failure'); END;");
  assert.equal((await h.allocate()).status,500);
  assert.equal((await h.account()).data.portfolio.cashBalance,1000);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM recorded_allocations').get().n,0);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM allocation_events').get().n,0);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM ledger').get().n,1);
});
test('recorded total limit includes allocations so releasing remains possible',async t=>{
  const h=await harness(t);const allocation=(await h.allocate('100')).data.allocation;
  for(let index=0;index<9;index++) assert.equal((await h.credit('100000000')).status,200);
  assert.equal((await h.credit('99999000')).status,200);
  assert.equal((await h.credit('0.01')).status,400);
  assert.equal((await h.release(allocation.id)).data.summary.availableBalance,1000000000);
});
test('schema upgrade preserves existing data and allocations persist across database reopen',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'nexora-allocations-')),path=join(directory,'existing.sqlite');
  try {
    const db=openStore(path),id=randomUUID();
    db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,balance_cents,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,'existing@example.invalid','Existing','User',passwordHash,'user',10000,new Date().toISOString());
    db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),id,id,10000,10000,'Existing credit','existing-ref',new Date().toISOString());
    db.exec('DROP TABLE allocation_events; DROP TABLE recorded_allocations; PRAGMA user_version=2;');db.close();
    const upgraded=openStore(path);assert.equal(upgraded.prepare('SELECT balance_cents FROM users WHERE id=?').get(id).balance_cents,10000);
    assert.equal(upgraded.prepare('SELECT count(*) AS n FROM ledger').get().n,1);
    const allocationId=randomUUID();
    upgraded.prepare('INSERT INTO recorded_allocations VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(allocationId,id,'AAPL','Apple','stock',1234,'persist-ref',new Date().toISOString(),'purchase_not_verified');
    upgraded.close();
    const reopened=openStore(path);assert.equal(reopened.prepare('SELECT amount_cents FROM recorded_allocations WHERE id=?').get(allocationId).amount_cents,1234);
    assert.equal(reopened.prepare('PRAGMA user_version').get().user_version,3);reopened.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});
