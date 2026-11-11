'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

const cfg = require('./config');
const database = require('./db');
const { translator, subtree, availableLangs, pickLang } = require('./i18n');
const { securityHeaders, rateLimiter, esc } = require('./http');
const { parseGel, formatGel, feeFor } = require('./money');
const { getProvider } = require('./payments');
const views = require('./views/public');

const METHODS = new Set(['apple_pay', 'google_pay']);

/**
 * The PUBLIC app: landing page, guest tip pages, the tip API.
 * It contains no admin routes at all — the admin panel is a different server.
 */
function createPublicApp({ db, config = cfg.config, provider = getProvider(config.paymentProvider) }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(securityHeaders());
  app.use(express.json({ limit: '4kb' }));

  const staticOpts = { maxAge: config.production ? '1h' : 0, index: false };
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), staticOpts));
  fs.mkdirSync(path.join(config.dataDir, 'logos'), { recursive: true });
  app.use('/logos', express.static(path.join(config.dataDir, 'logos'), { maxAge: '1h', index: false, dotfiles: 'ignore' }));

  const ctx = (req, res) => {
    const lang = pickLang(req, config);
    if (req.query.lang && req.query.lang === lang) {
      res.setHeader('Set-Cookie', `lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
    }
    return { lang, langs: availableLangs(), t: translator(lang), config };
  };

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /t/\nDisallow: /api/\n'));

  // ── Landing page ──────────────────────────────────────────────────
  app.get('/', (req, res) => {
    // Only the name + logo of opted-in, active companies is ever exposed here.
    const partners = db.prepare(
      'SELECT name, logo_file FROM companies WHERE active = 1 AND show_on_landing = 1 ORDER BY created_at, id'
    ).all();
    res.type('html').send(views.landing({ ...ctx(req, res), partners }));
  });

  // ── Guest tip page (reached by QR code / NFC tag) ─────────────────
  app.get('/t/:slug', (req, res) => {
    const c = ctx(req, res);
    const company = db.prepare('SELECT slug, name FROM companies WHERE slug = ? AND active = 1').get(req.params.slug);
    res.setHeader('Cache-Control', 'no-store');
    if (!company) return res.status(404).type('html').send(views.tipUnavailable(c));
    const clientText = subtree(c.lang, 'tip');
    res.type('html').send(views.tipPage({ ...c, company, isDemo: !!provider.isDemo, clientText }));
  });

  // ── Tip API ───────────────────────────────────────────────────────
  const tipLimiter = rateLimiter({ windowMs: 60_000, max: 20 });
  app.post('/api/tip', tipLimiter, async (req, res) => {
    const { slug, amount, method } = req.body || {};
    if (typeof slug !== 'string' || !METHODS.has(method)) return res.status(400).json({ error: 'Invalid request.' });

    const gross = parseGel(amount);
    if (gross === null || gross < config.minTip || gross > config.maxTip) {
      return res.status(400).json({ error: `Amount must be between ${formatGel(config.minTip)} and ${formatGel(config.maxTip)} GEL.` });
    }
    const company = db.prepare('SELECT * FROM companies WHERE slug = ? AND active = 1').get(slug);
    if (!company) return res.status(404).json({ error: 'This tip page is not available.' });

    try {
      const charge = await provider.charge({ amount: gross, method, company: { id: company.id, name: company.name } });
      if (!charge || !charge.ok) return res.status(402).json({ error: 'Payment failed.' });

      // The fee is fixed at the moment of the tip, so later fee changes never rewrite history.
      const platform = database.getPlatform(db, config);
      const feeBp = database.effectiveFeeBp(company, platform);
      const fee = feeFor(gross, feeBp);
      db.prepare(
        `INSERT INTO tips (company_id, gross, fee, net, method, provider, provider_ref, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?)`
      ).run(company.id, gross, fee, gross - fee, method, provider.name, String(charge.ref || ''), Date.now());

      res.json({ ok: true, amount: formatGel(gross), company: company.name });
    } catch (err) {
      console.error('tip failed', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // ── 404 + errors ──────────────────────────────────────────────────
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
    res.status(404).type('html').send(views.notFound(ctx(req, res)));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Bad request.' });
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  });

  return app;
}

if (require.main === module) {
  const config = cfg.config;
  const db = database.open(path.join(config.dataDir, 'tipper.db'));
  const provider = getProvider(config.paymentProvider);
  createPublicApp({ db, config, provider }).listen(config.port, () => {
    console.log(`Tipper public site   → http://localhost:${config.port}  (payments: ${provider.name}${provider.isDemo ? ' — DEMO, no real money' : ''})`);
  });
}

module.exports = { createPublicApp };
