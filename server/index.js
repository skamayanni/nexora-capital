import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { tradingRequest } from './trading.js';
import { openStore, publicUser, hashPassword, verifyPassword, atomic } from './store.js';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, label, max = 80) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f]/.test(value)) fail(400, `Enter a valid ${label}.`);
  return value.trim();
};
export function profile(body) {
  const email = text(body.email, 'email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  return { firstName: text(body.firstName, 'first name'), lastName: text(body.lastName, 'last name'), email };
}
export function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400, 'Use a password of 12–128 characters.');
  return value;
}
export function createApp({ db = openStore(), origin = process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000', production = process.env.NODE_ENV === 'production' } = {}) {
  const configuredOrigin = new URL(origin).origin;
  if (production && !configuredOrigin.startsWith('https://')) throw new Error('Production PUBLIC_ORIGIN must use HTTPS.');
  const attempts = new Map();
  const dummyPassword = hashPassword(randomBytes(32).toString('hex'));
  const now = () => new Date().toISOString();
  function rateLimit(key, maximum) {
    const time = Date.now();
    if (attempts.size > 5000) for (const [k,v] of attempts) if (v.until < time) attempts.delete(k);
    if (!attempts.has(key) && attempts.size >= 10000) fail(429, 'Too many attempts. Try again later.');
    let entry = attempts.get(key);
    if (!entry || entry.until < time) { entry = {count:0, until:time+15*60*1000}; attempts.set(key,entry); }
    if (++entry.count > maximum) fail(429, 'Too many attempts. Try again in 15 minutes.');
  }
  function account(id) {
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    return { user: publicUser(row), portfolio: {cashBalance:row.balance_cents/100, currency:'USD',holdings:[],createdAt:row.created_at},
      transactions: db.prepare('SELECT * FROM ledger WHERE user_id=? ORDER BY rowid DESC').all(id).map(e=>({
        id:e.id, type:e.delta_cents>0?'CREDIT':'DEBIT',symbol:'USD',total:Math.abs(e.delta_cents)/100,
        description:e.reason,date:e.created_at,balanceAfter:e.balance_after_cents/100,actorId:e.actor_id
      })) };
  }
  function session(req) {
    const token = /(?:^|;\s*)nexora_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    return db.prepare(`SELECT s.token_hash, s.csrf, u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`).get(sha(token),Date.now());
  }
  function setSession(res, userId) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(sha(token),userId,csrf,Date.now()+8*60*60*1000);
    res.setHeader('Set-Cookie', `nexora_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${production?'; Secure':''}`);
    return csrf;
  }
  function audit(actor, id, action, details) {
    db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').run(randomUUID(),actor,id,action,JSON.stringify(details),now());
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; frame-src https://www.tradingview-widget.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (production) res.setHeader('Strict-Transport-Security','max-age=31536000');
    const json = (status, value) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url,configuredOrigin), path = url.pathname;
      if (!path.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(req.method)) fail(405,'Method not allowed.');
        const name = decodeURIComponent(path === '/' ? '/index.html' : path);
        if (!/^\/(?:[a-z-]+\.html|(?:css|js|images)\/[^\0]+)$/.test(name)) fail(404,'Not found.');
        if (name.includes('\\') || name.split('/').some(part => part === '..' || part === '.')) fail(404,'Not found.');
        const file = resolve(root,'.'+name);
        if (!file.startsWith(root+sep)) fail(404,'Not found.');
        const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
        if (!types[extname(file)]) fail(404,'Not found.');
        const data = await readFile(file).catch(()=>fail(404,'Not found.'));
        res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);return;
      }
      const write = !['GET','HEAD'].includes(req.method);
      if (write && req.headers.origin !== configuredOrigin) fail(403,'Request origin is not allowed.');
      let body = {};
      if (write) {
        if (!(req.headers['content-type']||'').startsWith('application/json')) fail(415,'Send JSON.');
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw)>16384) fail(413,'Request is too large.'); }
        try { body=JSON.parse(raw||'{}'); } catch { fail(400,'Invalid JSON.'); }
        if (!body || Array.isArray(body) || typeof body!=='object') fail(400,'Send a JSON object.');
      }
      if (req.method==='GET' && path==='/api/health') { json(200,{status:'ok'});return; }
      if (req.method==='POST' && ['/api/register','/api/login'].includes(path)) {
        rateLimit(`ip:${req.socket.remoteAddress}`,30);
        const email = typeof body.email==='string' ? body.email.trim().toLowerCase() : '';
        rateLimit(`email:${email.slice(0,254)}`,10);
        let row;
        if (path==='/api/register') {
          const p=profile(body), password=passwordInput(body.password);
          const hash=await hashPassword(password), id=randomUUID();
          try { db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)').run(id,p.email,p.firstName,p.lastName,hash,'user',now()); }
          catch(error) { if(error.message.includes('UNIQUE')) fail(409,'An account with this email already exists.'); throw error; }
          row=db.prepare('SELECT * FROM users WHERE id=?').get(id);
        } else {
          row=db.prepare('SELECT * FROM users WHERE email=?').get(email);
          const candidate=typeof body.password==='string' && body.password.length<=128 ? body.password : '';
          const valid=await verifyPassword(candidate,row?.password_hash || await dummyPassword);
          if (!valid || !row || row.status!=='active') fail(401,'Unable to log in with those details.');
          // Re-read after asynchronous hashing so suspended accounts cannot gain a session.
          row=db.prepare("SELECT * FROM users WHERE id=? AND status='active'").get(row.id);
          if(!row) fail(401,'Unable to log in with those details.');
        }
        const previous=session(req);
        if (previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(previous.token_hash);
        const csrfToken=setSession(res,row.id);
        json(path==='/api/register'?201:200,{user:publicUser(row),csrfToken});return;
      }
      const actor=session(req);
      if (!actor) fail(401,'Please log in to continue.');
      if (write && req.headers['x-csrf-token']!==actor.csrf) fail(403,'Invalid security token. Reload and try again.');
      if (req.method==='GET' && path==='/api/session') { json(200,{user:publicUser(actor),csrfToken:actor.csrf});return; }
      if (req.method==='POST' && path==='/api/logout') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(actor.token_hash);
        res.setHeader('Set-Cookie',`nexora_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?'; Secure':''}`);
        json(200,{ok:true});return;
      }
      if (req.method==='GET' && path==='/api/account') { json(200,account(actor.id));return; }
      if (path.startsWith('/api/trading')) {
        const result=tradingRequest({db,actor,path,method:req.method,body,headers:req.headers});
        json(result.status,result.data);return;
      }
      if (path.startsWith('/api/admin/')) {
        if (actor.role!=='admin') fail(403,'Administrator access required.');
        if (req.method==='GET' && path==='/api/admin/users') {
          const q=(url.searchParams.get('q')||'').slice(0,100).toLowerCase();
          const users=db.prepare("SELECT * FROM users WHERE instr(lower(email || ' ' || first_name || ' ' || last_name),?)>0 ORDER BY created_at DESC LIMIT 200").all(q);
          json(200,{users:users.map(u=>({...publicUser(u),balance:u.balance_cents/100,currency:'USD'}))});return;
        }
        const match=/^\/api\/admin\/users\/([a-f0-9-]{36})(?:\/(adjustments))?$/.exec(path);
        if (!match) fail(404,'Not found.');
        const id=match[1], row=db.prepare('SELECT * FROM users WHERE id=?').get(id);
        if (!row) fail(404,'Account not found.');
        if (req.method==='GET' && !match[2]) {
          const history=db.prepare('SELECT * FROM audit WHERE user_id=? ORDER BY rowid DESC LIMIT 200').all(id);
          json(200,{...account(id),audit:history});return;
        }
        if (req.method==='PATCH' && !match[2]) {
          const p=profile(body), status=body.status;
          if (!['active','suspended'].includes(status)) fail(400,'Invalid account status.');
          if (row.role==='admin') fail(403,'Admin accounts are managed through the server, not this dashboard.');
          if (!Number.isInteger(body.version)) fail(400,'Account version is required.');
          try { atomic(db,()=>{
            const changed=db.prepare('UPDATE users SET first_name=?,last_name=?,email=?,status=?,version=version+1 WHERE id=? AND version=?').run(p.firstName,p.lastName,p.email,status,id,body.version);
            if(!changed.changes) fail(409,'Account changed. Reload before editing.');
            if (status==='suspended' || p.email!==row.email) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
            audit(actor.id,id,'PROFILE_UPDATED',{before:publicUser(row),after:{...p,status}});
          }); } catch(error) { if(error.message.includes('UNIQUE')) fail(409,'Email is already in use.');throw error; }
          json(200,account(id));return;
        }
        if(req.method==='POST' && match[2]==='adjustments') {
          if (row.role!=='user') fail(403,'Adjustments are only allowed for customer accounts.');
          const amount=typeof body.amount==='string'?body.amount:'';
          if(!/^\d{1,9}(\.\d{1,2})?$/.test(amount)) fail(400,'Enter a positive amount with at most two decimal places.');
          const [whole,fraction='']=amount.split('.');
          const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
          if(cents<=0 || cents>10000000000) fail(400,'Amount must be between 0.01 and 100,000,000.00.');
          if(!['credit','debit'].includes(body.direction)) fail(400,'Choose credit or debit.');
          const reason=text(body.reason,'reason',500), key=text(req.headers['idempotency-key'],'request identifier',100);
          const delta=body.direction==='credit'?cents:-cents;
          const entry=atomic(db,()=>{
            const existing=db.prepare('SELECT * FROM ledger WHERE actor_id=? AND request_key=?').get(actor.id,key);
            if(existing) {
              if(existing.user_id!==id || existing.delta_cents!==delta || existing.reason!==reason) fail(409,'This request identifier was already used for another adjustment.');
              return existing;
            }
            const current=db.prepare('SELECT * FROM users WHERE id=?').get(id);
            if(current.status!=='active') fail(409,'Reactivate the account before adjusting its balance.');
            const next=current.balance_cents+delta;
            if(next<0) fail(409,'Insufficient balance for this debit.');
            if(next>100000000000) fail(400,'Account balance limit exceeded.');
            const entry={id:randomUUID(),user_id:id,actor_id:actor.id,delta_cents:delta,balance_after_cents:next,reason,request_key:key,created_at:now()};
            db.prepare('UPDATE users SET balance_cents=?,version=version+1 WHERE id=?').run(next,id);
            db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(entry));
            audit(actor.id,id,'BALANCE_ADJUSTMENT',{entryId:entry.id,deltaCents:delta,balanceAfterCents:next,reason});
            return entry;
          });
          json(200,{entry,...account(id)});return;
        }
      }
      fail(404,'Not found.');
    } catch(error) {
      if(!error.status) console.error('Request failed:',error.message);
      if(!res.headersSent) json(error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});
      else res.end();
    }
  });
  server.requestTimeout=15000;
  return server;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const port=Number(process.env.PORT||3000), host=process.env.HOST||'127.0.0.1';
  createApp().listen(port,host,()=>console.log(`Nexora backend listening on ${host}:${port}`));
}
