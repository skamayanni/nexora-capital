import { randomUUID } from 'node:crypto';
import { openStore, hashPassword } from './store.js';
import { profile, passwordInput } from './index.js';
process.umask(0o077);
try {
  const p=profile({email:process.env.ADMIN_EMAIL,firstName:process.env.ADMIN_FIRST_NAME||'Nexora',lastName:process.env.ADMIN_LAST_NAME||'Admin'});
  const password=passwordInput(process.env.ADMIN_PASSWORD);
  const db=openStore();
  try {
    if(db.prepare('SELECT id FROM users WHERE email=?').get(p.email)) throw new Error('Email already exists. An existing customer will not be promoted.');
    const hash=await hashPassword(password);
    db.prepare('INSERT INTO users (id,email,first_name,last_name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),p.email,p.firstName,p.lastName,hash,'admin',new Date().toISOString());
    console.log('Admin created. Log in through login.html, then open admin.html.');
  } finally { db.close(); }
} catch(error) { console.error(error.message);process.exitCode=1; }
