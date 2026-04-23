// src/Loads.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState } from 'react'

const BRUCE_CUT = 0.20  // Bruce receives 20% of every base rate
const TIM_CUT   = 0.80  // Tim receives 80% of every base rate

export default function Loads({ loads, setLoads, api, showToast, fetchLoads }) {

  const [view,          setView]          = useState('all')
  const [period,        setPeriod]        = useState('monthly')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [updating,      setUpdating]      = useState(null)
  const [fuelInputs,    setFuelInputs]    = useState({})
  const [editIdx,       setEditIdx]       = useState(null)
  const [editData,      setEditData]      = useState(null)

  // ── PATCH LOAD IN D1 ─────────────────────────────────────
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

  // ── DELETE LOAD IN D1 ────────────────────────────────────
  async function deleteLoad(load, localIdx) {
    setDeleting(true)
    try {
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, { method: 'DELETE' })
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
      showToast('🗑️ Load deleted')
      setConfirmDelete(null)
      if (editIdx === localIdx) { setEditIdx(null); setEditData(null) }
    } catch (err) {
      showToast('⚠️ Delete failed: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── FUEL SAVE ────────────────────────────────────────────
  function saveFuel(load, localIdx) {
    const val = parseFloat(fuelInputs[load.id || localIdx] || '0') || 0
    patchLoad(load, localIdx, { fuel: val })
    setFuelInputs(p => ({ ...p, [load.id || localIdx]: '' }))
  }

  // ── EDIT DRAWER ──────────────────────────────────────────
  function openEdit(load, localIdx) {
    if (editIdx === localIdx) { setEditIdx(null); setEditData(null); return }
    setEditIdx(localIdx)
    setEditData({
      base_pay:    String(load.base_pay    || ''),
      detention:   String(load.detention   || ''),
      pallets:     String(load.pallets     || ''),
      notes:       String(load.notes       || ''),
      lumpers:     (load.lumpers     || []).map(i => ({ ...i, amount: String(i.amount || '0') })),
      incidentals: (load.incidentals || []).map(i => ({ ...i, amount: String(i.amount || '0') })),
      comdatas:    (load.comdatas    || []).map(i => ({ ...i, amount: String(i.amount || '0') })),
    })
  }

  function closeEdit() { setEditIdx(null); setEditData(null) }

  function updateItemAmount(type, idx, val) {
    setEditData(prev => ({
      ...prev,
      [type]: prev[type].map((item,i) => i === idx ? { ...item, amount: val } : item)
    }))
  }

  function removeEditItem(type, idx) {
    setEditData(prev => ({ ...prev, [type]: prev[type].filter((_,i) => i !== idx) }))
  }

  function addEditItem(type) {
    setEditData(prev => ({
      ...prev,
      [type]: [...prev[type], { amount: '0.00', label: 'Manual entry', dataUrl: null, base64: null, w: 0, h: 0 }]
    }))
  }

  function editNetPreview() {
    if (!editData) return 0
    const base_pay     = parseFloat(editData.base_pay)  || 0
    const detention    = parseFloat(editData.detention)  || 0
    const pallets      = parseFloat(editData.pallets)    || 0
    const lumperTotal  = editData.lumpers.reduce((s,i)     => s + (parseFloat(i.amount)||0), 0)
    const incTotal     = editData.incidentals.reduce((s,i) => s + (parseFloat(i.amount)||0), 0)
    const comdataTotal = editData.comdatas.reduce((s,i)    => s + (parseFloat(i.amount)||0), 0)
    return (base_pay + lumperTotal + incTotal + detention + pallets) - comdataTotal
  }

  async function saveEdit(load, localIdx) {
    const newNetPay = editNetPreview()
    const fields = {
      base_pay:    editData.base_pay,
      detention:   editData.detention,
      pallets:     editData.pallets,
      notes:       editData.notes,
      lumpers:     JSON.stringify(editData.lumpers),
      incidentals: JSON.stringify(editData.incidentals),
      comdatas:    JSON.stringify(editData.comdatas),
      net_pay:     newNetPay,
      edited:      1,
      edited_date: new Date().toISOString(),
    }
    await patchLoad(load, localIdx, fields)
    showToast('✅ Invoice updated! Net: ' + fmt(newNetPay))
    closeEdit()
  }

  // ── HELPERS ──────────────────────────────────────────────
  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  function calcPay(load) {
    const base = parseFloat(load.base_pay) || 0
    if (load.driver === 'BRUCE') {
      return { gross: base, ownerCut: base * BRUCE_CUT, driverNet: base }
    }
    return { gross: base, ownerCut: base * BRUCE_CUT, driverNet: base * TIM_CUT }
  }

  function advanceKept(load) {
    const comdataTotal = (load.comdatas    || []).reduce((s,i) => s + (parseFloat(i.amount)||0), 0)
    const lumperTotal  = (load.lumpers     || []).reduce((s,i) => s + (parseFloat(i.amount)||0), 0)
    const incTotal     = (load.incidentals || []).reduce((s,i) => s + (parseFloat(i.amount)||0), 0)
    return Math.max(0, comdataTotal - lumperTotal - incTotal)
  }

  function inPeriod(dateStr, p) {
    if (!dateStr) return false
    const d   = new Date(dateStr)
    const now = new Date()
    if (p === 'daily')   return d.toDateString() === now.toDateString()
    if (p === 'weekly')  { const s = new Date(now); s.setDate(now.getDate()-6); s.setHours(0,0,0,0); return d >= s }
    if (p === 'monthly') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (p === 'yearly')  return d.getFullYear() === now.getFullYear()
    return false
  }

  // ── DRIVER SPLITS ────────────────────────────────────────
  const bruceLoads = loads.filter(l => l.driver === 'BRUCE')
  const timLoads   = loads.filter(l => l.driver === 'TIM')

  function driverStats(dLoads, p) {
    const inRange = dLoads.filter(l => inPeriod(l.date, p))
    const billed  = inRange.filter(l => l.status === 'billed' || l.status === 'paid')
    const paid    = inRange.filter(l => l.status === 'paid')
    return {
      count:       inRange.length,
      billed:      billed.reduce((s,l)  => s + (parseFloat(l.netPay || l.net_pay)||0), 0),
      paid:        paid.reduce((s,l)    => s + (parseFloat(l.netPay || l.net_pay)||0), 0),
      total:       inRange.reduce((s,l) => s + (parseFloat(l.netPay || l.net_pay)||0), 0),
      grossPay:    inRange.reduce((s,l) => s + calcPay(l).driverNet, 0),
      ownerCut:    inRange.reduce((s,l) => s + calcPay(l).ownerCut, 0),
      fuel:        inRange.reduce((s,l) => s + (parseFloat(l.fuel)||0), 0),
      advanceKept: inRange.reduce((s,l) => s + advanceKept(l), 0),
    }
  }

  const bruceTotalAllTime = bruceLoads.reduce((s,l) => s + (parseFloat(l.netPay || l.net_pay)||0), 0)
  const timTotalAllTime   = timLoads.reduce((s,l)   => s + (parseFloat(l.netPay || l.net_pay)||0), 0)
  const grandTotal        = bruceTotalAllTime + timTotalAllTime
  const brucePercent      = grandTotal > 0 ? Math.round((bruceTotalAllTime / grandTotal) * 100) : 50
  const timPercent        = 100 - brucePercent
  const leader            = bruceTotalAllTime > timTotalAllTime ? 'BRUCE' :
                            timTotalAllTime > bruceTotalAllTime ? 'TIM'   : 'TIE'

  const filteredLoads = view === 'all'   ? loads :
                        view === 'BRUCE' ? bruceLoads :
                        view === 'TIM'   ? timLoads   : []

  const totalNet    = filteredLoads.reduce((s,l) => s + (parseFloat(l.netPay || l.net_pay)||0), 0)
  const totalPaid   = filteredLoads.filter(l=>l.status==='paid').reduce((s,l) => s + (parseFloat(l.netPay || l.net_pay)||0), 0)
  const totalUnpaid = totalNet - totalPaid

  const bruceStats  = driverStats(bruceLoads, period)
  const timStats    = driverStats(timLoads,   period)

  const periodLabel = { daily:'TODAY', weekly:'THIS WEEK', monthly:'THIS MONTH', yearly:'THIS YEAR' }

  const inputStyle = {
    width:'100%', background:'var(--navy3)', border:'1px solid var(--border)',
    color:'var(--white)', borderRadius:8, padding:'8px 10px',
    fontSize:14, fontFamily:'var(--font-body)', boxSizing:'border-box',
  }

  // ── EMPTY STATE ──────────────────────────────────────────
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

      {/* VIEW TABS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
        {['all','BRUCE','TIM','reports'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding:'9px 4px', borderRadius:8, border:'none',
            fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
            letterSpacing:'0.05em', cursor:'pointer',
            background: view === v ? 'var(--amber)' : 'var(--navy3)',
            color:       view === v ? 'var(--navy)'  : 'var(--grey)',
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
          <div style={{ width:brucePercent+'%', background:'#1e88e5', transition:'width 0.4s' }} />
          <div style={{ width:timPercent+'%',   background:'#e53935', transition:'width 0.4s' }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #1e88e5' }}>
            <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:4 }}>
              BRUCE {leader==='BRUCE'?'👑':''}
            </div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#1e88e5' }}>
              {fmt(bruceTotalAllTime)}
            </div>
            <div style={{ fontSize:11, color:'var(--grey)', marginTop:2 }}>
              {bruceLoads.length} load{bruceLoads.length!==1?'s':''}
            </div>
          </div>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #e53935' }}>
            <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:4 }}>
              TIM {leader==='TIM'?'👑':''}
            </div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#e53935' }}>
              {fmt(timTotalAllTime)}
            </div>
            <div style={{ fontSize:11, color:'var(--grey)', marginTop:2 }}>
              {timLoads.length} load{timLoads.length!==1?'s':''}
            </div>
          </div>
        </div>
      </div>

      {/* REPORTS VIEW */}
      {view === 'reports' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
            {['daily','weekly','monthly','yearly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding:'9px 4px', borderRadius:8, border:'none',
                fontFamily:'var(--font-head)', fontWeight:700, fontSize:11,
                letterSpacing:'0.05em', cursor:'pointer',
                background: period === p ? 'var(--white)' : 'var(--navy3)',
                color:       period === p ? 'var(--navy)'  : 'var(--grey)',
              }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13,
                        color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>
            {periodLabel[period]} - PER DRIVER REPORT
          </div>

          {/* BRUCE REPORT */}
          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>
              BRUCE {leader==='BRUCE'?'👑':''}
            </div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{bruceStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.billed - bruceStats.paid)}</span></div>
            <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
              <div className="amount-row"><span className="label">Owner Cut (20%)</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.ownerCut)}</span></div>
            </div>
          </div>

          {/* TIM REPORT */}
          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>
              TIM {leader==='TIM'?'👑':''}
            </div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.billed - timStats.paid)}</span></div>
            <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
              <div className="amount-row"><span className="label">Gross Pay (80%)</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.grossPay)}</span></div>
              <div className="amount-row"><span className="label">Advance Kept</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.advanceKept)}</span></div>
              <div className="amount-row"><span className="label">Fuel</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.fuel)}</span></div>
            </div>
          </div>

          {/* COMBINED REPORT */}
          <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>
              COMBINED {periodLabel[period]}
            </div>
            <div className="amount-row"><span className="label">Total Loads</span><span className="value">{bruceStats.count + timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed + timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid + timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt((bruceStats.billed + timStats.billed) - (bruceStats.paid + timStats.paid))}</span></div>
          </div>
        </div>
      )}

      {/* LOADS LIST VIEW */}
      {view !== 'reports' && (
        <div>

          {/* TOTALS BAR */}
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

          {filteredLoads.length === 0 && (
            <div className="empty-state">
              <div className="icon">📋</div>
              <h3>NO LOADS</h3>
              <p>No loads found for this driver yet</p>
            </div>
          )}

          {filteredLoads.map((load, idx) => {
            const localIdx  = loads.indexOf(load)
            const isEditing = editIdx === localIdx
            const loadId    = load.id || localIdx
            const netPay    = parseFloat(load.netPay || load.net_pay) || 0
            const bolCount  = load.bol_count || (load.bols && load.bols.length) || 0

            return (
              <div className="load-card" key={idx} style={{ flexDirection:'column', alignItems:'stretch' }}>

                {/* TOP ROW */}
                <div style={{ display:'flex', alignItems:'flex-start' }}>
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
                    <p style={{ color:'var(--grey)', fontSize:11 }}>
                      {load.date ? new Date(load.date).toLocaleDateString() : '-'}
                      {(load.edited || load.edited_date) && (
                        <span style={{ marginLeft:6, color:'var(--amber)', fontSize:10 }}>
                          EDITED {load.edited_date ? new Date(load.edited_date).toLocaleDateString() : ''}
                        </span>
                      )}
                    </p>

                    <div style={{ marginTop:8, fontFamily:'var(--font-head)', fontSize:22, fontWeight:900, color:'var(--amber)' }}>
                      {fmt(netPay)}
                    </div>

                  </div>

                  <div style={{ marginLeft:12, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                    <span className={'status-chip ' + load.status}>
                      {load.status}
                    </span>
                    {bolCount > 0 && (
                      <div style={{ fontSize:10, color:'var(--grey)', marginTop:6 }}>
                        {bolCount} BOL{bolCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* VIEW INVOICE BUTTON */}
                {load.invoice_url && (
                  <a
                    href={load.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display:'block', marginTop:10, padding:'9px 0', borderRadius:8,
                      background:'var(--navy3)', border:'1px solid var(--border)',
                      color:'var(--amber)', fontFamily:'var(--font-head)', fontWeight:700,
                      fontSize:13, textAlign:'center', textDecoration:'none', letterSpacing:'0.05em',
                    }}
                  >
                    VIEW INVOICE PDF
                  </a>
                )}

                {/* ACTION BUTTONS */}
                <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                  {load.status !== 'billed' && load.status !== 'paid' && (
                    <button
                      className="scan-btn secondary"
                      style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                      disabled={updating === loadId}
                      onClick={() => patchLoad(load, localIdx, { status:'billed' })}
                    >
                      {updating === loadId ? '...' : 'MARK BILLED'}
                    </button>
                  )}
                  {load.status !== 'paid' && (
                    <button
                      className="scan-btn success"
                      style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                      disabled={updating === loadId}
                      onClick={() => patchLoad(load, localIdx, { status:'paid' })}
                    >
                      {updating === loadId ? '...' : 'MARK PAID'}
                    </button>
                  )}
                  {load.status === 'paid' && (
                    <div style={{ fontSize:13, color:'var(--green)', fontFamily:'var(--font-head)', fontWeight:700, paddingTop:4 }}>
                      PAYMENT RECEIVED
                    </div>
                  )}
                  <button
                    style={{
                      padding:'8px 12px', borderRadius:8, border:'1px solid var(--amber)',
                      background: isEditing ? 'var(--amber)' : 'transparent',
                      color: isEditing ? 'var(--navy)' : 'var(--amber)',
                      fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                    }}
                    onClick={() => openEdit(load, localIdx)}
                  >
                    {isEditing ? 'CLOSE' : 'EDIT'}
                  </button>
                  <button
                    style={{
                      padding:'8px 12px', borderRadius:8, border:'1px solid #555',
                      background:'transparent', color:'#888', fontSize:13,
                      fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                    }}
                    onClick={() => setConfirmDelete(localIdx)}
                  >
                    DELETE
                  </button>
                </div>

                {/* CONFIRM DELETE */}
                {confirmDelete === localIdx && (
                  <div style={{ marginTop:12, padding:12, background:'var(--navy3)', borderRadius:8, border:'1px solid #e53935' }}>
                    <div style={{ fontSize:13, color:'var(--white)', marginBottom:10, fontFamily:'var(--font-head)' }}>
                      DELETE THIS LOAD? This cannot be undone.
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button
                        disabled={deleting}
                        onClick={() => deleteLoad(load, localIdx)}
                        style={{
                          flex:1, padding:'10px 0', borderRadius:8, border:'none',
                          background: deleting ? '#555' : '#e53935', color:'#fff',
                          fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                        }}
                      >
                        {deleting ? 'DELETING...' : 'CONFIRM DELETE'}
                      </button>
                      <button
                        disabled={deleting}
                        onClick={() => setConfirmDelete(null)}
                        style={{
                          flex:1, padding:'10px 0', borderRadius:8, border:'1px solid #555',
                          background:'transparent', color:'#aaa', fontSize:13,
                          fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}

                {/* EDIT DRAWER */}
                {isEditing && editData && (
                  <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>

                    <div style={{ fontFamily:'var(--font-head)', fontSize:12, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>
                      EDIT INVOICE AMOUNTS
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>BASE PAY ($)</div>
                      <input style={inputStyle} type="number" inputMode="decimal"
                        value={editData.base_pay}
                        onChange={e => setEditData(p => ({ ...p, base_pay: e.target.value }))}
                        placeholder="0.00" />
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>DETENTION ($)</div>
                        <input style={inputStyle} type="number" inputMode="decimal"
                          value={editData.detention}
                          onChange={e => setEditData(p => ({ ...p, detention: e.target.value }))}
                          placeholder="0.00" />
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>PALLETS ($)</div>
                        <input style={inputStyle} type="number" inputMode="decimal"
                          value={editData.pallets}
                          onChange={e => setEditData(p => ({ ...p, pallets: e.target.value }))}
                          placeholder="0.00" />
                      </div>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:6, fontFamily:'var(--font-head)' }}>LUMPER RECEIPTS</div>
                      {editData.lumpers.map((item, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <div style={{ fontSize:12, color:'var(--grey)', minWidth:70 }}>Lumper {i+1}</div>
                          <input style={{ ...inputStyle, flex:1 }} type="number" inputMode="decimal"
                            value={item.amount} onChange={e => updateItemAmount('lumpers', i, e.target.value)} placeholder="0.00" />
                          <button onClick={() => removeEditItem('lumpers', i)}
                            style={{ background:'transparent', border:'1px solid #555', color:'#888', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                        </div>
                      ))}
                      <button className="scan-btn secondary" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }}
                        onClick={() => addEditItem('lumpers')}>+ ADD LUMPER</button>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:6, fontFamily:'var(--font-head)' }}>INCIDENTALS</div>
                      {editData.incidentals.map((item, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <div style={{ fontSize:12, color:'var(--grey)', minWidth:70 }}>Inc. {i+1}</div>
                          <input style={{ ...inputStyle, flex:1 }} type="number" inputMode="decimal"
                            value={item.amount} onChange={e => updateItemAmount('incidentals', i, e.target.value)} placeholder="0.00" />
                          <button onClick={() => removeEditItem('incidentals', i)}
                            style={{ background:'transparent', border:'1px solid #555', color:'#888', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                        </div>
                      ))}
                      <button className="scan-btn secondary" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }}
                        onClick={() => addEditItem('incidentals')}>+ ADD INCIDENTAL</button>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:6, fontFamily:'var(--font-head)' }}>COMDATA / EXPRESS CODES</div>
                      {editData.comdatas.map((item, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <div style={{ fontSize:12, color:'#e57373', minWidth:70 }}>Comdata {i+1}</div>
                          <input style={{ ...inputStyle, flex:1, borderColor:'#e57373' }} type="number" inputMode="decimal"
                            value={item.amount} onChange={e => updateItemAmount('comdatas', i, e.target.value)} placeholder="0.00" />
                          <button onClick={() => removeEditItem('comdatas', i)}
                            style={{ background:'transparent', border:'1px solid #555', color:'#888', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                        </div>
                      ))}
                      <button className="scan-btn danger" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }}
                        onClick={() => addEditItem('comdatas')}>+ ADD COMDATA / EXPRESS CODE</button>
                    </div>

                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>NOTES</div>
                      <textarea value={editData.notes}
                        onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Notes..."
                        style={{ ...inputStyle, minHeight:60, resize:'vertical' }} />
                    </div>

                    <div style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      background:'var(--navy3)', borderRadius:8, padding:'10px 14px',
                      marginBottom:14, border:'1px solid var(--border)',
                    }}>
                      <span style={{ fontFamily:'var(--font-head)', fontSize:12, color:'var(--grey)' }}>UPDATED NET TOTAL</span>
                      <span style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color: editNetPreview() >= 0 ? 'var(--amber)' : 'var(--red)' }}>
                        {fmt(editNetPreview())}
                      </span>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <button className="scan-btn secondary" style={{ padding:'10px', fontSize:13 }} onClick={closeEdit}>CANCEL</button>
                      <button className="scan-btn success" style={{ padding:'10px', fontSize:13 }} onClick={() => saveEdit(load, localIdx)}>SAVE CHANGES</button>
                    </div>

                  </div>
                )}

              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
