// src/Tax.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4 — Tax Desk (Bruce + Tim)

import { useState, useEffect } from 'react'

const YEAR = 2026

const QUARTERS = [
  { label:'Q1', title:'January – March',     months:[0,1,2],    due:'2026-04-15', dueLabel:'April 15, 2026',     color:'#1e88e5' },
  { label:'Q2', title:'April – May',          months:[3,4],      due:'2026-06-15', dueLabel:'June 15, 2026',      color:'#8e24aa' },
  { label:'Q3', title:'June – August',        months:[5,6,7],    due:'2026-09-15', dueLabel:'September 15, 2026', color:'#e65100' },
  { label:'Q4', title:'September – December', months:[8,9,10,11],due:'2027-01-15', dueLabel:'January 15, 2027',   color:'#2e7d32' },
]

const FED_DEFAULT = 12

const STATE_RATES = {
  TIM:   { rate:0.0495, label:'Illinois',  default:4.95 },
  BRUCE: { rate:0.0530, label:'Wisconsin', default:5.30 },
}

const EXPENSE_CATEGORIES = [
  {
    label: '🔧 Truck & Equipment',
    items: [
      'Tires & Brakes','Engine Repairs','Oil Change & Filters','Belt & Seal Repairs',
      'Injector Service','Truck Washing / Detailing','APU Purchase & Maintenance',
      'Trailer Lease / Rental','Trailer Repair & Maintenance','Truck Loan Interest',
      'Truck Lease Payments','Truck Depreciation (Section 179)','Trailer Depreciation',
      'Bobtail Insurance','Non-Trucking Liability Insurance','Occupational Accident Insurance',
      'Cargo Insurance','Physical Damage Insurance','Primary Liability Insurance',
      'Reefer Unit Maintenance','Registration Fees','Truck Inspection Fees',
    ],
  },
  {
    label: '⛽ Fuel & Road Costs',
    items: [
      'DEF (Diesel Exhaust Fluid)','Fuel Additives','Reefer Fuel',
      'Bridge Tolls & Turnpike Fees','Scale Fees','Weigh Station Fees',
      'IFTA Fuel Taxes','State Fuel Taxes','Oversize / Overweight Permit Fees',
      'Port Fees & Terminal Access Fees','Lumper Fees (Unreimbursed)',
      'Comdata / EFS Transaction Fees','Overnight Parking','Parking at Shippers/Receivers',
    ],
  },
  {
    label: '🛌 Travel, Meals & Per Diem',
    items: [
      'Per Diem Meals (OTR Full Day — $80 x 80%)','Per Diem Meals (Partial Day — $60 x 80%)',
      'Hotel / Motel Stays','Short-Term Rental While on Job',
      'Truck Stop Shower Fees','Laundry While on the Road',
      'Sleeper Berth Supplies (Refrigerator, Bedding, Cleaning)',
    ],
  },
  {
    label: '📋 Licenses, Permits & Compliance',
    items: [
      'Heavy Highway Vehicle Use Tax (Form 2290)','CDL Renewal Fees',
      'Hazmat Endorsement Fees','CDL Safety Training / Seminar',
      'MC / DOT Authority Filing Fees','UCR (Unified Carrier Registration)',
      'IRP Apportioned Registration','BOC-3 Process Agent Fees',
      'FMCSA Portal Fees','DOT Medical Exam / Physical',
      'Drug & Alcohol Testing Program Fees','TWIC Card Fees',
      'TSA / Hazmat Background Check','Pre-Employment Background Check',
      'MVR (Motor Vehicle Record) Pull Fees',
    ],
  },
  {
    label: '🔩 Tools, Safety & Gear',
    items: [
      'Chains, Tarps & Straps','Tire Irons & Air Tools',
      'Fire Extinguisher','Emergency Triangles',
      'Load Binders & Wheel Chocks','Steel-Toed Boots',
      'Hi-Vis Vests, Hard Hats, Gloves, Rain Gear','Required Uniforms (Logo)',
      'ELD Device (Purchase or Lease)','Dashcam (Purchase & Subscription)',
      'GPS Unit','CB Radio','Inverter / Power Converter',
      'Jump Pack / Battery Jump Starter','Tire Pressure Monitoring System',
      'Bungee Cords, Load Locks, Dunnage','Pallet Jack','Logbooks / Paper Logs',
    ],
  },
  {
    label: '📱 Technology & Communications',
    items: [
      'Cell Phone & Data Plan (Business Use %)','Tablet or Laptop (Business Use %)',
      'Load Board Subscription (DAT, Truckstop.com)','TMS Software',
      'Trucking Accounting Software','ELD Software / Subscription',
      'Satellite Communication Service','Dispatch Software / App',
      'Fuel Optimization App','GPS Subscription Service',
      'Business Apps & Software',
    ],
  },
  {
    label: '🏢 Office & Administrative',
    items: [
      'Office Supplies (Stationery, Pens, Printer)','Postage & Shipping',
      'Tax Preparation Fees (CPA)','Bookkeeping / Accounting Fees',
      'Legal Fees (Business Related)','Factoring Fees',
      'Business Loan Interest','Business Credit Card Interest',
      'Business Bank Account Fees','Check Printing Fees',
      'Website Hosting & Domain','Online Ads & Business Cards',
      'Freight Broker Fees (Out of Pocket)','Home Office Deduction',
      'Internet Service (Business Use %)','OOIDA Membership Dues',
      'State Trucking Association Dues','Roadside Assistance Membership',
      'Industry Publications / Magazines','Conference Attendance',
    ],
  },
  {
    label: '🧾 Often Overlooked',
    items: [
      'Scale Tickets','DOT Physicals / Medical Cards',
      'Bank Wire / ACH Transfer Fees','Interest on Business Line of Credit',
      'Start-Up Costs (New Business)','Detention Time Costs',
      'SEP-IRA / Solo 401(k) Contributions','State & Local Taxes (SALT)',
      'Property Taxes on Business Property','Excise Taxes',
      'Fuel Taxes Paid via IFTA','Pre-Trip Inspection Costs',
    ],
  },
]

