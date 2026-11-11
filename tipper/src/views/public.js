'use strict';
const { esc } = require('../http');

const ICONS = {
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/></svg>',
  tap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
  pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>',
  access: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.500 10c0 5.400-7.500 10-7.500 10z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.500 2.500M15.500 15.500L18 18M18 6l-2.500 2.500M8.500 15.500L6 18"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.500a2.500 2.500 0 0 1 0 5H17M8 3v3M12 3v3"/></svg>',
  apple: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.400 12.600c0-2.300 1.900-3.400 2-3.500-1.100-1.600-2.800-1.800-3.400-1.800-1.400-.1-2.800.9-3.500.9-.7 0-1.800-.8-3-.8-1.500 0-2.900.9-3.700 2.200-1.600 2.800-.4 6.800 1.100 9 .8 1.100 1.700 2.300 2.800 2.200 1.100 0 1.600-.7 2.900-.7 1.400 0 1.700.7 2.900.7 1.200 0 2-1.100 2.700-2.200.9-1.300 1.200-2.500 1.200-2.600-.1 0-2-.8-2-3.400zM14.200 5.800c.6-.8 1-1.800.9-2.800-.9 0-2 .6-2.600 1.400-.6.700-1.100 1.700-.9 2.700 1 .1 2-.5 2.600-1.300z"/></svg>',
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.600 12.200c0-.7-.1-1.400-.2-2H12v3.800h5.400a4.600 4.600 0 0 1-2 3v2.500h3.200c1.900-1.700 3-4.300 3-7.300z"/><path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 1-3.400 1-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.400 14c-.2-.6-.3-1.300-.3-2s.1-1.400.3-2V7.400H3.100a10 10 0 0 0 0 9.200z"/><path fill="#EA4335" d="M12 5.900c1.500 0 2.800.5 3.800 1.500l2.900-2.900A10 10 0 0 0 3.100 7.400L6.400 10c.8-2.300 3-4.100 5.600-4.100z"/></svg>',
};

const WHY_ICONS = ['access', 'box', 'shield', 'calendar', 'heart', 'spark'];
const STEP_ICONS = ['qr', 'tap', 'pay', 'bank'];
const PROBLEM_ICONS = ['heart', 'pay', 'box'];

function page({ lang, langs, t, title, description, body, css = [], js = [], bodyClass = '', robots = '' }) {
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots ? `<meta name="robots" content="${esc(robots)}">` : ''}
<meta name="theme-color" content="#FBF7F0">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap">
${css.map((c) => `<link rel="stylesheet" href="/static/css/${c}">`).join('\n')}
</head>
<body class="${esc(bodyClass)}">
${body}
${js.map((j) => `<script src="/static/js/${j}" defer></script>`).join('\n')}
</body>
</html>`;
}

function langSwitch({ lang, langs, t }) {
  if (langs.length < 2) return '';
  return `<div class="lang" role="group" aria-label="${esc(t('nav.language'))}">${langs
    .map((l) => `<a href="?lang=${esc(l)}" class="${l === lang ? 'on' : ''}" hreflang="${esc(l)}"${l === lang ? ' aria-current="true"' : ''}>${esc(l.toUpperCase())}</a>`)
    .join('')}</div>`;
}

function brandMark() {
  return `<a class="brand" href="/" aria-label="Tipper"><span class="brand-mark">${ICONS.cup}</span><span>Tipper</span></a>`;
}

function partnerItem(p) {
  return p.logo_file
    ? `<li class="partner"><img src="/logos/${esc(p.logo_file)}" alt="${esc(p.name)}" loading="lazy" height="40"></li>`
    : `<li class="partner partner-text"><span>${esc(p.name)}</span></li>`;
}

function partnersSection({ t, partners }) {
  if (!partners.length) return '';
  // Repeat the set until one "group" is wide enough, then render it twice for a seamless loop.
  let group = partners;
  while (group.length < 8) group = group.concat(partners);
  const items = group.map(partnerItem).join('');
  return `<section class="section partners" id="partners" aria-labelledby="partners-title">
  <div class="wrap center">
    <p class="eyebrow">${esc(t('partners.eyebrow'))}</p>
    <h2 id="partners-title">${esc(t('partners.title'))}</h2>
  </div>
  <div class="marquee" role="region" aria-label="${esc(t('partners.label'))}">
    <ul class="marquee-track">${items}</ul>
    <ul class="marquee-track" aria-hidden="true">${items}</ul>
  </div>
