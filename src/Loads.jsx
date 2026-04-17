// src/Loads.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState } from 'react'

const BRUCE_CUT = 0.20
const TIM_CUT   = 0.80

export default function Loads({ loads, setLoads, api, showToast, fetchLoads }) {

  const [view,          setView]          = useState('all')
  const [period,        setPeriod]        = useState('monthly')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [updating,      setUpdating]      = useState(null)

  // ── ACTUAL DATE RANGE LABEL PER PERIOD ──────────────────
  function getPeriodDateLabel(period) {
    const now = new Date()
    const mo  = now.toLocaleString('en-US', { month: 'long' }).toUpperCase()
    const yr  = now.getFullYear()
    const day = now.getDate()

    if (period === 'daily') {
      return mo + ' ' + day + ', ' + yr
    }
    if (period === 'weekly') {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      const startMo  = start.toLocaleString('en-US', { month: 'long' }).toUpperCase()
      const startDay = start.getDate()
      const startYr  = start.getFullYear()
      if (startYr !== yr) {
        return startMo + ' ' + startDay + ', ' + startYr + ' \u2013 ' + mo + ' ' + day + ', ' + yr
      }
      if (startMo !== mo) {
        return startMo + ' ' + startDay + ' \u2013 ' + mo + ' ' + day + ', ' + yr
      }
      return mo + ' ' + startDay + ' \u2013 ' + day + ', ' + yr
    }
    if (period === 'monthly') {
      return mo + ' ' + yr
    }
    if (period === 'yearly') {
      return String(yr)
    }
    return ''
  }

  async function patchLoad(load, localIdx, fields) {
    setUpdating(load.id || localIdx)
    try {
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          showToast('⚠️ Update failed: ' + (data.error || 'unknown'))
          setUpdating(null); return
        }
        await fetchLoads()
        if (fields.status === 'paid')   showToast('✅ Marked as paid!')
        if (fields.status === 'billed') showToast('✅ Marked as billed!')
      } else {
        setLoads(prev => prev.map((l,i) => i === localIdx ? { ...l, ...fields } : l))
        if (fields.status === 'paid')   showToast('✅ Marked as paid!')
        if (fields.status === 'billed') showToast('✅ Marked as billed!')
      }
    } catch (err) {
      showToast('⚠️ Update failed: ' + err.message)
    } finally { setUpdating(null) }
  }

  async function deleteLoad(load, localIdx) {
    setDeleting(true)
    try {
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver: load.driver }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          showToast('⚠️ Delete failed: ' + (data.error || 'unknown'))
          setDeleting(false); return
        }
        await fetchLoads()
      } else {
        setLoads(prev => prev.filter((_,i) => i !== localIdx))
      }
      setConfirmDelete(null)
      showToast('✅ Load deleted')
    } catch (err) {
      showToast('⚠️ Delete failed: ' + err.message)
    } finally { setDeleting(false) }
  }

  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  function inPeriod(dateStr, period) {
    if (!dateStr) return false
    const d = new Date(dateStr), now = new Date()
    if (period === 'daily')   return d.toDateString() === now.toDateString()
    if (period === 'weekly') {
      const start = new Date(now); start.setDate(now.getDate()-6); start.setHours(0,0,0,0)
      return d >= start
    }
    if (period === 'monthly') return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()
    if (period === 'yearly')  return d.getFullYear()===now.getFullYear()
    return false
  }

  function advanceKept(load) {
    const c = parseFloat(load.comdata_total    || load.comdataTotal    || 0)
    const l = parseFloat(load.lumper_total     || load.lumperTotal     || 0)
    const i = parseFloat(load.incidental_total || load.incidentalTotal || 0)
    return Math.max(0, c - l - i)
  }

  const bruceLoads = loads.filter(l => l.driver === 'BRUCE')
  const timLoads   = loads.filter(l => l.driver === 'TIM')

  function bruceCutForPeriod(period) {
    const inRange   = loads.filter(l => inPeriod(l.date || l.created_at, period))
    const totalBase = inRange.reduce((s,l) => s + parseFloat(l.base_pay || 0), 0)
    return { totalBase, bruceGross: totalBase * BRUCE_CUT, loadCount: inRange.length }
  }

  function driverStats(dLoads, period) {
    const inRange = dLoads.filter(l => inPeriod(l.date || l.created_at, period))
    const billed  = inRange.filter(l => l.status === 'billed' || l.status === 'paid')
    const paid    = inRange.filter(l => l.status === 'paid')
    return {
      count:           inRange.length,
      billed:          billed.reduce((s,l)  => s + (parseFloat(l.net_pay||l.netPay)||0), 0),
      paid:            paid.reduce((s,l)    => s + (parseFloat(l.net_pay||l.netPay)||0), 0),
      advanceKept:     inRange.reduce((s,l) => s + advanceKept(l), 0),
      timGross:        inRange.reduce((s,l) => s + parseFloat(l.base_pay||0) * TIM_CUT, 0),
      totalFuel:       inRange.reduce((s,l) => s + parseFloat(l.fuel||0), 0),
      comdataTotal:    inRange.reduce((s,l) => s + parseFloat(l.comdata_total||l.comdataTotal||0), 0),
      lumperTotal:     inRange.reduce((s,l) => s + parseFloat(l.lumper_total||l.lumperTotal||0), 0),
      incidentalTotal: inRange.reduce((s,l) => s + parseFloat(l.incidental_total||l.incidentalTotal||0), 0),
      baseTotal:       inRange.reduce((s,l) => s + parseFloat(l.base_pay||0), 0),
    }
  }

  const bruceTotalAllTime = bruceLoads.reduce((s,l) => s + (parseFloat(l.net_pay||l.netPay)||0), 0)
  const timTotalAllTime   = timLoads.reduce((s,l)   => s + (parseFloat(l.net_pay||l.netPay)||0), 0)
  const grandTotal        = bruceTotalAllTime + timTotalAllTime
  const brucePercent      = grandTotal > 0 ? Math.round((bruceTotalAllTime/grandTotal)*100) : 50
  const timPercent        = 100 - brucePercent
  const leader            = bruceTotalAllTime > timTotalAllTime ? 'BRUCE' :
                            timTotalAllTime > bruceTotalAllTime ? 'TIM' : 'TIE'

  function sortByDeliveryDate(arr) {
    return [...arr].sort((a, b) => {
      const da = a.delivery_date ? new Date(a.delivery_date) : null
      const db = b.delivery_date ? new Date(b.delivery_date) : null
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    })
  }

  const rawFiltered   = view==='all' ? loads : view==='BRUCE' ? bruceLoads : view==='TIM' ? timLoads : []
  const filteredLoads = sortByDeliveryDate(rawFiltered)
  const totalNet      = filteredLoads.reduce((s,l) => s + (parseFloat(l.net_pay||l.netPay)||0), 0)
  const totalPaid     = filteredLoads.filter(l=>l.status==='paid').reduce((s,l) => s + (parseFloat(l.net_pay||l.netPay)||0), 0)
  const totalUnpaid   = totalNet - totalPaid

  const bruceStats     = driverStats(bruceLoads, period)
  const timStats       = driverStats(timLoads,   period)
  const brucePeriodCut = bruceCutForPeriod(period)
  const dateLabel      = getPeriodDateLabel(period)

  if (loads.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div><h3>NO LOADS YET</h3>
        <p>Complete and invoice a load to see it here</p>
      </div>
    )
  }

  // ── LEDGER ROW STYLES ────────────────────────────────────
  const ledgerRow   = { display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'8px 0', borderBottom:'1px solid #ebebeb' }
  const ledgerLabel = { fontSize:15, color:'#444', fontWeight:400 }
  const ledgerValue = { fontSize:15, fontWeight:600, color:'#111', textAlign:'right', minWidth:90 }

  return (
    <div>

      {/* VIEW TABS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
        {['all','BRUCE','TIM','reports'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding:'9px 4px', borderRadius:8, border:'none',
            fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
            letterSpacing:'0.05em', cursor:'pointer',
            background: view===v ? 'var(--amber)' : 'var(--navy3)',
            color:       view===v ? 'var(--navy)' : 'var(--grey)',
          }}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      {/* LEADERBOARD */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:10 }}>
          LEADERBOARD - ALL TIME
          {leader !== 'TIE' && <span style={{ marginLeft:8, fontSize:12, color:'var(--amber)' }}>{leader} IS WINNING!</span>}
        </div>
        <div style={{ display:'flex', height:18, borderRadius:9, overflow:'hidden', marginBottom:10 }}>
          <div style={{ width:brucePercent+'%', background:'#1e88e5', transition:'width 0.4s' }} />
          <div style={{ width:timPercent+'%',   background:'#e53935', transition:'width 0.4s' }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #1e88e5' }}>
            <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:4 }}>BRUCE {leader==='BRUCE'?'👑':''}</div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#1e88e5' }}>{fmt(bruceTotalAllTime)}</div>
            <div style={{ fontSize:11, color:'var(--grey)', marginTop:2 }}>{bruceLoads.length} load{bruceLoads.length!==1?'s':''}</div>
          </div>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #e53935' }}>
            <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:4 }}>TIM {leader==='TIM'?'👑':''}</div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#e53935' }}>{fmt(timTotalAllTime)}</div>
            <div style={{ fontSize:11, color:'var(--grey)', marginTop:2 }}>{timLoads.length} load{timLoads.length!==1?'s':''}</div>
          </div>
        </div>
      </div>

      {/* ── REPORTS TAB ─────────────────────────────────── */}
      {view === 'reports' && (
        <div>
          {/* PERIOD SELECTOR */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
            {['daily','weekly','monthly','yearly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding:'9px 4px', borderRadius:8, border:'none',
                fontFamily:'var(--font-head)', fontWeight:700, fontSize:11,
                letterSpacing:'0.05em', cursor:'pointer',
                background: period===p ? 'var(--white)' : 'var(--navy3)',
                color:       period===p ? 'var(--navy)' : 'var(--grey)',
              }}>{p.toUpperCase()}</button>
            ))}
          </div>

          {/* ── BILLING REPORT ── */}
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:12, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:4 }}>
            BILLING REPORT
          </div>
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:14, fontWeight:900, color:'var(--white)', letterSpacing:'0.06em', marginBottom:14 }}>
            {dateLabel}
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE — BILLING</div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{bruceStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.billed-bruceStats.paid)}</span></div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM — BILLING</div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.billed-timStats.paid)}</span></div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid var(--amber)', marginBottom:20 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>COMBINED — BILLING</div>
            <div className="amount-row"><span className="label">Total Loads</span><span className="value">{bruceStats.count+timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed+timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid+timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt((bruceStats.billed+timStats.billed)-(bruceStats.paid+timStats.paid))}</span></div>
          </div>

          {/* ── DRIVER PAY REPORT ── */}
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:12, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:4 }}>
            DRIVER PAY REPORT
          </div>
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:14, fontWeight:900, color:'var(--white)', letterSpacing:'0.06em', marginBottom:6 }}>
            {dateLabel}
          </div>
          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:12, textAlign:'center' }}>
            BASE RATE SPLIT: BRUCE 20% / TIM 80%
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE — OWNER CUT</div>
            <div className="amount-row"><span className="label">All Loads This Period</span><span className="value">{brucePeriodCut.loadCount}</span></div>
            <div className="amount-row"><span className="label">All Base Rates Combined</span><span className="value">{fmt(brucePeriodCut.totalBase)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>BRUCE GROSS CUT (20%)</span>
                <span className="value" style={{color:'#1e88e5',fontSize:18,fontWeight:900}}>{fmt(brucePeriodCut.bruceGross)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:20 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM — DRIVER PAY</div>
            <div className="amount-row"><span className="label">Tim's Base Rates</span><span className="value">{fmt(timStats.baseTotal)}</span></div>
            <div className="amount-row"><span className="label">Fuel Tracked</span><span className="value" style={{color:'var(--grey)'}}>{fmt(timStats.totalFuel)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TIM GROSS PAY (80%)</span>
                <span className="value" style={{color:'var(--green)',fontSize:18,fontWeight:900}}>{fmt(timStats.timGross)}</span>
              </div>
            </div>
          </div>

          {/* ── ADVANCE KEPT REPORT ── */}
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:12, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:4 }}>
            ADVANCE KEPT REPORT
          </div>
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:14, fontWeight:900, color:'var(--white)', letterSpacing:'0.06em', marginBottom:6 }}>
            {dateLabel}
          </div>
          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:12, textAlign:'center' }}>
            COMDATA \u2212 LUMPERS \u2212 INCIDENTALS = KEPT BY DRIVER
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE — ADVANCE KEPT</div>
            <div className="amount-row"><span className="label">Comdata Issued</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.comdataTotal)}</span></div>
            <div className="amount-row"><span className="label">Lumpers Paid</span><span className="value">{fmt(bruceStats.lumperTotal)}</span></div>
            <div className="amount-row"><span className="label">Incidentals Paid</span><span className="value">{fmt(bruceStats.incidentalTotal)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>KEPT BY BRUCE</span>
                <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(bruceStats.advanceKept)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM — ADVANCE KEPT</div>
            <div className="amount-row"><span className="label">Comdata Issued</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.comdataTotal)}</span></div>
            <div className="amount-row"><span className="label">Lumpers Paid</span><span className="value">{fmt(timStats.lumperTotal)}</span></div>
            <div className="amount-row"><span className="label">Incidentals Paid</span><span className="value">{fmt(timStats.incidentalTotal)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>KEPT BY TIM</span>
                <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(timStats.advanceKept)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>COMBINED — ADVANCE KEPT</div>
            <div className="amount-row">
              <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TOTAL KEPT BY BOTH</span>
              <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(bruceStats.advanceKept+timStats.advanceKept)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── LOAD LIST ────────────────────────────────────── */}
      {view !== 'reports' && (
        <div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
            <div className="card" style={{ padding:12, textAlign:'center', marginBottom:0 }}>
              <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>TOTAL</div>
              <div style={{ fontFamily:'var(--font-head)', fontSize:17, fontWeight:900, color:'var(--amber)' }}>{fmt(totalNet)}</div>
            </div>
            <div className="card" style={{ padding:12, textAlign:'center', marginBottom:0 }}>
              <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>PAID</div>
              <div style={{ fontFamily:'var(--font-head)', fontSize:17, fontWeight:900, color:'var(--green)' }}>{fmt(totalPaid)}</div>
            </div>
            <div className="card" style={{ padding:12, textAlign:'center', marginBottom:0 }}>
              <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>OWED</div>
              <div style={{ fontFamily:'var(--font-head)', fontSize:17, fontWeight:900, color:'var(--red)' }}>{fmt(totalUnpaid)}</div>
            </div>
          </div>

          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:10, textAlign:'center' }}>
            SORTED BY DELIVERY DATE — OLDEST FIRST
          </div>

          {filteredLoads.length === 0 && (
            <div className="empty-state">
              <div className="icon">📋</div><h3>NO LOADS</h3>
              <p>No loads found for this driver yet</p>
            </div>
          )}

          {filteredLoads.map((load, idx) => {
            const realIdx    = loads.indexOf(load)
            const isPending  = confirmDelete === (load.id || realIdx)
            const isUpdating = updating === (load.id || realIdx)
            const netPayVal  = parseFloat(load.net_pay || load.netPay) || 0
            const isBruce    = load.driver === 'BRUCE'
            const invoiceUrl = load.invoice_url ? api + load.invoice_url : null

            const basePay      = parseFloat(load.base_pay         || 0)
            const lumperTotal  = parseFloat(load.lumper_total     || load.lumperTotal     || 0)
            const incTotal     = parseFloat(load.incidental_total || load.incidentalTotal || 0)
            const detention    = parseFloat(load.detention        || 0)
            const pallets      = parseFloat(load.pallets          || 0)
            const comdataTotal = parseFloat(load.comdata_total    || load.comdataTotal    || 0)
            const subtotal     = basePay + lumperTotal + incTotal + detention + pallets
            const hasAdditions = lumperTotal > 0 || incTotal > 0 || detention > 0 || pallets > 0

            return (
              <div key={load.id || idx} style={{
                marginBottom:16, borderRadius:10, overflow:'hidden',
                boxShadow:'0 1px 8px rgba(0,0,0,0.18)',
                border:'1px solid #d0d0d0', background:'#ffffff',
              }}>

                <div style={{
                  background: isBruce ? '#0d1e33' : '#1a0808',
                  padding:'10px 16px', display:'flex',
                  alignItems:'center', justifyContent:'space-between',
                }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{
                        padding:'2px 8px', borderRadius:8,
                        background: isBruce ? '#1e88e5' : '#e53935',
                        color:'#fff', fontSize:10,
                        fontFamily:'var(--font-head)', fontWeight:700,
                      }}>
                        {load.driver || '-'}
                      </div>
                      <span style={{ fontSize:18, fontFamily:'var(--font-head)', fontWeight:900, color:'#ffffff', letterSpacing:'0.03em' }}>
                        # {load.load_number || '-'}
                      </span>
                    </div>
                  </div>
                  <span style={{
                    padding:'4px 12px', borderRadius:8, fontSize:11,
                    fontFamily:'var(--font-head)', fontWeight:700,
                    background: load.status==='paid'   ? '#1b5e20' :
                                load.status==='billed' ? '#0d47a1' : '#333',
                    color:      load.status==='paid'   ? '#a5d6a7' :
                                load.status==='billed' ? '#90caf9' : '#aaa',
                  }}>
                    {(load.status || 'INVOICED').toUpperCase()}
                  </span>
                </div>

                <div style={{ padding:'16px 18px' }}>
                  <div style={{ fontSize:17, fontWeight:800, color:'#111', marginBottom:2, lineHeight:1.2 }}>
                    {load.broker_name || 'Unknown Broker'}
                  </div>
                  <div style={{ fontSize:13, color:'#555', marginBottom:12, lineHeight:1.4 }}>
                    {load.origin || '-'} \u2192 {load.destination || '-'}
                  </div>

                  <div style={{ display:'flex', gap:24, marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:10, color:'#888', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:2 }}>DELIVERY DATE</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#333' }}>{load.delivery_date || '-'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:'#888', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:2 }}>INVOICED</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#333' }}>
                        {(load.created_at || load.date) ? new Date(load.created_at || load.date).toLocaleDateString('en-US') : '-'}
                      </div>
                    </div>
                    {load.bol_count > 0 && (
                      <div>
                        <div style={{ fontSize:10, color:'#888', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:2 }}>BOLs</div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#333' }}>{load.bol_count}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop:'1px solid #ccc', marginBottom:0 }}>
                    <div style={ledgerRow}><span style={ledgerLabel}>Trucking Rate</span><span style={ledgerValue}>{fmt(basePay)}</span></div>
                    {lumperTotal > 0 && <div style={ledgerRow}><span style={ledgerLabel}>Lumper Fees</span><span style={ledgerValue}>{fmt(lumperTotal)}</span></div>}
                    {incTotal    > 0 && <div style={ledgerRow}><span style={ledgerLabel}>Incidentals</span><span style={ledgerValue}>{fmt(incTotal)}</span></div>}
                    {detention   > 0 && <div style={ledgerRow}><span style={ledgerLabel}>Detention</span><span style={ledgerValue}>{fmt(detention)}</span></div>}
                    {pallets     > 0 && <div style={ledgerRow}><span style={ledgerLabel}>Pallets</span><span style={ledgerValue}>{fmt(pallets)}</span></div>}
                    {hasAdditions && (
                      <div style={{ ...ledgerRow, borderBottom:'1px solid #bbb' }}>
                        <span style={{ ...ledgerLabel, fontWeight:700, color:'#222' }}>Subtotal</span>
                        <span style={{ ...ledgerValue, color:'#222' }}>{fmt(subtotal)}</span>
                      </div>
                    )}
                    {comdataTotal > 0 && (
                      <div style={ledgerRow}>
                        <span style={ledgerLabel}>Comdata / Express Codes</span>
                        <span style={{ ...ledgerValue, color:'#c62828' }}>({fmt(comdataTotal)})</span>
                      </div>
                    )}
                  </div>

                  <div style={{
                    display:'flex', justifyContent:'space-between', alignItems:'baseline',
                    padding:'10px 0 14px 0', borderTop:'3px double #333', marginTop:4,
                  }}>
                    <span style={{ fontSize:15, fontWeight:800, color:'#111', fontFamily:'var(--font-head)', letterSpacing:'0.03em' }}>
                      NET BILLABLE TOTAL
                    </span>
                    <span style={{ fontSize:26, fontWeight:900, color:'#111', fontFamily:'var(--font-head)' }}>
                      {fmt(netPayVal)}
                    </span>
                  </div>

                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', borderTop:'1px solid #e8e8e8', paddingTop:12 }}>
                    {load.status !== 'billed' && load.status !== 'paid' && (
                      <button className="scan-btn secondary"
                        style={{ flex:1, padding:'11px 12px', fontSize:13, opacity: isUpdating ? 0.5 : 1 }}
                        disabled={isUpdating}
                        onClick={() => patchLoad(load, realIdx, { status:'billed' })}>
                        {isUpdating ? 'SAVING...' : 'MARK BILLED'}
                      </button>
                    )}
                    {load.status !== 'paid' && (
                      <button className="scan-btn success"
                        style={{ flex:1, padding:'11px 12px', fontSize:13, opacity: isUpdating ? 0.5 : 1 }}
                        disabled={isUpdating}
                        onClick={() => patchLoad(load, realIdx, { status:'paid' })}>
                        {isUpdating ? 'SAVING...' : 'MARK PAID'}
                      </button>
                    )}
                    {load.status === 'paid' && (
                      <div style={{ fontSize:14, color:'#1a6b1a', fontFamily:'var(--font-head)', fontWeight:800, paddingTop:6 }}>
                        ✅ PAYMENT RECEIVED
                      </div>
                    )}
                    {invoiceUrl && (
                      <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                          display:'flex', alignItems:'center', justifyContent:'center',
                          padding:'11px 12px', borderRadius:8, border:'1px solid #999',
                          background:'#f5f5f5', color:'#333', fontSize:13,
                          fontFamily:'var(--font-head)', fontWeight:700, textDecoration:'none', flexShrink:0,
                        }}>
                        📄 VIEW INVOICE
                      </a>
                    )}
                    {!isPending && (
                      <button
                        style={{ padding:'11px 12px', borderRadius:8, border:'1px solid #ddd', background:'#f9f9f9', color:'#999', fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}
                        onClick={() => setConfirmDelete(load.id || realIdx)}>
                        DELETE
                      </button>
                    )}
                  </div>

                  {isPending && (
                    <div style={{ marginTop:10, background:'#fff3f3', border:'1px solid #e53935', borderRadius:8, padding:'12px 14px' }}>
                      <div style={{ fontSize:13, color:'#c62828', fontFamily:'var(--font-head)', fontWeight:700, marginBottom:10 }}>
                        DELETE THIS LOAD? THIS CANNOT BE UNDONE.
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button disabled={deleting} onClick={() => deleteLoad(load, realIdx)} style={{
                          flex:1, padding:'10px 0', borderRadius:8, border:'none',
                          background: deleting ? '#ccc' : '#e53935', color:'#fff',
                          fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                        }}>{deleting ? 'DELETING...' : 'CONFIRM DELETE'}</button>
                        <button disabled={deleting} onClick={() => setConfirmDelete(null)} style={{
                          flex:1, padding:'10px 0', borderRadius:8, border:'1px solid #ccc',
                          background:'#f5f5f5', color:'#666',
                          fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                        }}>CANCEL</button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
