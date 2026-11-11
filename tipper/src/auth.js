'use strict';
const crypto = require('node:crypto');

const N = 16384;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N });
  return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, n, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n) });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

// Used so a wrong username takes as long as a wrong password (no user enumeration by timing).
const DUMMY = hashPassword('dummy-password-for-timing');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, adminId, hours) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha(token), adminId, now, now + hours * 3600_000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now); // purge expired sessions
  return token;
}

function getSession(db, token) {
  if (!token) return null;
  return db.prepare(
    `SELECT a.id, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).get(sha(token), Date.now()) || null;
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

/** Sign the admin out everywhere except the current session. */
function destroyOtherSessions(db, adminId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').run(adminId, keepToken ? sha(keepToken) : '');
}

module.exports = { hashPassword, verifyPassword, DUMMY, createSession, getSession, destroySession, destroyOtherSessions };
