// src/SettlementReport.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4 — Settlement Report
// 2026-06-11: hardened array-column reads (lumpers/incidentals/comdatas)
//             to parse D1 string/array/null safely — fixes blank-screen crash
//             (same asArray guard as Loads.jsx — see INCIDENT_2026-06-11)
//
// ACCOUNTING MODEL — v2:
// "Still Owed to TIM" is a RUNNING BALANCE (all-time cumulative).
// Think of it like a bank account — it doesn't reset by period.
// Period filters only control which ACTIVITY ROWS are displayed (loads,
// fuel, escrow events that occurred in that window) so Tim and Bruce
// can audit what happened in a given window. The bottom-line balance
// is always the full picture: all earned − all fuel − all ACH − all escrow.
//
// Escrow is a one-time settlement event. Once applied it lives in the
// running balance forever. It should NEVER drive "still owed" to $0
// just because the period slice is smaller than the escrow amount.

import { useState, useRef } from 'react'

// -- CONSTANTS — DO NOT CHANGE -----------------------------------------
const BRUCE_CUT = 0.10
const TIM_CUT   = 0.90

// Safely turn a D1 column that may be an array, a JSON string, null, or ''
// into a real array. Never throws.
function asArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

// -- FORMATTERS --------------------------------------------------------
function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

// -- DATE / PERIOD HELPERS ---------------------------------------------
function inPeriodByDate(dateStr, p, offset) {
  if (!dateStr) return false
  const d = new Date(dateStr), now = new Date()
  if (p === 'daily') {
    const target = new Date(now); target.setDate(target.getDate() + offset)
    return d.toDateString() === target.toDateString()
  }
  if (p === 'weekly') {
    const end = new Date(now); end.setDate(end.getDate() + offset * 7); end.setHours(23,59,59,999)
    const start = new Date(end); start.setDate(end.getDate() - 6); start.setHours(0,0,0,0)
    return d >= start && d <= end
  }
  if (p === 'monthly') {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear()
  }
  if (p === 'yearly') return d.getFullYear() === now.getFullYear() + offset
  return false
}

function getPeriodLabel(p, offset) {
  const now = new Date()
  if (p === 'daily') {
    const target = new Date(now); target.setDate(target.getDate() + offset)
    if (offset === 0) return 'TODAY'
    if (offset === -1) return 'YESTERDAY'
    return target.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }).toUpperCase()
  }
  if (p === 'weekly') {
    const end = new Date(now); end.setDate(end.getDate() + offset * 7)
    const start = new Date(end); start.setDate(end.getDate() - 6)
    return start.toLocaleDateString('en-US', { month:'short', day:'numeric' }).toUpperCase()
      + ' - ' + end.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }).toUpperCase()
  }
  if (p === 'monthly') {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return target.toLocaleDateString('en-US', { month:'long', year:'numeric' }).toUpperCase()
  }
  if (p === 'yearly') return String(now.getFullYear() + offset)
  return ''
}

// -- LOAD HELPERS — DO NOT CHANGE --------------------------------------
function loadDate(load) { return load.created_at || load.date || null }

function inPeriod(load, p, offset) {
  const dateStr = loadDate(load)
  if (!dateStr) return false
  return inPeriodByDate(dateStr, p, offset)
}

function getLoadTotals(load) {
  const comdataTotal = parseFloat(load.comdata_total) > 0
    ? parseFloat(load.comdata_total)
    : asArray(load.comdatas).reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
  const lumperTotal = parseFloat(load.lumper_total) > 0
    ? parseFloat(load.lumper_total)
    : asArray(load.lumpers).reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
  const incTotal = parseFloat(load.incidental_total) > 0
    ? parseFloat(load.incidental_total)
    : asArray(load.incidentals).reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
  return { comdataTotal, lumperTotal, incTotal }
}

function calcPay(load) {
  const base      = parseFloat(load.base_pay) || 0
  const detention = parseFloat(load.detention) || 0
  if (load.driver === 'BRUCE') return { gross: base, ownerCut: base * BRUCE_CUT, driverNet: base }
  return { gross: base, ownerCut: base * BRUCE_CUT, driverNet: (base * TIM_CUT) + detention }
}

function advanceKept(load) {
  const { comdataTotal, lumperTotal, incTotal } = getLoadTotals(load)
  return Math.max(0, comdataTotal - lumperTotal - incTotal)
}

function reimbursementOwed(load) {
  const { comdataTotal, lumperTotal, incTotal } = getLoadTotals(load)
  return Math.max(0, (lumperTotal + incTotal) - comdataTotal)
}

