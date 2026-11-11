'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  location         TEXT NOT NULL DEFAULT '',
  account_holder   TEXT NOT NULL DEFAULT '',
  iban             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,       -- unguessable id used in the QR/NFC link
  fee_bp           INTEGER,                    -- NULL = use the default fee
  logo_file        TEXT,
  show_on_landing  INTEGER NOT NULL DEFAULT 1,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id),
  amount      INTEGER NOT NULL,                -- tetri sent to the company (net of fee)
  tips_count  INTEGER NOT NULL,
  iban        TEXT NOT NULL,                   -- snapshot of the account paid
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tips (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL REFERENCES companies(id),
  gross        INTEGER NOT NULL,               -- what the guest paid, tetri
  fee          INTEGER NOT NULL,               -- our share, tetri (fixed at the time of the tip)
  net          INTEGER NOT NULL,               -- gross - fee, owed to the company
  method       TEXT NOT NULL,                  -- apple_pay | google_pay
  provider     TEXT NOT NULL,
  provider_ref TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'paid',
  payout_id    INTEGER REFERENCES payouts(id),
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tips_company ON tips(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tips_pending ON tips(company_id, payout_id, status);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

/** Runs fn inside a transaction; rolls back if it throws. */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getSetting(db, key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function newSlug(db) {
  for (let i = 0; i < 10; i++) {
    const slug = crypto.randomBytes(8).toString('base64url');
    if (!db.prepare('SELECT 1 FROM companies WHERE slug = ?').get(slug)) return slug;
  }
  throw new Error('could not generate a unique slug');
}

/** Platform owner's own details + the default fee. */
function getPlatform(db, config) {
  return {
    name: getSetting(db, 'platform_name', 'Tipper'),
    location: getSetting(db, 'platform_location', ''),
    holder: getSetting(db, 'platform_holder', ''),
    iban: getSetting(db, 'platform_iban', ''),
    default_fee_bp: Number(getSetting(db, 'default_fee_bp', String(config.defaultFeeBp))),
  };
}

function effectiveFeeBp(company, platform) {
  return company.fee_bp === null || company.fee_bp === undefined ? platform.default_fee_bp : company.fee_bp;
}

module.exports = { open, tx, getSetting, setSetting, newSlug, getPlatform, effectiveFeeBp };
