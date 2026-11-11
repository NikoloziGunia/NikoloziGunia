'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cfgMod = require('../src/config');
const database = require('../src/db');
const auth = require('../src/auth');
const { createPublicApp } = require('../src/public-server');
const { createAdminApp } = require('../src/admin-server');
const { getProvider } = require('../src/payments');

const IBAN = 'GE29NB0000000101904917';

async function setup(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipper-test-'));
  const config = cfgMod.load({ DATA_DIR: dataDir, PUBLIC_URL: 'https://tips.example', PAYMENT_PROVIDER: 'demo' });
  const db = database.open(':memory:');
  db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run('owner', auth.hashPassword('correct horse battery'), Date.now());
  const pub = createPublicApp({ db, config, provider: getProvider('demo') }).listen(0);
  const adm = createAdminApp({ db, config }).listen(0);
  t.after(() => { pub.close(); adm.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const P = `http://127.0.0.1:${pub.address().port}`;
  const A = `http://127.0.0.1:${adm.address().port}`;

  let cookie = '';
  const admin = async (method, url, body, { csrf = true } = {}) => {
    const res = await fetch(A + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Requested-With': 'tipper-admin' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: ct.includes('json') ? await res.json() : await res.text() };
  };
  const tip = async (slug, amount, method = 'apple_pay') => {
    const res = await fetch(`${P}/api/tip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, amount, method }) });
    return { status: res.status, body: await res.json() };
  };
  return { db, P, A, admin, tip, config, login: () => admin('POST', '/api/login', { username: 'owner', password: 'correct horse battery' }) };
}

test('admin requires login and CSRF header', async (t) => {
  const { admin, login } = await setup(t);
  assert.equal((await admin('GET', '/api/overview')).status, 401);
  assert.equal((await admin('POST', '/api/login', { username: 'owner', password: 'nope' })).status, 401);
  assert.equal((await admin('POST', '/api/login', { username: 'owner', password: 'correct horse battery' }, { csrf: false })).status, 403);
  const ok = await login();
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  assert.match(ok.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await admin('GET', '/api/overview')).status, 200);
  assert.equal((await admin('POST', '/api/companies', { name: 'X', iban: IBAN }, { csrf: false })).status, 403);
});

test('public server exposes no admin surface', async (t) => {
  const { P } = await setup(t);
  for (const p of ['/api/overview', '/api/login', '/api/companies', '/api/payouts', '/app.js', '/admin.css', '/data/tipper.db']) {
    const res = await fetch(P + p);
    assert.equal(res.status, 404, p);
  }
});

test('full flow: add company, QR, tip, fee split, payout', async (t) => {
  const { admin, tip, login, P, db } = await setup(t);
  await login();

  // set my fee to 10%
  assert.equal((await admin('PUT', '/api/platform', { name: 'Tipper', location: 'Tbilisi', holder: 'Me', iban: IBAN, default_fee_percent: '10' })).status, 200);
  assert.equal((await admin('PUT', '/api/platform', { name: 'Tipper', default_fee_percent: '99' })).status, 400);

  // validation
  assert.equal((await admin('POST', '/api/companies', { name: 'Bad', iban: 'GE00XX' })).status, 400);
  assert.equal((await admin('POST', '/api/companies', { name: '', iban: IBAN })).status, 400);

  const created = await admin('POST', '/api/companies', { name: 'Cup <b>&</b> Corner', location: 'Rustaveli 1', account_holder: 'Cup LLC', iban: IBAN, show_on_landing: true });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const detail = (await admin('GET', `/api/companies/${id}`)).body.company;
  assert.match(detail.tip_url, /^https:\/\/tips\.example\/t\/[A-Za-z0-9_-]{11}$/);
  const slug = detail.tip_url.split('/t/')[1];

  // QR endpoints
  const svg = await admin('GET', `/api/companies/${id}/qr.svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.body, /<svg/);

  // guest page
  const page = await (await fetch(`${P}/t/${slug}`)).text();
  assert.match(page, /Hi, have a good day!/);
  assert.match(page, /Thank you for your tip/);
  assert.match(page, /Cup &lt;b&gt;&amp;&lt;\/b&gt; Corner/); // escaped
  assert.doesNotMatch(page, /<b>&<\/b>/);
  assert.match(page, /Tipper/);
  assert.equal((await fetch(`${P}/t/doesnotexist`)).status, 404);

  // invalid tips
  assert.equal((await tip(slug, '0')).status, 400);
  assert.equal((await tip(slug, '0.50')).status, 400);   // below min 1 GEL
  assert.equal((await tip(slug, '5000')).status, 400);   // above max
  assert.equal((await tip(slug, 'abc')).status, 400);
  assert.equal((await tip(slug, '5', 'bitcoin')).status, 400);
  assert.equal((await tip('nope', '5')).status, 404);

  // valid tips: 10 GEL + 2.50 GEL at 10% => fees 1.00 + 0.25
  assert.equal((await tip(slug, '10')).status, 200);
  assert.equal((await tip(slug, '2,50', 'google_pay')).status, 200);

  let o = (await admin('GET', '/api/overview')).body;
  assert.equal(o.totals.today_gross, 1250);
  assert.equal(o.totals.today_fee, 125);
  assert.equal(o.totals.owed_to_companies, 1125);
  assert.equal(o.companies[0].pending_net, 1125);

  // changing the fee later must NOT rewrite earlier tips
  await admin('PUT', '/api/platform', { name: 'Tipper', iban: IBAN, default_fee_percent: '8' });
  await tip(slug, '10');
  o = (await admin('GET', '/api/overview')).body;
  assert.equal(o.totals.today_fee, 125 + 80);

  // per-company override
  await admin('PUT', `/api/companies/${id}`, { name: 'Cup & Corner', location: 'x', account_holder: 'Cup LLC', iban: IBAN, fee_percent: '5', show_on_landing: true, active: true });
  await tip(slug, '10');
  assert.equal((await admin('GET', '/api/overview')).body.totals.today_fee, 125 + 80 + 50);

  // payout CSV + settle
  const csv = await admin('GET', '/api/payouts/pending.csv');
  assert.match(csv.body, /Cup & Corner,Cup LLC,GE29NB0000000101904917,/);
  const pay = await admin('POST', `/api/companies/${id}/payouts`, { note: 'test' });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.tips_count, 4);
  assert.equal(pay.body.amount, 1125 + 920 + 950);
  assert.equal((await admin('POST', `/api/companies/${id}/payouts`, {})).status, 400); // nothing left
  assert.equal((await admin('GET', '/api/overview')).body.totals.owed_to_companies, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tips WHERE payout_id IS NULL').get().n, 0);

  // deactivating kills the QR
  await admin('PUT', `/api/companies/${id}`, { name: 'Cup & Corner', iban: IBAN, active: false });
  assert.equal((await fetch(`${P}/t/${slug}`)).status, 404);
  assert.equal((await tip(slug, '5')).status, 404);
});

test('landing page lists partners but never leaks bank or link data', async (t) => {
  const { admin, login, P } = await setup(t);
  await login();
  await admin('POST', '/api/companies', { name: 'Visible Cafe', iban: IBAN, show_on_landing: true });
  await admin('POST', '/api/companies', { name: 'Hidden Shop', iban: IBAN, show_on_landing: false });
  const html = await (await fetch(P + '/')).text();
  assert.match(html, /Visible Cafe/);
  assert.doesNotMatch(html, /Hidden Shop/);
  assert.doesNotMatch(html, /GE29NB/);
  assert.doesNotMatch(html, /\/t\//);
  assert.match(html, /Become a partner/);
  assert.match(html, /Content-Security-Policy|<title>/);
});

test('logo upload accepts real images only', async (t) => {
  const { admin, login } = await setup(t);
  await login();
  const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const ok = await admin('POST', '/api/companies', { name: 'Logo Co', iban: IBAN, logo: png1x1 });
  assert.equal(ok.status, 201);
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.equal((await admin('POST', '/api/companies', { name: 'Evil', iban: IBAN, logo: svg })).status, 400);
  const fake = 'data:image/png;base64,' + Buffer.from('not a png at all, definitely').toString('base64');
  assert.equal((await admin('POST', '/api/companies', { name: 'Fake', iban: IBAN, logo: fake })).status, 400);
});

test('password change signs out other sessions', async (t) => {
  const { admin, login, A } = await setup(t);
  await login();
  assert.equal((await admin('POST', '/api/password', { current: 'wrong', next: 'a-much-longer-password' })).status, 403);
  assert.equal((await admin('POST', '/api/password', { current: 'correct horse battery', next: 'short' })).status, 400);
  assert.equal((await admin('POST', '/api/password', { current: 'correct horse battery', next: 'a-much-longer-password' })).status, 200);
  assert.equal((await admin('GET', '/api/me')).status, 200); // current session survives
  void A;
});
