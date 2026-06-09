# Load Ledger V4 — Money Math & Data Integrity Spec

**Owner:** dbappsystems.com | daddyboyapps.com
**Scope:** Financial fields and formulas only (billing, settlement split, escrow, tax).
**Status:** Living document. Phase 1 of a planned full data dictionary — the other seven
modules (credentials, assets, brokers, maintenance non-financial, etc.) get appended later
using the same four-part structure (Fields → Formulas → Invariants → Change Protocol).

**Purpose:** A single source of truth for every dollar figure in the app. Before anyone
touches a number, this document answers: what is it, where is it stored, what reads it,
what formula governs it, and what breaks if it changes.

> **How to use this doc:** When changing any financial number or relationship, read the
> relevant section top to bottom, then run the Change Protocol checklist at the end.
> Most production incidents on this app would have been a 30-second lookup here.

---

## 1. THE PEOPLE & ROLES

| Person | Role | Tax state | Notes |
|--------|------|-----------|-------|
| Bruce Edgerton | Owner / carrier | Wisconsin (5.30%) | Takes a percentage cut on Tim's loads; full rate on his own |
| Tim | Driver | Illinois (4.95%) | Receives the remainder of his loads + 100% of add-ons |
| Nicole | Bookkeeper | n/a | Sees loads, maintenance, assets, brokers. Does NOT see Tim's split with Bruce or asset payment/balance details |

---

## 2. THE BILLING CHAIN (per load)

This is the invoice math — what the broker is billed. It is the same for both drivers.

```
SUBTOTAL      = Base Pay + Lumpers + Incidentals + Detention + Pallets
NET BILLABLE  = SUBTOTAL − Comdata
```

**Order of operations is fixed.** Comdata (express-code cash advances) is the only item
ever subtracted. Everything else adds.

### Field map — billing

| Field | D1 column | Type | Default | Source | Notes |
|-------|-----------|------|---------|--------|-------|
| Base pay (trucking rate) | `base_pay` | REAL | 0 | Rate con import or manual | The imported rate confirmation amount |
| Lumpers | `lumpers` | TEXT (JSON array) | NULL → `[]` | Scan or manual | **Consumed as an array.** See Invariant I-1 |
| Lumper total | `lumper_total` | REAL | 0 | Computed at save | Numeric sum, written on POST |
| Incidentals | `incidentals` | TEXT (JSON array) | NULL → `[]` | Scan or manual | Consumed as an array. See I-1 |
| Incidental total | `incidental_total` | REAL | 0 | Computed at save | Numeric sum, written on POST |
| Detention | `detention` | REAL | 0 | Manual (often added after import) | 100% to Tim — see §3 |
| Pallets | `pallets` | REAL | 0 | Manual | 100% to Tim — see §3 |
| Comdata | `comdatas` | TEXT (JSON array) | NULL → `[]` | Scan or manual | Consumed as an array. SUBTRACTED. See I-1 |
| Comdata total | `comdata_total` | REAL | 0 | Computed at save | Numeric sum, written on POST |
| Net billable | `net_pay` | REAL | 0 | Computed | The bottom-line figure on the invoice |

> **Why detention/lumpers/incidentals are editable after import:** the rate confirmation
> imports only the base rate. Brokers frequently add detention (and lumpers/incidentals
> arise in the field) after the rate con exists. That is why the load EDIT path lets you
> add them manually and regenerate a CORRECTED invoice.

---

## 3. THE DRIVER SPLIT (Bruce's carrier cut)

Bruce is the carrier. He takes a percentage **of the rate confirmation (base pay) amount
only.**

```
Bruce's cut   = base_pay × CUT_RATE
Tim's base    = base_pay × (1 − CUT_RATE)
Tim's total   = Tim's base + Detention + Lumpers + Incidentals + Pallets   (100% of add-ons)
```

- **CUT_RATE is currently 10%** (0.10). It was 20% historically and was changed to 10%.
  It is variable and may change in future (range 10%–20%).
- **The cut applies to base pay ONLY.** Detention, lumpers, incidentals, and pallets pass
  through **100% to Tim** — Bruce takes nothing on them.
- **On Bruce's own loads:** Bruce keeps the full rate. No split.

