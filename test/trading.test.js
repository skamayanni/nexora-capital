import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/index.js';
import { openStore, hashPassword } from '../server/store.js';
import { createProxyHandler } from '../deployment/proxy.js';
const origin='https://nexoracapitalinc.vercel.app';
let db,backend,proxy,base,userId,draftId;
const customer={},other={},admin={};
async function request(client,path,method='GET',body,headers={}) {
  const response=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(client.cookie?{Cookie:client.cookie}:{}),...(client.csrf?{'X-CSRF-Token':client.csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  if(response.headers.get('set-cookie')) client.cookie=response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('content-type'),/application\/json/);
  const data=await response.json();if(data.csrfToken) client.csrf=data.csrfToken;
  return {status:response.status,data};
}
const buy={symbol:'AAPL',side:'buy',sizing:'notional',size:'100.25',orderType:'market'};
const save=(client,body=buy,key=randomUUID())=>request(client,'/api/trading/drafts','POST',body,{'Idempotency-Key':key});
before(async()=>{
  db=openStore(':memory:');
  db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),'trading-admin@example.invalid','Trading','Admin',await hashPassword('trading-password-123'),'admin',new Date().toISOString());
  backend=createApp({db,origin});backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const handler=createProxyHandler({backendOrigin:`http://127.0.0.1:${backend.address().port}`,allowLocalHttp:true});
  const rule=JSON.parse(readFileSync('vercel.json','utf8')).rewrites[0];
  proxy=createServer((req,res)=>{
    const source=new URL(req.url,origin),destination=new URL(rule.destination.replace(':path*',source.pathname.slice('/api/'.length)),origin);
    for(const [key,value] of source.searchParams) destination.searchParams.append(key,value);
    req.url=destination.pathname+destination.search;handler(req,res);
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');base=`http://127.0.0.1:${proxy.address().port}`;
  for(const [client,email] of [[customer,'trading-customer@example.invalid'],[other,'other-trading@example.invalid']]) {
    const result=await request(client,'/api/register','POST',{email,firstName:'Trading',lastName:'Customer',password:'trading-password-123'});
    assert.equal(result.status,201);if(client===customer) userId=result.data.user.id;
  }
  assert.equal((await request(admin,'/api/login','POST',{email:'trading-admin@example.invalid',password:'trading-password-123'})).status,200);
});
after(async()=>{await new Promise(resolve=>proxy.close(resolve));await new Promise(resolve=>backend.close(resolve));db.close();});
test('trading requires authentication and separates manual balance from buying power',async()=>{
  assert.equal((await request({},'/api/trading')).status,401);
  const credit=await request(admin,`/api/admin/users/${userId}/adjustments`,'POST',{amount:'1000',direction:'credit',reason:'Trading test ledger credit'},{'Idempotency-Key':randomUUID()});
  assert.equal(credit.status,200);
  const result=await request(customer,'/api/trading');
  assert.equal(result.status,200);assert.equal(result.data.brokerage.canSubmitOrders,false);
  assert.equal(result.data.brokerage.buyingPower,null);assert.equal(result.data.quotesAvailable,false);
  assert.deepEqual(result.data.orders,[]);assert.deepEqual(result.data.positions,[]);
  assert.ok(result.data.assets.some(asset=>asset.assetClass==='stock'));assert.ok(result.data.assets.some(asset=>asset.assetClass==='crypto'));
});
test('saving and retrying a draft preserves exact size without touching funds or holdings',async()=>{
  const key=randomUUID();
  const saved=await save(customer,{...buy,userId:'another-user',price:1,buyingPower:999999},key);
  assert.equal(saved.status,201);draftId=saved.data.draft.id;
  assert.equal(saved.data.draft.size,'100.25');assert.equal(saved.data.draft.status,'draft');
  const retry=await save(customer,buy,key);assert.equal(retry.status,200);assert.equal(retry.data.draft.id,draftId);
  assert.equal((await save(customer,{...buy,size:'100.26'},key)).status,409);
  const list=(await request(customer,'/api/trading')).data.drafts;
  assert.equal(list.length,1);assert.equal(list[0].id,draftId);
  const account=(await request(customer,'/api/account')).data;
  assert.equal(account.portfolio.cashBalance,1000);assert.deepEqual(account.portfolio.holdings,[]);assert.equal(account.transactions.length,1);
});
test('crypto unit precision is retained and invalid requests cannot become orders',async()=>{
  const crypto=await save(customer,{symbol:'BTCUSD',side:'sell',sizing:'quantity',size:'0.00000001',orderType:'market'});
  assert.equal(crypto.status,201);assert.equal(crypto.data.draft.size,'0.00000001');
  for(const body of [
    {...buy,symbol:'FAKE'}, {...buy,side:'transfer'}, {...buy,orderType:'limit'}, {...buy,size:'-1'}, {...buy,size:'0'},
    {...buy,size:'1.001'}, {...buy,size:'NaN'}, {...buy,size:'1e3'}, {...buy,size:'100000001'}, {...buy,side:'sell'},
    {...buy,sizing:'quantity',size:'0.000000001'}
  ]) assert.equal((await save(customer,body)).status,400);
  assert.equal((await save(admin)).status,403);
  assert.equal((await request(customer,'/api/trading/drafts','POST',buy,{'Idempotency-Key':randomUUID(),'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await request(customer,'/api/trading/orders','POST',buy)).status,409);
  const account=(await request(customer,'/api/account')).data;
  assert.equal(account.portfolio.cashBalance,1000);assert.equal(account.transactions.length,1);
});
test('customers can only see and discard their own drafts',async()=>{
  assert.deepEqual((await request(other,'/api/trading')).data.drafts,[]);
  assert.equal((await request(other,`/api/trading/drafts/${draftId}/discard`,'POST',{})).status,404);
  assert.equal((await request(customer,`/api/trading/drafts/${draftId}/discard`,'POST',{})).status,200);
  assert.equal((await request(customer,`/api/trading/drafts/${draftId}/discard`,'POST',{})).status,404);
  assert.equal((await request(customer,'/api/account')).data.portfolio.cashBalance,1000);
});
test('existing accounts and ledger history survive the additive draft schema migration',()=>{
  const directory=mkdtempSync(join(tmpdir(),'nexora-draft-migration-')),path=join(directory,'legacy.sqlite');
  try {
    const old=openStore(path),id=randomUUID();
    old.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)').run(id,'legacy@example.invalid','Legacy','User','test-hash','user',new Date().toISOString());
    old.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),id,id,1234,1234,'Historical test credit',randomUUID(),new Date().toISOString());
    old.prepare('UPDATE users SET balance_cents=1234 WHERE id=?').run(id);
    old.exec('DROP TABLE order_drafts; PRAGMA user_version=1;');old.close();
    const upgraded=openStore(path);
    assert.equal(upgraded.prepare('SELECT balance_cents FROM users WHERE id=?').get(id).balance_cents,1234);
    assert.equal(upgraded.prepare('SELECT count(*) AS n FROM ledger').get().n,1);
    assert.equal(upgraded.prepare('SELECT count(*) AS n FROM order_drafts').get().n,0);
    assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,3);upgraded.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});
