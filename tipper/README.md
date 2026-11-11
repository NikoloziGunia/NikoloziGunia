# Tipper

Card tips for small cafés and shops. A guest scans a QR code (or taps an NFC tag), picks an amount and pays with Apple Pay / Google Pay. At the end of the day each business is paid its tips, minus your fee.

Two separate web servers share one database:

| | Public site | Admin panel |
|---|---|---|
| What | Landing page, guest tip pages (`/t/<id>`), tip API | Companies, fee %, QR codes, payouts |
| Who | Everyone | Only you (login) |
| Default | `http://localhost:3000` | `http://127.0.0.1:3001` (localhost only) |
| Command | `npm run start:public` | `npm run start:admin` |

The public server contains **no admin routes at all** (there is a test for it), so the admin panel cannot be reached through the public site.

## Run it locally

Requires Node 22.13+. No build step, two dependencies (`express`, `qrcode`), SQLite is built into Node.

```bash
cd tipper
npm install
cp .env.example .env          # optional, defaults work locally
npm run create-admin          # choose your username + password (min 10 chars)
npm run seed                  # optional: FAKE demo companies and tips
npm start                     # runs both servers for development
```

Open http://localhost:3000 (landing page) and http://localhost:3001 (admin).

```bash
npm test                      # money maths, security and the whole flow
```

## What the admin panel does

- **Companies table.** First row is *you* (name, location, your bank account, default fee). Below it every company: name, location, bank account (IBAN, validated), fee, today's tips, amount owed.
- **Fee %.** Click *Edit mine*. Set the default (you mentioned 8–10%) and optionally a custom % per company. A fee change only affects future tips; each tip stores the fee it was charged.
- **Add company** creates its own panel automatically: a unique, unguessable QR code and tip link, PNG/SVG downloads, a printable table card (A6), and NFC instructions. Write the same link to an NFC tag (NTAG213/215, "URL" record).
- **Payouts.** Shows what you owe each company since its last payout (tips minus your fee), a bank-transfer CSV, and a *Mark as paid* button that records the payout once you have sent the money.
- Deactivating a company turns its QR code off.

## Guest tip page

`/t/<id>`: "Hi, have a good day! Thank you for your tip", the company name, amount buttons (1 / 2 / 5 / 10 ₾ or custom), Apple Pay and Google Pay buttons, and **Tipper** in the bottom-left corner. Limits are `MIN_TIP` / `MAX_TIP` in `.env`.

## Georgian text

All text guests see lives in `locales/en.json`. When you have the Georgian text, put it in `locales/ka.json` with the **same structure**, then set `DEFAULT_LANG=ka`. Missing keys fall back to English, and the EN/KA switcher appears automatically once `ka.json` has content. The printed table card also uses this file (`print.*`). The page loads Noto Sans Georgian for Georgian text. The admin panel itself is English-only.

The English copy is a draft I wrote from your description. Please review it, especially the claims in "About us" and "Why Tipper".

## ⚠️ Real payments are not connected yet

`PAYMENT_PROVIDER=demo` **simulates** payments: nothing is charged and no money moves. The Apple Pay / Google Pay buttons are styled placeholders. A "Demo mode" banner shows on the tip pages and in the admin while this is on.

To take real money you need a payment provider that supports Apple Pay and Google Pay for Georgian merchants (for example Bank of Georgia iPay, TBC, or Flitt; check which one your bank agreement allows). Then:

1. Add `src/payments/<provider>.js` exposing `{ name, isDemo: false, charge({ amount, method, company }) → { ok, ref } }` and register it in `src/payments/index.js`. The server records the tip only after `charge` succeeds.
2. Replace the placeholder buttons in `src/views/public.js` / `public/js/tip.js` with the provider's official Apple Pay / Google Pay buttons and SDK (Apple and Google require their official buttons). Apple Pay also needs domain verification on your real domain.
3. Allow the SDK's hosts in the Content-Security-Policy (`extraCsp` in `src/public-server.js`).
4. Prefer the provider's **server-side confirmation / webhook** before marking a tip paid, so a client can't fake a payment.

Also decide who pays the provider's processing fee. It is not modelled here: the "fee" in this app is only *your* share.

Payouts are recorded manually (you transfer from your bank, then press *Mark as paid*). Fully automatic daily transfers would need your bank's payout API.

## Hosting (we'll do this together)

- Set `PUBLIC_URL` to your real domain **before printing QR codes**. It is baked into every QR code.
- Run the **public** server where everyone can reach it (HTTPS in front, e.g. a reverse proxy or a platform like Render/Fly/a VPS), with `NODE_ENV=production` and `TRUST_PROXY=1`.
- Run the **admin** server as a separate service, ideally on its own subdomain (`admin.yourdomain`) or only reachable by you (VPN, SSH tunnel, or `ADMIN_ALLOW_IPS=1.2.3.4`). It must use HTTPS (cookies are `Secure` in production). Both servers must use the **same `DATA_DIR`**; it holds the SQLite database and uploaded logos, so put it on a persistent disk and back it up.
- Not suitable for platforms with ephemeral disks unless you mount a volume.

## Security notes

- Admin login: scrypt password hashing, random server-side sessions (12 h), `HttpOnly` + `SameSite=Strict` cookie, login rate limiting, CSRF header check on every write.
- Strict Content-Security-Policy (no inline scripts or styles), all dynamic text HTML-escaped, logo uploads limited to real PNG/JPEG/WebP (no SVG).
- Tip links use random 64-bit IDs so they can't be guessed. The landing page never exposes bank details or tip links.
- Money is stored as integer tetri, never floats.