</section>`;
}

function landing({ lang, langs, t, config, partners }) {
  const sw = langSwitch({ lang, langs, t });
  const contactBtns = [
    config.contactEmail ? `<a class="btn btn-light" href="mailto:${esc(config.contactEmail)}">${esc(t('contact.email'))}: ${esc(config.contactEmail)}</a>` : '',
    config.contactPhone ? `<a class="btn btn-ghost-light" href="tel:${esc(config.contactPhone.replace(/\s+/g, ''))}">${esc(t('contact.phone'))}: ${esc(config.contactPhone)}</a>` : '',
  ].join('');
  const ctaHref = config.contactEmail ? `mailto:${esc(config.contactEmail)}` : '#contact';

  const body = `
<header class="site-header" id="top">
  <div class="wrap bar">
    ${brandMark()}
    <nav id="nav" class="nav" aria-label="Main">
      <a href="#problem">${esc(t('nav.problem'))}</a>
      <a href="#how">${esc(t('nav.how'))}</a>
      <a href="#why">${esc(t('nav.why'))}</a>
      <a href="#about">${esc(t('nav.about'))}</a>
      ${partners.length ? `<a href="#partners">${esc(t('nav.partners'))}</a>` : ''}
      <a href="#contact">${esc(t('nav.contact'))}</a>
    </nav>
    <div class="bar-end">
      ${sw}
      <a class="btn btn-small btn-primary hide-sm" href="${ctaHref}">${esc(t('nav.cta'))}</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav" aria-label="${esc(t('nav.menu'))}"><span></span><span></span></button>
    </div>
  </div>
</header>

<main>
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${esc(t('hero.eyebrow'))}</p>
      <h1>${esc(t('hero.title'))}</h1>
      <p class="lead">${esc(t('hero.text'))}</p>
      <div class="actions">
        <a class="btn btn-primary" href="${ctaHref}">${esc(t('hero.primary'))}</a>
        <a class="btn btn-ghost" href="#how">${esc(t('hero.secondary'))}</a>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="phone">
        <div class="phone-notch"></div>
        <div class="phone-screen">
          <p class="ps-hi">${esc(t('hero.cardGreeting'))}</p>
          <p class="ps-thanks">${esc(t('hero.cardThanks'))}</p>
          <p class="ps-place">${esc(t('hero.cardPlace'))}</p>
          <div class="ps-amounts"><span>1 ₾</span><span class="on">2 ₾</span><span>5 ₾</span><span>10 ₾</span></div>
          <div class="ps-pay ps-apple">${ICONS.apple}<span>Pay</span></div>
          <div class="ps-pay ps-google">${ICONS.google}<span>Pay</span></div>
          <p class="ps-brand">Tipper</p>
        </div>
      </div>
      <div class="chip chip-nfc">${ICONS.tap}<span>NFC</span></div>
      <div class="chip chip-qr">${ICONS.qr}<span>QR</span></div>
    </div>
  </div>
</section>

<section class="section problem" id="problem">
  <div class="wrap">
    <p class="eyebrow">${esc(t('problem.eyebrow'))}</p>
    <h2>${esc(t('problem.title'))}</h2>
    <p class="lead narrow">${esc(t('problem.text'))}</p>
    <div class="cards three">
      ${t('problem.points').map((p, i) => `<article class="card"><span class="icon">${ICONS[PROBLEM_ICONS[i % PROBLEM_ICONS.length]]}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></article>`).join('')}
    </div>
  </div>
</section>

<section class="solution">
  <div class="wrap center">
    <h2>${esc(t('solution.title'))}</h2>
    <p class="lead">${esc(t('solution.text'))}</p>
  </div>
</section>

