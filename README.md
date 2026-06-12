# Load Ledger V4

Trucking operations PWA for Edgerton Truck & Trailer Repair.
Live at **https://ettrapp.com** — the only URL. Never test at .pages.dev.

Last refreshed: 2026-06-12

---

## Stack
| Layer | Service |
|---|---|
| Frontend | React + Vite → Cloudflare Pages |
| API | Cloudflare Worker (`load-ledger-v4`) |
| Database | Cloudflare D1 (`load-ledger-db`) |
| Files | Cloudflare R2 (`load-ledger-files`) — PIN-gated serving |
| OCR | Anthropic Claude API (Scanner V2 key, `anthropic-beta: pdfs-2024-09-25` for PDFs) |
| Email | ZeptoMail (Zoho) via `ZEPTO_API_KEY` Worker secret |
| PDF | jsPDF + PDF.js 2.16.105 (CDN script tag only — never npm-bundled) |

## Two deploy pipelines
1. **Worker** — GitHub Actions on push (`.github/workflows/deploy-worker.yml`)
2. **Pages frontend** — Cloudflare's direct GitHub integration. Failures are
   invisible in Actions; diagnose at dash.cloudflare.com → Workers & Pages →
   project → Deployments.

## Modules
- **Loads** — Rate Con scanner (AI OCR auto-fill), Invoice builder with ordered
  PDF assembly (BOLs, lumpers, comdatas), white ledger load cards, ACH payment
  handling, edit drawer with corrected-PDF re-download, broker auto-upsert
- **Profile** — Settlements → Tax → Credentials
  - **Settlement Report** — per-driver statements, fuel entry add/edit/delete,
    all-time running balance, FIFO source-of-funds audit trail (display-only)
  - **Tax Desk** — quarterly estimates on IRS 1040-ES periods, multi-state
    (WI 5.30% / IL 4.95%), pulls live fuel + maintenance from D1
  - **Credentials** — expiry tracking, alert overlays with snooze, R2 uploads
- **Repairs / Maintenance** — OCR receipt scanning, paid-by tracking, category
  filters, asset linking, financed-repair ledger
- **Assets** — truck/trailer tracking, payment history, balance owed,
  linked repair totals
- **Brokers** — master file auto-built from rate cons, contact cards,
  freight reports by period
- **Auth** — PIN login, role-based views (driver / owner / bookkeeper)

## Accounting model (MONEY_MATH_SPEC.md is authoritative)
- Billing: Base + Lumpers + Incidentals + Detention + Pallets = SUBTOTAL
  − Comdata = NET BILLABLE TOTAL
- **Accrual basis** — revenue posts by DELIVERY DATE; repairs are expenses at
  `entry_date`; repayments on financed repairs are debt service, never deductions
- "Still Owed" is an all-time running balance — period filters change which
  activity rows display, never the balance math
- Tax quarters = IRS 1040-ES periods (Q2 = Apr–May due Jun 15,
  Q3 = Jun–Aug due Sep 15), not calendar quarters

## Invoice save order (locked)
D1 save → build PDF → R2 upload → fetchLoads → `doc.save()` last
(iOS WebKit kills the POST if the Blob download fires first)

## iOS rules
- Inputs: `type="text"` + `inputMode="decimal"` — never `type="number"`
- Dates: append `T12:00:00` to YYYY-MM-DD before `new Date()`
- Scanner output via `FileReader.readAsDataURL`, never `createObjectURL`

## Standing rules
1. Always pull the live file from GitHub before writing code
2. Backup committed to `backups/` (BACKUP_filename_YYYY-MM-DD) before every change
3. Ask permission before writing code — wait for explicit go
4. Complete file replacements only — no surgical fixes
5. B&W scanner pipeline LOCKED — never modify
6. Never rename: `bols`, `lumpers`, `incidentals`, `comdatas` — or any API
   route or D1 field name
7. Strip images before any localStorage write; images live in R2, never D1
8. Test only at ettrapp.com

## Connector
2026-06-12 — GitHub MCP write access verified; Claude commits directly
(backup first, then live file).