// -- B&W SCANNER PIPELINE — LOCKED DO NOT MODIFY ----------------------
function isPDF(file) { return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') }

async function renderPdfToCanvas(file) {
  const pdfjsLib = window.pdfjsLib
  if (!pdfjsLib) throw new Error('PDF.js not loaded')
  const arrayBuf = await file.arrayBuffer()
  const pdf      = await pdfjsLib.getDocument({ data: arrayBuf }).promise
  const page     = await pdf.getPage(1)
  const MAX      = 1200
  const baseVP   = page.getViewport({ scale: 1 })
  const scale    = Math.min(MAX / baseVP.width, MAX / baseVP.height, 2.0)
  const viewport = page.getViewport({ scale })
  const canvas   = document.createElement('canvas')
  canvas.width   = Math.round(viewport.width)
  canvas.height  = Math.round(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

function applyBWPipeline(canvas) {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')
  const id = ctx.getImageData(0, 0, w, h)
  const data = id.data
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p+1] + 0.114 * data[p+2])
  }
  let mn = 255, mx = 0
  for (let i = 0; i < gray.length; i++) { if (gray[i] < mn) mn = gray[i]; if (gray[i] > mx) mx = gray[i] }
  const range = mx - mn || 1
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(((gray[i] - mn) / range) * 255)
  const kernel = [1,2,1, 2,4,2, 1,2,1], kSum = 16
  const blurred = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, ki = 0
    for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
      const nx = Math.min(Math.max(x + kx, 0), w - 1)
      const ny = Math.min(Math.max(y + ky, 0), h - 1)
      sum += gray[ny * w + nx] * kernel[ki++]
    }
    blurred[y * w + x] = Math.round(sum / kSum)
  }
  const S = Math.floor(Math.max(w, h) / 16), T = 0.15
  const integ = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += blurred[y * w + x]
      integ[y * w + x] = rowSum + (y > 0 ? integ[(y-1)*w+x] : 0)
    }
  }
  const bw = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x1 = Math.max(x-S,0), y1 = Math.max(y-S,0)
    const x2 = Math.min(x+S,w-1), y2 = Math.min(y+S,h-1)
    const count = (x2-x1)*(y2-y1)
    const sum = integ[y2*w+x2]
      - (x1>0 ? integ[y2*w+(x1-1)] : 0)
      - (y1>0 ? integ[(y1-1)*w+x2] : 0)
      + (x1>0&&y1>0 ? integ[(y1-1)*w+(x1-1)] : 0)
    bw[y*w+x] = (blurred[y*w+x]*count) < (sum*(1-T)) ? 0 : 255
  }
  const sharp = new Uint8ClampedArray(w * h)
  for (let i = 0; i < bw.length; i++) sharp[i] = Math.min(255, Math.max(0, Math.round(bw[i] + 1.5 * (bw[i] - blurred[i]))))
  for (let i = 0; i < sharp.length; i++) {
    const p = i * 4
    data[p] = data[p+1] = data[p+2] = sharp[i]; data[p+3] = 255
  }
  ctx.putImageData(id, 0, 0)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return { dataUrl, base64: dataUrl.split(',')[1] }
}

async function processFile(file) {
  let canvas
  if (isPDF(file)) {
    canvas = await renderPdfToCanvas(file)
  } else {
    canvas = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = (ev) => {
        const img = new Image()
        img.onerror = reject
        img.onload = () => {
          const MAX = 1200
          let w = img.naturalWidth || img.width || 800
          let h = img.naturalHeight || img.height || 1000
          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
          if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }
          const c = document.createElement('canvas')
          c.width = w; c.height = h
          c.getContext('2d').drawImage(img, 0, 0, w, h)
          resolve(c)
        }
        img.src = ev.target.result
      }
      reader.readAsDataURL(file)
    })
  }
  return applyBWPipeline(canvas)
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

