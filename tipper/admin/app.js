(function () {
  'use strict';

  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var state = { overview: null, user: null };

  // ── helpers ───────────────────────────────────────────────────────
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function gel(t) { return (t / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₾'; }
  function pct(bp) { return (bp / 100).toString().replace(/\.0+$/, '') + '%'; }
  function dateTime(ms) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  }
  function methodName(m) { return m === 'apple_pay' ? 'Apple Pay' : m === 'google_pay' ? 'Google Pay' : m; }

  var toastTimer;
  function toast(msg, bad) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (bad ? ' bad' : '');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, bad ? 5000 : 2600);
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch('/api' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tipper-admin' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && path !== '/login') { state.user = null; renderLogin(); throw new Error('Please sign in.'); }
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
      });
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve(null);
      if (file.size > 400 * 1024) return reject(new Error('Logo is too large (max 400 KB).'));
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsDataURL(file);
    });
  }

  // ── login ─────────────────────────────────────────────────────────
  function renderLogin(message) {
    document.title = 'Sign in — Tipper Admin';
    app.innerHTML =
      '<div class="login"><form class="card" id="login-form" autocomplete="on">' +
      '<h1>Tipper admin</h1><p class="muted">Private area. Sign in to continue.</p>' +
      (message ? '<div class="err">' + esc(message) + '</div>' : '') +
      '<div id="login-err"></div>' +
      '<label class="f"><span>Username</span><input type="text" name="username" autocomplete="username" required autofocus></label>' +
      '<label class="f"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>' +
      '<button class="btn primary block">Sign in</button></form></div>';
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      api('/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } })
        .then(function (r) { state.user = r.username; route(); })
        .catch(function (err) { document.getElementById('login-err').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
  }

  // ── shell ─────────────────────────────────────────────────────────
  function shell(active, inner) {
    var demo = state.overview && state.overview.payment_provider === 'demo';
    app.innerHTML =
      '<header class="topbar"><div class="topbar-in">' +
      '<a class="logo" href="#/">Tipper <small>Admin</small></a>' +
      '<nav class="topnav" aria-label="Admin">' +
      nav('#/', 'Companies', active === 'companies') + nav('#/payouts', 'Payouts', active === 'payouts') + nav('#/account', 'Account', active === 'account') +
      '</nav><span class="who">' + esc(state.user) + '</span>' +
      '<button class="btn sm" data-action="logout">Sign out</button></div></header>' +
      '<main>' +
      (demo ? '<div class="banner"><strong>Demo payments.</strong> The payment provider is set to <code>demo</code>: tips are simulated and no real money moves.</div>' : '') +
      inner + '</main>';
  }
  function nav(href, label, on) { return '<a href="' + href + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' + label + '</a>'; }

  // ── companies (home) ──────────────────────────────────────────────
  function viewCompanies() {
    return api('/overview').then(function (o) {
      state.overview = o;
      document.title = 'Companies — Tipper Admin';
      var p = o.platform, t = o.totals;
      var rows = o.companies.map(function (c) {
        return '<tr class="' + (c.active ? '' : 'inactive') + '">' +
          '<td><a class="name" href="#/c/' + c.id + '">' + esc(c.name) + '</a>' + (c.active ? '' : ' <span class="pill off">Inactive</span>') + '</td>' +
          '<td>' + esc(c.location || '—') + '</td>' +
          '<td>' + (c.account_holder ? esc(c.account_holder) + '<br>' : '') + '<span class="mono">' + esc(c.iban_display) + '</span></td>' +
          '<td class="nowrap">' + pct(c.effective_fee_bp) + (c.fee_bp === null ? ' <span class="muted small">default</span>' : ' <span class="pill">custom</span>') + '</td>' +
          '<td class="right nowrap">' + gel(c.today_gross) + '<div class="muted small">' + c.today_count + ' tips</div></td>' +
          '<td class="right nowrap"><strong>' + gel(c.pending_net) + '</strong><div class="muted small">' + c.pending_count + ' tips</div></td>' +
          '<td class="right nowrap"><a class="btn sm" href="#/c/' + c.id + '">Open panel</a></td></tr>';
      }).join('');

      var me =
        '<tr class="me"><td><span class="name">' + esc(p.name) + '</span><span class="pill">You</span></td>' +
        '<td>' + esc(p.location || '—') + '</td>' +
        '<td>' + (p.holder ? esc(p.holder) + '<br>' : '') + (p.iban ? '<span class="mono">' + esc(p.iban_display) + '</span>' : '<span class="muted">Add your bank account →</span>') + '</td>' +
        '<td class="nowrap"><strong>' + pct(p.default_fee_bp) + '</strong> <span class="muted small">default fee</span></td>' +
        '<td class="right nowrap">' + gel(t.today_fee) + '<div class="muted small">my fee today</div></td>' +
        '<td class="right nowrap">' + gel(t.total_fee) + '<div class="muted small">my fees, all time</div></td>' +
        '<td class="right nowrap"><button class="btn sm" data-action="edit-platform">Edit mine</button></td></tr>';

      return shell('companies',
        '<div class="page-head"><h1>Companies</h1><button class="btn primary" data-action="add-company">+ Add company</button></div>' +
        '<section class="stats">' +
        stat('Tips today', gel(t.today_gross), 'paid by guests') +
        stat('My fee today', gel(t.today_fee), 'at the current fee %') +
        stat('Owed to companies', gel(t.owed_to_companies), 'to transfer at day end') +
        stat('My fees, all time', gel(t.total_fee), gel(t.total_gross) + ' tipped in total') +
        '</section>' +
        '<div class="table-wrap"><table><thead><tr><th>Company</th><th>Location</th><th>Bank account</th><th>Fee</th><th class="right">Today</th><th class="right">Owed (net)</th><th></th></tr></thead><tbody>' +
        me + rows + '</tbody></table>' +
        (o.companies.length ? '' : '<div class="empty">No companies yet. Add the first one — it gets its own QR code and tip page.</div>') +
        '</div>');
    });
  }
  function stat(label, value, sub) { return '<div class="stat"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div><div class="sub">' + esc(sub) + '</div></div>'; }

  // ── company panel ─────────────────────────────────────────────────
  function viewCompany(id) {
    return Promise.all([api('/companies/' + id), state.overview ? Promise.resolve(state.overview) : api('/overview')]).then(function (r) {
      var d = r[0]; state.overview = r[1];
      var c = d.company;
      document.title = c.name + ' — Tipper Admin';
      var daily = d.daily.map(function (x) { return '<tr><td>' + esc(x.day) + '</td><td class="right">' + x.count + '</td><td class="right">' + gel(x.gross) + '</td><td class="right">' + gel(x.net) + '</td></tr>'; }).join('');
      var tips = d.tips.map(function (x) {
        return '<tr><td class="nowrap">' + dateTime(x.created_at) + '</td><td>' + methodName(x.method) + '</td><td class="right">' + gel(x.gross) + '</td><td class="right">' + gel(x.fee) + '</td><td class="right">' + gel(x.net) + '</td><td>' + (x.payout_id ? '<span class="pill ok">Paid out</span>' : '<span class="pill">Pending</span>') + '</td></tr>';
      }).join('');
      var payouts = d.payouts.map(function (x) { return '<tr><td class="nowrap">' + dateTime(x.created_at) + '</td><td class="right">' + gel(x.amount) + '</td><td class="right">' + x.tips_count + '</td><td class="mono">' + esc(x.iban) + '</td><td>' + esc(x.note) + '</td></tr>'; }).join('');

      return shell('companies',
        '<p class="small"><a href="#/">← All companies</a></p>' +
        '<div class="page-head"><div><h1>' + esc(c.name) + (c.active ? '' : ' <span class="pill off">Inactive</span>') + '</h1><div class="muted">' + esc(c.location || 'No location') + '</div></div>' +
        '<div class="row"><a class="btn" href="' + esc(c.tip_url) + '" target="_blank" rel="noopener">Open tip page ↗</a></div></div>' +
        '<div class="panel-grid">' +
        // left: QR
        '<aside class="card qr-card"><h2>QR code</h2><p class="muted small">Print it, stick it by the till.</p>' +
        '<img src="/api/companies/' + c.id + '/qr.svg" alt="QR code for ' + esc(c.name) + '" width="280" height="280">' +
        '<div class="linkbox"><input type="text" readonly value="' + esc(c.tip_url) + '" aria-label="Tip link" id="tip-link"><button class="btn sm" data-action="copy-link">Copy</button></div>' +
        '<div class="row center-row">' +
        '<a class="btn sm" href="/api/companies/' + c.id + '/qr.png?download=1">PNG</a>' +
        '<a class="btn sm" href="/api/companies/' + c.id + '/qr.svg?download=1">SVG</a>' +
        '<button class="btn sm primary" data-action="print-card" data-id="' + c.id + '">Print table card</button></div>' +
        '<div class="hint"><strong>NFC:</strong> write the link above to an NFC tag (NTAG213 or NTAG215, as a “URL” record) with any free NFC-writer app. Tapping a phone on it opens the same tip page as the QR code.</div>' +
        '</aside>' +
        // right: stats + edit
        '<div>' +
        '<section class="stats tight">' +
        stat('Today', gel(c.today_gross), c.today_count + ' tips') +
        stat('Owed to ' + c.name, gel(c.pending_net), c.pending_count + ' tips pending') +
        stat('All-time tips', gel(c.total_gross), 'my fee ' + gel(c.total_fee)) +
        '</section>' +
        (c.pending_net > 0 ? '<div class="card gap-b"><div class="card-head"><div><h2>Pay out ' + gel(c.pending_net) + '</h2><div class="muted small">Transfer to <span class="mono">' + esc(c.iban_display) + '</span>, then record it here.</div></div><button class="btn primary" data-action="payout" data-id="' + c.id + '" data-amount="' + c.pending_net + '" data-name="' + esc(c.name) + '">Mark as paid out</button></div></div>' : '') +
        '<section class="card"><div class="card-head"><h2>Details</h2></div><form id="company-form" data-id="' + c.id + '">' + companyFields(c, d.default_fee_bp) +
        '<div class="row"><button class="btn primary">Save changes</button></div></form></section>' +
        '</div></div>' +
        '<section class="card"><h2>Last 14 days</h2>' + table(['Day', 'Tips', 'Gross', 'Net to company'], daily, [1, 2, 3]) + '</section>' +
        '<section class="card"><h2>Recent tips</h2>' + table(['When', 'Method', 'Tip', 'My fee', 'Company gets', 'Status'], tips, [2, 3, 4]) + '</section>' +
        '<section class="card"><h2>Payout history</h2>' + table(['When', 'Amount', 'Tips', 'Account paid', 'Note'], payouts, [1, 2]) + '</section>');
    });
  }

  function table(heads, rows, rightCols) {
    if (!rows) return '<div class="empty">Nothing yet.</div>';
    return '<div class="table-wrap gap-t"><table class="narrow-table"><thead><tr>' +
      heads.map(function (h, i) { return '<th' + (rightCols.indexOf(i) >= 0 ? ' class="right"' : '') + '>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function companyFields(c, defaultFeeBp) {
    c = c || {};
    return '<div id="form-err"></div>' +
      '<div class="grid2"><label class="f"><span>Company name</span><input type="text" name="name" required maxlength="80" value="' + esc(c.name || '') + '"></label>' +
      '<label class="f"><span>Location</span><input type="text" name="location" maxlength="120" placeholder="Street, city" value="' + esc(c.location || '') + '"></label></div>' +
      '<div class="grid2"><label class="f"><span>Account holder</span><input type="text" name="account_holder" maxlength="100" placeholder="Name on the bank account" value="' + esc(c.account_holder || '') + '"></label>' +
      '<label class="f"><span>Bank account (IBAN)</span><input type="text" name="iban" required class="mono" placeholder="GE00XX0000000000000000" value="' + esc(c.iban_display || '') + '"></label></div>' +
      '<div class="grid2"><label class="f"><span>Fee for this company (%)</span><input type="text" inputmode="decimal" name="fee_percent" placeholder="Default (' + pct(defaultFeeBp != null ? defaultFeeBp : state.overview.platform.default_fee_bp) + ')" value="' + (c.fee_bp == null ? '' : esc(c.fee_bp / 100)) + '"><small>Leave empty to use your default fee.</small></label>' +
      '<label class="f"><span>Logo (PNG, JPEG, WebP · max 400 KB)</span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp">' +
      (c.logo_url ? '<small><img src="' + esc(c.logo_url) + '" alt="" height="28" class="logo-thumb"><label><input type="checkbox" name="remove_logo"> remove current logo</label></small>' : '') + '</label></div>' +
      '<label class="check"><input type="checkbox" name="show_on_landing"' + (c.show_on_landing === false ? '' : ' checked') + '> Show on the landing page (partner logos)</label>' +
      (c.id !== undefined ? '<label class="check"><input type="checkbox" name="active"' + (c.active ? ' checked' : '') + '> Active (inactive companies’ QR codes stop working)</label>' : '');
  }

  function collectCompany(form) {
    var f = form.elements;
    return readFileAsDataUrl(f.logo && f.logo.files[0]).then(function (logo) {
      var body = {
        name: f.name.value, location: f.location.value, account_holder: f.account_holder.value,
        iban: f.iban.value, fee_percent: f.fee_percent.value, show_on_landing: f.show_on_landing.checked,
      };
      if (logo) body.logo = logo;
      if (f.remove_logo && f.remove_logo.checked) body.remove_logo = true;
      if (f.active) body.active = f.active.checked;
      return body;
    });
  }

  // ── payouts ───────────────────────────────────────────────────────
  function viewPayouts() {
    return Promise.all([api('/payouts'), api('/overview')]).then(function (r) {
      var d = r[0]; state.overview = r[1];
      document.title = 'Payouts — Tipper Admin';
      var total = d.pending.reduce(function (a, x) { return a + x.amount; }, 0);
      var pend = d.pending.map(function (x) {
        return '<tr><td><a class="name" href="#/c/' + x.company_id + '">' + esc(x.name) + '</a></td><td>' + esc(x.account_holder || '—') + '</td><td class="mono">' + esc(x.iban_display) + '</td>' +
          '<td class="right nowrap"><strong>' + gel(x.amount) + '</strong></td><td class="right">' + x.tips_count + '</td>' +
          '<td class="right"><button class="btn sm primary" data-action="payout" data-id="' + x.company_id + '" data-amount="' + x.amount + '" data-name="' + esc(x.name) + '">Mark as paid</button></td></tr>';
      }).join('');
      var hist = d.history.map(function (x) {
        return '<tr><td class="nowrap">' + dateTime(x.created_at) + '</td><td>' + esc(x.name) + '</td><td class="mono">' + esc(x.iban_display) + '</td><td class="right">' + gel(x.amount) + '</td><td class="right">' + x.tips_count + '</td><td>' + esc(x.note) + '</td></tr>';
      }).join('');
      return shell('payouts',
        '<div class="page-head"><h1>Payouts</h1>' + (d.pending.length ? '<a class="btn" href="/api/payouts/pending.csv">Download bank-transfer CSV</a>' : '') + '</div>' +
        '<section class="card"><div class="card-head"><div><h2>To pay now</h2><div class="muted small">Tips collected since each company’s last payout, after your fee. Transfer the money from your bank, then press “Mark as paid”.</div></div>' +
        (d.pending.length ? '<div class="stat total-tile"><div class="label">Total owed</div><div class="value">' + gel(total) + '</div></div>' : '') + '</div>' +
        (d.pending.length ? '<div class="table-wrap"><table class="mid-table"><thead><tr><th>Company</th><th>Account holder</th><th>IBAN</th><th class="right">Amount</th><th class="right">Tips</th><th></th></tr></thead><tbody>' + pend + '</tbody></table></div>' : '<div class="empty">Nothing to pay out right now. 🎉</div>') + '</section>' +
        '<section class="card"><h2>History</h2>' + table(['When', 'Company', 'Account paid', 'Amount', 'Tips', 'Note'], hist, [3, 4]) + '</section>');
    });
  }

  // ── account ───────────────────────────────────────────────────────
  function viewAccount() {
    document.title = 'Account — Tipper Admin';
    return Promise.resolve(shell('account',
      '<div class="page-head"><h1>Account</h1></div>' +
      '<section class="card narrow-card"><h2>Change password</h2><p class="muted small">Signed in as <strong>' + esc(state.user) + '</strong>. Other devices are signed out when you change it.</p>' +
      '<form id="pw-form"><div id="pw-err"></div>' +
      '<label class="f"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>' +
      '<label class="f"><span>New password (min 10 characters)</span><input type="password" name="next" autocomplete="new-password" minlength="10" required></label>' +
      '<button class="btn primary">Change password</button></form></section>'));
  }

  // ── dialogs ───────────────────────────────────────────────────────
  function openDialog(html, onSubmit) {
    var dlg = document.createElement('dialog');
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.querySelector('[data-close]').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter; if (btn) btn.disabled = true;
      Promise.resolve(onSubmit(e.target, dlg)).catch(function (err) {
        var box = dlg.querySelector('#form-err'); if (box) box.innerHTML = '<div class="err">' + esc(err.message) + '</div>';
      }).then(function () { if (btn) btn.disabled = false; });
    });
    dlg.showModal();
    return dlg;
  }

  function dialogAddCompany() {
    openDialog('<h2>Add a company</h2><form>' + companyFields(null, state.overview.platform.default_fee_bp) +
      '<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Create company</button></div></form>',
      function (form, dlg) {
        return collectCompany(form).then(function (body) { return api('/companies', { method: 'POST', body: body }); })
          .then(function (r) { dlg.close(); toast('Company created — its QR code is ready.'); location.hash = '#/c/' + r.id; });
      });
  }

  function dialogPlatform() {
    var p = state.overview.platform;
    openDialog('<h2>Your details &amp; fee</h2><p class="muted small">This is where your share goes. Only you can see and change this — it lives in the private admin panel.</p><form><div id="form-err"></div>' +
      '<div class="grid2"><label class="f"><span>Name</span><input type="text" name="name" required maxlength="80" value="' + esc(p.name) + '"></label>' +
      '<label class="f"><span>Location</span><input type="text" name="location" maxlength="120" value="' + esc(p.location) + '"></label></div>' +
      '<div class="grid2"><label class="f"><span>Account holder</span><input type="text" name="holder" maxlength="100" value="' + esc(p.holder) + '"></label>' +
      '<label class="f"><span>Your bank account (IBAN)</span><input type="text" name="iban" class="mono" placeholder="GE00XX0000000000000000" value="' + esc(p.iban_display) + '"></label></div>' +
      '<label class="f"><span>Default fee I keep from each tip (%)</span><input type="text" inputmode="decimal" name="fee" required value="' + esc(p.default_fee_bp / 100) + '"><small>Between 0 and 30. Applies to new tips only; past tips keep the fee they were charged. A company can have its own custom fee.</small></label>' +
      '<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>',
      function (form, dlg) {
        var f = form.elements;
        return api('/platform', { method: 'PUT', body: { name: f.name.value, location: f.location.value, holder: f.holder.value, iban: f.iban.value, default_fee_percent: f.fee.value } })
          .then(function () { dlg.close(); toast('Saved.'); route(); });
      });
  }

  function printCard(id) {
    var o = state.overview;
    api('/companies/' + id).then(function (d) {
      var c = d.company, p = o.print || {};
      var root = document.getElementById('print-root');
      root.innerHTML = '<h1>' + esc(p.title || 'Leave a tip') + '</h1><div class="pc-company">' + esc(c.name) + '</div>' +
        '<img alt="" src="/api/companies/' + c.id + '/qr.svg">' +
        '<div class="pc-scan">' + esc(p.scan || '') + '</div><div class="pc-tap">' + esc(p.tap || '') + '</div><div class="pc-pay">' + esc(p.pay || '') + '</div><div class="pc-brand">Tipper</div>';
      var img = root.querySelector('img');
      var go = function () { document.body.classList.add('printing'); window.print(); };
      window.addEventListener('afterprint', function done() { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); });
      if (img.complete) go(); else img.addEventListener('load', go);
    }).catch(function (e) { toast(e.message, true); });
  }

  // ── events (delegated; CSP forbids inline handlers) ───────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    if (a === 'logout') api('/logout', { method: 'POST' }).then(function () { state.user = null; state.overview = null; renderLogin(); });
    else if (a === 'add-company') dialogAddCompany();
    else if (a === 'edit-platform') dialogPlatform();
    else if (a === 'copy-link') {
      var input = document.getElementById('tip-link');
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).catch(function () { input.select(); document.execCommand('copy'); }).then(function () { toast('Link copied.'); });
    }
    else if (a === 'print-card') printCard(el.dataset.id);
    else if (a === 'payout') {
      var msg = 'Record a payout of ' + gel(Number(el.dataset.amount)) + ' to ' + el.dataset.name + '?\n\nOnly do this after you have transferred the money.';
      if (!window.confirm(msg)) return;
      api('/companies/' + el.dataset.id + '/payouts', { method: 'POST', body: {} })
        .then(function (r) { toast('Payout of ' + gel(r.amount) + ' recorded.'); route(); })
        .catch(function (err) { toast(err.message, true); });
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.id === 'company-form') {
      e.preventDefault();
      collectCompany(form).then(function (body) { return api('/companies/' + form.dataset.id, { method: 'PUT', body: body }); })
        .then(function () { toast('Saved.'); route(); })
        .catch(function (err) { document.getElementById('form-err').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    } else if (form.id === 'pw-form') {
      e.preventDefault();
      api('/password', { method: 'POST', body: { current: form.current.value, next: form.next.value } })
        .then(function () { form.reset(); toast('Password changed.'); })
        .catch(function (err) { document.getElementById('pw-err').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    }
  });

  // ── router ────────────────────────────────────────────────────────
  function route() {
    if (!state.user) {
      return api('/me').then(function (r) { state.user = r.username; route(); }).catch(function () { renderLogin(); });
    }
    var h = location.hash || '#/';
    var m;
    var view;
    if ((m = h.match(/^#\/c\/(\d+)$/))) view = viewCompany(m[1]);
    else if (h === '#/payouts') view = viewPayouts();
    else if (h === '#/account') view = viewAccount();
    else view = viewCompanies();
    view.then(function () { window.scrollTo(0, 0); }).catch(function (err) { if (state.user) toast(err.message, true); });
  }
  window.addEventListener('hashchange', route);
  route();
})();
