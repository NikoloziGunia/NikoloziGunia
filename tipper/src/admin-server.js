'use strict';
const path = require('node:path');
const express = require('express');
const QRCode = require('qrcode');

const cfg = require('./config');
const database = require('./db');
const auth = require('./auth');
const logos = require('./logos');
const { securityHeaders, rateLimiter, parseCookies } = require('./http');
const { formatGel, isValidIban, normalizeIban, formatIban } = require('./money');
const { translator } = require('./i18n');

const COOKIE = 'tipper_admin';

const bad = (res, msg, status = 400) => res.status(status).json({ error: msg });
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** "9", "9.5", "" -> basis points (900, 950) / null. Returns undefined if invalid. */
function percentToBp(v, { allowNull }) {
  if (v === null || v === undefined || String(v).trim() === '') return allowNull ? null : undefined;
  const s = String(v).trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return undefined;
  const n = parseFloat(s);
  return n >= 0 && n <= 30 ? Math.round(n * 100) : undefined;
}

function dayStart(config, now = Date.now()) {
  const off = config.tzOffsetMin * 60_000;
  return Math.floor((now + off) / 86_400_000) * 86_400_000 - off;
}

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The ADMIN app. Run it as a separate process on a separate host/port from the public site.
 * Everything except /api/login requires a valid session cookie.
 */