// -- FULL STATEMENT OVERLAY --------------------------------------------
function StatementOverlay({ data, driverName, onClose }) {
  const d = data
  const TH  = { background:'#1a2a3a', color:'#fff', padding:'8px 10px', fontSize:11, fontWeight:700, textAlign:'left', fontFamily:'var(--font-head)', letterSpacing:'0.04em' }
  const TD  = { padding:'8px 10px', fontSize:12, borderBottom:'1px solid #e8e8e8', color:'#222', verticalAlign:'middle' }
  const TDr = { ...TD, textAlign:'right', fontFamily:'var(--font-head)', fontWeight:600 }
  const TF  = { ...TD, background:'#f0f0f0', fontWeight:700, color:'#111' }
  const TFr = { ...TF, textAlign:'right', fontFamily:'var(--font-head)' }
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#fff', zIndex:9999, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
      <div style={{ position:'sticky', top:0, background:'#1a2a3a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10 }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontFamily:'var(--font-head)', letterSpacing:'0.08em' }}>SETTLEMENT STATEMENT</div>
          <div style={{ fontSize:16, fontFamily:'var(--font-head)', fontWeight:900, color: driverName==='TIM'?'#ff6b6b':'#64b5f6' }}>{driverName}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginTop:2 }}>PERIOD ACTIVITY: {d.periodLabel}</div>
        </div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:8, padding:'8px 16px', fontSize:14, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}>X CLOSE</button>
      </div>
      <div style={{ padding:'16px', maxWidth:600, margin:'0 auto' }}>
        <div style={{ background:'#f8f8f8', borderRadius:8, padding:'12px 14px', marginBottom:16, border:'1px solid #e0e0e0' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12, color:'#444' }}>
            <div><span style={{ color:'#888', fontSize:11 }}>COMPANY</span><br /><strong>Edgerton Truck &amp; Trailer Repair</strong></div>
            <div><span style={{ color:'#888', fontSize:11 }}>DRIVER</span><br /><strong>{driverName}</strong></div>
            <div><span style={{ color:'#888', fontSize:11 }}>PERIOD SHOWN</span><br /><strong>{d.periodLabel}</strong></div>
            <div><span style={{ color:'#888', fontSize:11 }}>GENERATED</span><br /><strong>{d.generated}</strong></div>
          </div>
        </div>

        {/* PERIOD EARNINGS */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:900, color:'#1a2a3a', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:6, paddingLeft:4 }}>PERIOD EARNINGS</div>
          <div style={{ borderRadius:8, border:'1px solid #e0e0e0', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr>
                <th style={TH}>Load #</th>
                <th style={{...TH,textAlign:'right'}}>Rate Con</th>
                <th style={{...TH,textAlign:'right'}}>90% Pay</th>
                {d.totalDetention > 0 && <th style={{...TH,textAlign:'right'}}>Detention</th>}
                <th style={{...TH,textAlign:'right'}}>Earned</th>
              </tr></thead>
              <tbody>
                {d.earningsRows.map((r,i) => (
                  <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                    <td style={TD}><strong>{r.loadNum}</strong>{r.isAch && <span style={{ marginLeft:6, fontSize:9, background:'#e8f5e9', color:'#2e7d32', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>ACH</span>}</td>
                    <td style={TDr}>{fmt(r.base)}</td>
                    <td style={TDr}>{fmt(r.gross90)}</td>
                    {d.totalDetention > 0 && <td style={{...TDr,color:r.det>0?'#2e7d32':'#aaa'}}>{r.det>0?fmt(r.det):'-'}</td>}
                    <td style={{...TDr,fontWeight:700}}>{fmt(r.earned)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={TF}>PERIOD TOTAL</td>
                  <td style={TFr}>{fmt(d.totalRateCon)}</td>
                  <td style={TFr}>{fmt(d.totalGross90)}</td>
                  {d.totalDetention > 0 && <td style={{...TFr,color:'#2e7d32'}}>{fmt(d.totalDetention)}</td>}
                  <td style={{...TFr,color:'#1a2a3a'}}>{fmt(d.totalEarned)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ADVANCES */}
        {d.advRows.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:900, color:'#1a2a3a', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:6, paddingLeft:4 }}>ADVANCES &amp; REIMBURSEMENTS</div>
            <div style={{ borderRadius:8, border:'1px solid #e0e0e0', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr>
                  <th style={TH}>Load #</th>
                  <th style={{...TH,textAlign:'right'}}>Comdata</th>
                  <th style={{...TH,textAlign:'right'}}>Lumpers+Inc</th>
                  <th style={{...TH,textAlign:'right'}}>Adv Kept</th>
                  <th style={{...TH,textAlign:'right'}}>Reimb</th>
                </tr></thead>
                <tbody>
                  {d.advRows.map((r,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                      <td style={TD}><strong>{r.loadNum}</strong></td>
                      <td style={TDr}>{fmt(r.comdata)}</td>
                      <td style={TDr}>{fmt(r.expenses)}</td>
                      <td style={{...TDr,color:r.advKept>0?'#388e3c':'#aaa'}}>{r.advKept>0?fmt(r.advKept):'-'}</td>
                      <td style={{...TDr,color:r.reimb>0?'#f57c00':'#aaa'}}>{r.reimb>0?fmt(r.reimb):'-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={TF} colSpan={3}>TOTAL</td>
                    <td style={{...TFr,color:'#388e3c'}}>{fmt(d.totalAdvKept)}</td>
                    <td style={{...TFr,color:'#f57c00'}}>{fmt(d.totalReimb)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACH */}
        {d.achLoads.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:900, color:'#1a2a3a', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:6, paddingLeft:4 }}>ACH PAYMENTS</div>
            <div style={{ borderRadius:8, border:'1px solid #e0e0e0', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr>
                  <th style={TH}>Load #</th>
                  <th style={{...TH,textAlign:'right'}}>Invoice Amt</th>
                  <th style={{...TH,textAlign:'right'}}>Received</th>
                  <th style={{...TH,textAlign:'right'}}>Broker Fee</th>
                </tr></thead>
                <tbody>
                  {d.achLoads.map((l,i) => {
                    const netPay   = parseFloat(l.netPay||l.net_pay)||0
                    const received = parseFloat(l.ach_received)||0
                    const fee      = Math.max(0, netPay - received)
                    return (
                      <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                        <td style={TD}><strong>{l.load_number||'-'}</strong></td>
                        <td style={TDr}>{fmt(netPay)}</td>
                        <td style={{...TDr,color:'#2e7d32'}}>{fmt(received)}</td>
                        <td style={{...TDr,color:'#e65100'}}>{fee>0?fmt(fee):'-'}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td style={TF} colSpan={2}>TOTAL</td>
                    <td style={{...TFr,color:'#2e7d32'}}>{fmt(d.totalAchDisbursed)}</td>
                    <td style={{...TFr,color:'#e65100'}}>{fmt(d.totalAchFees)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FUEL */}
        {d.fuelInRange.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:900, color:'#1a2a3a', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:6, paddingLeft:4 }}>FUEL (PERIOD)</div>
            <div style={{ borderRadius:8, border:'1px solid #e0e0e0', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr>
                  <th style={TH}>Date</th><th style={TH}>Type</th><th style={TH}>Notes</th>
                  <th style={{...TH,textAlign:'right'}}>Amount</th>
                </tr></thead>
                <tbody>
                  {d.fuelInRange.map((f,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                      <td style={TD}>{f.entry_date}</td>
                      <td style={TD}><span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, background:f.fuel_type==='fleet'?'#fff3e0':'#e3f2fd', color:f.fuel_type==='fleet'?'#e65100':'#1565c0' }}>{f.fuel_type==='fleet'?'FLEET':'POCKET'}</span></td>
                      <td style={{...TD,color:'#666',fontSize:11}}>{f.notes||'-'}</td>
                      <td style={{...TDr,color:f.fuel_type==='fleet'?'#c62828':'#1565c0'}}>{fmt(f.amount)}</td>
                    </tr>
                  ))}
                  {d.fleetFuelTotal > 0 && <tr style={{background:'#fff8f8'}}><td style={TF} colSpan={3}>Fleet Card Total (period)</td><td style={{...TFr,color:'#c62828'}}>{fmt(d.fleetFuelTotal)}</td></tr>}
                  {d.pocketFuelTotal > 0 && <tr style={{background:'#f0f4ff'}}><td style={{...TF,color:'#1565c0'}} colSpan={3}>Out of Pocket Total (tax expense only)</td><td style={{...TFr,color:'#1565c0'}}>{fmt(d.pocketFuelTotal)}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* RUNNING BALANCE SUMMARY */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:900, color:'#1a2a3a', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:6, paddingLeft:4 }}>RUNNING BALANCE — ALL TIME</div>
          <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:8, padding:'10px 14px', marginBottom:8, fontSize:11, color:'#7a5c00' }}>
            The running balance reflects ALL loads, fuel, ACH payments, and escrow ever recorded — not just this period. This is what is currently owed.
          </div>
          <div style={{ borderRadius:8, border:'1px solid #e0e0e0', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <tbody>
                <tr><td style={TD}>Gross Pay — All Loads (90% of rate con)</td><td style={TDr}>{fmt(d.allGross90)}</td></tr>
                {d.allDetention > 0 && <tr style={{background:'#f1f8e9'}}><td style={{...TD,color:'#2e7d32'}}>+ Detention (all time)</td><td style={{...TDr,color:'#2e7d32'}}>{fmt(d.allDetention)}</td></tr>}
                {d.allAdvKept > 0 && <tr style={{background:'#fafafa'}}><td style={TD}>- Advance Kept (all time)</td><td style={{...TDr,color:'#c62828'}}>({fmt(d.allAdvKept)})</td></tr>}
                {d.allReimb > 0 && <tr style={{background:'#fffde7'}}><td style={{...TD,color:'#f57c00'}}>+ Lumper Reimbursements (all time)</td><td style={{...TDr,color:'#f57c00'}}>{fmt(d.allReimb)}</td></tr>}
                {d.allFleetFuel > 0 && <tr style={{background:'#fafafa'}}><td style={TD}>- Fleet Card Fuel (all time)</td><td style={{...TDr,color:'#c62828'}}>({fmt(d.allFleetFuel)})</td></tr>}
                {d.allAchDisbursed > 0 && <tr style={{background:'#e8f5e9'}}><td style={{...TD,color:'#2e7d32'}}>- ACH Payments Made (all time)</td><td style={{...TDr,color:'#2e7d32'}}>({fmt(d.allAchDisbursed)})</td></tr>}
                {d.allEscrow > 0 && <tr style={{background:'#f3e5f5'}}><td style={{...TD,color:'#7b1fa2'}}>- Escrow Applied (settled against earnings)</td><td style={{...TDr,color:'#7b1fa2'}}>({fmt(d.allEscrow)})</td></tr>}
                <tr style={{background:'#1a2a3a'}}>
                  <td style={{ padding:'14px 12px', fontSize:15, fontWeight:900, color:'#fff', fontFamily:'var(--font-head)', letterSpacing:'0.04em' }}>BALANCE CURRENTLY OWED TO {driverName}</td>
                  <td style={{ padding:'14px 12px', textAlign:'right', fontSize:20, fontWeight:900, color:'#ffd54f', fontFamily:'var(--font-head)' }}>{fmt(d.stillOwed)}</td>
                </tr>
                {d.totalAchFees > 0 && <tr style={{background:'#fff3e0'}}><td style={{...TD,color:'#e65100',fontSize:11}}>ACH Convenience Fees (broker kept - operating expense)</td><td style={{...TDr,color:'#e65100',fontSize:11}}>{fmt(d.totalAchFees)}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {d.pocketFuelTotal > 0 && (
          <div style={{ background:'#e3f2fd', borderRadius:8, padding:'12px 14px', marginBottom:16, border:'1px solid #bbdefb' }}>
            <div style={{ fontSize:11, color:'#1565c0', fontFamily:'var(--font-head)', fontWeight:700, marginBottom:4 }}>TAX NOTE — PERIOD</div>
            <div style={{ fontSize:12, color:'#1a3a6a' }}>Out of Pocket Fuel this period: <strong>{fmt(d.pocketFuelTotal)}</strong> — paid by driver, deductible business expense.</div>
          </div>
        )}
        <div style={{ textAlign:'center', fontSize:10, color:'#aaa', paddingBottom:32 }}>Generated by Load Ledger V4 — dbappsystems.com</div>
      </div>
    </div>
  )
}

// -- MAIN EXPORTED COMPONENT -------------------------------------------
export default function SettlementReport({ driverName, loads, api, showToast }) {
  const isBookkeeper = driverName === null

  const [loaded,          setLoaded]          = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [fuelEntries,     setFuelEntries]     = useState([])
  // Raw escrow records — filtered all-time for running balance, by period for display row
  const [escrowPayments,  setEscrowPayments]  = useState([])
  const [period,          setPeriod]          = useState('monthly')
  const [periodOffset,    setPeriodOffset]    = useState(0)
  const [showStatement,   setShowStatement]   = useState(null)

  // Fuel entry form state
  const [showFuelDrawer,  setShowFuelDrawer]  = useState(false)
  const [fuelDriver,      setFuelDriver]      = useState(isBookkeeper ? 'TIM' : driverName || 'TIM')
  const [fuelDate,        setFuelDate]        = useState(new Date().toISOString().split('T')[0])
  const [fuelAmount,      setFuelAmount]      = useState('')
  const [fuelType,        setFuelType]        = useState('fleet')
  const [fuelNotes,       setFuelNotes]       = useState('')
  const [fuelScanning,    setFuelScanning]    = useState(false)
  const [fuelSaving,      setFuelSaving]      = useState(false)
  const [fuelReceiptB64,  setFuelReceiptB64]  = useState(null)
  const [fuelReceiptType, setFuelReceiptType] = useState(null)
  const [fuelPreview,     setFuelPreview]     = useState(null)
  const fuelFileRef = useRef()

  async function loadData() {
    if (loaded || loading) return
    setLoading(true)
    try {
      const fetches = [fetch(api + '/api/fuel/TIM'), fetch(api + '/api/fuel/BRUCE')]
      if (!isBookkeeper && driverName !== 'BRUCE') {
        fetches.push(fetch(api + '/api/escrow-payments/TIM'))
      } else if (isBookkeeper) {
        fetches.push(fetch(api + '/api/escrow-payments/TIM'))
      }
      const results = await Promise.all(fetches)
      const timFuel   = await results[0].json()
      const bruceFuel = await results[1].json()
      setFuelEntries([
        ...(Array.isArray(timFuel)   ? timFuel   : []),
        ...(Array.isArray(bruceFuel) ? bruceFuel : []),
      ])
      if (results[2]) {
        const escrowData = await results[2].json()
        setEscrowPayments(Array.isArray(escrowData) ? escrowData : [])
      }
      setLoaded(true)
    } catch (err) {
      showToast('Could not load settlement data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function refreshFuel() {
    try {
      const [timRes, bruceRes] = await Promise.all([
        fetch(api + '/api/fuel/TIM'),
        fetch(api + '/api/fuel/BRUCE'),
      ])
      const timFuel   = await timRes.json()
      const bruceFuel = await bruceRes.json()
      setFuelEntries([
        ...(Array.isArray(timFuel)   ? timFuel   : []),
        ...(Array.isArray(bruceFuel) ? bruceFuel : []),
      ])
    } catch {}
  }

  // -- ESCROW HELPERS ------------------------------------------------
  // Period display: only show escrow that was recorded in the selected period
  function escrowForPeriod(dn) {
    if (dn !== 'TIM') return 0
    return escrowPayments
      .filter(p => inPeriodByDate(p.funded_at, period, periodOffset))
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  }
  // Running balance: ALL escrow ever applied — used for the bottom-line balance
  function escrowAllTime(dn) {
    if (dn !== 'TIM') return 0
    return escrowPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  }

  // -- PERIOD FUEL HELPERS -------------------------------------------
  function fuelForPeriod(dn, fuelTypeFilter) {
    return fuelEntries
      .filter(f => f.driver === dn.toUpperCase() && f.fuel_type === fuelTypeFilter && inPeriodByDate(f.entry_date, period, periodOffset))
      .reduce((s,f) => s + (parseFloat(f.amount)||0), 0)
  }

  function fuelEntriesForPeriod(dn) {
    return fuelEntries.filter(f => f.driver === dn.toUpperCase() && inPeriodByDate(f.entry_date, period, periodOffset))
  }

  // -- RUNNING BALANCE — all-time ------------------------------------
  // This is the true "what does Bruce owe Tim right now" number.
  // It uses every load, every fuel entry, every ACH payment, every escrow
  // ever recorded. Not period-filtered. Never resets.
  function runningBalance(dn) {
    const dLoads = loads.filter(l => l.driver === dn)
    const allGrossPay     = dLoads.reduce((s,l) => s + calcPay(l).driverNet, 0)
    const allAdvKept      = dLoads.reduce((s,l) => s + advanceKept(l), 0)
    const allReimb        = dLoads.reduce((s,l) => s + reimbursementOwed(l), 0)
    const allFleetFuel    = fuelEntries.filter(f => f.driver === dn.toUpperCase() && f.fuel_type === 'fleet').reduce((s,f) => s+(parseFloat(f.amount)||0), 0)
    const allAchDisbursed = dLoads.filter(l => l.ach_payment).reduce((s,l) => s+(parseFloat(l.ach_received)||0), 0)
    const allEscrow       = escrowAllTime(dn)
    return {
      allGrossPay, allAdvKept, allReimb, allFleetFuel, allAchDisbursed, allEscrow,
      allDetention: dLoads.reduce((s,l) => s+(parseFloat(l.detention)||0), 0),
      allGross90: dLoads.reduce((s,l) => s+(parseFloat(l.base_pay)||0)*TIM_CUT, 0),
      stillOwed: Math.max(0, allGrossPay - allAdvKept + allReimb - allFleetFuel - allAchDisbursed - allEscrow),
    }
  }

  function buildSettlementData(dn) {
    const dLoads      = loads.filter(l => l.driver === dn)
    const inRange     = dLoads.filter(l => inPeriod(l, period, periodOffset))
    const fuelInRange = fuelEntries.filter(f => f.driver === dn && inPeriodByDate(f.entry_date, period, periodOffset))
    const fleetFuelTotal  = fuelInRange.filter(f => f.fuel_type === 'fleet').reduce((s,f) => s+(parseFloat(f.amount)||0), 0)
    const pocketFuelTotal = fuelInRange.filter(f => f.fuel_type === 'pocket').reduce((s,f) => s+(parseFloat(f.amount)||0), 0)
    let totalRateCon = 0, totalGross90 = 0, totalDetention = 0, totalEarned = 0, totalAdvKept = 0, totalReimb = 0
    const earningsRows = inRange.map(l => {
      const base    = parseFloat(l.base_pay) || 0
      const det     = parseFloat(l.detention) || 0
      const gross90 = base * TIM_CUT
      const earned  = gross90 + det
      totalRateCon += base; totalGross90 += gross90; totalDetention += det; totalEarned += earned
      return { loadNum: l.load_number || '-', base, gross90, det, earned, isAch: !!l.ach_payment, achReceived: parseFloat(l.ach_received)||0 }
    })
    const advRows = inRange.filter(l => {
      const { comdataTotal, lumperTotal, incTotal } = getLoadTotals(l)
      return comdataTotal > 0 || lumperTotal > 0 || incTotal > 0
    }).map(l => {
      const { comdataTotal, lumperTotal, incTotal } = getLoadTotals(l)
      const expenses = lumperTotal + incTotal
      const advKept  = Math.max(0, comdataTotal - expenses)
      const reimb    = Math.max(0, expenses - comdataTotal)
      totalAdvKept += advKept; totalReimb += reimb
      return { loadNum: l.load_number || '-', comdata: comdataTotal, expenses, advKept, reimb }
    })
    const achLoads          = inRange.filter(l => l.ach_payment)
    const totalAchDisbursed = achLoads.reduce((s,l) => s + (parseFloat(l.ach_received)||0), 0)
    const totalAchFees      = achLoads.reduce((s,l) => s + Math.max(0, (parseFloat(l.netPay||l.net_pay)||0) - (parseFloat(l.ach_received)||0)), 0)
    // Running balance for bottom-line "owed" number
    const rb = runningBalance(dn)
    return {
      driverName: dn,
      periodLabel: getPeriodLabel(period, periodOffset),
      generated: new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }),
      earningsRows, totalRateCon, totalGross90, totalDetention, totalEarned,
      advRows, totalAdvKept, totalReimb,
      fuelInRange, fleetFuelTotal, pocketFuelTotal,
      achLoads, totalAchDisbursed, totalAchFees,
      // Running balance fields for the summary table
      ...rb,
    }
  }

  // driverStats: period display rows + running balance for "still owed"
  function driverStats(dn) {
    const dLoads = loads.filter(l => l.driver === dn)
    const inRange = dLoads.filter(l => inPeriod(l, period, periodOffset))

    // Period display values (shown as activity rows in the card)
    const detentionTotal = inRange.reduce((s,l) => s + (parseFloat(l.detention)||0), 0)
    const advKeptPeriod  = inRange.reduce((s,l) => s + advanceKept(l), 0)
    const reimbPeriod    = inRange.reduce((s,l) => s + reimbursementOwed(l), 0)
    const gPayPeriod     = inRange.reduce((s,l) => s + calcPay(l).driverNet, 0)
    const fleetFuelPrd   = fuelForPeriod(dn, 'fleet')
    const pocketFuelPrd  = fuelForPeriod(dn, 'pocket')
    const achDisbPeriod  = inRange.filter(l => l.ach_payment).reduce((s,l) => s+(parseFloat(l.ach_received)||0), 0)
    const achFeesPeriod  = inRange.filter(l => l.ach_payment).reduce((s,l) => s+Math.max(0,(parseFloat(l.netPay||l.net_pay)||0)-(parseFloat(l.ach_received)||0)), 0)
    // Escrow: show as a line item only when it was applied in the selected period
    const escrowPeriod   = escrowForPeriod(dn)

    // Running balance — the only correct "still owed" answer
    const rb = runningBalance(dn)

    return {
      count: inRange.length,
      rateCon: inRange.reduce((s,l) => s+(parseFloat(l.base_pay)||0), 0),
      grossPay: gPayPeriod,
      detentionTotal,
      advanceKept: advKeptPeriod,
      reimbOwed: reimbPeriod,
      fleetFuel: fleetFuelPrd,
      pocketFuel: pocketFuelPrd,
      achDisbursed: achDisbPeriod,
      achFees: achFeesPeriod,
      escrowApplied: escrowPeriod, // display row: only when in this period
      stillOwed: rb.stillOwed,     // running balance — all-time correct answer
    }
  }

  // -- FUEL ENTRY HANDLERS ---------------------------------------
  async function handleFuelFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFuelScanning(true)
    showToast('Scanning fuel receipt...')
    try {
      const scanned   = await processFile(file)
      const base64    = await toBase64(file)
      const mediaType = isPDF(file) ? 'application/pdf' : (file.type || 'image/jpeg')
      const res = await fetch(api + '/api/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType, mode: 'fuel' }),
      })
      const json2 = await res.json()
      if (json2.error) throw new Error(json2.detail || json2.error)
      let raw = json2.result || ''
      raw = raw.replace(/```json/gi,'').replace(/```/gi,'').trim()
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No data found')
      const parsed = JSON.parse(raw.substring(start, end + 1))
      const amount = parsed.amount || '0.00'
      setFuelAmount(amount)
      setFuelReceiptB64(scanned.base64)
      setFuelReceiptType('image/jpeg')
      setFuelPreview(scanned.dataUrl)
      showToast('Fuel receipt scanned! $' + amount)
    } catch {
      showToast('Scan failed — enter amount manually')
    } finally {
      setFuelScanning(false)
      e.target.value = ''
    }
  }

  async function saveFuelEntry() {
    const amt = parseFloat(fuelAmount)
    if (!amt || amt <= 0) { showToast('Enter a valid amount'); return }
    setFuelSaving(true)
    try {
      const res = await fetch(api + '/api/fuel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver: fuelDriver, entry_date: fuelDate, amount: amt, fuel_type: fuelType, notes: fuelNotes }),
      })
      const data = await res.json()
      if (!res.ok) { showToast('Save failed: ' + (data.error || 'unknown')); return }
      if (fuelReceiptB64 && data.id) {
        try {
          await fetch(api + '/api/fuel-receipt/' + data.id, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: fuelReceiptB64, mediaType: fuelReceiptType || 'image/jpeg' }),
          })
        } catch {}
      }
      showToast('Fuel entry saved!')
      setFuelAmount(''); setFuelNotes(''); setFuelReceiptB64(null)
      setFuelReceiptType(null); setFuelPreview(null)
      setShowFuelDrawer(false)
      await refreshFuel()
    } catch (err) {
      showToast('Save failed: ' + err.message)
    } finally {
      setFuelSaving(false)
    }
  }

  async function deleteFuelEntry(id) {
    try {
      const res = await fetch(api + '/api/fuel/' + id, { method: 'DELETE' })
      if (!res.ok) { showToast('Delete failed'); return }
      showToast('Fuel entry deleted')
      await refreshFuel()
    } catch { showToast('Delete failed') }
  }

  function changePeriod(p) { setPeriod(p); setPeriodOffset(0) }

  // -- RENDER ----------------------------------------------------
  const navBtn = {
    padding:'6px 18px', borderRadius:8, border:'1px solid var(--border)',
    background:'var(--navy3)', color:'var(--white)', fontSize:22,
    fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer', lineHeight:1,
  }
  const inputStyle = {
    width:'100%', background:'var(--navy3)', border:'1px solid var(--border)',
    color:'var(--white)', borderRadius:8, padding:'8px 10px',
    fontSize:14, fontFamily:'var(--font-body)', boxSizing:'border-box',
  }

  const driversToShow = isBookkeeper ? ['BRUCE','TIM'] : [driverName]

  return (
    <div>
      {/* Full statement overlay */}
      {showStatement && loaded && (
        <StatementOverlay
          data={buildSettlementData(showStatement)}
          driverName={showStatement}
          onClose={() => setShowStatement(null)}
        />
      )}

      <input ref={fuelFileRef} type="file" accept="image/*,application/pdf" style={{display:'none'}} onChange={handleFuelFile} />

      {/* Load data trigger */}
      {!loaded && (
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{ padding:'14px 32px', borderRadius:10, border:'none', background: loading ? '#555' : 'var(--amber)', color: loading ? '#aaa' : '#0A1628', fontFamily:'var(--font-head)', fontWeight:900, fontSize:14, cursor:'pointer', letterSpacing:'0.06em' }}
          >
            {loading ? 'LOADING...' : '\uD83D\uDCB5 LOAD SETTLEMENT DATA'}
          </button>
        </div>
      )}

      {/* Main content — shown after load */}
      {loaded && (
        <div>
          {/* Period type selector */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:10 }}>
            {['daily','weekly','monthly','yearly'].map(p => (
              <button key={p} onClick={() => changePeriod(p)} style={{
                padding:'9px 4px', borderRadius:8, border:'none',
                fontFamily:'var(--font-head)', fontWeight:700, fontSize:11,
                letterSpacing:'0.04em', cursor:'pointer',
                background: period === p ? 'var(--white)' : 'var(--navy3)',
                color:       period === p ? 'var(--navy)'  : 'var(--grey)',
              }}>{p.toUpperCase()}</button>
            ))}
          </div>

          {/* Period navigator */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <button style={navBtn} onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
            <div style={{ textAlign:'center', flex:1, padding:'0 8px' }}>
              <div style={{ fontFamily:'var(--font-head)', fontSize:13, color:'var(--amber)', letterSpacing:'0.08em' }}>
                {getPeriodLabel(period, periodOffset)}
              </div>
              {periodOffset === 0 && <div style={{ fontSize:10, color:'var(--grey)', marginTop:2 }}>CURRENT</div>}
            </div>
            <button style={{ ...navBtn, opacity: periodOffset >= 0 ? 0.3 : 1 }} disabled={periodOffset >= 0} onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
          </div>

          {/* Driver settlement cards */}
          {driversToShow.map(dn => {
            const s     = driverStats(dn)
            const color = dn === 'BRUCE' ? '#1e88e5' : '#e53935'
            const fuelList = fuelEntriesForPeriod(dn)
            return (
              <div key={dn} className="card" style={{ borderLeft:'3px solid ' + color, marginBottom:12 }}>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color, marginBottom:10 }}>{dn}</div>

                {/* PERIOD ACTIVITY LABEL */}
                <div style={{ fontSize:9, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.1em', marginBottom:8, textTransform:'uppercase' }}>
                  Period Activity — {getPeriodLabel(period, periodOffset)}
                </div>

                <div className="amount-row"><span className="label">Loads</span><span className="value">{s.count}</span></div>
                <div className="amount-row"><span className="label">Rate Con Total</span><span className="value">{fmt(s.rateCon)}</span></div>
                <div className="amount-row"><span className="label">Gross Pay (90%)</span><span className="value" style={{color:'var(--amber)'}}>{fmt(s.grossPay - s.detentionTotal)}</span></div>
                {s.detentionTotal > 0 && <div className="amount-row"><span className="label" style={{color:'var(--green)'}}>+ Detention</span><span className="value" style={{color:'var(--green)'}}>+{fmt(s.detentionTotal)}</span></div>}
                {s.advanceKept > 0 && <div className="amount-row"><span className="label">Advance Kept</span><span className="value" style={{color:'var(--green)'}}>{fmt(s.advanceKept)}</span></div>}
                {s.reimbOwed > 0 && <div className="amount-row"><span className="label" style={{color:'var(--amber)'}}>+ Lumper Reimb</span><span className="value" style={{color:'var(--amber)'}}>+{fmt(s.reimbOwed)}</span></div>}
                {s.fleetFuel > 0 && <div className="amount-row"><span className="label">Fleet Fuel</span><span className="value" style={{color:'var(--red)'}}>{fmt(s.fleetFuel)}</span></div>}
                {s.achDisbursed > 0 && <div className="amount-row"><span className="label" style={{color:'#2e7d32'}}>ACH Paid Out</span><span className="value" style={{color:'#2e7d32'}}>-{fmt(s.achDisbursed)}</span></div>}
                {/* Escrow: display row only when it was recorded in this period */}
                {s.escrowApplied > 0 && (
                  <div className="amount-row">
                    <span className="label" style={{color:'#ce93d8'}}>Escrow Applied (this period)</span>
                    <span className="value" style={{color:'#ce93d8'}}>-{fmt(s.escrowApplied)}</span>
                  </div>
                )}

                {/* RUNNING BALANCE — separated clearly */}
                <div style={{ borderTop:'2px solid var(--border)', marginTop:10, paddingTop:10 }}>
                  <div style={{ fontSize:9, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.1em', marginBottom:6, textTransform:'uppercase' }}>
                    Running Balance — All Time
                  </div>
                  <div className="amount-row">
                    <span className="label" style={{fontWeight:900,color:'var(--white)',fontSize:14}}>Balance Owed to {dn}</span>
                    <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(s.stillOwed)}</span>
                  </div>
                </div>

                {s.achFees > 0 && <div className="amount-row" style={{marginTop:4}}><span className="label" style={{color:'#e65100',fontSize:11}}>ACH Broker Fees</span><span className="value" style={{color:'#e65100',fontSize:11}}>{fmt(s.achFees)}</span></div>}

                {/* Fuel entries for this driver in period */}
                {fuelList.length > 0 && (
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:6 }}>FUEL ENTRIES</div>
                    {fuelList.map(f => (
                      <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:6 }}>
                        <div>
                          <span style={{ fontSize:11, color:f.fuel_type==='fleet'?'var(--amber)':'#1565c0', fontFamily:'var(--font-head)', fontWeight:700 }}>{f.fuel_type==='fleet'?'FLEET':'POCKET'}</span>
                          <span style={{ fontSize:11, color:'var(--grey)', marginLeft:6 }}>{f.entry_date}</span>
                          {f.notes && <span style={{ fontSize:10, color:'var(--grey)', marginLeft:6 }}>{f.notes}</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:'var(--font-head)', fontWeight:700, color:f.fuel_type==='fleet'?'var(--red)':'#1565c0' }}>{fmt(f.amount)}</span>
                          <button onClick={() => deleteFuelEntry(f.id)} style={{ background:'transparent', border:'none', color:'#666', cursor:'pointer', fontSize:14, padding:'0 2px' }}>X</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* View full statement button */}
                <button
                  onClick={() => setShowStatement(dn)}
                  style={{ width:'100%', marginTop:12, padding:'10px 0', borderRadius:8, border:'1px solid ' + color, background:'transparent', color, fontFamily:'var(--font-head)', fontWeight:700, fontSize:12, cursor:'pointer', letterSpacing:'0.06em' }}
                >
                  VIEW FULL STATEMENT - {dn}
                </button>
              </div>
            )
          })}

          {/* Fuel entry form */}
          <button
            onClick={() => {
              setShowFuelDrawer(p => !p)
              setFuelDate(new Date().toISOString().split('T')[0])
              setFuelAmount(''); setFuelNotes(''); setFuelType('fleet')
              setFuelReceiptB64(null); setFuelPreview(null)
            }}
            style={{ width:'100%', padding:'12px 0', borderRadius:10, border:'none', marginBottom:12, fontFamily:'var(--font-head)', fontWeight:900, fontSize:13, cursor:'pointer', background: showFuelDrawer ? 'var(--navy3)' : '#1a3a1a', color: showFuelDrawer ? 'var(--grey)' : '#4caf50', letterSpacing:'0.06em' }}
          >
            {showFuelDrawer ? 'X CANCEL FUEL ENTRY' : '\u26FD ADD FUEL ENTRY'}
          </button>

          {showFuelDrawer && (
            <div className="card" style={{ marginBottom:12, border:'1px solid #2a4a2a' }}>
              <div style={{ fontFamily:'var(--font-head)', fontSize:12, color:'#4caf50', letterSpacing:'0.1em', marginBottom:12 }}>NEW FUEL ENTRY</div>
              {isBookkeeper && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>DRIVER</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {['TIM','BRUCE'].map(d => (
                      <button key={d} onClick={() => setFuelDriver(d)} style={{ padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'var(--font-head)', fontWeight:700, fontSize:13, background: fuelDriver===d?(d==='TIM'?'#e53935':'#1e88e5'):'var(--navy3)', color: fuelDriver===d?'#fff':'var(--grey)' }}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>FUEL TYPE</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button onClick={() => setFuelType('fleet')} style={{ padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'var(--font-head)', fontWeight:700, fontSize:12, background:fuelType==='fleet'?'var(--amber)':'var(--navy3)', color:fuelType==='fleet'?'var(--navy)':'var(--grey)' }}>FLEET CARD</button>
                  <button onClick={() => setFuelType('pocket')} style={{ padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'var(--font-head)', fontWeight:700, fontSize:12, background:fuelType==='pocket'?'#1565c0':'var(--navy3)', color:fuelType==='pocket'?'#fff':'var(--grey)' }}>OUT OF POCKET</button>
                </div>
                <div style={{ fontSize:10, color:'var(--grey)', marginTop:6, fontFamily:'var(--font-head)' }}>{fuelType==='fleet'?'Fleet card — deducted from driver pay':'Driver paid — tracked for tax purposes only'}</div>
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>DATE</div>
                <input type="date" value={fuelDate} onChange={e => setFuelDate(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>AMOUNT ($)</div>
                <input type="text" inputMode="decimal" placeholder="0.00" value={fuelAmount} onChange={e => setFuelAmount(e.target.value)} style={{ ...inputStyle, fontSize:22, fontWeight:700, fontFamily:'var(--font-head)' }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <button onClick={() => fuelFileRef.current.click()} disabled={fuelScanning} style={{ width:'100%', padding:'10px 0', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy3)', color:fuelScanning?'var(--grey)':'var(--white)', fontFamily:'var(--font-head)', fontWeight:700, fontSize:13, cursor:'pointer' }}>{fuelScanning?'Scanning...':'Scan Receipt (optional)'}</button>
                {fuelPreview && (
                  <div style={{ marginTop:8, position:'relative' }}>
                    <img src={fuelPreview} alt="Receipt" style={{ width:'100%', borderRadius:6, border:'1px solid var(--border)', maxHeight:120, objectFit:'cover' }} />
                    <button onClick={() => { setFuelPreview(null); setFuelReceiptB64(null) }} style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.7)', color:'#fff', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer', fontSize:12 }}>X</button>
                  </div>
                )}
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>NOTES (optional)</div>
                <input type="text" placeholder="e.g. Fleet card week of May 21" value={fuelNotes} onChange={e => setFuelNotes(e.target.value)} style={inputStyle} />
              </div>
              <button onClick={saveFuelEntry} disabled={fuelSaving||!fuelAmount} style={{ width:'100%', padding:'12px 0', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'var(--font-head)', fontWeight:900, fontSize:14, background:fuelSaving||!fuelAmount?'#555':'#4caf50', color:'#fff', letterSpacing:'0.06em' }}>
                {fuelSaving ? 'SAVING...' : 'SAVE FUEL ENTRY'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
