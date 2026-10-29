import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createProxyHandler } from '../deployment/proxy.js';
import { createApp } from '../server/index.js';
import { openStore } from '../server/store.js';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
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
