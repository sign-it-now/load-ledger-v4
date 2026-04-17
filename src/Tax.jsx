// src/Tax.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4 — Tim's Tax Desk

import { useState, useEffect } from 'react'

const YEAR = 2026

// ── IRS 2026 QUARTERLY DUE DATES ────────────────────────────
const QUARTERS = [
  {
    label:    'Q1',
    title:    'January – March',
    months:   [0, 1, 2],
    due:      '2026-04-15',
    dueLabel: 'April 15, 2026',
    color:    '#1e88e5',
  },
  {
    label:    'Q2',
    title:    'April – May',
    months:   [3, 4],
    due:      '2026-06-15',
    dueLabel: 'June 15, 2026',
    color:    '#8e24aa',
  },
  {
    label:    'Q3',
    title:    'June – August',
    months:   [5, 6, 7],
    due:      '2026-09-15',
    dueLabel: 'September 15, 2026',
    color:    '#e65100',
  },
  {
    label:    'Q4',
    title:    'September – December',
    months:   [8, 9, 10, 11],
    due:      '2027-01-15',
    dueLabel: 'January 15, 2027',
    color:    '#2e7d32',
  },
]

// ── TAX RATES ───────────────────────────────────────────────
const SE_RATE       = 0.153   // Self-employment tax (SS + Medicare)
const IL_RATE       = 0.0495  // Illinois flat income tax
const FED_DEFAULT   = 12      // Default federal bracket %
const SE_DEDUCT     = 0.5     // IRS allows deducting half of SE tax

// ── EXPENSE CATEGORIES ──────────────────────────────────────
const EXPENSE_FIELDS = [
  { key: 'fuel',        label: 'Fuel' },
  { key: 'repairs',     label: 'Repairs & Maintenance' },
  { key: 'insurance',   label: 'Insurance' },
  { key: 'truck',       label: 'Truck Payment / Lease' },
  { key: 'meals',       label: 'Meals / Per Diem' },
  { key: 'phone',       label: 'Phone & Communication' },
  { key: 'other',       label: 'Other Expenses' },
]

const STORAGE_KEY = 'll_v4_tax_data'

function loadStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

function saveStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

function daysUntil(dateStr) {
  const due  = new Date(dateStr)
  const now  = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24))
  return diff
}

function fmt(n) {
  return '$' + (parseFloat(n) || 0).toFixed(2)
}

