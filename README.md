# ProjectPro — Offline-First Project Estimating & Job Management PWA

ProjectPro is a complete, production-ready **Progressive Web App** for homeowners, DIY users,
tradespeople, contractors and service businesses. It runs **100% offline** — no servers, no
accounts, no paid APIs — and installs natively on Android, iOS, Windows, macOS and Linux.

All data lives on your device in **IndexedDB**, protected with **AES-256-GCM encrypted fields**,
an optional **PIN/biometric lock**, and **automatic encrypted backups**.

---

## Feature map

| Area | What's included |
|---|---|
| **Projects** | Unlimited projects with status (quoted → approved → active → completed), budget, progress, site notes, photos/files |
| **Templates** | 18 pre-filled templates: building & renovation, painting, roofing, flooring, tiling, concreting, fencing, decking, landscaping, lawn mowing, garden clean-ups, tree work, pressure washing, handyman, cleaning, pool maintenance, moving, plus fully custom |
| **Estimating** | Materials, labour, equipment, travel, fuel, delivery, waste/disposal, fees — with per-line **markup** (cost vs sell), per-line tax, discounts on documents |
| **Documents** | Quotes, invoices, receipts with automatic numbering (`Q-2026-0001`), logo, tax, payment details, T&Cs, signatures; **quote → invoice → receipt** conversion; partial payments |
| **Customers / Suppliers** | Unlimited records; contact secrets encrypted at rest; CSV import/export |
| **Materials** | Library with multi-supplier price lists, default prices, waste %, default markup %; **cheapest-supplier comparison** and auto **shopping lists** (PDF + CSV) per project |
| **Measurement sketch** | Draw rooms/gardens/fence lines/slabs on a scaled grid — auto **area, perimeter, length, volume** and material quantities (with waste), pushes straight into the project estimate |
| **Units & currency** | Metric ↔ Imperial display, 32 currencies with locale formatting |
| **Budget & profit** | Per-project budget tracking vs actual expenses; dashboard and reports for revenue, expenses, profit, margins, outstanding invoices |
| **Reminders** | Automatic follow-up reminders for quotes/invoices due, plus custom reminders; in-app + browser notifications |
| **PWA** | Web manifest, service worker (pre-cached, offline-first), installable, maskable icons, iOS splash screens, app shortcuts, dark/light Material Design theme |
| **Data safety** | AES-GCM encryption of sensitive fields & attachments, PIN (PBKDF2 250k) / WebAuthn biometric lock, automatic rotating backups, JSON export/restore, CSV everywhere |

## Quick start (2 minutes)

Any static file server works — PWA install requires `http(s)` (or `localhost`):

```bash
cd projectpro
# pick one:
python3 -m http.server 8080       # Python
npx serve .                       # Node
php -S localhost:8080             # PHP
```

Open **http://localhost:8080** — the app loads with guided sample data. First-run seeds
demo customers, suppliers, materials, two projects with a live quote/invoice/receipt so every
feature is immediately explorable. Clear it any time: **Settings → Data → Erase everything**.

### Deploying for real
Upload the `projectpro/` folder to any static host (GitHub Pages, Netlify, Cloudflare Pages,
IIS, nginx, S3+CDN, your own server). No build step, no environment variables, no backend.

## Installing on each platform

| Platform | How |
|---|---|
| **Android (Chrome/Edge/Samsung)** | Open the app → menu ⋮ → *Install app* / *Add to Home screen*. Installs with icon + splash. |
| **iOS / iPadOS (Safari)** | Share button → *Add to Home Screen*. Runs fullscreen with the bundled Apple touch icon and splash screens (`apple-touch-startup-image`). |
| **Windows (Chrome/Edge)** | Click the install icon in the address bar, or menu → *Apps → Install ProjectPro*. |
| **macOS (Safari 17+/Chrome)** | Safari: File → *Add to Dock*. Chrome: address-bar install icon. |
| **Linux (Chrome/Edge/Firefox)** | Chrome/Edge address-bar install icon. Creates a desktop entry. |

App shortcuts (long-press the icon): **New Quote**, **New Project**, **Dashboard**.

## Architecture

