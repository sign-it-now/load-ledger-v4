// src/Invoice.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useRef } from 'react'
import { jsPDF } from 'jspdf'

const MAX_BOLS = 50

export default function Invoice({ load, setLoad, driver, api, showToast, loads, setLoads, resetLoad }) {
  const [scanning, setScanning]     = useState(null)
  const [bolLoading, setBolLoading] = useState(false)
  const fileRef  = useRef()
  const bolRef   = useRef()
  const scanMode = useRef(null)

  const base_pay     = parseFloat(load.base_pay)     || 0
  const detention    = parseFloat(load.detention)    || 0
  const pallets      = parseFloat(load.pallets)      || 0
  const lumperTotal  = load.lumpers.reduce((s,i)     => s + parseFloat(i.amount||0), 0)
  const incTotal     = load.incidentals.reduce((s,i) => s + parseFloat(i.amount||0), 0)
  const comdataTotal = load.comdatas.reduce((s,i)    => s + parseFloat(i.amount||0), 0)
  const subtotal     = base_pay + lumperTotal + incTotal + detention + pallets
  const netPay       = subtotal - comdataTotal

  function fmt(n) { return '$' + n.toFixed(2) }

  function openScanner(mode) {
    scanMode.current = mode
    fileRef.current.click()
  }

  // ── FULL ADOBE-QUALITY SCANNER PIPELINE ─────────────────
  // 1. Grayscale  2. Auto-levels  3. Gaussian blur
  // 4. Bradley-Roth adaptive threshold  5. Unsharp mask
  // Returns { dataUrl, w, h }
  function processImageBW(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = (ev) => {
        const img = new Image()
        img.onerror = reject
        img.onload = () => {
          try {
            const MAX = 2400
            let w = img.naturalWidth  || img.width
            let h = img.naturalHeight || img.height
            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
            if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }

            const canvas = document.createElement('canvas')
            canvas.width  = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, w, h)

            const id   = ctx.getImageData(0, 0, w, h)
            const data = id.data

            // STEP 1 — Grayscale (luminance weighted)
            const gray = new Uint8ClampedArray(w * h)
            for (let i = 0; i < gray.length; i++) {
              const p = i * 4
              gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p+1] + 0.114 * data[p+2])
            }

            // STEP 2 — Auto-levels (histogram stretch)
            let mn = 255, mx = 0
            for (let i = 0; i < gray.length; i++) {
              if (gray[i] < mn) mn = gray[i]
              if (gray[i] > mx) mx = gray[i]
            }
            const range = mx - mn || 1
            for (let i = 0; i < gray.length; i++) {
              gray[i] = Math.round(((gray[i] - mn) / range) * 255)
            }

            // STEP 3 — Gaussian blur 3x3 (noise reduction)
            const kernel  = [1,2,1, 2,4,2, 1,2,1]
            const kSum    = 16
            const blurred = new Uint8ClampedArray(w * h)
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                let sum = 0, ki = 0
                for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                    const nx = Math.min(Math.max(x + kx, 0), w - 1)
                    const ny = Math.min(Math.max(y + ky, 0), h - 1)
                    sum += gray[ny * w + nx] * kernel[ki++]
                  }
                }
                blurred[y * w + x] = Math.round(sum / kSum)
              }
            }

            // STEP 4 — Bradley-Roth adaptive thresholding
            // Handles shadows and uneven lighting — CamScanner quality
            const S     = Math.floor(Math.max(w, h) / 16)
            const T     = 0.15
            const integ = new Int32Array(w * h)
            for (let y = 0; y < h; y++) {
              let rowSum = 0
              for (let x = 0; x < w; x++) {
                rowSum += blurred[y * w + x]
                integ[y * w + x] = rowSum + (y > 0 ? integ[(y-1)*w+x] : 0)
              }
            }
            const bw = new Uint8ClampedArray(w * h)
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const x1    = Math.max(x - S, 0)
                const y1    = Math.max(y - S, 0)
                const x2    = Math.min(x + S, w - 1)
                const y2    = Math.min(y + S, h - 1)
                const count = (x2 - x1) * (y2 - y1)
                const sum   = integ[y2*w+x2]
                            - (x1 > 0 ? integ[y2*w+(x1-1)] : 0)
                            - (y1 > 0 ? integ[(y1-1)*w+x2] : 0)
                            + (x1 > 0 && y1 > 0 ? integ[(y1-1)*w+(x1-1)] : 0)
                bw[y * w + x] = (blurred[y*w+x] * count) < (sum * (1 - T)) ? 0 : 255
              }
            }

            // STEP 5 — Unsharp mask (razor sharp text edges)
            const sharp  = new Uint8ClampedArray(w * h)
            const amount = 1.5
            for (let i = 0; i < bw.length; i++) {
              sharp[i] = Math.min(255, Math.max(0, Math.round(bw[i] + amount * (bw[i] - blurred[i]))))
            }

            // Write final B&W pixels back to canvas
            for (let i = 0; i < sharp.length; i++) {
              const p = i * 4
              data[p] = data[p+1] = data[p+2] = sharp[i]
              data[p+3] = 255
            }
            ctx.putImageData(id, 0, 0)

            resolve({
              dataUrl: canvas.toDataURL('image/jpeg', 0.92),
              name: file.name,
              w,
              h,
            })
          } catch (err) { reject(err) }
        }
        img.src = ev.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  // ── BOL UPLOAD HANDLER ───────────────────────────────────
  async function handleBOL(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const remaining = MAX_BOLS - load.bols.length
    if (remaining <= 0) { showToast('Max 50 BOLs reached'); return }
    const toProcess = files.slice(0, remaining)
    setBolLoading(true)
    showToast('📷 Processing BOL scans...')
    try {
      const processed = await Promise.all(toProcess.map(f => processImageBW(f)))
      setLoad(p => ({ ...p, bols: [...p.bols, ...processed] }))
      showToast(`✅ ${processed.length} BOL(s) added`)
    } catch (err) {
      showToast('❌ BOL scan failed')
      console.error(err)
    } finally {
      setBolLoading(false)
      e.target.value = ''
    }
  }

  function removeBOL(idx) {
    setLoad(p => ({ ...p, bols: p.bols.filter((_,i) => i !== idx) }))
  }

  // ── RECEIPT SCANNER — B&W scan + OCR amount ─────────────
  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const mode = scanMode.current
    setScanning(mode)
    showToast('📡 Scanning receipt...')
    try {
      // Run full B&W pipeline — same as BOL
      const scanned = await processImageBW(file)

      // OCR for dollar amount
      const base64    = await toBase64(file)
      const mediaType = file.type || 'image/jpeg'
      const res = await fetch(`${api}/api/ocr`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType, mode }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.detail || json.error)

      let raw = json.result || ''
      raw = raw.replace(/```json/gi,'').replace(/```/gi,'').trim()
      const start = raw.indexOf('{')
      const end   = raw.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No data found')

      const parsed = JSON.parse(raw.substring(start, end + 1))
      const amount = parsed.amount || '0.00'

      // Store amount + full B&W scan together
      const item = {
        amount,
        label:  file.name,
        dataUrl: scanned.dataUrl,
        w:       scanned.w,
        h:       scanned.h,
      }

      if (mode === 'lumper')     setLoad(p => ({ ...p, lumpers:     [...p.lumpers,     item] }))
      if (mode === 'incidental') setLoad(p => ({ ...p, incidentals: [...p.incidentals, item] }))
      if (mode === 'express')    setLoad(p => ({ ...p, comdatas:    [...p.comdatas,    item] }))
      showToast('✅ Receipt scanned! $' + amount)
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
    const item = { amount: parseFloat(amount).toFixed(2), label: 'Manual entry', dataUrl: null, w: 0, h: 0 }
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

  // ── ADD SCANNED PAGE TO PDF ──────────────────────────────
  function addScanPage(doc, item, label) {
    if (!item.dataUrl || !item.w || !item.h) return
    doc.addPage()
    const pageW = 612
    const pageH = 792
    const ratio = Math.min((pageW - 40) / item.w, (pageH - 60) / item.h)
    const imgW  = Math.round(item.w * ratio)
    const imgH  = Math.round(item.h * ratio)
    const x     = Math.round((pageW - imgW) / 2)
    const yPos  = Math.round((pageH - imgH) / 2)
    doc.addImage(item.dataUrl, 'JPEG', x, yPos, imgW, imgH)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(160, 160, 160)
    doc.text(label, pageW / 2, 787, { align: 'center' })
  }

  // ── GENERATE PDF ─────────────────────────────────────────
  function generatePDF() {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const W   = 612
    const M   = 40
    let   y   = 0

    // -- HEADER
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Edgerton Truck & Trailer Repair', W / 2, 50, { align: 'center' })
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.5)
    doc.line(M, 58, W - M, 58)
    y = 75

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Bruce Edgerton', M, y)
    doc.setFont('helvetica', 'normal')
    doc.text('N4202 Hill Rd · Bonduel WI 54107', M, y + 12)
    doc.text('MC#699644', M, y + 24)
    doc.text('bruce.edgerton@yahoo.com · 715-509-0114', M, y + 36)

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

    // -- BILL TO + LOAD #
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

    // -- PICKUP / DELIVERY
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
    const locHeight = Math.max(originLines.length, destLines.length) * 14
    y += locHeight + 6
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 14

    // -- DELIVERY DATE
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

    // -- MEMO
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(80, 80, 80)
    doc.text('Please remit payment amount for transport services', M, y)
    y += 20

    // -- LINE ITEMS
    function lineItem(label, amount, bold, red) {
      doc.setFontSize(10)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(red ? 180 : 0, 0, 0)
      doc.text(label, M, y)
      doc.text(amount, W - M, y, { align: 'right' })
      y += 18
    }

    lineItem('Trucking Rate', fmt(base_pay), false, false)
    load.lumpers.forEach((l,i)    => lineItem(`Lumper Receipt ${i+1}`, fmt(parseFloat(l.amount)), false, false))
    load.incidentals.forEach((l,i)=> lineItem(`Incidental ${i+1}`,     fmt(parseFloat(l.amount)), false, false))
    if (detention > 0) lineItem('Detention', fmt(detention), false, false)
    if (pallets   > 0) lineItem('Pallets',   fmt(pallets),   false, false)

    y += 4
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(1)
    doc.line(M, y, W - M, y)
    y += 14

    // -- SUBTOTAL
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('SUBTOTAL', M, y)
    doc.text(fmt(subtotal), W - M, y, { align: 'right' })
    y += 20
    doc.setLineWidth(0.5)
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y)
    y += 14

    // -- COMDATA DEDUCTIONS
    load.comdatas.forEach((c,i) => {
      lineItem(`Comdata / Express Code ${i+1}`, `-${fmt(parseFloat(c.amount))}`, false, true)
    })

    y += 8

    // -- NET BILLABLE TOTAL
    doc.setFillColor(30, 30, 30)
    doc.rect(M, y, W - M * 2, 28, 'F')
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('NET BILLABLE TOTAL', M + 10, y + 19)
    doc.text(fmt(netPay), W - M - 10, y + 19, { align: 'right' })
    y += 48

    // -- NOTES
    if (load.notes) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(80, 80, 80)
      const noteLines = doc.splitTextToSize(load.notes, W - M * 2)
      doc.text(noteLines, M, y)
      y += noteLines.length * 12 + 10
    }

    // -- ATTACHMENT SUMMARY on invoice page
    const bolCount     = load.bols.length
    const lumperScans  = load.lumpers.filter(l => l.dataUrl && l.w && l.h)
    const incScans     = load.incidentals.filter(l => l.dataUrl && l.w && l.h)
    const comdataScans = load.comdatas.filter(l => l.dataUrl && l.w && l.h)
    const totalAttach  = bolCount + lumperScans.length + incScans.length + comdataScans.length

    if (totalAttach > 0) {
      y += 10
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      const parts = []
      if (bolCount            > 0) parts.push(`${bolCount} BOL(s)`)
      if (lumperScans.length  > 0) parts.push(`${lumperScans.length} Lumper receipt(s)`)
      if (incScans.length     > 0) parts.push(`${incScans.length} Incidental receipt(s)`)
      if (comdataScans.length > 0) parts.push(`${comdataScans.length} Comdata receipt(s)`)
      doc.text(`Attached: ${parts.join(', ')} — see following pages`, M, y)
      y += 20
    }

    // -- SIGNATURE
    y += 10
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text('Thank You', W - M, y, { align: 'right' })
    y += 20
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bolditalic')
    doc.setTextColor(0, 0, 0)
    doc.text('Bruce Edgerton', W - M, y, { align: 'right' })

    // -- FOOTER
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(160, 160, 160)
    doc.text('dbappsystems.com | daddyboyapps.com', W / 2, 760, { align: 'center' })

    // ── ATTACHED SCAN PAGES ──────────────────────────────
    load.bols.forEach((bol, i) => {
      addScanPage(doc, bol, `BOL ${i+1} of ${bolCount} — ${bol.name}`)
    })
    lumperScans.forEach((l, i) => {
      addScanPage(doc, l, `Lumper Receipt ${i+1} — $${parseFloat(l.amount).toFixed(2)} — ${l.label}`)
    })
    incScans.forEach((l, i) => {
      addScanPage(doc, l, `Incidental ${i+1} — $${parseFloat(l.amount).toFixed(2)} — ${l.label}`)
    })
    comdataScans.forEach((l, i) => {
      addScanPage(doc, l, `Comdata / Express Code ${i+1} — $${parseFloat(l.amount).toFixed(2)} — ${l.label}`)
    })

    doc.save(`Edgerton-Invoice-${load.load_number || 'draft'}-${driver}.pdf`)
    showToast('✅ Invoice + all receipts downloaded!')

    // ── Strip images before saving to localStorage ───────
    const { bols: _bols, ...loadData } = load
    const cleanLumpers     = load.lumpers.map(({ dataUrl, w, h, ...rest }) => rest)
    const cleanIncidentals = load.incidentals.map(({ dataUrl, w, h, ...rest }) => rest)
    const cleanComdatas    = load.comdatas.map(({ dataUrl, w, h, ...rest }) => rest)
    const saved = {
      ...loadData,
      lumpers:     cleanLumpers,
      incidentals: cleanIncidentals,
      comdatas:    cleanComdatas,
      status:      'invoiced',
      driver,
      netPay,
      date:        new Date().toISOString(),
    }
    setLoads(prev => [saved, ...prev])
  }

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}} onChange={handleFile} />
      <input ref={bolRef}  type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleBOL} />

      <div className="card">
        <div className="section-title">Load Summary</div>
        <div className="amount-row"><span className="label">Broker</span><span className="value">{load.broker_name || '—'}</span></div>
        <div className="amount-row"><span className="label">Load #</span><span className="value">{load.load_number || '—'}</span></div>
        <div className="amount-row"><span className="label">Route</span><span className="value" style={{fontSize:13}}>{load.origin || '—'} → {load.destination || '—'}</span></div>
        <div className="amount-row"><span className="label">Base Pay</span><span className="value">{fmt(base_pay)}</span></div>
      </div>

      {/* BOL SCANS */}
      <div className="card">
        <div className="section-title">
          📋 BOL Scans
          <span style={{fontSize:11,fontWeight:400,marginLeft:8,color:'var(--muted)'}}>
            {load.bols.length} / {MAX_BOLS}
          </span>
        </div>
        {load.bols.map((bol, i) => (
          <div className="scanned-item" key={i}>
            <img src={bol.dataUrl} alt={`BOL ${i+1}`}
              style={{width:48,height:48,objectFit:'cover',borderRadius:6,border:'1px solid var(--border)'}} />
            <div style={{flex:1,marginLeft:10}}>
              <div className="item-label">BOL {i+1}</div>
              <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{bol.name}</div>
            </div>
            <button className="remove-btn" onClick={()=>removeBOL(i)}>✕</button>
          </div>
        ))}
        {load.bols.length < MAX_BOLS && (
          <button className="scan-btn secondary" style={{marginTop:8,width:'100%'}}
            onClick={()=>bolRef.current.click()} disabled={bolLoading}>
            {bolLoading ? '⏳ Processing...' : '📷 Add BOL Photos — Camera · Photos · Files'}
          </button>
        )}
        {load.bols.length >= MAX_BOLS && (
          <div style={{textAlign:'center',color:'var(--muted)',fontSize:12,marginTop:8}}>Max 50 BOLs reached</div>
        )}
      </div>

      {/* LUMPER RECEIPTS */}
      <div className="card">
        <div className="section-title">Lumper Receipts</div>
        {load.lumpers.map((l,i) => (
          <div className="scanned-item" key={i}>
            {l.dataUrl && (
              <img src={l.dataUrl} alt={`Lumper ${i+1}`}
                style={{width:48,height:48,objectFit:'cover',borderRadius:6,border:'1px solid var(--border)'}} />
            )}
            <div style={{flex:1,marginLeft: l.dataUrl ? 10 : 0}}>
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
          <button className="scan-btn secondary" onClick={()=>addManual('lumper')}>✏️ Manual</button>
        </div>
      </div>

      {/* INCIDENTALS */}
      <div className="card">
        <div className="section-title">Incidentals</div>
        {load.incidentals.map((l,i) => (
          <div className="scanned-item" key={i}>
            {l.dataUrl && (
              <img src={l.dataUrl} alt={`Incidental ${i+1}`}
                style={{width:48,height:48,objectFit:'cover',borderRadius:6,border:'1px solid var(--border)'}} />
            )}
            <div style={{flex:1,marginLeft: l.dataUrl ? 10 : 0}}>
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
          <button className="scan-btn secondary" onClick={()=>addManual('incidental')}>✏️ Manual</button>
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
            {l.dataUrl && (
              <img src={l.dataUrl} alt={`Comdata ${i+1}`}
                style={{width:48,height:48,objectFit:'cover',borderRadius:6,border:'1px solid var(--border)'}} />
            )}
            <div style={{flex:1,marginLeft: l.dataUrl ? 10 : 0}}>
              <div className="item-label">Comdata {i+1}</div>
              <div className="item-amount red">-{fmt(parseFloat(l.amount))}</div>
            </div>
            <button className="remove-btn" onClick={()=>removeItem('comdatas',i)}>✕</button>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <button className="scan-btn danger" onClick={()=>openScanner('express')} disabled={scanning==='express'}>
            {scanning==='express' ? '⏳ Scanning...' : '📷 Scan Comdata'}
          </button>
          <button className="scan-btn danger" onClick={()=>addManual('comdata')}>✏️ Manual</button>
        </div>
      </div>

      {/* NOTES */}
      <div className="card">
        <div className="section-title">Notes</div>
        <textarea
          value={load.notes || ''}
          onChange={e=>setLoad(p=>({...p,notes:e.target.value}))}
          placeholder="Special instructions, reference numbers, commodity..."
          style={{width:'100%',minHeight:70,background:'var(--navy3)',border:'1px solid var(--border)',color:'var(--white)',borderRadius:8,padding:'10px 12px',fontSize:14,fontFamily:'var(--font-body)',resize:'vertical'}}
        />
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
        <div className="amount-row"><span className="label">Comdata / Express Codes</span><span className="value red">-{fmt(comdataTotal)}</span></div>
        <div className="net-total" style={{marginTop:12}}>
          <span className="label">NET BILLABLE TOTAL</span>
          <span className="value">{fmt(netPay)}</span>
        </div>
      </div>

      <button className="scan-btn success" onClick={generatePDF} style={{marginBottom:8}}>
        ⬇️ DOWNLOAD INVOICE + ALL RECEIPTS
      </button>
      <button className="scan-btn secondary" onClick={resetLoad}>
        + START NEW LOAD
      </button>

    </div>
  )
}
