# 📊 LOAD LEDGER V4 — FORMULA & DATA FLOW REFERENCE
**Edgerton Truck & Trailer Repair (ETTR)**
**Two-Driver Operation: Bruce (Owner) & Tim (Driver)**

---

## 🗺️ THE BIG PICTURE — MONEY FLOW MAP

```
RATE CONFIRMATION (Gross Income)
        │
        ▼
  INVOICE BUILDER (Invoice Tab)
  Trucking Rate + Detention + Lumpers + Incidentals + Pallets
        │
        ├──── Subtotal
        │
        └──── minus Comdata / Express Codes
                      │
                      ▼
              NET BILLABLE TOTAL  ◄── This is what gets saved to the Load Card
                      │
                      ├──► Leaderboard (per driver running total)
                      ├──► Carrier Report (Total Billed)
                      └──► Driver Settlement (Rate Con Total)
```

---

## 📄 SECTION 1 — INVOICE TAB (Building the Invoice)

These are the input fields. When you press **DOWNLOAD INVOICE + ALL RECEIPTS**, these numbers lock in and the load is saved.

| Field | What It Is | Direction |
|---|---|---|
| Trucking Rate | The base rate from the rate confirmation | ➕ ADD |
| Lumper Fees | Cost of unloading labor paid out-of-pocket | ➕ ADD |
| Incidentals | Misc charges (tolls, scale tickets, etc.) | ➕ ADD |
| Detention / Layover | Extra time waiting at shipper or receiver | ➕ ADD |
| Pallets | Pallet charges billed to broker | ➕ ADD |
| Comdata / Express Codes | Cash advance codes already issued by broker | ➖ SUBTRACT |

### 🧮 Invoice Formulas

```
Subtotal = Trucking Rate + Lumper Fees + Incidentals + Detention + Pallets

Net Billable Total = Subtotal − Comdata / Express Codes
```

> **NET BILLABLE TOTAL** is the number that goes on the invoice PDF and lives on the Load Card.

---

## 🗂️ SECTION 2 — LOAD CARD (What Gets Saved)

After the invoice is downloaded, a Load Card is created in the **LOADS tab**. The card stores:

