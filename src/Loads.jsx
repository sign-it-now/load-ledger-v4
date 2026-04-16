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
  const [fuelInputs,    setFuelInputs]    = useState({})

  // ── PATCH STATUS OR FUEL IN D1 ───────────────────────────
  async function patchLoad(load, localIdx, fields) {
    setUpdating(load.id || localIdx)
    try {
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(fields),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          showToast('⚠️ Update failed: ' + (data.error || 'unknown'))
          setUpdating(null)
          return
        }
        await fetchLoads()
        if (fields.status === 'paid')   showToast('✅ Marked as paid!')
        if (fields.status === 'billed') showToast('✅ Marked as billed!')
        if (fields.fuel !== undefined)  showToast('✅ Fuel saved!')
      } else {
        setLoads(prev => prev.map((l,i) => i === localIdx ? { ...l, ...fields } : l))
        if (fields.status === 'paid')   showToast('✅ Marked as paid!')
        if (fields.status === 'billed') showToast('✅ Marked as billed!')
        if (fields.fuel !== undefined)  showToast('✅ Fuel saved!')
      }
    } catch (err) {
      showToast('⚠️ Update failed: ' + err.message)
    } finally {
      setUpdating(null)
    }
  }

  // ── DELETE FROM D1 + R2 ──────────────────────────────────
  async function deleteLoad(load, localIdx) {
    setDeleting(true)
    try {
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ driver: load.driver }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          showToast('⚠️ Delete failed: ' + (data.error || 'unknown'))
          setDeleting(false)
          return
        }
        await fetchLoads()
      } else {
        setLoads(prev => prev.filter((_,i) => i !== localIdx))
      }
      setConfirmDelete(null)
      showToast('✅ Load deleted')
    } catch (err) {
      showToast('⚠️ Delete failed: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  function inPeriod(dateStr, period) {
    if (!dateStr) return false
    const d   = new Date(dateStr)
    const now = new Date()
    if (period === 'daily')   return d.toDateString() === now.toDateString()
    if (period === 'weekly') {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      start.setHours(0,0,0,0)
      return d >= start
    }
    if (period === 'monthly') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (period === 'yearly')  return d.getFullYear() === now.getFullYear()
    return false
  }

  function calcPay(load) {
    const basePay    = parseFloat(load.base_pay || 0)
    const bruceGross = basePay * BRUCE_CUT
    const timGross   = basePay * TIM_CUT
    const fuel       = parseFloat(load.fuel || 0)
    return { basePay, bruceGross, timGross, fuel }
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
      billed:          billed.reduce((s,l)  => s + (parseFloat(l.net_pay || l.netPay)||0), 0),
      paid:            paid.reduce((s,l)    => s + (parseFloat(l.net_pay || l.netPay)||0), 0),
      advanceKept:     inRange.reduce((s,l) => s + advanceKept(l), 0),
      timGross:        inRange.reduce((s,l) => s + parseFloat(l.base_pay||0) * TIM_CUT, 0),
      totalFuel:       inRange.reduce((s,l) => s + parseFloat(l.fuel||0), 0),
      comdataTotal:    inRange.reduce((s,l) => s + parseFloat(l.comdata_total    || l.comdataTotal    || 0), 0),
      lumperTotal:     inRange.reduce((s,l) => s + parseFloat(l.lumper_total     || l.lumperTotal     || 0), 0),
      incidentalTotal: inRange.reduce((s,l) => s + parseFloat(l.incidental_total || l.incidentalTotal || 0), 0),
    }
  }

  const bruceTotalAllTime = bruceLoads.reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const timTotalAllTime   = timLoads.reduce((s,l)   => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const grandTotal        = bruceTotalAllTime + timTotalAllTime
  const brucePercent      = grandTotal > 0 ? Math.round((bruceTotalAllTime / grandTotal) * 100) : 50
  const timPercent        = 100 - brucePercent
  const leader            = bruceTotalAllTime > timTotalAllTime ? 'BRUCE' :
                            timTotalAllTime > bruceTotalAllTime ? 'TIM'   : 'TIE'

  function sortByDeliveryDate(arr) {
    return [...arr].sort((a, b) => {
      const da = a.delivery_date ? new Date(a.delivery_date) : null
      const db = b.delivery_date ? new Date(b.delivery_date) : null
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da - db
    })
  }

  const rawFiltered   = view === 'all'   ? loads :
                        view === 'BRUCE' ? bruceLoads :
                        view === 'TIM'   ? timLoads   : []

  const filteredLoads = sortByDeliveryDate(rawFiltered)

  const totalNet    = filteredLoads.reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const totalPaid   = filteredLoads.filter(l=>l.status==='paid').reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const totalUnpaid = totalNet - totalPaid

  const bruceStats     = driverStats(bruceLoads, period)
  const timStats       = driverStats(timLoads,   period)
  const brucePeriodCut = bruceCutForPeriod(period)

  const periodLabel = { daily:'TODAY', weekly:'THIS WEEK', monthly:'THIS MONTH', yearly:'THIS YEAR' }

  if (loads.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div>
        <h3>NO LOADS YET</h3>
        <p>Complete and invoice a load to see it here</p>
      </div>
    )
  }

  return (
    <div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
        {['all','BRUCE','TIM','reports'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding:'9px 4px', borderRadius:8, border:'none',
            fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
            letterSpacing:'0.05em', cursor:'pointer',
            background: view === v ? 'var(--amber)' : 'var(--navy3)',
            color:       view === v ? 'var(--navy)' : 'var(--grey)',
          }}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      {/* LEADERBOARD */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:10 }}>
          LEADERBOARD - ALL TIME
          {leader !== 'TIE' && (
            <span style={{ marginLeft:8, fontSize:12, color:'var(--amber)' }}>
              {leader} IS WINNING!
            </span>
          )}
        </div>
        <div style={{ display:'flex', height:18, borderRadius:9, overflow:'hidden', marginBottom:10 }}>
          <div style={{ width:brucePercent + '%', background:'#1e88e5', transition:'width 0.4s' }} />
          <div style={{ width:timPercent + '%',   background:'#e53935', transition:'width 0.4s' }} />
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

      {/* REPORTS TAB */}
      {view === 'reports' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
            {['daily','weekly','monthly','yearly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding:'9px 4px', borderRadius:8, border:'none',
                fontFamily:'var(--font-head)', fontWeight:700, fontSize:11,
                letterSpacing:'0.05em', cursor:'pointer',
                background: period === p ? 'var(--white)' : 'var(--navy3)',
                color:       period === p ? 'var(--navy)' : 'var(--grey)',
              }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13,
                        color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>
            {periodLabel[period]} - PER DRIVER REPORT
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE {leader==='BRUCE'?'👑':''}</div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{bruceStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.billed - bruceStats.paid)}</span></div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM {leader==='TIM'?'👑':''}</div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.billed - timStats.paid)}</span></div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid var(--amber)', marginBottom:20 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>COMBINED {periodLabel[period]}</div>
            <div className="amount-row"><span className="label">Total Loads</span><span className="value">{bruceStats.count + timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed + timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid + timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt((bruceStats.billed+timStats.billed)-(bruceStats.paid+timStats.paid))}</span></div>
          </div>

          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:6 }}>
            {periodLabel[period]} - DRIVER PAY MODULE
          </div>
          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:12, textAlign:'center' }}>
            BASE RATE SPLIT: BRUCE 20% / TIM 80%
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE — OWNER CUT (20% OF ALL LOADS)</div>
            <div className="amount-row"><span className="label">Total Loads ({periodLabel[period]})</span><span className="value">{brucePeriodCut.loadCount}</span></div>
            <div className="amount-row"><span className="label">All Base Rates Combined</span><span className="value">{fmt(brucePeriodCut.totalBase)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>BRUCE GROSS CUT</span>
                <span className="value" style={{color:'#1e88e5',fontSize:18,fontWeight:900}}>{fmt(brucePeriodCut.bruceGross)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:20 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM — DRIVER PAY (80%)</div>
            <div className="amount-row"><span className="label">Tim's Base Rates</span><span className="value">{fmt(timLoads.filter(l=>inPeriod(l.date||l.created_at,period)).reduce((s,l)=>s+parseFloat(l.base_pay||0),0))}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TIM GROSS PAY</span>
                <span className="value" style={{color:'var(--green)',fontSize:18,fontWeight:900}}>{fmt(timStats.timGross)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:6 }}>
            {periodLabel[period]} - DRIVER ADVANCE KEPT
          </div>
          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:12, textAlign:'center' }}>
            COMDATA − LUMPERS − INCIDENTALS = KEPT BY DRIVER
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE — ADVANCE KEPT</div>
            <div className="amount-row"><span className="label">Total Comdata Issued</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.comdataTotal)}</span></div>
            <div className="amount-row"><span className="label">Lumpers Paid</span><span className="value">{fmt(bruceStats.lumperTotal)}</span></div>
            <div className="amount-row"><span className="label">Incidentals Paid</span><span className="value">{fmt(bruceStats.incidentalTotal)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TOTAL KEPT BY BRUCE</span>
                <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(bruceStats.advanceKept)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM — ADVANCE KEPT</div>
            <div className="amount-row"><span className="label">Total Comdata Issued</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.comdataTotal)}</span></div>
            <div className="amount-row"><span className="label">Lumpers Paid</span><span className="value">{fmt(timStats.lumperTotal)}</span></div>
            <div className="amount-row"><span className="label">Incidentals Paid</span><span className="value">{fmt(timStats.incidentalTotal)}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:10 }}>
              <div className="amount-row">
                <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TOTAL KEPT BY TIM</span>
                <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(timStats.advanceKept)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>COMBINED — ADVANCE KEPT</div>
            <div className="amount-row">
              <span className="label" style={{fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TOTAL KEPT BY BOTH DRIVERS</span>
              <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(bruceStats.advanceKept + timStats.advanceKept)}</span>
            </div>
          </div>
        </div>
      )}

      {/* LOAD LIST */}
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

          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)',
                        letterSpacing:'0.08em', marginBottom:10, textAlign:'center' }}>
            SORTED BY DELIVERY DATE — OLDEST FIRST
          </div>

          {filteredLoads.length === 0 && (
            <div className="empty-state">
              <div className="icon">📋</div>
              <h3>NO LOADS</h3>
              <p>No loads found for this driver yet</p>
            </div>
          )}

          {filteredLoads.map((load, idx) => {
            const realIdx    = loads.indexOf(load)
            const isPending  = confirmDelete === (load.id || realIdx)
            const isUpdating = updating === (load.id || realIdx)
            const pay        = calcPay(load)
            const kept       = advanceKept(load)
            const netPayVal  = parseFloat(load.net_pay || load.netPay) || 0
            const fuelVal    = fuelInputs[load.id] !== undefined ? fuelInputs[load.id] : (load.fuel || '')
            const invoiceUrl = load.invoice_url ? api + load.invoice_url : null

            return (
              <div className="load-card" key={load.id || idx}>
                <div className="load-card-info" style={{ flex:1 }}>

                  <div style={{
                    display:'inline-block', padding:'2px 8px', borderRadius:10,
                    fontSize:10, fontFamily:'var(--font-head)', fontWeight:700, marginBottom:6,
                    background: load.driver === 'BRUCE' ? '#1e88e5' : '#e53935', color:'#fff',
                  }}>
                    {load.driver || '-'}
                  </div>

                  <h4>{load.broker_name || 'Unknown Broker'}</h4>
                  <p>Load # {load.load_number || '-'}</p>
                  <p>{load.origin || '-'} to {load.destination || '-'}</p>

                  <p style={{ color:'var(--amber)', fontSize:12, fontFamily:'var(--font-head)', fontWeight:700, marginTop:2 }}>
                    Delivery: {load.delivery_date || '-'}
                  </p>
                  <p style={{ color:'var(--grey)', fontSize:11 }}>
                    Invoiced: {(load.created_at || load.date) ? new Date(load.created_at || load.date).toLocaleDateString() : '-'}
                  </p>

                  <div style={{ marginTop:8, fontFamily:'var(--font-head)', fontSize:22, fontWeight:900, color:'var(--amber)' }}>
                    {fmt(netPayVal)}
                  </div>

                  {/* TIM PAY CARD */}
                  {load.driver === 'TIM' && (
                    <div style={{
                      marginTop:10, background:'var(--navy3)', border:'1px solid var(--border)',
                      borderRadius:8, padding:'10px 12px',
                    }}>
                      <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:8 }}>DRIVER PAY — THIS LOAD</div>
                      <div className="amount-row" style={{marginBottom:4}}>
                        <span style={{fontSize:11,color:'var(--grey)'}}>Base Rate</span>
                        <span style={{fontSize:12,fontFamily:'var(--font-head)',fontWeight:700}}>{fmt(pay.basePay)}</span>
                      </div>
                      <div className="amount-row" style={{marginBottom:4}}>
                        <span style={{fontSize:11,color:'var(--grey)'}}>Bruce 20% cut</span>
                        <span style={{fontSize:12,fontFamily:'var(--font-head)',fontWeight:700,color:'#1e88e5'}}>{fmt(pay.bruceGross)}</span>
                      </div>
                      <div style={{ borderTop:'1px solid var(--border)', marginTop:6, paddingTop:8 }}>
                        <div className="amount-row">
                          <span style={{fontSize:12,fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>TIM GROSS PAY</span>
                          <span style={{fontSize:16,fontFamily:'var(--font-head)',fontWeight:900,color:'var(--green)'}}>{fmt(pay.timGross)}</span>
                        </div>
                      </div>
                      <div style={{ marginTop:8, borderTop:'1px solid var(--border)', paddingTop:8 }}>
                        <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:6 }}>FUEL COST (TRACKING ONLY)</div>
                        <div style={{ display:'flex', gap:8 }}>
                          <input
                            type="text" inputMode="decimal" pattern="[0-9.]*" placeholder="0.00"
                            value={fuelVal}
                            onChange={e => setFuelInputs(p => ({ ...p, [load.id]: e.target.value }))}
                            style={{
                              flex:1, background:'var(--navy)', border:'1px solid var(--border)',
                              color:'var(--white)', borderRadius:8, padding:'8px 12px',
                              fontSize:16, fontFamily:'var(--font-head)', fontWeight:700, minWidth:0,
                            }}
                          />
                          <button
                            disabled={isUpdating}
                            onClick={() => patchLoad(load, realIdx, { fuel: parseFloat(fuelVal) || 0 })}
                            style={{
                              padding:'8px 14px', borderRadius:8, border:'none',
                              background:'var(--amber)', color:'var(--navy)',
                              fontSize:12, fontFamily:'var(--font-head)', fontWeight:900,
                              cursor:'pointer', flexShrink:0,
                            }}
                          >
                            SAVE
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BRUCE PAY CARD */}
                  {load.driver === 'BRUCE' && (
                    <div style={{
                      marginTop:10, background:'var(--navy3)', border:'1px solid var(--border)',
                      borderRadius:8, padding:'10px 12px',
                    }}>
                      <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:8 }}>OWNER PAY — THIS LOAD</div>
                      <div className="amount-row" style={{marginBottom:4}}>
                        <span style={{fontSize:11,color:'var(--grey)'}}>Base Rate</span>
                        <span style={{fontSize:12,fontFamily:'var(--font-head)',fontWeight:700}}>{fmt(pay.basePay)}</span>
                      </div>
                      <div style={{ borderTop:'1px solid var(--border)', marginTop:6, paddingTop:8 }}>
                        <div className="amount-row">
                          <span style={{fontSize:12,fontFamily:'var(--font-head)',fontWeight:900,color:'var(--white)'}}>BRUCE GROSS CUT</span>
                          <span style={{fontSize:16,fontFamily:'var(--font-head)',fontWeight:900,color:'#1e88e5'}}>{fmt(pay.bruceGross)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ADVANCE KEPT PILL */}
                  {parseFloat(load.comdata_total || load.comdataTotal || 0) > 0 && (
                    <div style={{
                      marginTop:6, padding:'6px 10px', background:'var(--navy3)',
                      borderRadius:6, border:'1px solid var(--border)',
                      display:'inline-flex', gap:8, alignItems:'center',
                    }}>
                      <span style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)' }}>ADVANCE KEPT</span>
                      <span style={{ fontSize:14, fontFamily:'var(--font-head)', fontWeight:900, color: kept > 0 ? 'var(--amber)' : 'var(--grey)' }}>
                        {fmt(kept)}
                      </span>
                    </div>
                  )}

                  {/* ACTION BUTTONS */}
                  <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                    {load.status !== 'billed' && load.status !== 'paid' && (
                      <button
                        className="scan-btn secondary"
                        style={{ flex:1, padding:'8px 12px', fontSize:13, opacity: isUpdating ? 0.5 : 1 }}
                        disabled={isUpdating}
                        onClick={() => patchLoad(load, realIdx, { status: 'billed' })}
                      >
                        {isUpdating ? 'SAVING...' : 'MARK BILLED'}
                      </button>
                    )}
                    {load.status !== 'paid' && (
                      <button
                        className="scan-btn success"
                        style={{ flex:1, padding:'8px 12px', fontSize:13, opacity: isUpdating ? 0.5 : 1 }}
                        disabled={isUpdating}
                        onClick={() => patchLoad(load, realIdx, { status: 'paid' })}
                      >
                        {isUpdating ? 'SAVING...' : 'MARK PAID'}
                      </button>
                    )}
                    {load.status === 'paid' && (
                      <div style={{ fontSize:13, color:'var(--green)', fontFamily:'var(--font-head)', fontWeight:700, paddingTop:4 }}>
                        PAYMENT RECEIVED
                      </div>
                    )}

                    {/* VIEW INVOICE — only shows when PDF is stored in R2 */}
                    {invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display:'flex', alignItems:'center', justifyContent:'center',
                          padding:'8px 12px', borderRadius:8,
                          border:'1px solid var(--amber)',
                          background:'transparent', color:'var(--amber)',
                          fontSize:13, fontFamily:'var(--font-head)', fontWeight:700,
                          textDecoration:'none', flexShrink:0,
                        }}
                      >
                        📄 VIEW INVOICE
                      </a>
                    )}

                    {!isPending && (
                      <button
                        style={{
                          padding:'8px 12px', borderRadius:8, border:'1px solid #555',
                          background:'transparent', color:'#888', fontSize:13,
                          fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                        }}
                        onClick={() => setConfirmDelete(load.id || realIdx)}
                      >
                        DELETE
                      </button>
                    )}
                  </div>

                  {/* INLINE CONFIRM DELETE */}
                  {isPending && (
                    <div style={{
                      marginTop:12, background:'#2a0a0a',
                      border:'1px solid #e53935', borderRadius:8, padding:'12px 14px',
                    }}>
                      <div style={{ fontSize:12, color:'#e53935', fontFamily:'var(--font-head)', fontWeight:700, marginBottom:10 }}>
                        DELETE THIS LOAD? THIS CANNOT BE UNDONE.
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button disabled={deleting} onClick={() => deleteLoad(load, realIdx)} style={{
                          flex:1, padding:'10px 0', borderRadius:8, border:'none',
                          background: deleting ? '#555' : '#e53935', color:'#fff',
                          fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                        }}>
                          {deleting ? 'DELETING...' : 'CONFIRM DELETE'}
                        </button>
                        <button disabled={deleting} onClick={() => setConfirmDelete(null)} style={{
                          flex:1, padding:'10px 0', borderRadius:8, border:'1px solid #555',
                          background:'transparent', color:'#aaa', fontSize:13,
                          fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                        }}>
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                <div style={{ marginLeft:12, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                  <span className={'status-chip ' + load.status}>{load.status}</span>
                  {load.bol_count > 0 && (
                    <div style={{ fontSize:10, color:'var(--grey)', marginTop:6 }}>
                      {load.bol_count} BOL{load.bol_count!==1?'s':''}
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