export default function Tax({ loads }) {

  // ── STATE ────────────────────────────────────────────────
  const [taxData,   setTaxData]   = useState(loadStorage)
  const [fedRate,   setFedRate]   = useState(FED_DEFAULT)
  const [openQ,     setOpenQ]     = useState(null)

  // ── PERSIST TAX DATA ─────────────────────────────────────
  useEffect(() => {
    saveStorage(taxData)
  }, [taxData])

  // ── HELPERS ──────────────────────────────────────────────
  function getQKey(qIdx) {
    return `${YEAR}_Q${qIdx + 1}`
  }

  function getQData(qIdx) {
    const key = getQKey(qIdx)
    return taxData[key] || {}
  }

  function updateQData(qIdx, field, value) {
    const key = getQKey(qIdx)
    setTaxData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      }
    }))
  }

  function togglePaid(qIdx) {
    const key  = getQKey(qIdx)
    const curr = (taxData[key] || {}).paid || false
    updateQData(qIdx, 'paid', !curr)
  }

  // ── REVENUE: sum Tim's invoiced loads for this quarter ───
  function getQuarterRevenue(qMonths) {
    return loads
      .filter(l => {
        if (l.driver !== 'TIM') return false
        if (!l.date)            return false
        const d = new Date(l.date)
        return (
          d.getFullYear() === YEAR &&
          qMonths.includes(d.getMonth())
        )
      })
      .reduce((sum, l) => sum + (parseFloat(l.netPay) || 0), 0)
  }

  // ── TAX MATH ─────────────────────────────────────────────
  function calcTax(revenue, expenses) {
    const netIncome    = Math.max(0, revenue - expenses)
    // IRS: only 92.35% of net SE income is subject to SE tax
    const seBase       = netIncome * 0.9235
    const seTax        = seBase * SE_RATE
    // Deduct half of SE tax before federal + IL income tax
    const adjIncome    = Math.max(0, netIncome - seTax * SE_DEDUCT)
    const fedTax       = adjIncome * (fedRate / 100)
    const ilTax        = adjIncome * IL_RATE
    const totalTax     = seTax + fedTax + ilTax
    return { netIncome, seTax, fedTax, ilTax, totalTax }
  }

  // ── GRAND TOTAL ACROSS ALL QUARTERS ──────────────────────
  const grandTotals = QUARTERS.reduce((acc, q, i) => {
    const qd       = getQData(i)
    const revenue  = getQuarterRevenue(q.months)
    const expenses = EXPENSE_FIELDS.reduce((s, f) => s + (parseFloat(qd[f.key]) || 0), 0)
    const { totalTax } = calcTax(revenue, expenses)
    acc.revenue  += revenue
    acc.expenses += expenses
    acc.tax      += totalTax
    acc.paid     += qd.paid ? totalTax : 0
    return acc
  }, { revenue: 0, expenses: 0, tax: 0, paid: 0 })

  return (
    <div style={{ paddingBottom: 16 }}>

      {/* ── HEADER CARD ─────────────────────────────────── */}
      <div className="card" style={{ borderLeft: '3px solid #e53935', marginBottom: 14 }}>
        <div style={{
          fontFamily:    'var(--font-head)',
          fontWeight:    900,
          fontSize:      15,
          color:         '#e53935',
          marginBottom:  10,
          letterSpacing: '0.05em',
        }}>
          TIM'S TAX DESK — {YEAR}
        </div>

        <div className="amount-row">
          <span className="label">Total Revenue</span>
          <span className="value" style={{ color: 'var(--amber)' }}>{fmt(grandTotals.revenue)}</span>
        </div>
        <div className="amount-row">
          <span className="label">Total Expenses</span>
          <span className="value" style={{ color: 'var(--grey)' }}>-{fmt(grandTotals.expenses)}</span>
        </div>
        <div className="amount-row">
          <span className="label">Est. Tax Owed (All Quarters)</span>
          <span className="value" style={{ color: '#e53935' }}>{fmt(grandTotals.tax)}</span>
        </div>
        <div className="amount-row">
          <span className="label">Quarterly Payments Made</span>
          <span className="value" style={{ color: 'var(--green)' }}>{fmt(grandTotals.paid)}</span>
        </div>
        <div className="net-total" style={{ marginTop: 12 }}>
          <span className="label">REMAINING BALANCE</span>
          <span className="value" style={{ color: grandTotals.tax - grandTotals.paid > 0 ? '#e53935' : 'var(--green)' }}>
            {fmt(Math.max(0, grandTotals.tax - grandTotals.paid))}
          </span>
        </div>
      </div>

      {/* ── FEDERAL RATE ADJUSTER ────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>
          Federal Tax Bracket
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            min={10}
            max={32}
            step={1}
            value={fedRate}
            onChange={e => setFedRate(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--amber)' }}
          />
          <div style={{
            fontFamily:  'var(--font-head)',
            fontWeight:  900,
            fontSize:    20,
            color:       'var(--amber)',
            minWidth:    48,
            textAlign:   'right',
          }}>
            {fedRate}%
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--grey)', marginTop: 6 }}>
          SE Tax 15.3% + Federal {fedRate}% + Illinois 4.95% — Estimated Tax
        </div>
      </div>

      {/* ── QUARTER CARDS ────────────────────────────────── */}
      {QUARTERS.map((q, qIdx) => {
        const qd       = getQData(qIdx)
        const revenue  = getQuarterRevenue(q.months)
        const expenses = EXPENSE_FIELDS.reduce((s, f) => s + (parseFloat(qd[f.key]) || 0), 0)
        const { netIncome, seTax, fedTax, ilTax, totalTax } = calcTax(revenue, expenses)
        const days     = daysUntil(q.due)
        const isPaid   = qd.paid || false
        const isOpen   = openQ === qIdx

        let countdownColor = 'var(--green)'
        let countdownText  = days + ' days away'
        if (days < 0)  { countdownColor = 'var(--grey)';  countdownText = 'Past due' }
        if (days <= 14 && days >= 0) { countdownColor = '#e53935'; countdownText = days + ' days — ACT NOW' }
        if (days <= 30 && days > 14) { countdownColor = 'var(--amber)'; countdownText = days + ' days away' }

        return (
          <div
            key={qIdx}
            className="card"
            style={{ borderLeft: '3px solid ' + q.color, marginBottom: 12 }}
          >
            {/* ── QUARTER HEADER ─────────────────────────── */}
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
              onClick={() => setOpenQ(isOpen ? null : qIdx)}
            >
              <div>
                <div style={{
                  fontFamily:    'var(--font-head)',
                  fontWeight:    900,
                  fontSize:      15,
                  color:         q.color,
                  letterSpacing: '0.05em',
                }}>
                  {q.label} — {q.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--grey)', marginTop: 3 }}>
                  Due: {q.dueLabel}
                </div>
                <div style={{ fontSize: 11, color: countdownColor, marginTop: 2, fontWeight: 700 }}>
                  {isPaid ? '✓ PAYMENT MADE' : countdownText}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: 'var(--font-head)',
                  fontSize:   22,
                  fontWeight: 900,
                  color:      isPaid ? 'var(--green)' : '#e53935',
                }}>
                  {fmt(totalTax)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--grey)', marginTop: 2 }}>
                  estimated tax
                </div>
                <div style={{ fontSize: 12, color: 'var(--grey)', marginTop: 4 }}>
                  {isOpen ? '▲' : '▼'}
                </div>
              </div>
            </div>

            {/* ── EXPANDED CONTENT ───────────────────────── */}
            {isOpen && (
              <div style={{ marginTop: 14 }}>

                {/* Revenue auto-pulled */}
                <div style={{
                  background:   'var(--navy3)',
                  borderRadius: 8,
                  padding:      '10px 12px',
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--grey)', fontFamily: 'var(--font-head)', marginBottom: 6 }}>
                    AUTO-PULLED FROM LOADS
                  </div>
                  <div className="amount-row" style={{ marginBottom: 0 }}>
                    <span className="label">Gross Revenue</span>
                    <span className="value" style={{ color: 'var(--amber)' }}>{fmt(revenue)}</span>
                  </div>
                  {revenue === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--grey)', marginTop: 6 }}>
                      No invoiced Tim loads found for this quarter
                    </div>
                  )}
                </div>

                {/* Expense inputs */}
                <div style={{ fontSize: 11, color: 'var(--grey)', fontFamily: 'var(--font-head)', marginBottom: 8 }}>
                  OPERATING EXPENSES
                </div>
                {EXPENSE_FIELDS.map(f => (
                  <div className="field-row" key={f.key} style={{ marginBottom: 8 }}>
                    <div className="field-label">{f.label} ($)</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={qd[f.key] || ''}
                      onChange={e => updateQData(qIdx, f.key, e.target.value)}
                    />
                  </div>
                ))}

                {/* Tax breakdown */}
                <div style={{
                  background:   'var(--navy3)',
                  borderRadius: 8,
                  padding:      '10px 12px',
                  marginTop:    12,
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--grey)', fontFamily: 'var(--font-head)', marginBottom: 8 }}>
                    TAX BREAKDOWN
                  </div>
                  <div className="amount-row">
                    <span className="label">Gross Revenue</span>
                    <span className="value">{fmt(revenue)}</span>
                  </div>
                  <div className="amount-row">
                    <span className="label">Total Expenses</span>
                    <span className="value" style={{ color: 'var(--grey)' }}>-{fmt(expenses)}</span>
                  </div>
                  <div className="amount-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span className="label">Net Taxable Income</span>
                    <span className="value" style={{ color: 'var(--white)' }}>{fmt(netIncome)}</span>
                  </div>
                  <div className="amount-row" style={{ marginTop: 8 }}>
                    <span className="label">SE Tax (15.3%)</span>
                    <span className="value" style={{ color: '#e53935' }}>{fmt(seTax)}</span>
                  </div>
                  <div className="amount-row">
                    <span className="label">Federal ({fedRate}%)</span>
                    <span className="value" style={{ color: '#e53935' }}>{fmt(fedTax)}</span>
                  </div>
                  <div className="amount-row">
                    <span className="label">Illinois (4.95%)</span>
                    <span className="value" style={{ color: '#e53935' }}>{fmt(ilTax)}</span>
                  </div>
                  <div className="net-total" style={{ marginTop: 10 }}>
                    <span className="label">ESTIMATED TAX</span>
                    <span className="value" style={{ color: '#e53935' }}>{fmt(totalTax)}</span>
                  </div>
                </div>

                {/* Notes field */}
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <div className="field-label">Notes</div>
                  <textarea
                    value={qd.notes || ''}
                    onChange={e => updateQData(qIdx, 'notes', e.target.value)}
                    placeholder="Payment confirmation, reference number..."
                    style={{
                      width:       '100%',
                      minHeight:   56,
                      background:  'var(--navy3)',
                      border:      '1px solid var(--border)',
                      color:       'var(--white)',
                      borderRadius: 8,
                      padding:     '10px 12px',
                      fontSize:    14,
                      fontFamily:  'var(--font-body)',
                      resize:      'vertical',
                    }}
                  />
                </div>

                {/* Mark paid button */}
                <button
                  className={isPaid ? 'scan-btn secondary' : 'scan-btn success'}
                  style={{ width: '100%' }}
                  onClick={() => togglePaid(qIdx)}
                >
                  {isPaid ? '↩ UNMARK PAYMENT' : '✓ MARK PAYMENT MADE — ' + fmt(totalTax)}
                </button>

              </div>
            )}
          </div>
        )
      })}

      {/* ── FOOTER ──────────────────────────────────────── */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--grey)', marginTop: 8, padding: '0 16px' }}>
        Estimated Tax — Form 1040-ES | Schedule C | IRS.gov
      </div>

    </div>
  )
}