| Field | Source |
|---|---|
| Load Number | Entered manually (e.g., #9025846) |
| Driver | TIM or BRUCE |
| Broker / Company | Entered manually |
| Origin → Destination | Entered manually |
| Date | Entered manually |
| Trucking Rate | From Invoice |
| Detention | From Invoice |
| Lumpers | From Invoice |
| Incidentals | From Invoice |
| Pallets | From Invoice |
| Comdata Codes | From Invoice |
| **Net Billable Total** | **Calculated on Invoice** |
| BOL Count | Number of Bills of Lading scanned |
| Status | BILLED → PAID |

---

## 🏆 SECTION 3 — LEADERBOARD (Loads Tab Top)

The leaderboard pulls from all saved Load Cards.

```
Driver Total = SUM of all Net Billable Totals for that driver

Winner = Driver with the highest total Net Billable amount (ALL TIME)
```

| Display | Formula |
|---|---|
| Bruce $X.XX | Sum of Net Billable Total — Bruce's loads |
| Tim $X.XX | Sum of Net Billable Total — Tim's loads |
| X loads | Count of load cards for that driver |

---

## 📊 SECTION 4 — REPORTS TAB (Carrier + Settlement Views)

### CARRIER Report (Billing View)

Filters by: DAILY / WEEKLY / MONTHLY / YEARLY + year navigation

```
Loads Invoiced  = COUNT of load cards in period
Total Billed    = SUM of Net Billable Totals in period
Total Paid      = SUM of Net Billable Totals where status = PAID
Outstanding     = Total Billed − Total Paid
```

Shown separately per driver and as a **COMBINED** total.

---

### 💵 SETTLEMENT Report (Driver Pay Reconciliation)

This is the full driver pay breakdown. Think of it as the paycheck math.

#### TIM'S SETTLEMENT FORMULA

```
Rate Con Total         = SUM of all Trucking Rates (raw rate con values, not Net Billable)

Gross Pay              = Rate Con Total × 80%
  (Tim keeps 80% of the base rate con amount)

Detention / Layover    = SUM of all Detention amounts  ← 100% goes to Tim, no split
  (shown as +$X.XX)

Advance Kept           = SUM of all Comdata / Express Codes issued
  (money already given to Tim upfront — reduces what's owed)

Lumper Reimbursement   = SUM of Lumper Fees where NO comdata was issued
  (if lumper was paid out of pocket and not reimbursed via comdata)
  (shown as +$X.XX with note "no comdata issued")

Fleet Card Fuel        = SUM of all fuel entries tagged to Tim's fuel card
  (this is a DEDUCTION — fuel charged to the fleet card reduces Tim's settlement)

ACH Disbursements      = SUM of all ACH received amounts already paid out
  (money already sent to Tim via ACH — reduces what's still owed)
  (shown as −$X.XX with note "already paid out")

─────────────────────────────────────────────────────────────────
Still Owed to Tim  =  Gross Pay
                    + Detention
                    + Lumper Reimbursement
                    − Advance Kept
                    − Fleet Card Fuel
                    − ACH Disbursements Received
─────────────────────────────────────────────────────────────────
```

#### Additional Settlement Line Items

```
ACH Broker Fees (expense) = SUM of all ACH fee deductions
  (the difference between invoice total and what actually hit the bank)
  (tracked as a business expense, NOT deducted from Tim's pay directly)
```

---

#### BRUCE'S SETTLEMENT FORMULA

```
Bruce gets 20% from ALL loads — both his own loads AND Tim's loads

Bruce Cut from Tim's loads  = Tim's Rate Con Total × 20%
Bruce Cut from Bruce's loads = Bruce's Rate Con Total × 20%

Bruce Total                 = (Tim Rate Con Total + Bruce Rate Con Total) × 20%
```

> ⚠️ **Key Rule:** Bruce's 20% comes off the **Rate Con Total** (base trucking rate), NOT off the Net Billable Total. Detention, lumpers, etc. do not factor into the 20% cut.

---

## ⚡ SECTION 5 — ACH PAYMENT FLOW

When Tim clicks **ACH** on a load card, this is what happens:

```
Step 1: Invoice Total displayed  =  Net Billable Total of the load

Step 2: Tim enters the ACTUAL amount that hit the bank
         (broker deducted their fee before sending)

Step 3: ACH Fee (Broker Fee)  =  Invoice Total − Amount Actually Received
         Example: $4,240.00 − $4,112.80 = $127.20 fee

Step 4: Load status changes to PAID
Step 5: ACH amount recorded as a DISBURSEMENT in the settlement
Step 6: ACH broker fee recorded as an EXPENSE in the settlement
```

### After CONFIRM PAID — ACH:
| What Updates | Where |
|---|---|
| Load card header shows ⚡ ACH badge | Load Card |
| Status pill changes from BILLED → PAID | Load Card |
| "ACH PAID — Received: $X Fee: $X" shows below line items | Load Card |
| Amount added to ACH Disbursements Received | Tim's Settlement |
| Fee added to ACH Broker Fees (expense) | Tim's Settlement |
| Total Paid increases | Carrier Report |
| Outstanding decreases | Carrier Report |

---

## 🔘 SECTION 6 — BUTTON REFERENCE (What Each Button Does to the Numbers)

| Button | Where | What It Does to the Data |
|---|---|---|
| **DOWNLOAD INVOICE + ALL RECEIPTS** | Invoice Tab | Creates Load Card, saves Net Billable Total, uploads PDF to R2, saves to D1 database |
| **MARK PAID** | Load Card | Changes load status to PAID, adds full Net Billable Total to Total Paid |
| **ACH** | Load Card | Opens ACH confirmation panel — records actual received amount and broker fee |
| **CONFIRM PAID — ACH** | ACH Panel | Locks in actual amount, calculates fee, marks load PAID, updates settlement |
| **EDIT** | Load Card | Opens load for editing — recalculates all formulas when saved |
| **DELETE** | Load Card | Removes load card permanently — all related totals recalculate |
| **TIM SETTLEMENT** | Reports Tab | Displays full Tim pay reconciliation (see Section 4) |
| **BRUCE SETTLEMENT** | Reports Tab | Displays full Bruce pay reconciliation |
| **TIM — EXPORT EXCEL** | Reports Tab | Downloads settlement data as Excel spreadsheet |
| **BRUCE — EXPORT EXCEL** | Reports Tab | Downloads settlement data as Excel spreadsheet |
| **ADD FUEL ENTRY** | Reports Tab | Adds a fuel charge — goes into Fleet Card Fuel deduction in settlement |
| **VIEW INVOICE PDF** | Load Card | Opens the saved PDF from R2 cloud storage |
| **+ NEW** | Top of Loads Tab | Opens Invoice Tab to start a new load |

---

## ⛽ SECTION 7 — FUEL ENTRY FLOW

```
Fuel Entry Input:
  - Date
  - Amount ($)
  - Type: FLEET (fleet card) or OTHER

Fleet Card Fuel entries → feed directly into Tim's Settlement
  Fleet Card Fuel (settlement line) = SUM of all FLEET fuel entries
  (shown in red as a deduction)
```

---

## 🔗 SECTION 8 — HOW ALL FILES CONNECT

| File | Role | Talks To |
|---|---|---|
| `src/Invoice.jsx` | Invoice builder, PDF generation, BOL scanner | Sends completed load to App.jsx, uploads to R2, saves to D1 |
| `src/Loads.jsx` | Displays load cards, leaderboard, settlement, reports | Reads from App.jsx state, updates load status |
| `src/App.jsx` | Master state manager, auth, routing | Holds all load data, passes to Invoice.jsx and Loads.jsx |
| **Cloudflare Worker** | Backend API | Receives POST /api/loads, saves to D1, handles R2 uploads |
| **D1 Database** | Persistent storage | Stores all load records permanently |
| **R2 Storage** | File storage | Stores invoice PDFs, BOL images, receipts, credential docs |
| **localStorage** `ll_v4_loads` | Local cache | Mirrors load data on device for offline speed |

---

## 📐 SECTION 9 — QUICK FORMULA CHEAT SHEET

```
Net Billable Total     = Trucking Rate + Detention + Lumpers + Incidentals + Pallets − Comdata

Tim Gross Pay          = Rate Con Total × 0.80

Bruce Cut              = (All Rate Con Totals) × 0.20

Still Owed to Tim      = Gross Pay + Detention + Lumpers − Advances − Fuel − ACH Paid

ACH Broker Fee         = Invoice Total − Amount Received by Bank

Outstanding (Carrier)  = Total Billed − Total Paid

Leaderboard Total      = SUM of Net Billable Totals per driver
```

---

## ⚠️ IMPORTANT RULES (Business Logic)

1. **Detention is always 100% Tim's** — it never goes into the 80/20 split
2. **Bruce's 20% is calculated from Rate Con Total, NOT Net Billable Total**
3. **Comdata codes reduce the invoice** (already-issued cash advances)
4. **Lumper reimbursement only applies when NO comdata was issued** for that lumper
5. **ACH fees are an expense record only** — they don't come out of Tim's gross pay calculation
6. **Fleet Card Fuel deducts from Tim's settlement** — it's fuel charged to the business card that Tim used
7. **Load status flows one direction:** BILLED → PAID (no reverse without edit/delete)

---

*Last updated: April 2026 | Load Ledger V4 | ettrapp.com*
