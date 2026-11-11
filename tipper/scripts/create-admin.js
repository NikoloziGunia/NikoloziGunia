'use strict';
// Creates (or resets the password of) an admin account.
//   npm run create-admin
//   ADMIN_USER=nika ADMIN_PASSWORD='long passphrase' npm run create-admin   (non-interactive)
const path = require('node:path');
const readline = require('node:readline');
const { config } = require('../src/config');
const database = require('../src/db');
const { hashPassword } = require('../src/auth');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const username = (process.env.ADMIN_USER || await ask('Admin username: ')).trim();
  const password = process.env.ADMIN_PASSWORD || await ask('Password (min 10 characters): ', { hidden: true });
  if (!username) { console.error('Username is required.'); process.exit(1); }
  if (password.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }

  const db = database.open(path.join(config.dataDir, 'tipper.db'));
  const hash = hashPassword(password);
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(existing.id);
    console.log(`Password updated for "${username}" (all sessions signed out).`);
  } else {
    db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, hash, Date.now());
    console.log(`Admin "${username}" created.`);
  }
})();
