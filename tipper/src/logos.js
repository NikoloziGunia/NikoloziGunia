'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 400 * 1024;

function detect(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Saves a data: URL image (png/jpeg/webp only — never SVG) and returns the file name. Throws on bad input. */
function saveLogo(dataUrl, dir) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Logo must be a PNG, JPEG or WebP image.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw new Error('Logo is too large (max 400 KB).');
  const ext = detect(buf);
  if (!ext) throw new Error('Logo file is not a valid PNG, JPEG or WebP image.');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

/** Removes a previously saved logo file (name is validated, so it can never point outside `dir`). */
function removeLogo(name, dir) {
  if (!name || !/^[a-f0-9]+\.(png|jpg|webp)$/.test(name)) return;
  try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* already gone */ }
}

module.exports = { saveLogo, removeLogo };