### Worked example
Rate con base = $4,000, detention = $302, on a TIM load at 10%:
- Bruce's cut = 4,000 × 0.10 = **$400**
- Tim's base = 4,000 × 0.90 = **$3,600**
- Tim's total = 3,600 + 302 = **$3,902**
- (Broker is still billed the full NET BILLABLE of $4,302 — the split is internal.)

### ⚠️ KNOWN GAP — planned enhancement
`CUT_RATE` is currently a **hardcoded constant** in the code (changed once already by
editing constants in two files). **Planned:** replace with a sliding percentage toggle
(10/11/12/.../20%) so a rate change is a setting, not a code deploy. Until built, changing
the rate = code edit + deploy + impact pass. Treat as its own task with its own backup.

---

## 4. SETTLEMENT — "Still Owed to Tim"

This is Tim's running account with the business. **It is an all-time running balance, like a
bank account — NEVER period-reset.** Period filters (week/month/year) control only which
ACTIVITY ROWS are displayed; they do NOT recompute the balance.

```
Still Owed to Tim (all-time) =
    Σ (Tim's total earned, all his loads, all time)
  − Σ (fuel he's responsible for)
  − Σ (ACH amounts already received)
  − Σ (escrow payments he's made out of money owed)
```

Implemented as `runningBalance()` in `SettlementReport.jsx`, walking all historical loads,
fuel, ACH payments, and escrow chronologically.

### Field map — settlement

| Field | D1 source | Type | Notes |
|-------|-----------|------|-------|
| Tim's earned per load | derived from `net_pay`/`base_pay` + split | — | See §3 |
| Fuel entries | `fuel_entries` (`amount`, `fuel_type`, `entry_date`) | — | `fleet` and `pocket` both pulled |
| ACH received | `ach_received` on load | REAL | What actually hit the bank |
| Escrow payments | `escrow_payments` (`amount`, `funded_at`) | — | See §5 |

### ⚠️ INVARIANT — the check that cashed itself
Escrow and one-time events must be filtered **by event**, not re-subtracted every period.
A past bug subtracted a one-time $4,000 escrow application from *every* settlement period
forever. The all-time running-balance model is the fix: each event counts exactly once.

---

## 5. TIM'S ESCROW (signed running balance)

Escrow is **Tim-only.** It is a single account with a **signed** balance.

| Balance state | Meaning | Who owes whom |
|---------------|---------|---------------|
| **Negative** | Tim drew repair money not yet reimbursed | Tim owes Edgerton |
| **Zero** | Square / current | nobody |
| **Positive** | Edgerton is holding Tim's money | Edgerton owes Tim (cut a check if unused) |

**Funding:** Escrow payments come OUT of Tim's all-time "Still Owed to Tim" balance and are
**added to the signed escrow balance**. A payment can carry the balance THROUGH zero into
positive — it does not stop at zero.

### Worked examples (Tim's model — authoritative)
1. Owed $10,000, pays $5,000 to escrow → Tim still owed **$5,000**; escrow rises by $5,000.
2. Escrow −$5,000, Tim pays $5,000 → escrow = **$0** (current).
3. Escrow −$2,500, Tim pays $5,000 → escrow = **+$2,500**. That $2,500 is Tim's money
   Edgerton holds; if unused, Edgerton owes Tim a check for it.

### Field map — escrow

| Field | D1 source | Type | Notes |
|-------|-----------|------|-------|
| Escrow payment | `escrow_payments.amount` | REAL | Positive number = a payment Tim made in |
| Funded date | `escrow_payments.funded_at` | TEXT (ISO) | Used for activity-row display, NOT for balance math |
| Repair draws | `maintenance_ledger` where `paid_by='EDGERTON'` | — | Create the negative side of escrow |

### ⚠️ KNOWN GAP — model vs. current code
The model above allows escrow to **cross zero into a positive balance**. Build history shows
the current code may enforce a **hard cap** ("Tim cannot fund more than his balance owed")
and/or **clamp escrow at zero**. If so, examples #3's positive outcome is NOT yet
implemented. **Action item:** verify live behavior against the model; if capped, this is a
correctness fix to scope as its own task.

---

## 6. TAX DESK (Tim's quarterly estimate)

Pulls deductible expenses from live data on mount.

```
Deductible fuel     = ALL fuel_entries for driver (fleet AND pocket — both IRS-deductible)
Deductible repairs  = maintenance_ledger where paid_by = 'TIM' only
                      (EDGERTON-paid repairs are Bruce's expense, NOT Tim's deduction)
```

