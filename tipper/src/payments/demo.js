'use strict';
const crypto = require('node:crypto');

/**
 * DEMO provider — pretends every payment succeeds. NO REAL MONEY MOVES.
 * Used so the whole flow (QR -> tip page -> pay -> balances -> payouts) can be
 * tried end-to-end before a real payment provider is connected.
 */
module.exports = {
  name: 'demo',
  isDemo: true,
  async charge({ amount, method }) {
    return { ok: true, ref: `demo_${crypto.randomBytes(6).toString('hex')}`, amount, method };
  },
};
