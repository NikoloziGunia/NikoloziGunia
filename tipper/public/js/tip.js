(function () {
  var root = document.getElementById('tip');
  if (!root) return;

  var slug = root.dataset.slug;
  var min = Number(root.dataset.min) / 100;
  var max = Number(root.dataset.max) / 100;
  var demo = root.dataset.demo === '1';
  var company = root.dataset.company;
  var text = {};
  try { text = JSON.parse(root.dataset.text || '{}'); } catch (e) { /* keep defaults */ }
  var fill = function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return v[k]; }); };

  var chips = Array.prototype.slice.call(root.querySelectorAll('.amt'));
  var custom = document.getElementById('custom');
  var err = document.getElementById('err');
  var form = document.getElementById('tip-form');
  var done = document.getElementById('tip-done');
  var payButtons = Array.prototype.slice.call(root.querySelectorAll('.pay-btn'));
  var amount = 2; // default preset

  // ── Which wallet buttons to offer ─────────────────────────────────
  // Demo mode shows both so the owner can see the page. With a real provider,
  // replace this with the provider's / Apple's / Google's availability checks.
  var apple = document.getElementById('pay-apple');
  if (!demo && apple && !(window.ApplePaySession && window.ApplePaySession.canMakePayments && window.ApplePaySession.canMakePayments())) {
    apple.hidden = true;
  }

  function parse(v) {
    v = String(v).trim().replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
    var n = parseFloat(v);
    return n > 0 ? n : null;
  }
  function valid(n) { return n !== null && n >= min && n <= max; }
  function showError(msg) { err.textContent = msg || ''; err.hidden = !msg; }
  function refresh() {
    var ok = valid(amount);
    payButtons.forEach(function (b) { b.disabled = !ok; });
  }
  function selectChip(chip) {
    chips.forEach(function (c) { var on = c === chip; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      amount = Number(chip.dataset.amount);
      custom.value = '';
      selectChip(chip);
      showError('');
      refresh();
    });
  });

  custom.addEventListener('input', function () {
    selectChip(null);
    if (custom.value.trim() === '') { amount = null; showError(''); refresh(); return; }
    amount = parse(custom.value);
    showError(valid(amount) ? '' : fill(text.invalidAmount || 'Invalid amount', { min: min, max: max }));
    refresh();
  });

  payButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!valid(amount)) { showError(fill(text.invalidAmount || 'Invalid amount', { min: min, max: max })); return; }
      showError('');
      payButtons.forEach(function (b) { b.disabled = true; });
      var label = btn.innerHTML;
      btn.textContent = text.processing || '…';

      fetch('/api/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, amount: amount.toFixed(2), method: btn.dataset.method }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.body.ok) throw new Error(res.body && res.body.error);
          document.getElementById('done-text').textContent = fill(text.successText || 'Thank you!', { amount: res.body.amount, company: company });
          form.hidden = true;
          done.hidden = false;
          done.scrollIntoView({ block: 'center' });
        })
        .catch(function () { showError(text.failed || 'Payment failed'); })
        .then(function () { btn.innerHTML = label; refresh(); });
    });
  });

  document.getElementById('again').addEventListener('click', function () {
    done.hidden = true;
    form.hidden = false;
    refresh();
  });

  refresh();
})();
