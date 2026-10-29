import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createProxyHandler } from '../deployment/proxy.js';
import { createApp } from '../server/index.js';
import { openStore, hashPassword } from '../server/store.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;};
const close=server=>new Promise(resolve=>server.close(resolve));
test('Vercel proxy preserves login, cookies, CSRF and account requests across hosts',async()=>{
  const db=openStore(':memory:');
  const backend=createApp({db,origin:'https://nexoracapitalinc.vercel.app'});
  const backendOrigin=await listen(backend);
  const proxy=createServer(createProxyHandler({backendOrigin,allowLocalHttp:true}));
  const base=await listen(proxy);
  try {
    const registration=await fetch(base+'/api/register',{method:'POST',headers:{Origin:'https://nexoracapitalinc.vercel.app','Content-Type':'application/json'},body:JSON.stringify({firstName:'Proxy',lastName:'Customer',email:'proxy@example.invalid',password:'proxy-test-password-123'})});
    assert.equal(registration.status,201);
    const cookie=registration.headers.get('set-cookie').split(';')[0];
    assert.match(registration.headers.get('set-cookie'),/HttpOnly/);
    assert.equal(registration.headers.get('cache-control'),'no-store');
    const data=await registration.json();
    const account=await fetch(base+'/api/account',{headers:{Cookie:cookie}});
    assert.equal(account.status,200);assert.equal((await account.json()).portfolio.cashBalance,0);
    const logout=await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://nexoracapitalinc.vercel.app','Content-Type':'application/json','X-CSRF-Token':data.csrfToken},body:'{}'});
    assert.equal(logout.status,200);
    assert.equal((await fetch(base+'/api/account',{headers:{Cookie:cookie}})).status,401);
    const invalidOrigin=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});
    assert.equal(invalidOrigin.status,403);
    assert.equal((await fetch(base+'/api/register',{method:'POST',body:'x'.repeat(16385)})).status,413);
  } finally {await close(proxy);await close(backend);db.close();}
});
test('proxy refuses missing, insecure, and request-controlled destinations',async()=>{
  for(const backendOrigin of [undefined,'http://example.com','https://user:pass@example.com','https://example.com/path']) {
    const server=createServer(createProxyHandler({backendOrigin}));const base=await listen(server);
    try {assert.equal((await fetch(base+'/api/health')).status,503);} finally {await close(server);}
  }
});
test('static output contains only public pages and assets',()=>{
  execFileSync(process.execPath,['scripts/build-static.js']);
  for(const file of ['index.html','admin.html','login.html','js/auth.js','css/accounts.css']) assert.ok(existsSync('dist/'+file));
  for(const file of ['server','test','.env','.data','package.json','render.yaml']) assert.equal(existsSync('dist/'+file),false);
  assert.ok(readdirSync('dist').every(name=>name.endsWith('.html')||['css','js','images'].includes(name)));
});

test('Vercel parsed JSON bodies are forwarded with the correct content length',async()=>{
  const db=openStore(':memory:');
  const backend=createApp({db,origin:'https://nexoracapitalinc.vercel.app'});
  const backendOrigin=await listen(backend);
  const handler=createProxyHandler({backendOrigin,allowLocalHttp:true});
  const proxy=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req) raw+=chunk;
    req.body=JSON.parse(raw);handler(req,res);
  });
  const base=await listen(proxy);
  try {
    const response=await fetch(base+'/api/register',{method:'POST',headers:{Origin:'https://nexoracapitalinc.vercel.app','Content-Type':'application/json'},body:JSON.stringify({firstName:'Parsed',lastName:'Body',email:'parsed@example.invalid',password:'parsed-test-password-123'})});
    assert.equal(response.status,201);assert.equal((await response.json()).user.firstName,'Parsed');
  } finally {await close(proxy);await close(backend);db.close();}
});

test('explicit Vercel rewrite forwards nested admin routes, query, cookies and mutations',async()=>{
  const config=JSON.parse(readFileSync('vercel.json','utf8'));
  const rule=config.rewrites.find(rule=>rule.source==='/api/:path*');
  assert.ok(rule,'Every API path must have an explicit rewrite.');
  assert.ok(config.functions['api/proxy.js']);
  const db=openStore(':memory:');
  const adminId=randomUUID(), customerId=randomUUID();
  const hash=await hashPassword('routing-test-password-123');
  const insert=db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)');
  insert.run(adminId,'route-admin@example.invalid','Route','Admin',hash,'admin',new Date().toISOString());
  insert.run(customerId,'routing+customer@example.invalid','Routing','Investor',hash,'user',new Date().toISOString());
  const origin='https://nexoracapitalinc.vercel.app';
  const backend=createApp({db,origin});
  const backendOrigin=await listen(backend);
  const handler=createProxyHandler({backendOrigin,allowLocalHttp:true});
  const proxy=createServer((req,res)=>{
    const original=new URL(req.url,'https://frontend.invalid');
    const destination=new URL(rule.destination.replace(':path*',original.pathname.slice('/api/'.length)),'https://frontend.invalid');
    for(const [key,value] of original.searchParams) destination.searchParams.append(key,value);
    req.url=destination.pathname+destination.search;
    handler(req,res);
  });
  const base=await listen(proxy);
  let cookie,csrf;
  async function request(path,method='GET',body) {
    const response=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),'Idempotency-Key':'rewrite-test-adjustment'},...(body?{body:JSON.stringify(body)}:{})});
    assert.match(response.headers.get('content-type'),/application\/json/);
    if(response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    const data=await response.json();if(data.csrfToken) csrf=data.csrfToken;
    return {status:response.status,data};
  }
  try {
    assert.equal((await request('/api/health')).status,200);
    assert.equal((await request('/api/admin/users')).status,401);
    assert.equal((await request('/api/login','POST',{email:'route-admin@example.invalid',password:'routing-test-password-123'})).status,200);
    assert.equal((await request('/api/session')).data.user.role,'admin');
    const list=await request('/api/admin/users?q='+encodeURIComponent('routing+customer@example.invalid'));
    assert.equal(list.status,200);assert.equal(list.data.users.length,1);assert.equal(list.data.users[0].id,customerId);
    const details=await request('/api/admin/users/'+customerId);
    assert.equal(details.status,200);assert.equal(details.data.user.firstName,'Routing');
    assert.equal((await request('/api/admin/users/'+customerId,'PATCH',{...details.data.user,firstName:'Edited'})).status,200);
    const credited=await request('/api/admin/users/'+customerId+'/adjustments','POST',{amount:'12.34',direction:'credit',reason:'Nested route regression test'});
    assert.equal(credited.status,200);assert.equal(credited.data.portfolio.cashBalance,12.34);
    const final=await request('/api/admin/users/'+customerId);
    assert.equal(final.data.user.firstName,'Edited');assert.equal(final.data.audit.length,2);
    assert.equal(final.data.transactions.length,1);
  } finally {await close(proxy);await close(backend);db.close();}
});

test('rewrite path metadata cannot target non-API paths or ambiguous routes',async()=>{
  const proxy=createServer(createProxyHandler({backendOrigin:'https://example.invalid'}));
  const base=await listen(proxy);
  try {
    for(const path of ['/server/index.js','https://evil.invalid/api/account','/api/../server','/api//account']) {
      assert.equal((await fetch(base+'/api/proxy?__nexora_path='+encodeURIComponent(path))).status,400);
    }
    assert.equal((await fetch(base+'/api/proxy?__nexora_path=/api/health&__nexora_path=/api/account')).status,400);
  } finally {await close(proxy);}
});
