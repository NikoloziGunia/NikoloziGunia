'use strict';
// Fills the database with FAKE demo companies and tips so you can see the panels with data.
// Never run this on a real/production database.
const path = require('node:path');
const { config } = require('../src/config');
const database = require('../src/db');
const { feeFor } = require('../src/money');

const db = database.open(path.join(config.dataDir, 'tipper.db'));
if (db.prepare('SELECT COUNT(*) AS n FROM companies').get().n > 0 && !process.argv.includes('--force')) {
  console.error('Database already has companies. Pass --force to add demo data anyway.');
  process.exit(1);
}

database.setSetting(db, 'platform_name', 'Tipper');
database.setSetting(db, 'platform_location', 'Tbilisi');
database.setSetting(db, 'platform_holder', 'Demo Owner');
database.setSetting(db, 'platform_iban', 'GE29NB0000000101904917');

// IBANs below are valid-format test numbers, not real accounts.
const demo = [
  ['Cup & Corner', 'Rustaveli Ave 12, Tbilisi', 'GE54TB0000000000000001'],
  ['Morning Bean', 'Chavchavadze Ave 33, Tbilisi', 'GE29NB0000000101904917'],
  ['Sweet Crumb Bakery', 'Vera, Tbilisi', 'GE54TB0000000000000001'],
  ['Kiosk 24', 'Batumi Boulevard', 'GE29NB0000000101904917'],
  ['Roast Lab', 'Kutaisi Center', 'GE54TB0000000000000001'],
];
const now = Date.now();
demo.forEach(([name, location, iban], i) => {
  const info = db.prepare(
    `INSERT INTO companies (name, location, account_holder, iban, slug, fee_bp, logo_file, show_on_landing, active, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, 1, ?)`
  ).run(name, location, `${name} LLC`, iban, database.newSlug(db), now - (10 - i) * 86_400_000);
  const id = Number(info.lastInsertRowid);
  for (let n = 0; n < 12 + i * 3; n++) {
    const gross = [100, 200, 200, 300, 500, 1000][Math.floor(Math.random() * 6)];
    const fee = feeFor(gross, config.defaultFeeBp);
    db.prepare(`INSERT INTO tips (company_id, gross, fee, net, method, provider, provider_ref, status, created_at) VALUES (?, ?, ?, ?, ?, 'demo', ?, 'paid', ?)`)
      .run(id, gross, fee, gross - fee, Math.random() > .5 ? 'apple_pay' : 'google_pay', `demo_${i}_${n}`, now - Math.floor(Math.random() * 3 * 86_400_000));
  }
});
console.log(`Seeded ${demo.length} demo companies with sample tips.`);