```
projectpro/
├── index.html               Shell: meta, manifest, iOS tags, boot splash, script order
├── manifest.webmanifest     PWA manifest (icons, shortcuts, display modes)
├── sw.js                    Service worker — precache + cache-first (network-first for HTML)
├── css/styles.css           Material Design 3 tokens, dark/light themes, responsive layout
├── assets/                  Icons (any/maskable/apple-touch) + 8 iOS splash sizes + icon source
├── js/
│   ├── utils.js             DOM builder, money/date formatting, CSV, units engine, event bus
│   ├── icons.js             Inline SVG icon set (no icon-font dependency)
│   ├── crypto.js            AES-256-GCM key mgmt, PBKDF2 PIN wrapping, WebAuthn biometric gate
│   ├── db.js                IndexedDB layer: CRUD, transparent field encryption, export/import,
│   │                        rotating auto-backups, attachments store
│   ├── pdf.js               Dependency-free PDF 1.4 writer (fonts, vector, JPEG, tables,
│   │                        paging) + branded renderers for all seven document types
│   ├── templates.js         Reference data: 18 project templates, currencies, categories
│   ├── calc.js              All maths: estimates, doc totals/tax, shopping lists, geometry,
│   │                        business statistics
│   ├── ui.js                Dialogs, toasts, forms, charts (SVG), lock screen, signature pad,
│   │                        global search, attachment grids
│   ├── app.js               Boot sequence, hash router, top bar / nav rail / bottom nav,
│   │                        theme switching, notifications, install prompt, sample-data seed
│   └── views/               dashboard · projects · people (customers/suppliers) · materials ·
│                            documents · sketch · reports · settings
├── test/smoke.js            Node smoke tests (calc engine + PDF validity)
└── tools/make_assets.py     Regenerates all icons/splashes from assets/icon-src.png
```

**Design principles**
- **Zero dependencies** — everything (PDF engine, charts, icons) is included, so the app works
  offline forever and can't break from a CDN or registry outage.
- **View modules** are pure functions `render(container, params, query)` — no framework needed.
- **Data layer** is the only place IndexedDB is touched; entity views use the same CRUD verbs.
- **Event bus** (`PP.util.on/emit`) keeps backups, search and settings reactive without coupling.

## Security model

- A single AES-256-GCM **master key** encrypts: customer/supplier phone, email, address;
  all file/photo attachments; automatic backup snapshots.
- **PIN off** → key stored locally (protects exported files & casual access).
- **PIN on** → key wrapped with PBKDF2-SHA-256 (250,000 iterations) from your PIN and exists
  only in memory while the app is unlocked.
- **Biometric** → WebAuthn platform-authenticator gate releases the unlocked key (device-level
  security); falls back to PIN anywhere.
- Practical note: a PWA cannot defend against someone with your unlocked device *and* your PIN.

## Documents & numbering

- Automatic numbers per type: `<PREFIX>-<YEAR>-<NNNN>` — prefixes & next numbers editable in
  **Settings → Document setup** (e.g. switch to `EST-2026-0001`, set invoice counter to 1200).
- Quotes track *draft/sent/accepted/declined/converted*; invoices track *draft/sent/partial/
  paid/overdue* with partial-payment history; receipts record method + date.
- Quote **Accepted → Convert to invoice**; invoice **Paid → Convert to receipt** — chain links
  are shown both ways.
- Every PDF includes your logo, ABN/reg number, contact block, payment details (invoices),
  per-line tax, discount, and terms; quotes offer a signature line or captured e-signature.

## Testing

```bash
# 1. Static checks
for f in js/*.js js/views/*.js sw.js; do node --check "$f"; done

# 2. Engine smoke tests (math + PDF validity, no browser needed)
node test/smoke.js          # writes test/out-test.pdf — open it to eyeball the layout

# 3. Full PWA test
python3 -m http.server 8080 &
# Chrome DevTools → Application →
#   • Manifest: icons + shortcuts detected, no errors
#   • Service Workers: "projectpro-*" active
#   • Toggle "Offline", reload — app and all views still work
# Lighthouse → PWA: installable, all checks green
```

Manual acceptance walkthrough (≈10 min):
1. Dashboard shows sample KPIs; toggle dark/light theme in the top bar.
2. Open the Kapoor fence project → **Estimate** (markup math), **Shopping list** (cheapest
   supplier per item — Mitre 10 vs Bunnings), **Summary PDF**.
3. Open quote `Q-XXXX-0001` → **PDF** → mark **Accepted** → **Convert to invoice**.
4. Record full payment → auto-converts to receipt → **PDF**.
5. **Sketch** → polygon a 4×3 m room (scale 0.5) → area 12 m², set depth 100 mm → volume
   1.2 m³ → pick "Interior wall paint" → *Add to project estimate*.
6. **Settings → Data → Backup now**, then *Export JSON*; reload and restore it.
7. Enable **PIN lock** in Settings → Security, reload → lock screen → unlock (and register
   biometrics where available).

## Notes & limits

- PDF currency: symbols renderable in PDF base fonts (€ £ ¥ $ ¢) are embedded; other currencies
  print as code prefix (`INR 1,234.00`). On-screen always uses full locale formatting.
- Reminders fire while the app is open (install it and they run at every launch); service-worker
  scheduled push requires a server, which this app deliberately avoids.
- Large photo attachments are stored encrypted in IndexedDB — check
  **Settings → Data** for live storage usage.
