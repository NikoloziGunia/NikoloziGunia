'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGel, formatGel, feeFor, isValidIban, formatIban } = require('../src/money');

test('parseGel accepts sane amounts and rejects junk', () => {
  assert.equal(parseGel('5'), 500);
  assert.equal(parseGel('5.5'), 550);
  assert.equal(parseGel('5,50'), 550);
  assert.equal(parseGel(' 0.01 '), 1);
  for (const bad of ['', 'abc', '-1', '0', '1.234', '1e3', '1 000', null, undefined, '٣']) assert.equal(parseGel(bad), null, String(bad));
});

test('fee maths is integer-exact', () => {
  assert.equal(feeFor(1000, 900), 90);   // 10 GEL @ 9%  -> 0.90
  assert.equal(feeFor(100, 800), 8);
  assert.equal(feeFor(150, 1000), 15);
  assert.equal(feeFor(101, 900), 9);     // 9.09 -> rounds to 9
  assert.equal(feeFor(500, 0), 0);
  assert.equal(formatGel(1234), '12.34');
  assert.equal(formatGel(5), '0.05');
});

test('IBAN validation', () => {
  assert.equal(isValidIban('GE29 NB00 0000 0101 9049 17'), true);
  assert.equal(isValidIban('ge29nb0000000101904917'), true);
  assert.equal(isValidIban('GE28NB0000000101904917'), false); // bad check digits
  assert.equal(isValidIban('GE29NB000000010190491'), false);  // too short
  assert.equal(isValidIban('1234'), false);
  assert.equal(formatIban('ge29nb0000000101904917'), 'GE29 NB00 0000 0101 9049 17');
});
