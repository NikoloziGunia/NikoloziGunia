'use strict';

/**
 * Payment provider registry.
 *
 * A provider exposes:  { name, isDemo, charge({ amount, method, company }) -> { ok, ref } }
 * Add a real one (Bank of Georgia iPay, TBC, Flitt, …) as src/payments/<name>.js,
 * register it below and set PAYMENT_PROVIDER=<name>. See README -> "Real payments".
 */
const providers = {
  demo: require('./demo'),
};

function getProvider(name) {
  const p = providers[name];
  if (!p) throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Available: ${Object.keys(providers).join(', ')}`);
  return p;
}

module.exports = { getProvider };
