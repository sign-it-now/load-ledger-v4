// src/Invoice.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useRef } from 'react'
import { jsPDF } from 'jspdf'

export default function Invoice({ load, setLoad, driver, api, showToast, loads, setLoads, resetLoad }) {
  const [scanning, setScanning] = useState(null) // 'lumper'|'incidental'|'comdata'
  const fileRef = useRef()
  const scanMode = useRef(null)

  const base_pay     = parseFloat(load.base_pay)     || 0
  const detention    = parseFloat(load.detention)    || 0
  const pallets      = parseFloat(load.pallets)      || 0
  const lumperTotal  = load.lumpers.reduce((s,i)    => s + parseFloat(i.amount||0), 0)
  const incTotal     = load.incidentals.reduce((s,i)=> s + parseFloat(i.amount||0), 0)
  const comdataTotal = load.comdatas.reduce((s,i)   => s + parseFloat(i.amount||0), 0)
  const subtotal     = base_pay + lumperTotal + incTotal + detention + pallets
  const netPay       = subtotal - comdataTotal

  function fmt(n) { return '$' + n.toFixed(2) }

  function openScanner(mode) {
    scanMode.current = mode
    fileRef.current.click()
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const mode = scanMode.current
    setScanning(mode)
    showToast('📡 Scanning receipt...')
    try {
      const base64    = await toBase64(file)
      const mediaType = file.type
      const res       = await fetch(`${api}/api/ocr`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType, mode }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const data   = JSON.parse(json.result)
      const amount = data.amount || '0.00'
      const item   = { amount, label: file.name }
      if (mode === 'lumper')     setLoad(p => ({ ...p, lumpers:     [...p.lumpers,     item] }))
      if (mode === 'incidental') setLoad(p => ({ ...p, incidentals: [...p.incidentals, item] }))
      if (mode === 'express')    setLoad(p => ({ ...p, comdatas:    [...p.comdatas,    item] }))
      showToast('✅ Receipt scanned!')
    } catch (err) {
      showToast('❌ Scan failed — add amount manually')
      console.error(err)
    } finally {
      setScanning(null)
      e.target.value = ''
    }
  }

  function removeItem(type, idx) {
    setLoad(p => ({ ...p, [type]: p[type].filter((_,i) => i !== idx) }))
  }

  function addManual(type) {
    const amount = prompt('Enter amount (numbers only):')
    if (!amount) return
    const item = { amount: parseFloat(amount).toFixed(2), label: 'Manual entry' }
    if (type === 'lumper')     setLoad(p => ({ ...p, lumpers:     [...p.lumpers,     item] }))
    if (type === 'incidental') setLoad(p => ({ ...p, incidentals: [...p.incidentals, item] }))
    if (type === 'comdata')    setLoad(p => ({ ...p, comdatas:    [...p.comdatas,    item] }))
  }

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload  = () => res(r.result.split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }

  function generatePDF() {
    const doc  = new jsPDF({ unit:'pt', format:'letter' })
    const W    = 612
    const navy = [10, 22, 40]
    const amber= [232, 160, 32]
    const grey = [139, 160, 184]
    let   y    = 0

    // Header background
    doc.setFillColor(...navy)
    doc.rect(0, 0, W, 90, 'F')

    // Logo
    doc.setFont('helvetica','bold')
    doc.setFontSize(28)
    doc.setTextColor(255,255,255)
    doc.text('LOAD LEDGER', 40, 40)
    doc.setFontSize(11)
    doc.setTextColor(...amber)
    doc.text('EDGERTON TRANSPORTATION — INVOICE', 40, 58)
    doc.setTextColor(...grey)
    doc.text(`Driver: ${driver}   |   Date: ${new Date().toLocaleDateString()}`, 40, 74)

    // Invoice number top right
    doc.setFontSize(11)
    doc.setTextColor(255,255,255)
    doc.text(`Load #: ${load.load_number || '—'}`, W - 40, 50, { align:'right' })
    doc.text(`Broker: ${load.broker_name || '—'}`, W - 40, 66, { align:'right' })

    y = 110
    // Load details box
    doc.setFillColor(15,31,61)
    doc.roundedRect(30, y, W-60, 80, 6, 6, 'F')
    doc.setFontSize(10)
    doc.setTextColor(...grey)
    doc.text('ORIGIN', 50, y+20)
    doc.text('DESTINATION', 220, y+20)
    doc.text('PICKUP', 390, y+20)
    doc.text('DELIVERY', 500, y+20)
    doc.setFontSize(12)
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold')
    doc.text(load.origin      || '—', 50,  y+40)
    doc.text(load.destination || '—', 220, y+40)
    doc.text(load.pickup_date   || '—', 390, y+40)
    doc.text(load.delivery_date || '—', 500, y+40)

    y = 210
    // Billing rows
    function row(label, amount, color) {
      doc.setFont('helvetica','normal')
      doc.setFontSize(12)
      doc.setTextColor(...(color || [255,255,255]))
      doc.text(label, 50, y)
      doc.text(amount, W-40, y, { align:'right' })
      doc.setDrawColor(30, 58, 92)
      doc.line(30, y+8, W-30, y+8)
      y += 30
    }

    doc.setFont('helvetica','bold')
    doc.setFontSize(11)
    doc.setTextColor(...amber)
    doc.text('BILLING BREAKDOWN', 50, y)
    y += 20

    row('Trucking Rate', fmt(base_pay))
    load.lumpers.forEach((l,i)     => row(`  Lumper Receipt ${i+1}`, fmt(parseFloat(l.amount))))
    load.incidentals.forEach((l,i) => row(`  Incidental ${i+1}`, fmt(parseFloat(l.amount))))
    if (detention > 0) row('Detention', fmt(detention))
    if (pallets   > 0) row('Pallets',   fmt(pallets))

    // Subtotal
    doc.setFillColor(15,31,61)
    doc.rect(30, y-6, W-60, 28, 'F')
    doc.setFont('helvetica','bold')
    doc.setFontSize(12)
    doc.setTextColor(255,255,255)
    doc.text('SUBTOTAL', 50, y+12)
    doc.text(fmt(subtotal), W-40, y+12, { align:'right' })
    y += 40

    load.comdatas.forEach((c,i)    => row(`  Comdata / Express Code ${i+1}`, `−${fmt(parseFloat(c.amount))}`, [239,68,68]))

    // Net total
    y += 8
    doc.setFillColor(...amber)
    doc.roundedRect(30, y, W-60, 50, 6, 6, 'F')
    doc.setFont('helvetica','bold')
    doc.setFontSize(16)
    doc.setTextColor(...navy)
    doc.text('NET BILLABLE TOTAL', 50, y+32)
    doc.text(fmt(netPay), W-40, y+32, { align:'right' })

    y += 80
    // Formula box
    doc.setFillColor(15,31,61)
    doc.roundedRect(30, y, W-60, 90, 6, 6, 'F')
    doc.setFont('helvetica','normal')
    doc.setFontSize(10)
    doc.setTextColor(...grey)
    doc.text('FORMULA: Trucking Rate + Lumpers + Incidentals + Detention + Pallets − Comdata/Express Codes = NET BILLABLE', 50, y+20, { maxWidth: W-100 })

    // Footer
    doc.setFontSize(9)
    doc.setTextColor(...grey)
    doc.text('© dbappsystems.com | daddyboyapps.com', W/2, 760, { align:'center' })

    doc.save(`ETTR-Invoice-${load.load_number || 'draft'}-${driver}.pdf`)
    showToast('✅ Invoice downloaded!')

    // Save load to history
    const saved = { ...load, status:'invoiced', driver, netPay, date: new Date().toISOString() }
    setLoads(prev => [saved, ...prev])
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}} onChange={handleFile} />

      {/* LOAD SUMMARY */}
      <div className="card">
        <div className="section-title">Load Summary</div>
        <div className="amount-row">
          <span className="label">Broker</span>
          <span className="value">{load.broker_name || '—'}</span>
        </div>
        <div className="amount-row">
          <span className="label">Load #</span>
          <span className="value">{load.load_number || '—'}</span>
        </div>
        <div className="amount-row">
          <span className="label">Route</span>
          <span className="value" style={{fontSize:13}}>{load.origin || '—'} → {load.destination || '—'}</span>
        </div>
        <div className="amount-row">
          <span className="label">Base Pay</span>
          <span className="value">{fmt(base_pay)}</span>
        </div>
      </div>

      {/* LUMPERS */}
      <div className="card">
        <div className="section-title">Lumper Receipts</div>
        {load.lumpers.map((l,i) => (
          <div className="scanned-item" key={i}>
            <div>
              <div className="item-label">Lumper {i+1}</div>
              <div className="item-amount">{fmt(parseFloat(l.amount))}</div>
            </div>
            <button className="remove-btn" onClick={()=>removeItem('lumpers',i)}>✕</button>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <button className="scan-btn secondary" onClick={()=>openScanner('lumper')} disabled={scanning==='lumper'}>
            {scanning==='lumper' ? '⏳ Scanning...' : '📷 Scan Lumper'}
          </button>
          <button className="scan-btn secondary" onClick={()=>addManual('lumper')}>
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* INCIDENTALS */}
      <div className="card">
        <div className="section-title">Incidentals</div>
        {load.incidentals.map((l,i) => (
          <div className="scanned-item" key={i}>
            <div>
              <div className="item-label">Incidental {i+1}</div>
              <div className="item-amount">{fmt(parseFloat(l.amount))}</div>
            </div>
            <button className="remove-btn" onClick={()=>removeItem('incidentals',i)}>✕</button>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <button className="scan-btn secondary" onClick={()=>openScanner('incidental')} disabled={scanning==='incidental'}>
            {scanning==='incidental' ? '⏳ Scanning...' : '📷 Scan Incidental'}
          </button>
          <button className="scan-btn secondary" onClick={()=>addManual('incidental')}>
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* DETENTION & PALLETS */}
      <div className="card">
        <div className="section-title">Detention & Pallets</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="field-row">
            <div className="field-label">Detention ($)</div>
            <input value={load.detention} onChange={e=>setLoad(p=>({...p,detention:e.target.value}))} placeholder="0.00" type="number" inputMode="decimal" />
          </div>
          <div className="field-row">
            <div className="field-label">Pallets ($)</div>
            <input value={load.pallets} onChange={e=>setLoad(p=>({...p,pallets:e.target.value}))} placeholder="0.00" type="number" inputMode="decimal" />
          </div>
        </div>
      </div>

      {/* COMDATA */}
      <div className="card">
        <div className="section-title">Comdata / Express Codes</div>
        {load.comdatas.map((l,i) => (
          <div className="scanned-item" key={i}>
            <div>
              <div className="item-label">Comdata {i+1}</div>
              <div className="item-amount red">−{fmt(parseFloat(l.amount))}</div>
            </div>
            <button className="remove-btn" onClick={()=>removeItem('comdatas',i)}>✕</button>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <button className="scan-btn danger" onClick={()=>openScanner('express')} disabled={scanning==='express'}>
            {scanning==='express' ? '⏳ Scanning...' : '📷 Scan Comdata'}
          </button>
          <button className="scan-btn danger" onClick={()=>addManual('comdata')}>
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* BILLING SUMMARY */}
      <div className="card">
        <div className="section-title">💰 Billing Summary</div>
        <div className="amount-row"><span className="label">Trucking Rate</span><span className="value">{fmt(base_pay)}</span></div>
        <div className="amount-row"><span className="label">Lumper Fees</span><span className="value">{fmt(lumperTotal)}</span></div>
        <div className="amount-row"><span className="label">Incidentals</span><span className="value">{fmt(incTotal)}</span></div>
        <div className="amount-row"><span className="label">Detention</span><span className="value">{fmt(detention)}</span></div>
        <div className="amount-row"><span className="label">Pallets</span><span className="value">{fmt(pallets)}</span></div>
        <div className="amount-row"><span className="label">Subtotal</span><span className="value">{fmt(subtotal)}</span></div>
        <div className="amount-row"><span className="label">Comdata / Express Codes</span><span className="value red">−{fmt(comdataTotal)}</span></div>
        <div className="net-total" style={{marginTop:12}}>
          <span className="label">NET BILLABLE TOTAL</span>
          <span className="value">{fmt(netPay)}</span>
        </div>
      </div>

      {/* GENERATE INVOICE */}
      <button className="scan-btn success" onClick={generatePDF} style={{marginBottom:8}}>
        ⬇️ DOWNLOAD INVOICE PDF
      </button>
      <button className="scan-btn secondary" onClick={resetLoad}>
        + START NEW LOAD
      </button>

    </div>
  )
}
