import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, stored] = encoded.split(':');
  const hash = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(hash, Buffer.from(stored, 'hex'));
}
export function openStore(path = process.env.DATABASE_PATH || '.data/nexora.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','admin')), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK(balance_cents BETWEEN 0 AND 100000000000),
      version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id),
      delta_cents INTEGER NOT NULL CHECK(delta_cents != 0), balance_after_cents INTEGER NOT NULL,
      reason TEXT NOT NULL, request_key TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(actor_id, request_key)
    );
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created_at);
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit entries are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit entries are immutable'); END;
    CREATE TABLE IF NOT EXISTS order_drafts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), symbol TEXT NOT NULL,
      asset_class TEXT NOT NULL CHECK(asset_class IN ('stock','crypto')),
      side TEXT NOT NULL CHECK(side IN ('buy','sell')), sizing TEXT NOT NULL CHECK(sizing IN ('notional','quantity')),
      size TEXT NOT NULL, request_key TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id, request_key)
    );
    CREATE INDEX IF NOT EXISTS drafts_user ON order_drafts(user_id, created_at);
    PRAGMA user_version=2;`);
  return db;
}
export function publicUser(row) {
  return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name,
    role: row.role, status: row.status, createdAt: row.created_at, version: row.version };
}
export function atomic(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
