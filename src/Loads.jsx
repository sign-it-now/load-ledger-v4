// src/Loads.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState } from 'react'
import { jsPDF } from 'jspdf'

const BRUCE_CUT = 0.20
const TIM_CUT   = 0.80

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

  // ── GENERATE CORRECTED INVOICE PDF ───────────────────────
  function generateCorrectedPDF(load, data, newNetPay) {
    const base_pay     = parseFloat(data.base_pay)  || 0
    const detention    = parseFloat(data.detention)  || 0
    const pallets      = parseFloat(data.pallets)    || 0
    const lumperTotal  = data.lumpers.reduce((s,i)     => s + (parseFloat(i.amount)||0), 0)
    const incTotal     = data.incidentals.reduce((s,i) => s + (parseFloat(i.amount)||0), 0)
    const comdataTotal = data.comdatas.reduce((s,i)    => s + (parseFloat(i.amount)||0), 0)
    const subtotal     = base_pay + lumperTotal + incTotal + detention + pallets

    const fmtN = n => '$' + (parseFloat(n)||0).toFixed(2)

    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const W   = 612
    const M   = 40
    let   y   = 0

    // ── HEADER ──
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Edgerton Truck & Trailer Repair', W / 2, 50, { align: 'center' })
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.5)
    doc.line(M, 58, W - M, 58)
    y = 75

    // ── CORRECTED INVOICE BADGE ──
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(180, 0, 0)
    doc.text('** CORRECTED INVOICE **', W / 2, y, { align: 'center' })
    y += 14

    // ── ADDRESS BLOCK ──
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Bruce Edgerton', M, y)
    doc.setFont('helvetica', 'normal')
    doc.text('N4202 Hill Rd - Bonduel WI 54107', M, y + 12)
    doc.text('MC#699644', M, y + 24)
    doc.text('bruce.edgerton@yahoo.com - 715-509-0114', M, y + 36)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('DATE SENT', W - M, y, { align: 'right' })
    doc.setDrawColor(180, 180, 180)
    doc.line(W - 160, y + 3, W - M, y + 3)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(new Date().toLocaleDateString('en-US'), W - M, y + 16, { align: 'right' })

    y += 60
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 14

    // ── BILL TO / LOAD # ──
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('BILL TO', M, y)
    doc.text('LOAD #', W / 2, y)
    y += 12
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    const brokerLines = doc.splitTextToSize(load.broker_name || '-', 220)
    doc.text(brokerLines, M, y)
    doc.text(load.load_number || '-', W / 2, y)
    y += brokerLines.length * 14 + 6
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 14

    // ── ORIGIN / DESTINATION ──
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('PICK UP LOCATION', M, y)
    doc.text('DELIVERY LOCATION', W / 2, y)
    y += 12
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    const originLines = doc.splitTextToSize(load.origin      || '-', 220)
    const destLines   = doc.splitTextToSize(load.destination || '-', 220)
    doc.text(originLines, M, y)
    doc.text(destLines,   W / 2, y)
    y += Math.max(originLines.length, destLines.length) * 14 + 6
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 14

    // ── DELIVERY DATE ──
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('DELIVERY DATE', M, y)
    y += 12
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(load.delivery_date || '-', M, y)
    y += 20
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 18

    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(80, 80, 80)
    doc.text('Please remit payment amount for transport services', M, y)
    y += 20

    // ── LINE ITEMS ──
    function lineItem(label, amount, bold, red) {
      doc.setFontSize(10)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(red ? 180 : 0, 0, 0)
      doc.text(label, M, y)
      doc.text(amount, W - M, y, { align: 'right' })
      y += 18
    }

    lineItem('Trucking Rate', fmtN(base_pay), false, false)
    data.lumpers.forEach((l,i)     => lineItem('Lumper Receipt ' + (i+1), fmtN(parseFloat(l.amount)), false, false))
    data.incidentals.forEach((l,i) => lineItem('Incidental ' + (i+1),     fmtN(parseFloat(l.amount)), false, false))
    if (detention > 0) lineItem('Detention', fmtN(detention), false, false)
    if (pallets   > 0) lineItem('Pallets',   fmtN(pallets),   false, false)

    // ── SUBTOTAL ──
    y += 4
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(1)
    doc.line(M, y, W - M, y)
    y += 14
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('SUBTOTAL', M, y)
    doc.text(fmtN(subtotal), W - M, y, { align: 'right' })
    y += 20
    doc.setLineWidth(0.5)
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 14

    // ── COMDATAS ──
    data.comdatas.forEach((c,i) => {
      lineItem('Comdata / Express Code ' + (i+1), '-' + fmtN(parseFloat(c.amount)), false, true)
    })

    // ── NET TOTAL BAR ──
    y += 8
    doc.setFillColor(30, 30, 30)
    doc.rect(M, y, W - M * 2, 28, 'F')
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('NET BILLABLE TOTAL', M + 10, y + 19)
    doc.text(fmtN(newNetPay), W - M - 10, y + 19, { align: 'right' })
    y += 48

    // ── NOTES ──
    if (data.notes) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(80, 80, 80)
      const noteLines = doc.splitTextToSize(data.notes, W - M * 2)
      doc.text(noteLines, M, y)
      y += noteLines.length * 12 + 10
    }

    // ── CORRECTED NOTICE ──
    y += 10
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(150, 0, 0)
    doc.text('This is a corrected invoice superseding the original. Please discard any previous version.', M, y)
    y += 20

    // ── SIGNATURE ──
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text('Thank You', W - M, y, { align: 'right' })
    y += 20
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bolditalic')
    doc.setTextColor(0, 0, 0)
    doc.text('Bruce Edgerton', W - M, y, { align: 'right' })

    // ── FOOTER ──
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(160, 160, 160)
    doc.text('dbappsystems.com | daddyboyapps.com', W / 2, 760, { align: 'center' })

    doc.save('Edgerton-CORRECTED-Invoice-' + (load.load_number || 'draft') + '.pdf')
  }

  // ── SAVE EDIT + GENERATE CORRECTED PDF ──────────────────
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
    generateCorrectedPDF(load, editData, newNetPay)
    showToast('✅ Corrected invoice downloaded!')
    closeEdit()
  }

  // ── HELPERS ──────────────────────────────────────────────
  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  function loadDate(load) { return load.created_at || load.date || null }

  function invoiceHref(load) {
    if (!load.invoice_url) return null
    if (load.invoice_url.startsWith('http')) return load.invoice_url
    return api + load.invoice_url
  }

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

  function inPeriod(load, p) {
    const dateStr = loadDate(load)
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
    const inRange = dLoads.filter(l => inPeriod(l, p))
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
            color:       view === v ? 'var(--navy)'  : 'var(--grey)',
          }}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>

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

          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>
            {periodLabel[period]} - PER DRIVER REPORT
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE {leader==='BRUCE'?'👑':''}</div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{bruceStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.billed - bruceStats.paid)}</span></div>
            <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
              <div className="amount-row"><span className="label">Owner Cut (20%)</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.ownerCut)}</span></div>
            </div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM {leader==='TIM'?'👑':''}</div>
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

          <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>COMBINED {periodLabel[period]}</div>
            <div className="amount-row"><span className="label">Total Loads</span><span className="value">{bruceStats.count + timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed + timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid + timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt((bruceStats.billed + timStats.billed) - (bruceStats.paid + timStats.paid))}</span></div>
          </div>
        </div>
      )}

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
            const dateStr   = loadDate(load)
            const invHref   = invoiceHref(load)

            return (
              <div className="load-card" key={idx} style={{ flexDirection:'column', alignItems:'stretch' }}>

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
                      {dateStr ? new Date(dateStr).toLocaleDateString() : '-'}
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
                    <span className={'status-chip ' + load.status}>{load.status}</span>
                    {bolCount > 0 && (
                      <div style={{ fontSize:10, color:'var(--grey)', marginTop:6 }}>
                        {bolCount} BOL{bolCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>

                {invHref && (
                  <a href={invHref} target="_blank" rel="noopener noreferrer" style={{
                    display:'block', marginTop:10, padding:'9px 0', borderRadius:8,
                    background:'var(--navy3)', border:'1px solid var(--border)',
                    color:'var(--amber)', fontFamily:'var(--font-head)', fontWeight:700,
                    fontSize:13, textAlign:'center', textDecoration:'none', letterSpacing:'0.05em',
                  }}>
                    VIEW INVOICE PDF
                  </a>
                )}

                <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                  {load.status !== 'billed' && load.status !== 'paid' && (
                    <button className="scan-btn secondary" style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                      disabled={updating === loadId}
                      onClick={() => patchLoad(load, localIdx, { status:'billed' })}>
                      {updating === loadId ? '...' : 'MARK BILLED'}
                    </button>
                  )}
                  {load.status !== 'paid' && (
                    <button className="scan-btn success" style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                      disabled={updating === loadId}
                      onClick={() => patchLoad(load, localIdx, { status:'paid' })}>
                      {updating === loadId ? '...' : 'MARK PAID'}
                    </button>
                  )}
                  {load.status === 'paid' && (
                    <div style={{ fontSize:13, color:'var(--green)', fontFamily:'var(--font-head)', fontWeight:700, paddingTop:4 }}>
                      PAYMENT RECEIVED
                    </div>
                  )}
                  <button style={{
                    padding:'8px 12px', borderRadius:8, border:'1px solid var(--amber)',
                    background: isEditing ? 'var(--amber)' : 'transparent',
                    color: isEditing ? 'var(--navy)' : 'var(--amber)',
                    fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                  }} onClick={() => openEdit(load, localIdx)}>
                    {isEditing ? 'CLOSE' : 'EDIT'}
                  </button>
                  <button style={{
                    padding:'8px 12px', borderRadius:8, border:'1px solid #555',
                    background:'transparent', color:'#888', fontSize:13,
                    fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                  }} onClick={() => setConfirmDelete(localIdx)}>
                    DELETE
                  </button>
                </div>

                {confirmDelete === localIdx && (
                  <div style={{ marginTop:12, padding:12, background:'var(--navy3)', borderRadius:8, border:'1px solid #e53935' }}>
                    <div style={{ fontSize:13, color:'var(--white)', marginBottom:10, fontFamily:'var(--font-head)' }}>
                      DELETE THIS LOAD? This cannot be undone.
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button disabled={deleting} onClick={() => deleteLoad(load, localIdx)} style={{
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

                {isEditing && editData && (
                  <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>

                    <div style={{ fontFamily:'var(--font-head)', fontSize:12, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>
                      EDIT INVOICE AMOUNTS
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>BASE PAY ($)</div>
                      <input style={inputStyle} type="number" inputMode="decimal" value={editData.base_pay}
                        onChange={e => setEditData(p => ({ ...p, base_pay: e.target.value }))} placeholder="0.00" />
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>DETENTION ($)</div>
                        <input style={inputStyle} type="number" inputMode="decimal" value={editData.detention}
                          onChange={e => setEditData(p => ({ ...p, detention: e.target.value }))} placeholder="0.00" />
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>PALLETS ($)</div>
                        <input style={inputStyle} type="number" inputMode="decimal" value={editData.pallets}
                          onChange={e => setEditData(p => ({ ...p, pallets: e.target.value }))} placeholder="0.00" />
                      </div>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:6, fontFamily:'var(--font-head)' }}>LUMPER RECEIPTS</div>
                      {editData.lumpers.map((item, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <div style={{ fontSize:12, color:'var(--grey)', minWidth:70 }}>Lumper {i+1}</div>
                          <input style={{ ...inputStyle, flex:1 }} type="number" inputMode="decimal"
                            value={item.amount} onChange={e => updateItemAmount('lumpers', i, e.target.value)} placeholder="0.00" />
                          <button onClick={() => removeEditItem('lumpers', i)} style={{ background:'transparent', border:'1px solid #555', color:'#888', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
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
                          <button onClick={() => removeEditItem('incidentals', i)} style={{ background:'transparent', border:'1px solid #555', color:'#888', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
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
                          <button onClick={() => removeEditItem('comdatas', i)} style={{ background:'transparent', border:'1px solid #555', color:'#888', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                        </div>
                      ))}
                      <button className="scan-btn danger" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }}
                        onClick={() => addEditItem('comdatas')}>+ ADD COMDATA / EXPRESS CODE</button>
                    </div>

                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4, fontFamily:'var(--font-head)' }}>NOTES</div>
                      <textarea value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Notes..." style={{ ...inputStyle, minHeight:60, resize:'vertical' }} />
                    </div>

                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      background:'var(--navy3)', borderRadius:8, padding:'10px 14px', marginBottom:14, border:'1px solid var(--border)' }}>
                      <span style={{ fontFamily:'var(--font-head)', fontSize:12, color:'var(--grey)' }}>UPDATED NET TOTAL</span>
                      <span style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color: editNetPreview() >= 0 ? 'var(--amber)' : 'var(--red)' }}>
                        {fmt(editNetPreview())}
                      </span>
                    </div>

                    <div style={{ fontSize:11, color:'var(--grey)', textAlign:'center', marginBottom:10 }}>
                      Saving will update the app and download a corrected invoice PDF.
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <button className="scan-btn secondary" style={{ padding:'10px', fontSize:13 }} onClick={closeEdit}>CANCEL</button>
                      <button className="scan-btn success" style={{ padding:'10px', fontSize:13 }} onClick={() => saveEdit(load, localIdx)}>
                        SAVE + DOWNLOAD
                      </button>
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
