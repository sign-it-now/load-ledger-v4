// src/BookkeeperProfile.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4 — Bookkeeper Profile: Billing Report + Broker Directory

import { useState } from 'react'
import BrokerDirectory from './BrokerDirectory.jsx'

// ── PERIOD HELPERS ────────────────────────────────────────────
function inPeriodByDate(dateStr, p, offset) {
  if (!dateStr) return false
  const d = new Date(dateStr), now = new Date()
  if (p === 'daily') {
    const target = new Date(now)
    target.setDate(target.getDate() + offset)
    return d.toDateString() === target.toDateString()
  }
  if (p === 'weekly') {
    const end = new Date(now)
    end.setDate(end.getDate() + offset * 7)
    end.setHours(23,59,59,999)
    const start = new Date(end)
    start.setDate(end.getDate() - 6)
    start.setHours(0,0,0,0)
    return d >= start && d <= end
  }
  if (p === 'monthly') {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear()
  }
  if (p === 'yearly') {
    return d.getFullYear() === now.getFullYear() + offset
  }
  return false
}

function getPeriodLabel(p, offset) {
  const now = new Date()
  if (p === 'daily') {
    const target = new Date(now)
    target.setDate(target.getDate() + offset)
    if (offset === 0) return 'TODAY'
    if (offset === -1) return 'YESTERDAY'
    return target.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }).toUpperCase()
  }
  if (p === 'weekly') {
    const end = new Date(now)
    end.setDate(end.getDate() + offset * 7)
    const start = new Date(end)
    start.setDate(end.getDate() - 6)
    return start.toLocaleDateString('en-US', { month:'short', day:'numeric' }).toUpperCase()
      + ' – ' + end.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }).toUpperCase()
  }
  if (p === 'monthly') {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return target.toLocaleDateString('en-US', { month:'long', year:'numeric' }).toUpperCase()
  }
  if (p === 'yearly') return String(now.getFullYear() + offset)
  return ''
}

function fmt(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}

