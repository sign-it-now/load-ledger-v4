// src/Invoice.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useRef } from 'react'
import { jsPDF } from 'jspdf'

// ─── BRADLEY-ROTH B&W SCANNER PIPELINE (inline — no lib folder) ─────────────
async function scanToBW(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        try {
          const MAX = 2400
          let w = img.naturalWidth
          let h = img.naturalHeight
          if (w > MAX || h > MAX) {
            const r = Math.min(MAX / w, MAX / h)
            w = Math.round(w * r)
            h = Math.round(h * r)
          }

          const canvas = document.createElement('canvas')
          canvas.width  = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)

          const src = ctx.getImageData(0, 0, w, h)
          const d   = src.data

          // 1. Grayscale (luminance-weighted)
          const gray = new Uint8Array(w * h)
          for (let i = 0; i < gray.length; i++) {
            const p = i * 4
            gray[i] = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2])
          }

          // 2. Auto-level (histogram stretch)
          let lo = 255, hi = 0
          for (let i = 0; i < gray.length; i++) {
            if (gray[i] < lo) lo = gray[i]
            if (gray[i] > hi) hi = gray[i]
          }
          const range = hi - lo || 1
          for (let i = 0; i < gray.length; i++) {
            gray[i] = Math.round(((gray[i] - lo) / range) * 255)
          }

          // 3. Gaussian blur (3x3, noise reduction)
          const blurred = new Uint8Array(w * h)
          const kernel  = [1, 2, 1, 2, 4, 2, 1, 2, 1]
          const kSum    = 16
          for (let y2 = 0; y2 < h; y2++) {
            for (let x2 = 0; x2 < w; x2++) {
              let sum = 0
              let ki  = 0
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const ny = Math.min(Math.max(y2 + dy, 0), h - 1)
                  const nx = Math.min(Math.max(x2 + dx, 0), w - 1)
                  sum += gray[ny * w + nx] * kernel[ki++]
                }
              }
              blurred[y2 * w + x2] = Math.round(sum / kSum)
            }
          }

          // 4. Bradley-Roth adaptive threshold
          const S      = Math.round(w / 8)
          const T      = 0.15
          const intImg = new Int32Array(w * h)
          for (let y2 = 0; y2 < h; y2++) {
            let rowSum = 0
            for (let x2 = 0; x2 < w; x2++) {
              rowSum += blurred[y2 * w + x2]
              intImg[y2 * w + x2] = rowSum + (y2 > 0 ? intImg[(y2 - 1) * w + x2] : 0)
            }
          }
          const bw = new Uint8Array(w * h)
          for (let y2 = 0; y2 < h; y2++) {
            for (let x2 = 0; x2 < w; x2++) {
              const x1 = Math.max(x2 - S, 0)
              const y1 = Math.max(y2 - S, 0)
              const x3 = Math.min(x2 + S, w - 1)
              const y3 = Math.min(y2 + S, h - 1)
              const count = (x3 - x1) * (y3 - y1)
              const sum2  =
                intImg[y3 * w + x3]
                - (y1 > 0 ? intImg[(y1 - 1) * w + x3] : 0)
                - (x1 > 0 ? intImg[y3 * w + (x1 - 1)] : 0)
                + (y1 > 0 && x1 > 0 ? intImg[(y1 - 1) * w + (x1 - 1)] : 0)
              bw[y2 * w + x2] = blurred[y2 * w + x2] * count < sum2 * (1 - T) ? 0 : 255
            }
          }

          // 5. Write back to canvas
          const out = ctx.createImageData(w, h)
          for (let i = 0; i < bw.length; i++) {
            const p    = i * 4
            out.data[p]     = bw[i]
            out.data[p + 1] = bw[i]
            out.data[p + 2] = bw[i]
            out.data[p + 3] = 255
          }
          ctx.putImageData(out, 0, 0)
          resolve(canvas.toDataURL('image/jpeg', 0.92))
        } catch (err) {
          reject(err)
        }
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function Invoice({ load, setLoad, driver, api, showToast, loads, setLoads, resetLoad }) {
  const [scanning, setScanning] = useState(null)
  const fileRef  = useRef()
  const scanMode = useRef(null)

  const base_pay     = parseFloat(load.base_pay)      || 0
  const detention    = parseFloat(load.detention)     || 0
  const pallets      = parseFloat(load.pallets)       || 0
  const lumperTotal  = load.lumpers.reduce((s, i)     => s + parseFloat(i.amount || 0), 0)
  const incTotal     = load.incidentals.reduce((s, i) => s + parseFloat(i.amount || 0), 0)
  const comdataTotal = load.comdatas.reduce((s, i)    => s + parseFloat(i.amount || 0), 0)
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
    showToast('Scanning receipt...')
    try {
      // STEP 1: B&W scan — same Bradley-Roth pipeline as BOLs
      let bwData = null
      try {
        bwData = await scanToBW(file)
      } catch (scanErr) {
        console.warn('B&W scan failed, storing without image:', scanErr)
      }

      // STEP 2: OCR — extract dollar amount
      const base64 = await toBase64(file)
      const res = await fetch(`${api}/api/ocr`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType: file.type, mode }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const data   = JSON.parse(json.result)
      const amount = data.amount || '0.00'

      // STEP 3: Store item WITH the scanned image
      const item = { amount, label: file.name, bwData }

      if (mode === 'lumper')     setLoad(p => ({ ...p, lumpers:     [...p.lumpers,     item] }))
      if (mode === 'incidental') setLoad(p => ({ ...p, incidentals: [...p.incidentals, item] }))
      if (mode === 'express')    setLoad(p => ({ ...p, comdatas:    [...p.comdatas,    item] }))

      showToast('Receipt scanned!')
    } catch (err) {
      showToast('Scan failed — add amount manually')
      console.error(err)
    } finally {
      setScanning(null)
      e.target.value = ''
    }
  }

  function removeItem(type, idx) {
    setLoad(p => ({ ...p, [type]: p[type].filter((_, i) => i !== idx) }))
  }

  function addManual(type) {
    const amount = prompt('Enter amount (numbers only):')
    if (!amount) return
    const item = { amount: parseFloat(amount).toFixed(2), label: 'Manual entry', bwData: null }
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

  // ─── Add one scanned image page to the PDF ───────────────────────────────
  function addImagePage(doc, bwData, caption, W, H) {
    doc.addPage()
    if (bwData) {
      try {
        const img   = new Image()
        img.src     = bwData
        const iw    = img.naturalWidth  || 800
        const ih    = img.naturalHeight || 1000
        const ratio = Math.min((W - 40) / iw, (H - 80) / ih)
        const dw    = iw * ratio
        const dh    = ih * ratio
        const x     = (W - dw) / 2
        doc.addImage(bwData, 'JPEG', x, 40, dw, dh)
      } catch (err) {
        console.warn('Image embed failed:', err)
        doc.setFontSize(12)
        doc.setTextColor(150, 150, 150)
        doc.text('(Image could not be embedded)', W / 2, H / 2, { align: 'center' })
      }
    } else {
      doc.setFontSize(12)
      doc.setTextColor(150, 150, 150)
      doc.text('(Manual entry — no scan image)', W / 2, H / 2, { align: 'center' })
    }
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(caption, W / 2, H - 20, { align: 'center' })
  }

  // ─── Generate Invoice PDF ─────────────────────────────────────────────────
  function generatePDF() {
    const doc   = new jsPDF({ unit: 'pt', format: 'letter' })
    const W     = 612
    const H     = 792
    const navy  = [10, 22, 40]
    const amber = [232, 160, 32]
    const grey  = [139, 160, 184]
    let   y     = 0

    // PAGE 1 — Invoice summary
    doc.setFillColor(...navy)
    doc.rect(0, 0, W, 90, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(255, 255, 255)
    doc.text('LOAD LEDGER', 40, 40)
    doc.setFontSize(11)
    doc.setTextColor(...amber)
    doc.text('EDGERTON TRANSPORTATION — INVOICE', 40, 58)
    doc.setFontSize(9)
    doc.setTextColor(...grey)
    doc.text('dbappsystems.com', 40, 74)

    const now = new Date()
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(`DATE: ${now.toLocaleDateString()}`, W - 40, 40, { align: 'right' })
    doc.text(`DRIVER: ${(driver || '').toUpperCase()}`, W - 40, 56, { align: 'right' })

    y = 110
    const field = (label, val) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...grey)
      doc.text(label.toUpperCase(), 40, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(...navy)
      doc.text(val || '—', 40, y + 14)
      y += 36
    }
    field('Broker',        load.broker_name)
    field('Load Number',   load.load_number)
    field('Origin',        load.origin)
    field('Destination',   load.destination)
    field('Pickup Date',   load.pickup_date)
    field('Delivery Date', load.delivery_date)

    y += 10
    doc.setFillColor(240, 243, 247)
    doc.rect(30, y, W - 60, 1, 'F')
    y += 20

    const row = (label, val, bold, color) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(bold ? 12 : 10)
      doc.setTextColor(...(color || navy))
      doc.text(label, 40, y)
      doc.text(val, W - 40, y, { align: 'right' })
      y += bold ? 24 : 20
    }
    row('Trucking Rate',           fmt(base_pay))
    row('Lumper Fees',             fmt(lumperTotal))
    row('Incidentals',             fmt(incTotal))
    row('Detention',               fmt(detention))
    row('Pallets',                 fmt(pallets))
    row('Subtotal',                fmt(subtotal))
    row('Comdata / Express Codes', '- ' + fmt(comdataTotal), false, [180, 40, 40])

    y += 8
    doc.setFillColor(...amber)
    doc.rect(30, y, W - 60, 2, 'F')
    y += 14
    row('NET BILLABLE TOTAL', fmt(netPay), true, navy)

    // BOL pages
    const bols = load.bolScans || []
    bols.forEach((bol, i) => {
      addImagePage(
        doc,
        bol.bwData || (typeof bol === 'string' ? bol : null),
        `BOL ${i + 1} of ${bols.length} — ${bol.label || ''}`,
        W, H
      )
    })

    // Lumper receipt pages
    load.lumpers.forEach((item, i) => {
      addImagePage(
        doc,
        item.bwData,
        `Lumper Receipt ${i + 1} — ${fmt(parseFloat(item.amount || 0))} — ${item.label || ''}`,
        W, H
      )
    })

    // Incidental receipt pages
    load.incidentals.forEach((item, i) => {
      addImagePage(
        doc,
        item.bwData,
        `Incidental ${i + 1} — ${fmt(parseFloat(item.amount || 0))} — ${item.label || ''}`,
        W, H
      )
    })

    // Comdata / Express Code pages
    load.comdatas.forEach((item, i) => {
      addImagePage(
        doc,
        item.bwData,
        `Comdata / Express Code ${i + 1} — ${fmt(parseFloat(item.amount || 0))} — ${item.label || ''}`,
        W, H
      )
    })

    // Save PDF
    const safeName = (load.broker_name || 'invoice').replace(/\s+/g, '_')
    const safeLoad = (load.load_number || 'load').replace(/\s+/g, '_')
    doc.save(`${safeName}_${safeLoad}_invoice.pdf`)

    // Persist to loads list — strip bwData to keep localStorage lean
    const snapshot = {
      ...load,
      status:       'invoiced',
      invoice_date: new Date().toISOString(),
      lumpers:      load.lumpers.map(i     => ({ amount: i.amount, label: i.label })),
      incidentals:  load.incidentals.map(i => ({ amount: i.amount, label: i.label })),
      comdatas:     load.comdatas.map(i    => ({ amount: i.amount, label: i.label })),
      bolScans:     (load.bolScans || []).map(b => ({ label: b.label || '' })),
    }
    setLoads(prev => {
      const updated = [snapshot, ...prev]
      try { localStorage.setItem('loads', JSON.stringify(updated)) } catch (_) {}
      return updated
    })
    showToast('Invoice PDF downloaded!')
    resetLoad()
  }

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const navy  = '#0a1628'
  const amber = '#e8a020'
  const grey  = '#8ba0b8'
  const red   = '#c0392b'

  const card = {
    background: '#fff', borderRadius: 10,
    padding: 16, marginBottom: 14,
    boxShadow: '0 2px 8px rgba(10,22,40,0.10)',
  }
  const sectionTitle = {
    fontFamily: 'Rajdhani, sans-serif', fontSize: 11,
    fontWeight: 700, color: grey,
    letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10,
  }
  const scanBtn = (bg) => ({
    padding: '12px 0', background: bg || navy,
    color: '#fff', border: 'none', borderRadius: 8,
    fontFamily: 'Rajdhani, sans-serif', fontSize: 13,
    fontWeight: 700, letterSpacing: '0.08em',
    cursor: 'pointer', marginBottom: 8,
  })
  const itemRow = {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0', borderBottom: '1px solid #f0f3f7',
  }
  const amountRow = {
    display: 'flex', justifyContent: 'space-between',
    padding: '6px 0', fontSize: 12, color: navy,
  }

  function ReceiptSection({ title, type, items, mode, color }) {
    return (
      <div style={card}>
        <div style={sectionTitle}>{title}</div>
        {items.map((item, i) => (
          <div key={i} style={itemRow}>
            <span style={{ fontSize: 12, color: navy }}>
              {item.label} — <strong>{fmt(parseFloat(item.amount || 0))}</strong>
              {item.bwData
                ? <span style={{ marginLeft: 6, fontSize: 10, color: '#27ae60' }}>IMG</span>
                : <span style={{ marginLeft: 6, fontSize: 10, color: red }}>MANUAL</span>
              }
            </span>
            <button
              onClick={() => removeItem(type, i)}
              style={{ background: 'none', border: 'none', color: red, fontSize: 18, cursor: 'pointer' }}
            >x</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            style={{ ...scanBtn(color), flex: 2 }}
            onClick={() => openScanner(mode)}
            disabled={scanning === mode}
          >
            {scanning === mode ? 'Scanning...' : 'Scan Receipt'}
          </button>
          <button style={{ ...scanBtn('#555'), flex: 1 }} onClick={() => addManual(type)}>
            Manual
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      <ReceiptSection title="Lumper Receipts"        type="lumper"     items={load.lumpers}     mode="lumper"     color={navy}     />
      <ReceiptSection title="Incidental Receipts"    type="incidental" items={load.incidentals} mode="incidental" color="#2980b9"  />
      <ReceiptSection title="Comdata / Express Codes" type="comdata"   items={load.comdatas}    mode="express"    color={red}      />

      <div style={card}>
        <div style={sectionTitle}>Billing Summary</div>
        <div style={amountRow}><span>Trucking Rate</span><span>{fmt(base_pay)}</span></div>
        <div style={amountRow}><span>Lumper Fees</span><span>{fmt(lumperTotal)}</span></div>
        <div style={amountRow}><span>Incidentals</span><span>{fmt(incTotal)}</span></div>
        <div style={amountRow}><span>Detention</span><span>{fmt(detention)}</span></div>
        <div style={amountRow}><span>Pallets</span><span>{fmt(pallets)}</span></div>
        <div style={amountRow}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
        <div style={{ ...amountRow, color: red }}>
          <span>Comdata / Express Codes</span><span>- {fmt(comdataTotal)}</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '10px 0', marginTop: 8,
          borderTop: `2px solid ${amber}`,
          fontWeight: 700, fontSize: 15, color: navy,
        }}>
          <span>NET BILLABLE TOTAL</span>
          <span>{fmt(netPay)}</span>
        </div>
      </div>

      <button style={{ ...scanBtn('#27ae60'), width: '100%' }} onClick={generatePDF}>
        DOWNLOAD INVOICE PDF
      </button>
      <button style={{ ...scanBtn('#555'), width: '100%' }} onClick={resetLoad}>
        + START NEW LOAD
      </button>
    </div>
  )
}
