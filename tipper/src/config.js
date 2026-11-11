'use strict';
const path = require('node:path');

// Tiny .env loader (no dependency). Real environment variables win.
try {
  const fs = require('node:fs');
  const file = path.join(__dirname, '..', '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* ignore */ }

function load(env = process.env) {
  const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
  const production = env.NODE_ENV === 'production';
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${num(env.PORT, 3000)}`).replace(/\/+$/, '');
  return {
    production,
    port: num(env.PORT, 3000),
    adminPort: num(env.ADMIN_PORT, 3001),
    adminHost: env.ADMIN_HOST || '127.0.0.1',
    publicUrl,
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
    defaultLang: env.DEFAULT_LANG || 'en',
    contactEmail: env.CONTACT_EMAIL || '',
    contactPhone: env.CONTACT_PHONE || '',
    minTip: Math.round(num(env.MIN_TIP, 1) * 100),   // stored in tetri
    maxTip: Math.round(num(env.MAX_TIP, 200) * 100),
    defaultFeeBp: Math.round(num(env.DEFAULT_FEE_PERCENT, 9) * 100),
    paymentProvider: env.PAYMENT_PROVIDER || 'demo',
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    cookieSecure: production || env.COOKIE_SECURE === '1',
    tzOffsetMin: 240, // Georgia is UTC+4 all year (no DST)
    sessionHours: 12,
  };
}

module.exports = { load, config: load() };