function getStorageKey(driver) { return 'll_v4_tax_' + driver.toLowerCase() }
function loadStorage(driver) {
  try { const s = localStorage.getItem(getStorageKey(driver)); return s ? JSON.parse(s) : {} } catch { return {} }
}
function saveStorage(driver, data) {
  try { localStorage.setItem(getStorageKey(driver), JSON.stringify(data)) } catch {}
}
function daysUntil(dateStr) {
  const due = new Date(dateStr), now = new Date()
  now.setHours(0,0,0,0); due.setHours(0,0,0,0)
  return Math.round((due - now) / (1000*60*60*24))
}
function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }
function uid()  { return Math.random().toString(36).slice(2,9) }

// ── PINNED SECTION — defined OUTSIDE Tax so React never remounts it ──
function PinnedSection({ entries, label, onAdd, onUpdate, onRemove }) {
  const total = entries.reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ fontSize:12, color:'var(--white)', fontFamily:'var(--font-head)', fontWeight:700, letterSpacing:'0.04em' }}>
          {label}
        </div>
        <button onClick={onAdd} style={{
          padding:'4px 12px', borderRadius:6, border:'1px solid var(--amber)',
          background:'transparent', color:'var(--amber)',
          fontSize:11, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
        }}>+ ADD</button>
      </div>
      {entries.length === 0 && (
        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4 }}>
          Tap + ADD to enter a {label.toLowerCase()} expense
        </div>
      )}
      {entries.map(e => (
        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ fontSize:12, color:'var(--grey)', minWidth:16 }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={e.amount}
            onChange={ev => onUpdate(e.id, ev.target.value)}
            style={{
              flex:1, background:'var(--navy3)', border:'1px solid var(--border)',
              color:'var(--white)', borderRadius:8, padding:'8px 10px',
              fontSize:14, fontFamily:'var(--font-body)',
            }}
          />
          <button onClick={() => onRemove(e.id)} style={{
            padding:'6px 10px', borderRadius:6, border:'none',
            background:'#3a1010', color:'#e53935',
            fontSize:13, fontWeight:900, cursor:'pointer',
          }}>×</button>
        </div>
      ))}
      <div style={{ fontSize:11, color:'var(--amber)', textAlign:'right', marginTop:2 }}>
        Total: {fmt(total)}
      </div>
    </div>
  )
}