// ── DRIVER BILLING STATS ──────────────────────────────────────
function buildDriverStats(loads, driverName, period, offset) {
  const inRange    = loads.filter(l =>
    l.driver === driverName &&
    inPeriodByDate(l.created_at || l.date, period, offset)
  )
  const billed     = inRange.filter(l => l.status === 'billed' || l.status === 'paid')
  const paid       = inRange.filter(l => l.status === 'paid')
  const totalNet   = inRange.reduce((s,l)  => s + (parseFloat(l.net_pay || l.netPay) || 0), 0)
  const totalBilled= billed.reduce((s,l)   => s + (parseFloat(l.net_pay || l.netPay) || 0), 0)
  const totalPaid  = paid.reduce((s,l)     => s + (parseFloat(l.net_pay || l.netPay) || 0), 0)
  return {
    count:       inRange.length,
    billedCount: billed.length,
    paidCount:   paid.length,
    totalNet,
    totalBilled,
    totalPaid,
    outstanding: totalBilled - totalPaid,
  }
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function BookkeeperProfile({ loads, api, showToast }) {
  const [subTab,       setSubTab]       = useState('billing')
  const [period,       setPeriod]       = useState('monthly')
  const [offset,       setOffset]       = useState(0)

  function changePeriod(p) { setPeriod(p); setOffset(0) }

  const bruceStats = buildDriverStats(loads, 'BRUCE', period, offset)
  const timStats   = buildDriverStats(loads, 'TIM',   period, offset)

  const combinedCount      = bruceStats.count      + timStats.count
  const combinedBilled     = bruceStats.totalBilled + timStats.totalBilled
  const combinedPaid       = bruceStats.totalPaid   + timStats.totalPaid
  const combinedOutstanding= bruceStats.outstanding + timStats.outstanding

  const navBtn = {
    padding:'6px 18px', borderRadius:8,
    border:'1px solid var(--border)',
    background:'var(--navy3)', color:'var(--white)',
    fontSize:22, fontFamily:'var(--font-head)',
    fontWeight:700, cursor:'pointer', lineHeight:1,
  }

  return (
    <div>
      {/* Sub-tab selector */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
        <button
          onClick={() => setSubTab('billing')}
          style={{
            padding:'13px 0', borderRadius:10, border:'none',
            fontFamily:'var(--font-head)', fontWeight:900,
            fontSize:13, letterSpacing:'0.06em', cursor:'pointer',
            background: subTab === 'billing' ? 'var(--amber)' : 'var(--navy3)',
            color:       subTab === 'billing' ? 'var(--navy)'  : 'var(--grey)',
          }}
        >
          📊 BILLING
        </button>
        <button
          onClick={() => setSubTab('brokers')}
          style={{
            padding:'13px 0', borderRadius:10, border:'none',
            fontFamily:'var(--font-head)', fontWeight:900,
            fontSize:13, letterSpacing:'0.06em', cursor:'pointer',
            background: subTab === 'brokers' ? 'var(--amber)' : 'var(--navy3)',
            color:       subTab === 'brokers' ? 'var(--navy)'  : 'var(--grey)',
          }}
        >
          🏢 BROKERS
        </button>
      </div>

      {/* ── BILLING SUB-TAB ──────────────────────────── */}
      {subTab === 'billing' && (
        <div>
          <div className="section-title">CARRIER BILLING REPORT</div>

          {/* Period type selector */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:10 }}>
            {['daily','weekly','monthly','yearly'].map(p => (
              <button key={p} onClick={() => changePeriod(p)} style={{
                padding:'9px 4px', borderRadius:8, border:'none',
                fontFamily:'var(--font-head)', fontWeight:700,
                fontSize:11, letterSpacing:'0.04em', cursor:'pointer',
                background: period === p ? 'var(--white)' : 'var(--navy3)',
                color:       period === p ? 'var(--navy)'  : 'var(--grey)',
              }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Period navigator */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <button style={navBtn} onClick={() => setOffset(o => o - 1)}>&#8249;</button>
            <div style={{ textAlign:'center', flex:1, padding:'0 8px' }}>
              <div style={{ fontFamily:'var(--font-head)', fontSize:13, color:'var(--amber)', letterSpacing:'0.08em' }}>
                {getPeriodLabel(period, offset)}
              </div>
              {offset === 0 && (
                <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', marginTop:2 }}>CURRENT</div>
              )}
            </div>
            <button
              style={{ ...navBtn, opacity: offset >= 0 ? 0.3 : 1 }}
              disabled={offset >= 0}
              onClick={() => setOffset(o => o + 1)}
            >
              &#8250;
            </button>
          </div>

          {/* Combined summary bar */}
          <div className="card" style={{ background:'var(--navy3)', borderLeft:'3px solid var(--amber)', marginBottom:12 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:13, color:'var(--amber)', letterSpacing:'0.06em', marginBottom:10 }}>
              COMBINED — {combinedCount} LOAD{combinedCount !== 1 ? 'S' : ''}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <StatBox label="BILLED"      value={fmt(combinedBilled)}      color="var(--amber)" />
              <StatBox label="PAID"        value={fmt(combinedPaid)}        color="var(--green)" />
              <StatBox label="OUTSTANDING" value={fmt(combinedOutstanding)} color="var(--red)"   />
            </div>
          </div>

          {/* Bruce card */}
          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5' }}>BRUCE</div>
              <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)' }}>
                {bruceStats.count} load{bruceStats.count !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="amount-row">
              <span className="label">Total Invoiced</span>
              <span className="value" style={{ color:'var(--white)' }}>{fmt(bruceStats.totalNet)}</span>
            </div>
            <div className="amount-row">
              <span className="label">Billed to Broker</span>
              <span className="value" style={{ color:'var(--amber)' }}>{fmt(bruceStats.totalBilled)}</span>
            </div>
            <div className="amount-row">
              <span className="label">Collected</span>
              <span className="value" style={{ color:'var(--green)' }}>{fmt(bruceStats.totalPaid)}</span>
            </div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:8 }}>
              <div className="amount-row">
                <span className="label" style={{ fontWeight:700 }}>Outstanding</span>
                <span className="value" style={{ color: bruceStats.outstanding > 0 ? 'var(--red)' : 'var(--grey)', fontSize:16, fontWeight:900 }}>
                  {fmt(bruceStats.outstanding)}
                </span>
              </div>
            </div>
          </div>

          {/* Tim card — invoice amounts only, no settlement details */}
          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935' }}>TIM</div>
              <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)' }}>
                {timStats.count} load{timStats.count !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="amount-row">
              <span className="label">Total Invoiced</span>
              <span className="value" style={{ color:'var(--white)' }}>{fmt(timStats.totalNet)}</span>
            </div>
            <div className="amount-row">
              <span className="label">Billed to Broker</span>
              <span className="value" style={{ color:'var(--amber)' }}>{fmt(timStats.totalBilled)}</span>
            </div>
            <div className="amount-row">
              <span className="label">Collected</span>
              <span className="value" style={{ color:'var(--green)' }}>{fmt(timStats.totalPaid)}</span>
            </div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:8 }}>
              <div className="amount-row">
                <span className="label" style={{ fontWeight:700 }}>Outstanding</span>
                <span className="value" style={{ color: timStats.outstanding > 0 ? 'var(--red)' : 'var(--grey)', fontSize:16, fontWeight:900 }}>
                  {fmt(timStats.outstanding)}
                </span>
              </div>
            </div>
          </div>

          {combinedCount === 0 && (
            <div style={{ textAlign:'center', padding:32, color:'var(--grey)', fontSize:13 }}>
              No loads found for this period
            </div>
          )}
        </div>
      )}

      {/* ── BROKERS SUB-TAB ──────────────────────────── */}
      {subTab === 'brokers' && (
        <BrokerDirectory api={api} showToast={showToast} role="bookkeeper" />
      )}
    </div>
  )
}

// ── SMALL STAT BOX ────────────────────────────────────────────
function StatBox({ label, value, color }) {
  return (
    <div style={{ background:'var(--navy2)', borderRadius:8, padding:'10px 8px', textAlign:'center' }}>
      <div style={{ fontFamily:'var(--font-head)', fontSize:14, fontWeight:900, color, lineHeight:1, marginBottom:4 }}>
        {value}
      </div>
      <div style={{ fontSize:9, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em' }}>
        {label}
      </div>
    </div>
  )
}
