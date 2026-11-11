'use strict';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Security headers + a strict CSP (no inline scripts or styles anywhere). */
function securityHeaders({ extraCsp = {} } = {}) {
  const csp = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", 'https://fonts.googleapis.com'],
    'font-src': ['https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
  };
  for (const [k, v] of Object.entries(extraCsp)) csp[k] = [...(csp[k] || []), ...v];
  const header = Object.entries(csp).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', header);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  };
}

/** Small in-memory sliding-window limiter. Enough for one process; use a proxy/WAF for more. */
function rateLimiter({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh); else hits.delete(k);
    }
  }, Math.min(windowMs, 60_000));
  timer.unref();

  const middleware = (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    arr.push(now);
    hits.set(k, arr);
    next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { esc, securityHeaders, rateLimiter, parseCookies };