- Requires the `api` prop passed from `App.jsx` — **without it the Tax desk shows no data.**
  See Invariant I-3.
- State rates: Bruce WI 5.30%, Tim IL 4.95%.

### Field map — tax inputs

| Source endpoint | Fields used | Filter |
|-----------------|-------------|--------|
| `/api/fuel/{driver}` | `entry_date`, `amount`, `fuel_type` | none (both types deductible) |
| `/api/maintenance/{driver}` | `entry_date`, `amount`, `paid_by`, `category` | `paid_by === 'TIM'` only |

---

## 7. INVARIANTS — relationships that must NEVER break

| # | Invariant | Why it matters / what breaks |
|---|-----------|------------------------------|
| **I-1** | `lumpers`, `incidentals`, `comdatas` are consumed as **arrays**. A new D1 column for these must default to NULL (→ `[]`), never the string `'[]'`. Reads must go through a safe parser (`asArray()`), never raw `.reduce()`. | A `'[]'` string default + raw `.reduce()` = white-screen crash on every load. (This happened.) |
| **I-2** | "Still Owed to Tim" is an **all-time running balance**, never period-reset. Period filters are display-only. | Period-isolated math double-counts or zeroes out one-time events (the $4,000 escrow bug). |
| **I-3** | The `api` prop must be passed down from `App.jsx` to any component that reads the DB (Tax, Settlement, Loads). | Missing prop = component silently shows no data, looks "broken" with no error. |
| **I-4** | A single D1 `UPDATE`/`INSERT` is atomic — one missing column rejects the WHOLE statement. The table schema must contain every column the Worker writes. | A missing `edited` column silently rejected the entire detention save. (This happened.) |
| **I-5** | Bruce's cut applies to **base pay only**. Detention/lumpers/incidentals/pallets are 100% Tim. | Applying the cut to the full total underpays Tim on every add-on. |
| **I-6** | Detention/lumpers/incidentals are often added AFTER rate-con import via the EDIT path. The edit save must persist to D1 AND regenerate the corrected invoice — and only download the PDF on a CONFIRMED save. | Downloading the PDF before confirming the save hides write failures (looked fixed, wasn't). |
| **I-7** | Numeric `<input>` on iOS Chrome must be `type="text"` + `inputMode="decimal"`, never `type="number"`. | `type="number"` silently rejects partial decimal input on iOS Chrome. |
| **I-8** | Images are NEVER stored in D1 — always R2. Strip images before any localStorage save. | D1 row bloat / quota failures. |
| **I-9** | Comdata is the ONLY item subtracted in the billing chain. | Sign errors flip the net billable. |

---

## 8. CHANGE PROTOCOL — run before touching any number

Before editing any financial field, formula, or relationship, answer these in order:

1. **What is it?** Find the field in §2–§6. Is it stored (D1 column), computed, or input?
2. **What reads it?** List every component/formula that consumes it. (Card, settlement,
   tax, PDF, leaderboard?)
3. **What writes it?** POST? PATCH? A computed-at-save total? Both a JSON column AND a
   `_total` numeric column?
4. **Does the DB schema match?** If adding a field the Worker will write, confirm the D1
   column exists FIRST (Invariant I-4). If it's an array field, default NULL not `'[]'`
   (I-1).
5. **What's the blast radius?** Name every downstream number that moves if this changes.
   Does it touch an Invariant in §7?
6. **What's the safe default?** Numbers → 0. Array columns → NULL (→ `[]`). Text → `''`.
7. **Backup first.** Note the current live commit SHA as the restore point before any change.
8. **Confirm, then change.** Match the scope of the request — frontend-only bug = frontend
   fix; do not introduce D1 migrations or Worker changes unless required.

---

## 9. ON THE HORIZON (financial items)

- **Sliding cut-rate toggle** (§3): replace hardcoded 10% with a 10–20% selectable control.
- **Escrow positive-balance behavior** (§5): verify/repair so escrow can cross zero into
  positive per Tim's model, and surface "Edgerton owes Tim" when positive and unused.
- **Future modules** to append using this doc's structure: Credentials, Assets (payment/
  balance), Brokers (freight reports), Maintenance (non-financial fields).

---

*End of Phase 1. Append new sections below as modules are documented.*
