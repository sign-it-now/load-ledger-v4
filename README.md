# Load Ledger V4 — Backup 2026-04-24

## What was working at this point
- White ledger load cards, dark header strip, load # 18px bold
- Full line-item breakdown per card with double-line above NET BILLABLE TOTAL
- D1 fetch, patchLoad, deleteLoad (no body required)
- VIEW INVOICE PDF button
- Reports: logged-in driver first, other driver condensed
- EDIT drawer with SAVE + DOWNLOAD corrected PDF
- B&W scanner pipeline LOCKED
- Invoice save order: D1 → build PDF → R2 upload → fetchLoads → doc.save() last
- Worker PATCH handles all edit fields
- Worker DELETE reads driver from D1, no body needed

## App.jsx requires this on the Loads line
driver={driver} prop must be passed to Loads component

## Rules
1. Always pull live file from GitHub before writing code
2. Never use backup files as source — reference only
3. Ask permission before writing code
4. Complete files only
5. Scanner pipeline LOCKED — never modify
6. Never rename: bols, lumpers, incidentals, comdatas
7. Test only at ettrapp.com