<section class="section how" id="how">
  <div class="wrap">
    <p class="eyebrow">${esc(t('how.eyebrow'))}</p>
    <h2>${esc(t('how.title'))}</h2>
    <ol class="steps">
      ${t('how.steps').map((s, i) => `<li class="step"><span class="step-num">${i + 1}</span><span class="icon">${ICONS[STEP_ICONS[i % STEP_ICONS.length]]}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}
    </ol>
  </div>
</section>

<section class="section why" id="why">
  <div class="wrap">
    <p class="eyebrow">${esc(t('why.eyebrow'))}</p>
    <h2>${esc(t('why.title'))}</h2>
    <div class="cards three">
      ${t('why.items').map((s, i) => `<article class="card"><span class="icon">${ICONS[WHY_ICONS[i % WHY_ICONS.length]]}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('')}
    </div>
  </div>
</section>

<section class="section about" id="about">
  <div class="wrap narrow-wrap">
    <p class="eyebrow">${esc(t('about.eyebrow'))}</p>
    <h2>${esc(t('about.title'))}</h2>
    <p class="lead">${esc(t('about.text'))}</p>
  </div>
</section>

${partnersSection({ t, partners })}

<section class="contact" id="contact">
  <div class="wrap center">
    <h2>${esc(t('contact.title'))}</h2>
    <p class="lead">${esc(t('contact.text'))}</p>
    <div class="actions center-actions">${contactBtns}</div>
  </div>
</section>
</main>

<footer class="site-footer">
  <div class="wrap foot">
    ${brandMark()}
    <p>${esc(t('footer.tagline'))}</p>
    <p class="muted">© ${new Date().getFullYear()} Tipper. ${esc(t('footer.rights'))}</p>
  </div>
</footer>`;

  return page({
    lang, langs, t,
    title: t('meta.landingTitle'),
    description: t('meta.landingDescription'),
    body,
    css: ['site.css'],
    js: ['landing.js'],
  });
}

function tipPage({ lang, langs, t, company, config, isDemo, clientText }) {
  const presets = [1, 2, 5, 10];
  const body = `
<main class="tip" id="tip"
  data-slug="${esc(company.slug)}"
  data-min="${config.minTip}" data-max="${config.maxTip}"
  data-demo="${isDemo ? '1' : '0'}"
  data-company="${esc(company.name)}"
  data-text="${esc(JSON.stringify(clientText))}">
  ${isDemo ? `<div class="demo-banner">${esc(t('tip.demoBanner'))}</div>` : ''}
  <section class="tip-card" id="tip-form">
    <p class="tip-hi">${esc(t('tip.greeting'))}</p>
    <h1 class="tip-thanks">${esc(t('tip.thanks'))}</h1>
    <p class="tip-for">${esc(t('tip.for'))} <strong>${esc(company.name)}</strong></p>

    <p class="tip-label" id="amt-label">${esc(t('tip.amountLabel'))}</p>
    <div class="amounts" role="radiogroup" aria-labelledby="amt-label">
      ${presets.map((p, i) => `<button type="button" class="amt${p === 2 ? ' on' : ''}" role="radio" aria-checked="${p === 2}" data-amount="${p}">${p}&nbsp;₾</button>`).join('')}
    </div>
    <label class="custom">
      <span>${esc(t('tip.custom'))}</span>
      <span class="custom-input"><input id="custom" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(t('tip.customPlaceholder'))}" aria-describedby="err"><b>₾</b></span>
    </label>
    <p class="tip-error" id="err" role="alert" hidden></p>

    <p class="tip-label">${esc(t('tip.payWith'))}</p>
    <div class="pay">
      <button type="button" class="pay-btn apple" id="pay-apple" data-method="apple_pay" aria-label="${esc(t('tip.applePay'))}">${ICONS.apple}<span>Pay</span></button>
      <button type="button" class="pay-btn google" id="pay-google" data-method="google_pay" aria-label="${esc(t('tip.googlePay'))}">${ICONS.google}<span>Pay</span></button>
    </div>
    <p class="tip-secure">${esc(t('tip.secure'))}</p>
  </section>

  <section class="tip-card tip-done" id="tip-done" hidden aria-live="polite">
    <div class="done-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></div>
    <h1>${esc(t('tip.successTitle'))}</h1>
    <p id="done-text"></p>
    <button type="button" class="again" id="again">${esc(t('tip.again'))}</button>
  </section>

  <a class="tip-brand" href="/" aria-label="Tipper"><span class="brand-mark">${ICONS.cup}</span>Tipper</a>
</main>`;
  return page({
    lang, langs, t,
    title: t('meta.tipTitle', { company: company.name }),
    description: t('tip.thanks'),
    body,
    css: ['tip.css'],
    js: ['tip.js'],
    bodyClass: 'tip-body',
    robots: 'noindex, nofollow',
  });
}

function tipUnavailable({ lang, langs, t }) {
  const body = `<main class="tip"><section class="tip-card center-text"><h1>${esc(t('tip.notFoundTitle'))}</h1><p>${esc(t('tip.notFoundText'))}</p></section>
  <a class="tip-brand" href="/"><span class="brand-mark">${ICONS.cup}</span>Tipper</a></main>`;
  return page({ lang, langs, t, title: t('tip.notFoundTitle'), description: t('tip.notFoundText'), body, css: ['tip.css'], bodyClass: 'tip-body', robots: 'noindex' });
}

function notFound({ lang, langs, t }) {
  const body = `<main class="tip"><section class="tip-card center-text"><h1>${esc(t('notFound.title'))}</h1><p>${esc(t('notFound.text'))}</p><p><a class="btn btn-primary" href="/">${esc(t('notFound.home'))}</a></p></section></main>`;
  return page({ lang, langs, t, title: t('notFound.title'), description: t('notFound.text'), body, css: ['tip.css'], bodyClass: 'tip-body', robots: 'noindex' });
}

module.exports = { landing, tipPage, tipUnavailable, notFound };