function createAdminApp({ db, config = cfg.config, allowIps = [] }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // Optional network allow-list, on top of the login.
  if (allowIps.length) {
    app.use((req, res, next) => {
      const ip = String(req.ip || '').replace(/^::ffff:/, '');
      if (allowIps.includes(ip)) return next();
      res.status(404).end();
    });
  }

  app.use(securityHeaders({ extraCsp: { 'img-src': ['blob:'] } }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  // CSRF: the cookie is SameSite=Strict, and every write must also carry a custom header
  // (which a cross-site form/page cannot add) and come from this same origin.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.get('X-Requested-With') !== 'tipper-admin') return bad(res, 'Forbidden.', 403);
    const origin = req.get('Origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('Host')) return bad(res, 'Forbidden.', 403); } catch { return bad(res, 'Forbidden.', 403); }
    }
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'admin'), { index: 'index.html', maxAge: 0 }));

  // ── Auth ──────────────────────────────────────────────────────────
  const loginLimiter = rateLimiter({ windowMs: 15 * 60_000, max: 10 });
  const cookieAttrs = () => `Path=/; HttpOnly; SameSite=Strict${config.cookieSecure ? '; Secure' : ''}`;

  app.post('/api/login', loginLimiter, (req, res) => {
    const username = str(req.body && req.body.username, 100);
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    const ok = auth.verifyPassword(password, admin ? admin.password_hash : auth.DUMMY);
    if (!admin || !ok) return bad(res, 'Wrong username or password.', 401);
    const token = auth.createSession(db, admin.id, config.sessionHours);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs()}; Max-Age=${config.sessionHours * 3600}`);
    res.json({ ok: true, username: admin.username });
  });

  app.use('/api', (req, res, next) => {
    const token = parseCookies(req)[COOKIE];
    const admin = auth.getSession(db, token);
    if (!admin) return bad(res, 'Not signed in.', 401);
    req.admin = admin;
    req.token = token;
    next();
  });

  app.post('/api/logout', (req, res) => {
    auth.destroySession(db, req.token);
    res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs()}; Max-Age=0`);
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => res.json({ username: req.admin.username }));

  app.post('/api/password', loginLimiter, (req, res) => {
    const current = typeof req.body.current === 'string' ? req.body.current : '';
    const next = typeof req.body.next === 'string' ? req.body.next : '';
    const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id);
    if (!auth.verifyPassword(current, row.password_hash)) return bad(res, 'Current password is wrong.', 403);
    if (next.length < 10) return bad(res, 'New password must be at least 10 characters.');
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(auth.hashPassword(next), req.admin.id);
    auth.destroyOtherSessions(db, req.admin.id, req.token); // sign out other devices
    res.json({ ok: true });
  });

  // ── Helpers ───────────────────────────────────────────────────────
  const logoDir = path.join(config.dataDir, 'logos');
  const tipUrl = (c) => `${config.publicUrl}/t/${c.slug}`;
  const platform = () => database.getPlatform(db, config);

  const publicCompany = (c, plat) => ({
    id: c.id,
    name: c.name,
    location: c.location,
    account_holder: c.account_holder,
    iban: c.iban,
    iban_display: formatIban(c.iban),
    fee_bp: c.fee_bp,
    effective_fee_bp: database.effectiveFeeBp(c, plat),
    logo_url: c.logo_file ? `${config.publicUrl}/logos/${c.logo_file}` : null,
    show_on_landing: !!c.show_on_landing,
    active: !!c.active,
    tip_url: tipUrl(c),
    created_at: c.created_at,
  });

  function companyRows() {
    const plat = platform();
    const rows = db.prepare(
      `SELECT c.*,
         COALESCE(SUM(CASE WHEN t.created_at >= $start THEN t.gross END), 0) AS today_gross,
         COALESCE(SUM(CASE WHEN t.created_at >= $start THEN 1 END), 0)       AS today_count,
         COALESCE(SUM(CASE WHEN t.payout_id IS NULL THEN t.net END), 0)      AS pending_net,
         COALESCE(SUM(CASE WHEN t.payout_id IS NULL THEN 1 END), 0)          AS pending_count,
         COALESCE(SUM(t.gross), 0) AS total_gross,
         COALESCE(SUM(t.fee), 0)   AS total_fee,
         COALESCE(SUM(t.net), 0)   AS total_net
       FROM companies c LEFT JOIN tips t ON t.company_id = c.id AND t.status = 'paid'
       GROUP BY c.id ORDER BY c.created_at, c.id`
    ).all({ start: dayStart(config) });
    return rows.map((r) => ({
      ...publicCompany(r, plat),
      today_gross: r.today_gross, today_count: r.today_count,
      pending_net: r.pending_net, pending_count: r.pending_count,
      total_gross: r.total_gross, total_fee: r.total_fee, total_net: r.total_net,
    }));
  }

  // ── Overview (first row = you, then every company) ────────────────
  app.get('/api/overview', (req, res) => {
    const plat = platform();
    const companies = companyRows();
    const sum = (k) => companies.reduce((a, c) => a + c[k], 0);
    const todayFee = db.prepare('SELECT COALESCE(SUM(fee),0) AS v FROM tips WHERE status = \'paid\' AND created_at >= ?').get(dayStart(config)).v;
    res.json({
      platform: { ...plat, iban_display: formatIban(plat.iban) },
      companies,
      totals: {
        today_gross: sum('today_gross'),
        today_fee: todayFee,
        owed_to_companies: sum('pending_net'),
        total_fee: sum('total_fee'),
        total_gross: sum('total_gross'),
      },
      limits: { min_tip: config.minTip, max_tip: config.maxTip },
      public_url: config.publicUrl,
      payment_provider: config.paymentProvider,
      print: { ...Object.fromEntries(['title', 'scan', 'tap', 'pay', 'thanks'].map((k) => [k, translator(config.defaultLang)(`print.${k}`)])) },
    });
  });

  // ── Your own details + the fee ────────────────────────────────────
  app.put('/api/platform', (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 80);
    const feeBp = percentToBp(b.default_fee_percent, { allowNull: false });
    const iban = normalizeIban(b.iban);
    if (!name) return bad(res, 'Name is required.');
    if (feeBp === undefined) return bad(res, 'Fee must be a percentage between 0 and 30.');
    if (iban && !isValidIban(iban)) return bad(res, 'That IBAN does not look valid. Please check it.');
    database.tx(db, () => {
      database.setSetting(db, 'platform_name', name);
      database.setSetting(db, 'platform_location', str(b.location, 120));
      database.setSetting(db, 'platform_holder', str(b.holder, 100));
      database.setSetting(db, 'platform_iban', iban);
      database.setSetting(db, 'default_fee_bp', feeBp);
    });
    res.json({ ok: true });
  });

  // ── Companies ─────────────────────────────────────────────────────
  function readCompanyBody(b, { partial = false } = {}) {
    const out = {};
    const name = str(b.name, 80);
    if (!name) return { error: 'Company name is required.' };
    out.name = name;
    out.location = str(b.location, 120);
    out.account_holder = str(b.account_holder, 100);
    const iban = normalizeIban(b.iban);
    if (!iban) return { error: 'Bank account (IBAN) is required.' };
    if (!isValidIban(iban)) return { error: 'That IBAN does not look valid. Please check it.' };
    out.iban = iban;
    const fee = percentToBp(b.fee_percent, { allowNull: true });
    if (fee === undefined) return { error: 'Fee must be a percentage between 0 and 30, or empty to use the default.' };
    out.fee_bp = fee;
    out.show_on_landing = b.show_on_landing === false ? 0 : 1;
    if (partial && typeof b.active === 'boolean') out.active = b.active ? 1 : 0;
    return { value: out };
  }

  app.post('/api/companies', (req, res) => {
    const r = readCompanyBody(req.body || {});
    if (r.error) return bad(res, r.error);
    let logo = null;
    try { if (req.body.logo) logo = logos.saveLogo(req.body.logo, logoDir); } catch (e) { return bad(res, e.message); }
    const c = r.value;
    const slug = database.newSlug(db);
    const info = db.prepare(
      `INSERT INTO companies (name, location, account_holder, iban, slug, fee_bp, logo_file, show_on_landing, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(c.name, c.location, c.account_holder, c.iban, slug, c.fee_bp, logo, c.show_on_landing, Date.now());
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  const loadCompany = (req, res, next) => {
    const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(Number(req.params.id));
    if (!c) return bad(res, 'Company not found.', 404);
    req.company = c;
    next();
  };

  app.get('/api/companies/:id', loadCompany, (req, res) => {
    const plat = platform();
    const c = req.company;
    const stats = companyRows().find((r) => r.id === c.id);
    const tips = db.prepare('SELECT id, gross, fee, net, method, status, payout_id, created_at FROM tips WHERE company_id = ? ORDER BY id DESC LIMIT 50').all(c.id);
    const payouts = db.prepare('SELECT id, amount, tips_count, iban, note, created_at FROM payouts WHERE company_id = ? ORDER BY id DESC LIMIT 30').all(c.id);
    const off = config.tzOffsetMin * 60;
    const daily = db.prepare(
      `SELECT date(created_at / 1000 + ?, 'unixepoch') AS day, SUM(gross) AS gross, SUM(net) AS net, COUNT(*) AS count
       FROM tips WHERE company_id = ? AND status = 'paid' GROUP BY day ORDER BY day DESC LIMIT 14`
    ).all(off, c.id);
    res.json({ company: { ...publicCompany(c, plat), ...stats }, tips, payouts, daily, default_fee_bp: plat.default_fee_bp });
  });

  app.put('/api/companies/:id', loadCompany, (req, res) => {
    const r = readCompanyBody(req.body || {}, { partial: true });
    if (r.error) return bad(res, r.error);
    const c = r.value;
    const old = req.company;
    let logo = old.logo_file;
    try {
      if (req.body.remove_logo) logo = null;
      if (req.body.logo) logo = logos.saveLogo(req.body.logo, logoDir);
    } catch (e) { return bad(res, e.message); }
    db.prepare(
      `UPDATE companies SET name = ?, location = ?, account_holder = ?, iban = ?, fee_bp = ?, logo_file = ?, show_on_landing = ?, active = ?
       WHERE id = ?`
    ).run(c.name, c.location, c.account_holder, c.iban, c.fee_bp, logo, c.show_on_landing, c.active ?? old.active, old.id);
    if (logo !== old.logo_file) logos.removeLogo(old.logo_file, logoDir);
    res.json({ ok: true });
  });

  // QR code for the company's tip link. The same link can be written to an NFC tag.
  app.get('/api/companies/:id/qr.:fmt', loadCompany, async (req, res) => {
    const url = tipUrl(req.company);
    const dl = req.query.download ? `attachment; filename="tipper-qr-${req.company.id}.${req.params.fmt}"` : 'inline';
    res.setHeader('Content-Disposition', dl);
    try {
      if (req.params.fmt === 'svg') {
        const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#2a1a10', light: '#ffffff' } });
        return res.type('image/svg+xml').send(svg);
      }
      if (req.params.fmt === 'png') {
        const png = await QRCode.toBuffer(url, { type: 'png', width: 1200, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#2a1a10', light: '#ffffff' } });
        return res.type('image/png').send(png);
      }
      bad(res, 'Unknown format.', 404);
    } catch (e) { console.error(e); bad(res, 'Could not generate QR code.', 500); }
  });

  // ── Payouts ───────────────────────────────────────────────────────
  app.get('/api/payouts', (req, res) => {
    const pending = companyRows().filter((c) => c.pending_net > 0 || c.pending_count > 0).map((c) => ({
      company_id: c.id, name: c.name, account_holder: c.account_holder, iban: c.iban, iban_display: c.iban_display,
      amount: c.pending_net, tips_count: c.pending_count,
    }));
    const history = db.prepare(
      `SELECT p.id, p.company_id, c.name, p.amount, p.tips_count, p.iban, p.note, p.created_at
       FROM payouts p JOIN companies c ON c.id = p.company_id ORDER BY p.id DESC LIMIT 200`
    ).all().map((p) => ({ ...p, iban_display: formatIban(p.iban) }));
    res.json({ pending, history });
  });

  // Bank-transfer sheet for everything currently owed (one line per company).
  app.get('/api/payouts/pending.csv', (req, res) => {
    const lines = [['Company', 'Account holder', 'IBAN', 'Amount (GEL)', 'Tips', 'Description'].map(csvCell).join(',')];
    const date = new Date(Date.now() + config.tzOffsetMin * 60_000).toISOString().slice(0, 10);
    for (const c of companyRows().filter((r) => r.pending_net > 0)) {
      lines.push([c.name, c.account_holder || c.name, c.iban, formatGel(c.pending_net), c.pending_count, `Tipper tips ${date}`].map(csvCell).join(','));
    }
    res.setHeader('Content-Disposition', `attachment; filename="tipper-payouts-${date}.csv"`);
    res.type('text/csv').send(lines.join('\r\n') + '\r\n');
  });

  // "I have transferred this" — closes out every unpaid tip for the company, atomically.
  app.post('/api/companies/:id/payouts', loadCompany, (req, res) => {
    const note = str(req.body && req.body.note, 200);
    try {
      const result = database.tx(db, () => {
        const agg = db.prepare(
          `SELECT COUNT(*) AS n, COALESCE(SUM(net), 0) AS amount, MAX(id) AS max_id
           FROM tips WHERE company_id = ? AND status = 'paid' AND payout_id IS NULL`
        ).get(req.company.id);
        if (!agg.n) return null;
        const info = db.prepare('INSERT INTO payouts (company_id, amount, tips_count, iban, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.company.id, agg.amount, agg.n, req.company.iban, note, Date.now());
        const payoutId = Number(info.lastInsertRowid);
        db.prepare(`UPDATE tips SET payout_id = ? WHERE company_id = ? AND status = 'paid' AND payout_id IS NULL AND id <= ?`)
          .run(payoutId, req.company.id, agg.max_id);
        return { id: payoutId, amount: agg.amount, tips_count: agg.n };
      });
      if (!result) return bad(res, 'Nothing to pay out for this company.');
      res.status(201).json(result);
    } catch (e) { console.error(e); bad(res, 'Could not record the payout.', 500); }
  });

  app.use('/api', (req, res) => bad(res, 'Not found.', 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return bad(res, 'Bad request.');
    console.error(err);
    bad(res, 'Server error.', 500);
  });

  return app;
}

if (require.main === module) {
  const config = cfg.config;
  const db = database.open(path.join(config.dataDir, 'tipper.db'));
  const allowIps = (process.env.ADMIN_ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!db.prepare('SELECT 1 FROM admins LIMIT 1').get()) {
    console.warn('No admin account yet — run:  npm run create-admin');
  }
  createAdminApp({ db, config, allowIps }).listen(config.adminPort, config.adminHost, () => {
    console.log(`Tipper ADMIN panel   → http://${config.adminHost}:${config.adminPort}  (private)`);
  });
}

module.exports = { createAdminApp, dayStart };