export default function Tax({ loads, driver }) {

  const stateInfo   = STATE_RATES[driver] || STATE_RATES.TIM
  const driverColor = driver === 'BRUCE' ? '#1e88e5' : '#e53935'

  const [taxData, setTaxData] = useState(() => loadStorage(driver))
  const [fedRate, setFedRate] = useState(FED_DEFAULT)
  const [openQ,   setOpenQ]   = useState(null)

  const [menuOpen,   setMenuOpen]   = useState(false)
  const [openCatIdx, setOpenCatIdx] = useState(null)
  const [menuQIdx,   setMenuQIdx]   = useState(null)

  useEffect(() => {
    setTaxData(loadStorage(driver))
    setFedRate(FED_DEFAULT)
    setOpenQ(null)
    setMenuOpen(false)
    setOpenCatIdx(null)
    setMenuQIdx(null)
  }, [driver])

  useEffect(() => { saveStorage(driver, taxData) }, [taxData, driver])

  function getQKey(qIdx)  { return YEAR + '_Q' + (qIdx + 1) }
  function getQData(qIdx) { return taxData[getQKey(qIdx)] || {} }

  function updateQData(qIdx, field, value) {
    const key = getQKey(qIdx)
    setTaxData(prev => ({ ...prev, [key]: { ...(prev[key]||{}), [field]: value } }))
  }

  function togglePaid(qIdx) {
    updateQData(qIdx, 'paid', !(getQData(qIdx).paid || false))
  }

  function getPinnedEntries(qIdx, type) {
    return (getQData(qIdx))['pinned_' + type] || []
  }

  function addPinnedEntry(qIdx, type) {
    const key = getQKey(qIdx)
    const cur = getPinnedEntries(qIdx, type)
    setTaxData(prev => ({
      ...prev,
      [key]: { ...(prev[key]||{}), ['pinned_' + type]: [...cur, { id:uid(), amount:'' }] }
    }))
  }

  function updatePinnedEntry(qIdx, type, id, amount) {
    const key = getQKey(qIdx)
    const cur = getPinnedEntries(qIdx, type)
    setTaxData(prev => ({
      ...prev,
      [key]: { ...(prev[key]||{}), ['pinned_' + type]: cur.map(e => e.id===id ? {...e, amount} : e) }
    }))
  }

  function removePinnedEntry(qIdx, type, id) {
    const key = getQKey(qIdx)
    const cur = getPinnedEntries(qIdx, type)
    setTaxData(prev => ({
      ...prev,
      [key]: { ...(prev[key]||{}), ['pinned_' + type]: cur.filter(e => e.id!==id) }
    }))
  }

  function getDropEntries(qIdx) {
    return (getQData(qIdx)).drop_expenses || []
  }

  function addDropEntry(qIdx, label) {
    const key = getQKey(qIdx)
    const cur = getDropEntries(qIdx)
    setTaxData(prev => ({
      ...prev,
      [key]: { ...(prev[key]||{}), drop_expenses: [...cur, { id:uid(), label, amount:'' }] }
    }))
    setMenuOpen(false)
    setOpenCatIdx(null)
    setMenuQIdx(null)
  }

  function updateDropEntry(qIdx, id, amount) {
    const key = getQKey(qIdx)
    const cur = getDropEntries(qIdx)
    setTaxData(prev => ({
      ...prev,
      [key]: { ...(prev[key]||{}), drop_expenses: cur.map(e => e.id===id ? {...e, amount} : e) }
    }))
  }

  function removeDropEntry(qIdx, id) {
    const key = getQKey(qIdx)
    const cur = getDropEntries(qIdx)
    setTaxData(prev => ({
      ...prev,
      [key]: { ...(prev[key]||{}), drop_expenses: cur.filter(e => e.id!==id) }
    }))
  }

  function getQuarterRevenue(qMonths) {
    return loads
      .filter(l => {
        if (l.driver !== driver) return false
        if (!l.date && !l.created_at) return false
        const d = new Date(l.date || l.created_at)
        return d.getFullYear() === YEAR && qMonths.includes(d.getMonth())
      })
      .reduce((sum, l) => sum + (parseFloat(l.net_pay || l.netPay) || 0), 0)
  }

  function getExpenseTotal(qIdx) {
    const fuel   = getPinnedEntries(qIdx,'fuel').reduce((s,e)   => s + (parseFloat(e.amount)||0), 0)
    const repair = getPinnedEntries(qIdx,'repair').reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
    const drop   = getDropEntries(qIdx).reduce((s,e)            => s + (parseFloat(e.amount)||0), 0)
    return fuel + repair + drop
  }

  function calcTax(revenue, expenses) {
    const netIncome = Math.max(0, revenue - expenses)
    const fedTax    = netIncome * (fedRate / 100)
    const stateTax  = netIncome * stateInfo.rate
    const totalTax  = fedTax + stateTax
    return { netIncome, fedTax, stateTax, totalTax }
  }

  const grandTotals = QUARTERS.reduce((acc, q, i) => {
    const revenue  = getQuarterRevenue(q.months)
    const expenses = getExpenseTotal(i)
    const { totalTax } = calcTax(revenue, expenses)
    acc.revenue  += revenue
    acc.expenses += expenses
    acc.tax      += totalTax
    acc.paid     += (getQData(i)).paid ? totalTax : 0
    return acc
  }, { revenue:0, expenses:0, tax:0, paid:0 })

  return (
    <div style={{ paddingBottom:16 }}>

      {/* ── HEADER CARD ─────────────────────────────────── */}
      <div className="card" style={{ borderLeft:'3px solid '+driverColor, marginBottom:14 }}>
        <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:driverColor, marginBottom:10, letterSpacing:'0.05em' }}>
          {driver}'S TAX DESK — {YEAR}
        </div>
        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:10 }}>
          {stateInfo.label} resident — state tax {stateInfo.default}%
        </div>
        <div className="amount-row"><span className="label">Total Revenue</span><span className="value" style={{color:'var(--amber)'}}>{fmt(grandTotals.revenue)}</span></div>
        <div className="amount-row"><span className="label">Total Expenses</span><span className="value" style={{color:'var(--grey)'}}>-{fmt(grandTotals.expenses)}</span></div>
        <div className="amount-row"><span className="label">Est. Tax Owed (All Quarters)</span><span className="value" style={{color:'#e53935'}}>{fmt(grandTotals.tax)}</span></div>
        <div className="amount-row"><span className="label">Quarterly Payments Made</span><span className="value" style={{color:'var(--green)'}}>{fmt(grandTotals.paid)}</span></div>
        <div className="net-total" style={{marginTop:12}}>
          <span className="label">REMAINING BALANCE</span>
          <span className="value" style={{color: grandTotals.tax - grandTotals.paid > 0 ? '#e53935' : 'var(--green)'}}>
            {fmt(Math.max(0, grandTotals.tax - grandTotals.paid))}
          </span>
        </div>
      </div>

      {/* ── FEDERAL RATE ADJUSTER ────────────────────────── */}
      <div className="card" style={{marginBottom:14}}>
        <div className="section-title" style={{marginBottom:8}}>Federal Tax Bracket</div>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <input type="range" min={10} max={32} step={1} value={fedRate}
            onChange={e => setFedRate(Number(e.target.value))}
            style={{flex:1, accentColor:'var(--amber)'}} />
          <div style={{fontFamily:'var(--font-head)', fontWeight:900, fontSize:20, color:'var(--amber)', minWidth:48, textAlign:'right'}}>{fedRate}%</div>
        </div>
        <div style={{fontSize:11, color:'var(--grey)', marginTop:6}}>
          Federal {fedRate}% + {stateInfo.label} {stateInfo.default}% — Estimated Tax
        </div>
      </div>

      {/* ── QUARTER CARDS ────────────────────────────────── */}
      {QUARTERS.map((q, qIdx) => {
        const revenue     = getQuarterRevenue(q.months)
        const expenses    = getExpenseTotal(qIdx)
        const { netIncome, fedTax, stateTax, totalTax } = calcTax(revenue, expenses)
        const days        = daysUntil(q.due)
        const isPaid      = (getQData(qIdx)).paid || false
        const isOpen      = openQ === qIdx
        const dropEntries = getDropEntries(qIdx)
        const isMenuOpen  = menuOpen && menuQIdx === qIdx

        let countdownColor = 'var(--green)'
        let countdownText  = days + ' days away'
        if (days < 0)                { countdownColor='var(--grey)';  countdownText='Past due' }
        if (days >= 0 && days <= 14) { countdownColor='#e53935';      countdownText=days+' days — ACT NOW' }
        if (days > 14 && days <= 30) { countdownColor='var(--amber)'; countdownText=days+' days away' }

        return (
          <div key={qIdx} className="card" style={{borderLeft:'3px solid '+q.color, marginBottom:12}}>

            {/* HEADER */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', cursor:'pointer'}}
              onClick={() => setOpenQ(isOpen ? null : qIdx)}>
              <div>
                <div style={{fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:q.color, letterSpacing:'0.05em'}}>
                  {q.label} — {q.title}
                </div>
                <div style={{fontSize:11, color:'var(--grey)', marginTop:3}}>Due: {q.dueLabel}</div>
                <div style={{fontSize:11, color:countdownColor, marginTop:2, fontWeight:700}}>
                  {isPaid ? '✓ PAYMENT MADE' : countdownText}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-head)', fontSize:22, fontWeight:900, color: isPaid ? 'var(--green)' : '#e53935'}}>
                  {fmt(totalTax)}
                </div>
                <div style={{fontSize:10, color:'var(--grey)', marginTop:2}}>estimated tax</div>
                <div style={{fontSize:12, color:'var(--grey)', marginTop:4}}>{isOpen ? '▲' : '▼'}</div>
              </div>
            </div>

            {/* EXPANDED */}
            {isOpen && (
              <div style={{marginTop:14}}>

                {/* AUTO REVENUE */}
                <div style={{background:'var(--navy3)', borderRadius:8, padding:'10px 12px', marginBottom:16}}>
                  <div style={{fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6}}>AUTO-PULLED FROM LOADS</div>
                  <div className="amount-row" style={{marginBottom:0}}>
                    <span className="label">Gross Revenue</span>
                    <span className="value" style={{color:'var(--amber)'}}>{fmt(revenue)}</span>
                  </div>
                  {revenue === 0 && <div style={{fontSize:11, color:'var(--grey)', marginTop:6}}>No invoiced {driver} loads found for this quarter</div>}
                </div>

                {/* PINNED FUEL */}
                <PinnedSection
                  entries={getPinnedEntries(qIdx, 'fuel')}
                  label="Fuel"
                  onAdd={()           => addPinnedEntry(qIdx, 'fuel')}
                  onUpdate={(id, val) => updatePinnedEntry(qIdx, 'fuel', id, val)}
                  onRemove={(id)      => removePinnedEntry(qIdx, 'fuel', id)}
                />

                {/* PINNED REPAIRS */}
                <PinnedSection
                  entries={getPinnedEntries(qIdx, 'repair')}
                  label="Repairs & Maintenance"
                  onAdd={()           => addPinnedEntry(qIdx, 'repair')}
                  onUpdate={(id, val) => updatePinnedEntry(qIdx, 'repair', id, val)}
                  onRemove={(id)      => removePinnedEntry(qIdx, 'repair', id)}
                />

                <div style={{borderTop:'1px solid var(--border)', margin:'14px 0'}} />

                {/* DROP ENTRIES */}
                {dropEntries.length > 0 && (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:12, color:'var(--white)', fontFamily:'var(--font-head)', fontWeight:700, letterSpacing:'0.04em', marginBottom:8}}>
                      ADDITIONAL EXPENSES
                    </div>
                    {dropEntries.map(e => (
                      <div key={e.id} style={{marginBottom:8}}>
                        <div style={{fontSize:11, color:'var(--grey)', marginBottom:4}}>{e.label}</div>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <span style={{fontSize:12, color:'var(--grey)', minWidth:16}}>$</span>
                          <input
                            type="number" inputMode="decimal" placeholder="0.00"
                            value={e.amount}
                            onChange={ev => updateDropEntry(qIdx, e.id, ev.target.value)}
                            style={{flex:1, background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--white)', borderRadius:8, padding:'8px 10px', fontSize:14, fontFamily:'var(--font-body)'}}
                          />
                          <button onClick={() => removeDropEntry(qIdx, e.id)} style={{
                            padding:'6px 10px', borderRadius:6, border:'none',
                            background:'#3a1010', color:'#e53935',
                            fontSize:13, fontWeight:900, cursor:'pointer',
                          }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ADD EXPENSE DROPDOWN */}
                <div style={{position:'relative', marginBottom:16}}>
                  <button
                    onClick={() => {
                      if (isMenuOpen) { setMenuOpen(false); setMenuQIdx(null); setOpenCatIdx(null) }
                      else { setMenuOpen(true); setMenuQIdx(qIdx); setOpenCatIdx(null) }
                    }}
                    style={{
                      width:'100%', padding:'11px 0', borderRadius:8,
                      border:'1px solid var(--amber)', background:'transparent',
                      color:'var(--amber)', fontSize:13,
                      fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                    }}
                  >
                    + ADD EXPENSE FROM LIST {isMenuOpen ? '▲' : '▼'}
                  </button>

                  {isMenuOpen && (
                    <div style={{
                      position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
                      background:'var(--navy2)', border:'1px solid var(--border)',
                      borderRadius:10, zIndex:100,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
                      maxHeight:360, overflowY:'auto',
                    }}>
                      {EXPENSE_CATEGORIES.map((cat, catIdx) => (
                        <div key={catIdx}>
                          <div
                            onClick={() => setOpenCatIdx(openCatIdx === catIdx ? null : catIdx)}
                            style={{
                              display:'flex', justifyContent:'space-between', alignItems:'center',
                              padding:'13px 16px', cursor:'pointer',
                              background: openCatIdx === catIdx ? 'var(--navy3)' : 'transparent',
                              borderBottom:'1px solid var(--border)',
                            }}
                          >
                            <span style={{fontSize:13, color:'var(--white)', fontFamily:'var(--font-head)', fontWeight:700}}>
                              {cat.label}
                            </span>
                            <span style={{fontSize:12, color:'var(--grey)'}}>
                              {openCatIdx === catIdx ? '▲' : '▼'}
                            </span>
                          </div>
                          {openCatIdx === catIdx && (
                            <div style={{background:'var(--navy3)'}}>
                              {cat.items.map((item, itemIdx) => (
                                <div
                                  key={itemIdx}
                                  onClick={() => addDropEntry(qIdx, item)}
                                  style={{
                                    padding:'11px 24px', fontSize:13,
                                    color:'var(--grey)', fontFamily:'var(--font-body)',
                                    borderBottom:'1px solid rgba(255,255,255,0.05)',
                                    cursor:'pointer',
                                  }}
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* TAX BREAKDOWN */}
                <div style={{background:'var(--navy3)', borderRadius:8, padding:'10px 12px', marginBottom:12}}>
                  <div style={{fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:8}}>TAX BREAKDOWN</div>
                  <div className="amount-row"><span className="label">Gross Revenue</span><span className="value">{fmt(revenue)}</span></div>
                  <div className="amount-row"><span className="label">Total Expenses</span><span className="value" style={{color:'var(--grey)'}}>-{fmt(expenses)}</span></div>
                  <div className="amount-row" style={{borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4}}>
                    <span className="label">Net Taxable Income</span>
                    <span className="value" style={{color:'var(--white)'}}>{fmt(netIncome)}</span>
                  </div>
                  <div className="amount-row" style={{marginTop:8}}>
                    <span className="label">Federal ({fedRate}%)</span>
                    <span className="value" style={{color:'#e53935'}}>{fmt(fedTax)}</span>
                  </div>
                  <div className="amount-row">
                    <span className="label">{stateInfo.label} ({stateInfo.default}%)</span>
                    <span className="value" style={{color:'#e53935'}}>{fmt(stateTax)}</span>
                  </div>
                  <div className="net-total" style={{marginTop:10}}>
                    <span className="label">ESTIMATED TAX</span>
                    <span className="value" style={{color:'#e53935'}}>{fmt(totalTax)}</span>
                  </div>
                </div>

                {/* NOTES */}
                <div className="field-row" style={{marginBottom:12}}>
                  <div className="field-label">Notes</div>
                  <textarea
                    value={(getQData(qIdx)).notes || ''}
                    onChange={e => updateQData(qIdx, 'notes', e.target.value)}
                    placeholder="Payment confirmation, reference number..."
                    style={{width:'100%', minHeight:56, background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--white)', borderRadius:8, padding:'10px 12px', fontSize:14, fontFamily:'var(--font-body)', resize:'vertical'}}
                  />
                </div>

                {/* MARK PAID */}
                <button
                  className={isPaid ? 'scan-btn secondary' : 'scan-btn success'}
                  style={{width:'100%'}}
                  onClick={() => togglePaid(qIdx)}
                >
                  {isPaid ? '↩ UNMARK PAYMENT' : '✓ MARK PAYMENT MADE — ' + fmt(totalTax)}
                </button>

              </div>
            )}
          </div>
        )
      })}

      <div style={{textAlign:'center', fontSize:11, color:'var(--grey)', marginTop:8, padding:'0 16px'}}>
        Estimated Tax — Form 1040-ES | Schedule C | IRS.gov
      </div>

    </div>
  )
}
