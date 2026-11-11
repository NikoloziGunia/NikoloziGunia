'use strict';
// All money is stored as integer tetri (1 GEL = 100 tetri) — never floats.

/** "5", "5.5", "5,50" -> 550 ; returns null if not a valid positive amount. */
function parseGel(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const tetri = Math.round(parseFloat(s) * 100);
  return tetri > 0 ? tetri : null;
}

function formatGel(tetri) {
  const n = Math.round(Number(tetri) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Fee in tetri for a gross amount and a fee in basis points (900 = 9.00%). */
function feeFor(grossTetri, feeBp) {
  return Math.round((grossTetri * feeBp) / 10000);
}

/** Validates an IBAN (ISO 13616 mod-97). Georgian IBANs are 22 chars: GE + 2 digits + 2 letters + 16 digits. */
function normalizeIban(input) {
  return String(input || '').replace(/\s+/g, '').toUpperCase();
}

function isValidIban(input) {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('GE') && !/^GE\d{2}[A-Z]{2}\d{16}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

function formatIban(input) {
  return normalizeIban(input).replace(/(.{4})/g, '$1 ').trim();
}

module.exports = { parseGel, formatGel, feeFor, normalizeIban, isValidIban, formatIban };
