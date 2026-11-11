'use strict';
// Convenience for local development: runs the public site AND the admin panel in one process.
// In production run them separately (npm run start:public / npm run start:admin) — see README.
const path = require('node:path');
const { config } = require('./config');
const database = require('./db');
const { createPublicApp } = require('./public-server');
const { createAdminApp } = require('./admin-server');
const { getProvider } = require('./payments');

const db = database.open(path.join(config.dataDir, 'tipper.db'));
const provider = getProvider(config.paymentProvider);

createPublicApp({ db, config, provider }).listen(config.port, () =>
  console.log(`Tipper public site   → http://localhost:${config.port}  (payments: ${provider.name}${provider.isDemo ? ' — DEMO, no real money' : ''})`));

const allowIps = (process.env.ADMIN_ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
createAdminApp({ db, config, allowIps }).listen(config.adminPort, config.adminHost, () =>
  console.log(`Tipper ADMIN panel   → http://${config.adminHost}:${config.adminPort}  (private)`));

if (!db.prepare('SELECT 1 FROM admins LIMIT 1').get()) console.warn('\nNo admin account yet — run:  npm run create-admin\n');
