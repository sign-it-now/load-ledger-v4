// src/Loads.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'

const BRUCE_CUT = 0.20
const TIM_CUT   = 0.80

export default function Loads({ loads, setLoads, driver, api, showToast, fetchLoads }) {

  const [view,          setView]          = useState('all')
  const [reportTab,     setReportTab]     = useState('carrier')
  const [period,        setPeriod]        = useState('monthly')
  const [periodOffset,  setPeriodOffset]  = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [updating,      setUpdating]      = useState(null)
  const [editIdx,       setEditIdx]       = useState(null)
  const [editData,      setEditData]      = useState(null)

  const [fuelEntries,    setFuelEntries]    = useState([])
  const [showFuelDrawer, setShowFuelDrawer] = useState(false)
  const [fuelDriver,     setFuelDriver]     = useState('TIM')
  const [fuelDate,       setFuelDate]       = useState(new Date().toISOString().split('T')[0])
  const [fuelAmount,     setFuelAmount]     = useState('')
  const [fuelType,       setFuelType]       = useState('fleet')
  const [fuelNotes,      setFuelNotes]      = useState('')
  const [fuelScanning,   setFuelScanning]   = useState(false)
  const [fuelSaving,     setFuelSaving]     = useState(false)
  const [fuelReceiptB64, setFuelReceiptB64] = useState(null)
  const [fuelReceiptType,setFuelReceiptType]= useState(null)
  const [fuelPreview,    setFuelPreview]    = useState(null)
  const fuelFileRef = useRef()

  async function fetchFuelEntries() {
    try {
      const [timRes, bruceRes] = await Promise.all([
        fetch(api + '/api/fuel/TIM'),
        fetch(api + '/api/fuel/BRUCE'),
      ])
      const timData   = await timRes.json()
      const bruceData = await bruceRes.json()
      setFuelEntries([
        ...(Array.isArray(timData)   ? timData   : []),
        ...(Array.isArray(bruceData) ? bruceData : []),
      ])
    } catch (err) { console.error('fetchFuelEntries failed:', err) }
  }

  useEffect(() => {
    if (view === 'reports' && reportTab === 'settlement') fetchFuelEntries()
  }, [view, reportTab])

  // ── B&W PIPELINE — LOCKED DO NOT MODIFY ──────────────────
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

  async function handleFuelFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFuelScanning(true)
    showToast('📡 Scanning fuel receipt...')
    try {
      const scanned   = await processFile(file)
      const base64    = await toBase64(file)
      const mediaType = isPDF(file) ? 'application/pdf' : (file.type || 'image/jpeg')
      const res = await fetch(api + '/api/ocr', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType, mode: 'fuel' }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.detail || json.error)
      let raw = json.result || ''
      raw = raw.replace(/```json/gi,'').replace(/```/gi,'').trim()
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No data found')
      const parsed = JSON.parse(raw.substring(start, end + 1))
      const amount = parsed.amount || '0.00'
      setFuelAmount(amount)
      setFuelReceiptB64(scanned.base64)
      setFuelReceiptType('image/jpeg')
      setFuelPreview(scanned.dataUrl)
      showToast('✅ Fuel receipt scanned! $' + amount)
    } catch (err) {
      showToast('❌ Scan failed — enter amount manually')
      console.error(err)
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver: fuelDriver, entry_date: fuelDate, amount: amt, fuel_type: fuelType, notes: fuelNotes }),
      })
      const data = await res.json()
      if (!res.ok) { showToast('⚠️ Save failed: ' + (data.error || 'unknown')); return }
      const savedId = data.id
      if (fuelReceiptB64 && savedId) {
        try {
          await fetch(api + '/api/fuel-receipt/' + savedId, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: fuelReceiptB64, mediaType: fuelReceiptType || 'image/jpeg' }),
          })
        } catch (err) { console.error('Fuel receipt upload failed (non-fatal):', err) }
      }
      showToast('✅ Fuel entry saved!')
      setFuelAmount(''); setFuelNotes(''); setFuelReceiptB64(null)
      setFuelReceiptType(null); setFuelPreview(null)
      setShowFuelDrawer(false)
      await fetchFuelEntries()
    } catch (err) {
      showToast('⚠️ Save failed: ' + err.message)
    } finally {
      setFuelSaving(false)
    }
  }

  async function deleteFuelEntry(id) {
    try {
      const res = await fetch(api + '/api/fuel/' + id, { method: 'DELETE' })
      if (!res.ok) { showToast('⚠️ Delete failed'); return }
      showToast('🗑️ Fuel entry deleted')
      await fetchFuelEntries()
    } catch (err) { showToast('⚠️ Delete failed: ' + err.message) }
  }

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
          let errMsg = 'unknown'
          try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
          showToast('⚠️ Update failed: ' + errMsg)
          setUpdating(null); return
        }
        try { await fetchLoads() } catch {}
        if (fields.status === 'paid')   showToast('✅ Marked as paid!')
        if (fields.status === 'billed') showToast('✅ Marked as billed!')
      } else {
        setLoads(prev => prev.map((l,i) => i === localIdx ? { ...l, ...fields } : l))
        if (fields.status === 'paid')   showToast('✅ Marked as paid!')
        if (fields.status === 'billed') showToast('✅ Marked as billed!')
      }
    } catch (err) { showToast('⚠️ Update failed: ' + err.message) }
    finally { setUpdating(null) }
  }

  async function deleteLoad(load, localIdx) {
    setDeleting(true)
    try {
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, { method: 'DELETE' })
        if (!res.ok) {
          let errMsg = 'Server error ' + res.status
          try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
          showToast('⚠️ Delete failed: ' + errMsg)
          setDeleting(false); return
        }
        try { await fetchLoads() } catch { setLoads(prev => prev.filter((_,i) => i !== localIdx)) }
      } else {
        setLoads(prev => prev.filter((_,i) => i !== localIdx))
      }
      showToast('🗑️ Load deleted')
      setConfirmDelete(null)
      if (editIdx === localIdx) { setEditIdx(null); setEditData(null) }
    } catch (err) { showToast('⚠️ Delete failed: ' + err.message) }
    finally { setDeleting(false) }
  }

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
    setEditData(prev => ({ ...prev, [type]: prev[type].map((item,i) => i === idx ? { ...item, amount: val } : item) }))
  }
  function removeEditItem(type, idx) {
    setEditData(prev => ({ ...prev, [type]: prev[type].filter((_,i) => i !== idx) }))
  }
  function addEditItem(type) {
    setEditData(prev => ({ ...prev, [type]: [...prev[type], { amount: '0.00', label: 'Manual entry', dataUrl: null, base64: null, w: 0, h: 0 }] }))
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

  function generateCorrectedPDF(load, data, newNetPay) {
    const base_pay  = parseFloat(data.base_pay)  || 0
    const detention = parseFloat(data.detention) || 0
    const pallets   = parseFloat(data.pallets)   || 0
    const subtotal  = base_pay
      + data.lumpers.reduce((s,i)     => s + (parseFloat(i.amount)||0), 0)
      + data.incidentals.reduce((s,i) => s + (parseFloat(i.amount)||0), 0)
      + detention + pallets
    const fmtN = n => '$' + (parseFloat(n)||0).toFixed(2)
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const W = 612, M = 40; let y = 0
    doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    doc.text('Edgerton Truck & Trailer Repair', W/2, 50, { align:'center' })
    doc.setDrawColor(180,180,180); doc.setLineWidth(0.5); doc.line(M,58,W-M,58); y = 75
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(180,0,0)
    doc.text('** CORRECTED INVOICE **', W/2, y, { align:'center' }); y += 14
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    doc.text('Bruce Edgerton', M, y); doc.setFont('helvetica','normal')
    doc.text('N4202 Hill Rd - Bonduel WI 54107', M, y+12)
    doc.text('MC#699644', M, y+24)
    doc.text('bruce.edgerton@yahoo.com - 715-509-0114', M, y+36)
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.text('DATE SENT', W-M, y, { align:'right' }); doc.line(W-160, y+3, W-M, y+3)
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    doc.text(new Date().toLocaleDateString('en-US'), W-M, y+16, { align:'right' }); y += 60
    doc.setDrawColor(180,180,180); doc.line(M,y,W-M,y); y += 14
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.text('BILL TO', M, y); doc.text('LOAD #', W/2, y); y += 12
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    const bl = doc.splitTextToSize(load.broker_name || '-', 220)
    doc.text(bl, M, y); doc.text(load.load_number || '-', W/2, y); y += bl.length * 14 + 6
    doc.setDrawColor(180,180,180); doc.line(M,y,W-M,y); y += 14
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.text('PICK UP LOCATION', M, y); doc.text('DELIVERY LOCATION', W/2, y); y += 12
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    const ol = doc.splitTextToSize(load.origin || '-', 220); const dl = doc.splitTextToSize(load.destination || '-', 220)
    doc.text(ol, M, y); doc.text(dl, W/2, y); y += Math.max(ol.length, dl.length) * 14 + 6
    doc.setDrawColor(180,180,180); doc.line(M,y,W-M,y); y += 14
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.text('DELIVERY DATE', M, y); y += 12
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    doc.text(load.delivery_date || '-', M, y); y += 20
    doc.setDrawColor(180,180,180); doc.line(M,y,W-M,y); y += 18
    doc.setFontSize(9); doc.setFont('helvetica','italic'); doc.setTextColor(80,80,80)
    doc.text('Please remit payment amount for transport services', M, y); y += 20
    function li(label, amount, bold, red) {
      doc.setFontSize(10); doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(red ? 180 : 0, 0, 0)
      doc.text(label, M, y); doc.text(amount, W-M, y, { align:'right' }); y += 18
    }
    li('Trucking Rate', fmtN(base_pay), false, false)
    data.lumpers.forEach((l,i)     => li('Lumper Receipt '+(i+1), fmtN(parseFloat(l.amount)), false, false))
    data.incidentals.forEach((l,i) => li('Incidental '+(i+1),     fmtN(parseFloat(l.amount)), false, false))
    if (detention > 0) li('Detention', fmtN(detention), false, false)
    if (pallets   > 0) li('Pallets',   fmtN(pallets),   false, false)
    y += 4; doc.setDrawColor(0,0,0); doc.setLineWidth(1); doc.line(M,y,W-M,y); y += 14
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0)
    doc.text('SUBTOTAL', M, y); doc.text(fmtN(subtotal), W-M, y, { align:'right' }); y += 20
    doc.setLineWidth(0.5); doc.setDrawColor(180,180,180); doc.line(M,y,W-M,y); y += 14
    data.comdatas.forEach((c,i) => li('Comdata / Express Code '+(i+1), '-'+fmtN(parseFloat(c.amount)), false, true))
    y += 8; doc.setFillColor(30,30,30); doc.rect(M,y,W-M*2,28,'F')
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255)
    doc.text('NET BILLABLE TOTAL', M+10, y+19); doc.text(fmtN(newNetPay), W-M-10, y+19, { align:'right' }); y += 48
    if (data.notes) {
      doc.setFontSize(9); doc.setFont('helvetica','italic'); doc.setTextColor(80,80,80)
      const nl = doc.splitTextToSize(data.notes, W-M*2); doc.text(nl, M, y); y += nl.length * 12 + 10
    }
    y += 10; doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(150,0,0)
    doc.text('This is a corrected invoice superseding the original. Please discard any previous version.', M, y); y += 20
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
    doc.text('Thank You', W-M, y, { align:'right' }); y += 20
    doc.setFontSize(14); doc.setFont('helvetica','bolditalic'); doc.setTextColor(0,0,0)
    doc.text('Bruce Edgerton', W-M, y, { align:'right' })
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160)
    doc.text('dbappsystems.com | daddyboyapps.com', W/2, 760, { align:'center' })
    doc.save('Edgerton-CORRECTED-Invoice-' + (load.load_number || 'draft') + '.pdf')
  }

  async function saveEdit(load, localIdx) {
    const newNetPay = editNetPreview()
    const fields = {
      base_pay: editData.base_pay, detention: editData.detention, pallets: editData.pallets,
      notes: editData.notes, lumpers: JSON.stringify(editData.lumpers),
      incidentals: JSON.stringify(editData.incidentals), comdatas: JSON.stringify(editData.comdatas),
      net_pay: newNetPay, edited: 1, edited_date: new Date().toISOString(),
    }
    await patchLoad(load, localIdx, fields)
    generateCorrectedPDF(load, editData, newNetPay)
    showToast('✅ Corrected invoice downloaded!')
    closeEdit()
  }

  // ── HELPERS ──────────────────────────────────────────────
  function fmt(n)         { return '$' + (parseFloat(n)||0).toFixed(2) }
  function loadDate(load) { return load.created_at || load.date || null }
  function invoiceHref(load) {
    if (!load.invoice_url) return null
    if (load.invoice_url.startsWith('http')) return load.invoice_url
    return api + load.invoice_url
  }

  function getLoadTotals(load) {
    const comdataTotal = parseFloat(load.comdata_total) > 0
      ? parseFloat(load.comdata_total)
      : (load.comdatas || []).reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
    const lumperTotal  = parseFloat(load.lumper_total) > 0
      ? parseFloat(load.lumper_total)
      : (load.lumpers || []).reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
    const incTotal     = parseFloat(load.incidental_total) > 0
      ? parseFloat(load.incidental_total)
      : (load.incidentals || []).reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
    return { comdataTotal, lumperTotal, incTotal }
  }

  // Bruce: 20% of base_pay only — detention excluded
  // Tim:   80% of base_pay + 100% of detention
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

  // ── PERIOD NAVIGATION ────────────────────────────────────
  function inPeriod(load, p, offset) {
    const dateStr = loadDate(load)
    if (!dateStr) return false
    return inPeriodByDate(dateStr, p, offset)
  }

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

  function changePeriod(newPeriod) { setPeriod(newPeriod); setPeriodOffset(0) }

  function fuelForPeriod(driverName, fuelTypeFilter) {
    return fuelEntries
      .filter(f => f.driver === driverName.toUpperCase() && f.fuel_type === fuelTypeFilter && inPeriodByDate(f.entry_date, period, periodOffset))
      .reduce((s,f) => s + (parseFloat(f.amount)||0), 0)
  }

  function fuelEntriesForPeriod(driverName) {
    return fuelEntries.filter(f => f.driver === driverName.toUpperCase() && inPeriodByDate(f.entry_date, period, periodOffset))
  }

  // ── EXPORT SETTLEMENT TO CSV (opens in Excel) ─────────────
  // No dependencies needed — CSV opens natively in Excel on any device
  function exportSettlementCSV(driverName) {
    const dLoads      = loads.filter(l => l.driver === driverName)
    const inRange     = dLoads.filter(l => inPeriod(l, period, periodOffset))
    const periodLabel = getPeriodLabel(period, periodOffset)
    const generated   = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
    const fuelInRange = fuelEntries.filter(f => f.driver === driverName && inPeriodByDate(f.entry_date, period, periodOffset))
    const fleetFuelTotal  = fuelInRange.filter(f => f.fuel_type === 'fleet').reduce((s,f) => s+(parseFloat(f.amount)||0), 0)
    const pocketFuelTotal = fuelInRange.filter(f => f.fuel_type === 'pocket').reduce((s,f) => s+(parseFloat(f.amount)||0), 0)
    const n = (v) => (parseFloat(v)||0).toFixed(2)
    const rows = []

    // HEADER
    rows.push(['EDGERTON TRUCK & TRAILER REPAIR'])
    rows.push(['DRIVER SETTLEMENT STATEMENT'])
    rows.push([])
    rows.push(['Driver:', driverName])
    rows.push(['Period:', periodLabel])
    rows.push(['Generated:', generated])
    rows.push([])

    // EARNINGS
    rows.push(['EARNINGS'])
    rows.push(['Load #', 'Rate Con', '80% Gross Pay', 'Detention (100%)', 'Total Earned'])
    let totalRateCon = 0, totalGross80 = 0, totalDetention = 0, totalEarned = 0
    inRange.forEach(l => {
      const base      = parseFloat(l.base_pay) || 0
      const det       = parseFloat(l.detention) || 0
      const gross80   = base * TIM_CUT
      const earned    = gross80 + det
      totalRateCon   += base
      totalGross80   += gross80
      totalDetention += det
      totalEarned    += earned
      rows.push([l.load_number || '-', n(base), n(gross80), det > 0 ? n(det) : '', n(earned)])
    })
    rows.push(['TOTAL', n(totalRateCon), n(totalGross80), n(totalDetention), n(totalEarned)])
    rows.push([])

    // ADVANCES & REIMBURSEMENTS
    rows.push(['ADVANCES & REIMBURSEMENTS'])
    rows.push(['Load #', 'Comdata Issued', 'Lumpers + Incidentals', 'Advance Kept', 'Reimbursement Owed'])
    let totalAdvKept = 0, totalReimb = 0
    inRange.forEach(l => {
      const { comdataTotal, lumperTotal, incTotal } = getLoadTotals(l)
      if (comdataTotal === 0 && lumperTotal === 0 && incTotal === 0) return
      const expenses = lumperTotal + incTotal
      const advKept  = Math.max(0, comdataTotal - expenses)
      const reimb    = Math.max(0, expenses - comdataTotal)
      totalAdvKept  += advKept
      totalReimb    += reimb
      rows.push([l.load_number || '-', n(comdataTotal), n(expenses), advKept > 0 ? n(advKept) : '', reimb > 0 ? n(reimb) : ''])
    })
    rows.push(['TOTAL', '', '', n(totalAdvKept), n(totalReimb)])
    rows.push([])

    // FUEL
    if (fuelInRange.length > 0) {
      rows.push(['FUEL'])
      rows.push(['Date', 'Type', 'Notes', 'Amount'])
      fuelInRange.forEach(f => {
        rows.push([f.entry_date, f.fuel_type === 'fleet' ? 'Fleet Card (deducted from pay)' : 'Out of Pocket (tax expense)', f.notes || '', n(f.amount)])
      })
      rows.push(['Fleet Card Total', '', '', n(fleetFuelTotal)])
      if (pocketFuelTotal > 0) rows.push(['Out of Pocket Total (tax expense)', '', '', n(pocketFuelTotal)])
      rows.push([])
    }

    // SETTLEMENT SUMMARY
    const stillOwed = Math.max(0, totalEarned - totalAdvKept + totalReimb - fleetFuelTotal)
    rows.push(['SETTLEMENT SUMMARY'])
    rows.push(['Item', 'Amount'])
    rows.push(['Gross Pay (80% of rate con)', n(totalGross80)])
    if (totalDetention > 0) rows.push(['Detention / Layover (100% to driver)', n(totalDetention)])
    rows.push(['Less: Advance Kept (Comdata leftover)', '(' + n(totalAdvKept) + ')'])
    if (totalReimb > 0) rows.push(['Plus: Lumper Reimbursement (no comdata issued)', n(totalReimb)])
    if (fleetFuelTotal > 0) rows.push(['Less: Fleet Card Fuel', '(' + n(fleetFuelTotal) + ')'])
    rows.push([])
    rows.push(['NET AMOUNT OWED TO ' + driverName, n(stillOwed)])
    if (pocketFuelTotal > 0) {
      rows.push([])
      rows.push(['Out of Pocket Fuel (tax deductible - not deducted from pay)', n(pocketFuelTotal)])
    }
    rows.push([])
    rows.push(['Generated by Load Ledger V4 - dbappsystems.com | daddyboyapps.com'])

    // BUILD CSV AND DOWNLOAD
    const csv = rows.map(row =>
      row.map(cell => {
        const s = String(cell === undefined || cell === null ? '' : cell)
        return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
      }).join(',')
    ).join('\r\n')

    const bom  = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'Settlement-' + driverName + '-' + periodLabel.replace(/[\s/]/g,'_') + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('✅ Settlement exported — open in Excel!')
  }

  // ── DRIVER SPLITS ────────────────────────────────────────
  const bruceLoads = loads.filter(l => l.driver === 'BRUCE')
  const timLoads   = loads.filter(l => l.driver === 'TIM')

  function driverStats(dLoads, driverName, p, offset) {
    const inRange        = dLoads.filter(l => inPeriod(l, p, offset))
    const billed         = inRange.filter(l => l.status === 'billed' || l.status === 'paid')
    const paid           = inRange.filter(l => l.status === 'paid')
    const advKept        = inRange.reduce((s,l) => s + advanceKept(l), 0)
    const reimbOwed      = inRange.reduce((s,l) => s + reimbursementOwed(l), 0)
    const gPay           = inRange.reduce((s,l) => s + calcPay(l).driverNet, 0)
    const detentionTotal = inRange.reduce((s,l) => s + (parseFloat(l.detention)||0), 0)
    const fleetFuel      = fuelForPeriod(driverName, 'fleet')
    const pocketFuel     = fuelForPeriod(driverName, 'pocket')
    const stillOwed      = gPay - advKept + reimbOwed - fleetFuel
    return {
      count:          inRange.length,
      billed:         billed.reduce((s,l) => s+(parseFloat(l.netPay||l.net_pay)||0), 0),
      paid:           paid.reduce((s,l)   => s+(parseFloat(l.netPay||l.net_pay)||0), 0),
      ownerCut:       inRange.reduce((s,l) => s+calcPay(l).ownerCut, 0),
      grossPay:       gPay,
      detentionTotal,
      advanceKept:    advKept,
      reimbOwed,
      fleetFuel,
      pocketFuel,
      stillOwed:      Math.max(0, stillOwed),
      rateCon:        inRange.reduce((s,l) => s+(parseFloat(l.base_pay)||0), 0),
    }
  }

  const bruceTotalAllTime = bruceLoads.reduce((s,l) => s+(parseFloat(l.netPay||l.net_pay)||0), 0)
  const timTotalAllTime   = timLoads.reduce((s,l)   => s+(parseFloat(l.netPay||l.net_pay)||0), 0)
  const grandTotal        = bruceTotalAllTime + timTotalAllTime
  const brucePercent      = grandTotal > 0 ? Math.round((bruceTotalAllTime/grandTotal)*100) : 50
  const timPercent        = 100 - brucePercent
  const leader            = bruceTotalAllTime > timTotalAllTime ? 'BRUCE' : timTotalAllTime > bruceTotalAllTime ? 'TIM' : 'TIE'

  const filteredLoads = view === 'all' ? loads : view === 'BRUCE' ? bruceLoads : view === 'TIM' ? timLoads : []
  const totalNet      = filteredLoads.reduce((s,l) => s+(parseFloat(l.netPay||l.net_pay)||0), 0)
  const totalPaid     = filteredLoads.filter(l=>l.status==='paid').reduce((s,l) => s+(parseFloat(l.netPay||l.net_pay)||0), 0)
  const totalUnpaid   = totalNet - totalPaid

  const bruceStats    = driverStats(bruceLoads, 'BRUCE', period, periodOffset)
  const timStats      = driverStats(timLoads,   'TIM',   period, periodOffset)

  const loggedInDriver = driver ? driver.toUpperCase() : null
  const myIsBruce      = loggedInDriver === 'BRUCE'
  const myIsTim        = loggedInDriver === 'TIM'
  const myColor        = myIsBruce ? '#1e88e5' : '#e53935'
  const theirColor     = myIsBruce ? '#e53935' : '#1e88e5'
  const myName         = myIsBruce ? 'BRUCE'   : 'TIM'
  const theirName      = myIsBruce ? 'TIM'     : 'BRUCE'

  const editInputStyle = {
    width:'100%', background:'var(--navy3)', border:'1px solid var(--border)',
    color:'var(--white)', borderRadius:8, padding:'8px 10px',
    fontSize:14, fontFamily:'var(--font-body)', boxSizing:'border-box',
  }
  const navBtn = {
    padding:'6px 16px', borderRadius:8, border:'1px solid var(--border)',
    background:'var(--navy3)', color:'var(--white)', fontSize:20,
    fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer', lineHeight:1,
  }

  function PeriodNav() {
    return (
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:10 }}>
          {['daily','weekly','monthly','yearly'].map(p => (
            <button key={p} onClick={() => changePeriod(p)} style={{
              padding:'9px 4px', borderRadius:8, border:'none',
              fontFamily:'var(--font-head)', fontWeight:700, fontSize:11,
              letterSpacing:'0.05em', cursor:'pointer',
              background: period === p ? 'var(--white)' : 'var(--navy3)',
              color:       period === p ? 'var(--navy)'  : 'var(--grey)',
            }}>{p.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <button style={navBtn} onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13, color:'var(--amber)', letterSpacing:'0.08em', flex:1, padding:'0 8px' }}>
            {getPeriodLabel(period, periodOffset)}
            {periodOffset === 0 && <span style={{ fontSize:10, color:'var(--grey)', marginLeft:6 }}>CURRENT</span>}
          </div>
          <button style={{ ...navBtn, opacity: periodOffset >= 0 ? 0.3 : 1 }}
            disabled={periodOffset >= 0}
            onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
        </div>
      </div>
    )
  }

  if (loads.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div><h3>NO LOADS YET</h3>
        <p>Complete and invoice a load to see it here</p>
      </div>
    )
  }

  return (
    <div>
      <input ref={fuelFileRef} type="file" accept="image/*,application/pdf" style={{display:'none'}} onChange={handleFuelFile} />

      {/* VIEW TABS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
        {['all','BRUCE','TIM','reports'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding:'9px 4px', borderRadius:8, border:'none',
            fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
            letterSpacing:'0.05em', cursor:'pointer',
            background: view === v ? 'var(--amber)' : 'var(--navy3)',
            color:       view === v ? 'var(--navy)'  : 'var(--grey)',
          }}>{v.toUpperCase()}</button>
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

      {/* REPORTS */}
      {view === 'reports' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            <button onClick={() => setReportTab('carrier')} style={{
              padding:'12px 0', borderRadius:10, border:'none',
              fontFamily:'var(--font-head)', fontWeight:900, fontSize:13,
              letterSpacing:'0.06em', cursor:'pointer',
              background: reportTab === 'carrier' ? 'var(--amber)' : 'var(--navy3)',
              color:       reportTab === 'carrier' ? 'var(--navy)'  : 'var(--grey)',
            }}>🚛 CARRIER</button>
            <button onClick={() => { setReportTab('settlement'); fetchFuelEntries() }} style={{
              padding:'12px 0', borderRadius:10, border:'none',
              fontFamily:'var(--font-head)', fontWeight:900, fontSize:13,
              letterSpacing:'0.06em', cursor:'pointer',
              background: reportTab === 'settlement' ? 'var(--amber)' : 'var(--navy3)',
              color:       reportTab === 'settlement' ? 'var(--navy)'  : 'var(--grey)',
            }}>💵 SETTLEMENT</button>
          </div>

          <PeriodNav />

          {/* CARRIER */}
          {reportTab === 'carrier' && (
            <div>
              <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:10, textAlign:'center' }}>
                CARRIER BILLING — LOADS INVOICED, PAID &amp; OUTSTANDING
              </div>
              <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE {leader==='BRUCE'?'👑':''}</div>
                <div className="amount-row"><span className="label">Loads Invoiced</span><span className="value">{bruceStats.count}</span></div>
                <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed)}</span></div>
                <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid)}</span></div>
                <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.billed-bruceStats.paid)}</span></div>
              </div>
              <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM {leader==='TIM'?'👑':''}</div>
                <div className="amount-row"><span className="label">Loads Invoiced</span><span className="value">{timStats.count}</span></div>
                <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.billed)}</span></div>
                <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.paid)}</span></div>
                <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.billed-timStats.paid)}</span></div>
              </div>
              <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>COMBINED — {getPeriodLabel(period, periodOffset)}</div>
                <div className="amount-row"><span className="label">Total Loads</span><span className="value">{bruceStats.count+timStats.count}</span></div>
                <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed+timStats.billed)}</span></div>
                <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid+timStats.paid)}</span></div>
                <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt((bruceStats.billed+timStats.billed)-(bruceStats.paid+timStats.paid))}</span></div>
              </div>
            </div>
          )}

          {/* SETTLEMENT */}
          {reportTab === 'settlement' && (
            <div>
              <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:10, textAlign:'center' }}>
                DRIVER SETTLEMENT — PAY RECONCILIATION
              </div>

              {/* EXPORT TO EXCEL BUTTON */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                <button onClick={() => exportSettlementCSV('TIM')} style={{
                  padding:'10px 0', borderRadius:10, border:'1px solid #2a5a2a',
                  fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
                  letterSpacing:'0.05em', cursor:'pointer',
                  background:'#0a2a0a', color:'#4caf50',
                }}>📊 TIM — EXPORT EXCEL</button>
                <button onClick={() => exportSettlementCSV('BRUCE')} style={{
                  padding:'10px 0', borderRadius:10, border:'1px solid #1a3a5a',
                  fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
                  letterSpacing:'0.05em', cursor:'pointer',
                  background:'#0a1a2a', color:'#1e88e5',
                }}>📊 BRUCE — EXPORT EXCEL</button>
              </div>

              {/* ADD FUEL BUTTON */}
              <button onClick={() => {
                setShowFuelDrawer(p => !p)
                setFuelDriver(loggedInDriver || 'TIM')
                setFuelDate(new Date().toISOString().split('T')[0])
                setFuelAmount(''); setFuelNotes(''); setFuelType('fleet')
                setFuelReceiptB64(null); setFuelPreview(null)
              }} style={{
                width:'100%', padding:'12px 0', borderRadius:10, border:'none', marginBottom:12,
                fontFamily:'var(--font-head)', fontWeight:900, fontSize:13, cursor:'pointer',
                background: showFuelDrawer ? 'var(--navy3)' : '#1a3a1a',
                color: showFuelDrawer ? 'var(--grey)' : '#4caf50',
                letterSpacing:'0.06em',
              }}>
                {showFuelDrawer ? '✕ CANCEL FUEL ENTRY' : '⛽ ADD FUEL ENTRY'}
              </button>

              {/* FUEL ENTRY DRAWER */}
              {showFuelDrawer && (
                <div className="card" style={{ marginBottom:12, border:'1px solid #2a4a2a' }}>
                  <div style={{ fontFamily:'var(--font-head)', fontSize:12, color:'#4caf50', letterSpacing:'0.1em', marginBottom:12 }}>NEW FUEL ENTRY</div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>DRIVER</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {['TIM','BRUCE'].map(d => (
                        <button key={d} onClick={() => setFuelDriver(d)} style={{
                          padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer',
                          fontFamily:'var(--font-head)', fontWeight:700, fontSize:13,
                          background: fuelDriver === d ? (d==='TIM' ? '#e53935' : '#1e88e5') : 'var(--navy3)',
                          color: fuelDriver === d ? '#fff' : 'var(--grey)',
                        }}>{d}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>FUEL TYPE</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      <button onClick={() => setFuelType('fleet')} style={{
                        padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer',
                        fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
                        background: fuelType === 'fleet' ? 'var(--amber)' : 'var(--navy3)',
                        color: fuelType === 'fleet' ? 'var(--navy)' : 'var(--grey)',
                      }}>🏢 FLEET CARD</button>
                      <button onClick={() => setFuelType('pocket')} style={{
                        padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer',
                        fontFamily:'var(--font-head)', fontWeight:700, fontSize:12,
                        background: fuelType === 'pocket' ? '#1565c0' : 'var(--navy3)',
                        color: fuelType === 'pocket' ? '#fff' : 'var(--grey)',
                      }}>💵 OUT OF POCKET</button>
                    </div>
                    <div style={{ fontSize:10, color:'var(--grey)', marginTop:6, fontFamily:'var(--font-head)' }}>
                      {fuelType === 'fleet' ? 'Fleet card — deducted from what Edgerton owes driver' : 'Driver paid — tracked for tax purposes, not deducted from pay'}
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>DATE</div>
                    <input type="date" value={fuelDate} onChange={e => setFuelDate(e.target.value)} style={editInputStyle} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>AMOUNT ($)</div>
                    <input type="number" inputMode="decimal" placeholder="0.00"
                      value={fuelAmount} onChange={e => setFuelAmount(e.target.value)}
                      style={{ ...editInputStyle, fontSize:22, fontWeight:700, fontFamily:'var(--font-head)' }} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <button onClick={() => fuelFileRef.current.click()} disabled={fuelScanning} style={{
                      width:'100%', padding:'10px 0', borderRadius:8, border:'1px solid var(--border)',
                      background:'var(--navy3)', color: fuelScanning ? 'var(--grey)' : 'var(--white)',
                      fontFamily:'var(--font-head)', fontWeight:700, fontSize:13, cursor:'pointer',
                    }}>
                      {fuelScanning ? '📡 Scanning...' : '📷 Scan Receipt (optional)'}
                    </button>
                    {fuelPreview && (
                      <div style={{ marginTop:8, position:'relative' }}>
                        <img src={fuelPreview} alt="Receipt" style={{ width:'100%', borderRadius:6, border:'1px solid var(--border)', maxHeight:120, objectFit:'cover' }} />
                        <button onClick={() => { setFuelPreview(null); setFuelReceiptB64(null) }}
                          style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.7)', color:'#fff', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer', fontSize:12 }}>✕</button>
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:6 }}>NOTES (optional)</div>
                    <input type="text" placeholder="e.g. Fleet card week of Apr 21"
                      value={fuelNotes} onChange={e => setFuelNotes(e.target.value)} style={editInputStyle} />
                  </div>
                  <button onClick={saveFuelEntry} disabled={fuelSaving || !fuelAmount} style={{
                    width:'100%', padding:'12px 0', borderRadius:10, border:'none', cursor:'pointer',
                    fontFamily:'var(--font-head)', fontWeight:900, fontSize:14,
                    background: fuelSaving || !fuelAmount ? '#555' : '#4caf50',
                    color: '#fff', letterSpacing:'0.06em',
                  }}>
                    {fuelSaving ? 'SAVING...' : '✅ SAVE FUEL ENTRY'}
                  </button>
                </div>
              )}

              {/* BRUCE SETTLEMENT CARD */}
              <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>BRUCE {leader==='BRUCE'?'👑':''}</div>
                <div className="amount-row"><span className="label">Loads</span><span className="value">{bruceStats.count}</span></div>
                <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                  <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:6 }}>OWNER SETTLEMENT</div>
                  <div className="amount-row"><span className="label">Rate Con Total</span><span className="value">{fmt(bruceStats.rateCon)}</span></div>
                  <div className="amount-row"><span className="label">Owner Cut (20% of rate con)</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.ownerCut)}</span></div>
                </div>
                {fuelEntriesForPeriod('BRUCE').length > 0 && (
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:6 }}>⛽ FUEL ENTRIES</div>
                    {fuelEntriesForPeriod('BRUCE').map(f => (
                      <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:6 }}>
                        <div>
                          <span style={{ fontSize:11, color: f.fuel_type==='fleet' ? 'var(--amber)' : '#1565c0', fontFamily:'var(--font-head)', fontWeight:700 }}>{f.fuel_type === 'fleet' ? 'FLEET' : 'POCKET'}</span>
                          <span style={{ fontSize:11, color:'var(--grey)', marginLeft:6 }}>{f.entry_date}</span>
                          {f.notes && <span style={{ fontSize:10, color:'var(--grey)', marginLeft:6 }}>{f.notes}</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:'var(--font-head)', fontWeight:700, color:'var(--red)' }}>{fmt(f.amount)}</span>
                          <button onClick={() => deleteFuelEntry(f.id)} style={{ background:'transparent', border:'none', color:'#666', cursor:'pointer', fontSize:14, padding:'0 2px' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TIM SETTLEMENT CARD */}
              <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>TIM {leader==='TIM'?'👑':''}</div>
                <div className="amount-row"><span className="label">Loads</span><span className="value">{timStats.count}</span></div>
                <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                  <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:6 }}>DRIVER SETTLEMENT</div>
                  <div className="amount-row"><span className="label">Rate Con Total</span><span className="value">{fmt(timStats.rateCon)}</span></div>
                  <div className="amount-row"><span className="label">Gross Pay (80% of rate con)</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.grossPay - timStats.detentionTotal)}</span></div>
                  {timStats.detentionTotal > 0 && (
                    <div className="amount-row">
                      <span className="label" style={{color:'var(--green)'}}>Detention / Layover <span style={{fontSize:9}}>100% to Tim</span></span>
                      <span className="value" style={{color:'var(--green)'}}>+{fmt(timStats.detentionTotal)}</span>
                    </div>
                  )}
                  <div className="amount-row"><span className="label">Advance Kept</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.advanceKept)}</span></div>
                  {timStats.reimbOwed > 0 && (
                    <div className="amount-row">
                      <span className="label" style={{color:'var(--amber)'}}>Lumper Reimbursement <span style={{fontSize:9, color:'var(--grey)'}}>no comdata issued</span></span>
                      <span className="value" style={{color:'var(--amber)'}}>+{fmt(timStats.reimbOwed)}</span>
                    </div>
                  )}
                  <div className="amount-row"><span className="label">Fleet Card Fuel</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.fleetFuel)}</span></div>
                  {timStats.pocketFuel > 0 && (
                    <div className="amount-row">
                      <span className="label" style={{color:'#1565c0'}}>Out of Pocket Fuel <span style={{fontSize:9}}>(tax expense)</span></span>
                      <span className="value" style={{color:'#1565c0'}}>{fmt(timStats.pocketFuel)}</span>
                    </div>
                  )}
                  <div style={{marginTop:8,paddingTop:8,borderTop:'2px solid var(--border)'}}>
                    <div className="amount-row">
                      <span className="label" style={{fontWeight:900,color:'var(--white)',fontSize:14}}>Still Owed to Tim</span>
                      <span className="value" style={{color:'var(--amber)',fontSize:18,fontWeight:900}}>{fmt(timStats.stillOwed)}</span>
                    </div>
                  </div>
                </div>
                {fuelEntriesForPeriod('TIM').length > 0 && (
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:6 }}>⛽ FUEL ENTRIES</div>
                    {fuelEntriesForPeriod('TIM').map(f => (
                      <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:6 }}>
                        <div>
                          <span style={{ fontSize:11, color: f.fuel_type==='fleet' ? 'var(--amber)' : '#1565c0', fontFamily:'var(--font-head)', fontWeight:700 }}>{f.fuel_type === 'fleet' ? 'FLEET' : 'POCKET'}</span>
                          <span style={{ fontSize:11, color:'var(--grey)', marginLeft:6 }}>{f.entry_date}</span>
                          {f.notes && <span style={{ fontSize:10, color:'var(--grey)', marginLeft:6 }}>{f.notes}</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:'var(--font-head)', fontWeight:700, color: f.fuel_type==='fleet' ? 'var(--red)' : '#1565c0' }}>{fmt(f.amount)}</span>
                          <button onClick={() => deleteFuelEntry(f.id)} style={{ background:'transparent', border:'none', color:'#666', cursor:'pointer', fontSize:14, padding:'0 2px' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOADS LIST VIEW */}
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
            <div className="empty-state"><div className="icon">📋</div><h3>NO LOADS</h3><p>No loads found for this driver yet</p></div>
          )}

          {filteredLoads.map((load, idx) => {
            const localIdx    = loads.indexOf(load)
            const isEditing   = editIdx === localIdx
            const loadId      = load.id || localIdx
            const netPay      = parseFloat(load.netPay || load.net_pay) || 0
            const basePay     = parseFloat(load.base_pay)   || 0
            const detention   = parseFloat(load.detention)  || 0
            const pallets     = parseFloat(load.pallets)    || 0
            const lumpers     = load.lumpers      || []
            const incidentals = load.incidentals  || []
            const comdatas    = load.comdatas     || []
            const lumperTot   = lumpers.reduce((s,i)     => s+(parseFloat(i.amount)||0), 0)
            const incTot      = incidentals.reduce((s,i) => s+(parseFloat(i.amount)||0), 0)
            const subtotal    = basePay + lumperTot + incTot + detention + pallets
            const bolCount    = load.bol_count || (load.bols && load.bols.length) || 0
            const dateStr     = loadDate(load)
            const invHref     = invoiceHref(load)

            return (
              <div key={load.id || idx} style={{ background:'var(--white)', borderRadius:10, marginBottom:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.18)' }}>
                <div style={{ background: load.driver === 'BRUCE' ? '#1A3A5C' : '#2a0a0a', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontFamily:'var(--font-head)', fontWeight:700, background: load.driver === 'BRUCE' ? '#1e88e5' : '#e53935', color:'#fff' }}>
                      {load.driver || '-'}
                    </div>
                    <div style={{ fontSize:18, fontFamily:'var(--font-head)', fontWeight:900, color:'#fff', letterSpacing:'0.04em' }}>
                      #{load.load_number || '-'}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {bolCount > 0 && <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontFamily:'var(--font-head)' }}>{bolCount} BOL{bolCount!==1?'s':''}</div>}
                    <span className={'status-chip ' + load.status}>{load.status}</span>
                  </div>
                </div>

                <div style={{ padding:'12px 14px' }}>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:14, fontFamily:'var(--font-head)', fontWeight:900, color:'var(--navy)', marginBottom:2 }}>{load.broker_name || 'Unknown Broker'}</div>
                    <div style={{ fontSize:12, color:'#555', marginBottom:1 }}>{load.origin || '-'} → {load.destination || '-'}</div>
                    <div style={{ fontSize:11, color:'#888' }}>
                      {dateStr ? new Date(dateStr).toLocaleDateString() : '-'}
                      {(load.edited || load.edited_date) && <span style={{ marginLeft:6, color:'var(--amber)', fontSize:10, fontWeight:700 }}>EDITED {load.edited_date ? new Date(load.edited_date).toLocaleDateString() : ''}</span>}
                    </div>
                  </div>
                  <div style={{ borderTop:'1px solid #e0e0e0', marginBottom:8 }} />
                  <div style={{ fontSize:13, color:'var(--navy)' }}>
                    {[
                      ['Trucking Rate', basePay],
                      ...lumpers.map((l,i)     => ['Lumper Receipt '+(i+1),  parseFloat(l.amount)||0]),
                      ...incidentals.map((l,i) => ['Incidental '+(i+1),      parseFloat(l.amount)||0]),
                      ...(detention > 0 ? [['Detention', detention]] : []),
                      ...(pallets   > 0 ? [['Pallets',   pallets]]   : []),
                    ].map(([label, amount], i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', paddingBottom:4 }}>
                        <span style={{ color:'#444' }}>{label}</span>
                        <span style={{ fontFamily:'var(--font-head)', fontWeight:600, color:'var(--navy)' }}>{fmt(amount)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop:'1px solid #bbb', marginTop:4, marginBottom:4 }} />
                    <div style={{ display:'flex', justifyContent:'space-between', paddingBottom:4 }}>
                      <span style={{ fontWeight:700, color:'var(--navy)' }}>Subtotal</span>
                      <span style={{ fontFamily:'var(--font-head)', fontWeight:700, color:'var(--navy)' }}>{fmt(subtotal)}</span>
                    </div>
                    {comdatas.map((c,i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', paddingBottom:4 }}>
                        <span style={{ color:'#c62828' }}>Comdata / Express Code {i+1}</span>
                        <span style={{ fontFamily:'var(--font-head)', fontWeight:600, color:'#c62828' }}>-{fmt(parseFloat(c.amount)||0)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop:'1px solid #333', marginTop:2 }} />
                    <div style={{ borderTop:'1px solid #333', marginBottom:6 }} />
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12, fontFamily:'var(--font-head)', fontWeight:900, color:'var(--navy)', letterSpacing:'0.04em' }}>NET BILLABLE TOTAL</span>
                      <span style={{ fontSize:20, fontFamily:'var(--font-head)', fontWeight:900, color:'var(--navy)' }}>{fmt(netPay)}</span>
                    </div>
                  </div>

                  {invHref && (
                    <a href={invHref} target="_blank" rel="noopener noreferrer" style={{ display:'block', marginTop:10, padding:'8px 0', borderRadius:8, background:'transparent', border:'1px solid var(--amber)', color:'var(--amber)', fontFamily:'var(--font-head)', fontWeight:700, fontSize:12, textAlign:'center', textDecoration:'none', letterSpacing:'0.05em' }}>
                      VIEW INVOICE PDF
                    </a>
                  )}

                  <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                    {load.status !== 'billed' && load.status !== 'paid' && (
                      <button className="scan-btn secondary" style={{ flex:1, padding:'8px 12px', fontSize:12 }}
                        disabled={updating === loadId} onClick={() => patchLoad(load, localIdx, { status:'billed' })}>
                        {updating === loadId ? '...' : 'MARK BILLED'}
                      </button>
                    )}
                    {load.status !== 'paid' && (
                      <button className="scan-btn success" style={{ flex:1, padding:'8px 12px', fontSize:12 }}
                        disabled={updating === loadId} onClick={() => patchLoad(load, localIdx, { status:'paid' })}>
                        {updating === loadId ? '...' : 'MARK PAID'}
                      </button>
                    )}
                    {load.status === 'paid' && (
                      <div style={{ fontSize:12, color:'var(--green)', fontFamily:'var(--font-head)', fontWeight:700, paddingTop:4 }}>PAYMENT RECEIVED</div>
                    )}
                    <button style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--amber)', background: isEditing ? 'var(--amber)' : 'transparent', color: isEditing ? 'var(--navy)' : 'var(--amber)', fontSize:12, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}
                      onClick={() => openEdit(load, localIdx)}>{isEditing ? 'CLOSE' : 'EDIT'}</button>
                    <button style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ccc', background:'transparent', color:'#999', fontSize:12, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}
                      onClick={() => setConfirmDelete(localIdx)}>DELETE</button>
                  </div>

                  {confirmDelete === localIdx && (
                    <div style={{ marginTop:12, padding:12, background:'#fff3f3', borderRadius:8, border:'1px solid #e53935' }}>
                      <div style={{ fontSize:13, color:'#c62828', marginBottom:10, fontFamily:'var(--font-head)', fontWeight:700 }}>DELETE THIS LOAD? This cannot be undone.</div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button disabled={deleting} onClick={() => deleteLoad(load, localIdx)} style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background: deleting ? '#ccc' : '#e53935', color:'#fff', fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer' }}>
                          {deleting ? 'DELETING...' : 'CONFIRM DELETE'}
                        </button>
                        <button disabled={deleting} onClick={() => setConfirmDelete(null)} style={{ flex:1, padding:'10px 0', borderRadius:8, border:'1px solid #ccc', background:'transparent', color:'#888', fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}>CANCEL</button>
                      </div>
                    </div>
                  )}

                  {isEditing && editData && (
                    <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid #e0e0e0' }}>
                      <div style={{ fontFamily:'var(--font-head)', fontSize:12, color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>EDIT INVOICE AMOUNTS</div>
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:'#666', marginBottom:4, fontFamily:'var(--font-head)' }}>BASE PAY ($)</div>
                        <input style={editInputStyle} type="number" inputMode="decimal" value={editData.base_pay} onChange={e => setEditData(p => ({ ...p, base_pay: e.target.value }))} placeholder="0.00" />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:11, color:'#666', marginBottom:4, fontFamily:'var(--font-head)' }}>DETENTION ($)</div>
                          <input style={editInputStyle} type="number" inputMode="decimal" value={editData.detention} onChange={e => setEditData(p => ({ ...p, detention: e.target.value }))} placeholder="0.00" />
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:'#666', marginBottom:4, fontFamily:'var(--font-head)' }}>PALLETS ($)</div>
                          <input style={editInputStyle} type="number" inputMode="decimal" value={editData.pallets} onChange={e => setEditData(p => ({ ...p, pallets: e.target.value }))} placeholder="0.00" />
                        </div>
                      </div>
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:'#666', marginBottom:6, fontFamily:'var(--font-head)' }}>LUMPER RECEIPTS</div>
                        {editData.lumpers.map((item, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                            <div style={{ fontSize:12, color:'#666', minWidth:70 }}>Lumper {i+1}</div>
                            <input style={{ ...editInputStyle, flex:1 }} type="number" inputMode="decimal" value={item.amount} onChange={e => updateItemAmount('lumpers', i, e.target.value)} placeholder="0.00" />
                            <button onClick={() => removeEditItem('lumpers', i)} style={{ background:'transparent', border:'1px solid #ccc', color:'#999', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                          </div>
                        ))}
                        <button className="scan-btn secondary" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }} onClick={() => addEditItem('lumpers')}>+ ADD LUMPER</button>
                      </div>
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:'#666', marginBottom:6, fontFamily:'var(--font-head)' }}>INCIDENTALS</div>
                        {editData.incidentals.map((item, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                            <div style={{ fontSize:12, color:'#666', minWidth:70 }}>Inc. {i+1}</div>
                            <input style={{ ...editInputStyle, flex:1 }} type="number" inputMode="decimal" value={item.amount} onChange={e => updateItemAmount('incidentals', i, e.target.value)} placeholder="0.00" />
                            <button onClick={() => removeEditItem('incidentals', i)} style={{ background:'transparent', border:'1px solid #ccc', color:'#999', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                          </div>
                        ))}
                        <button className="scan-btn secondary" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }} onClick={() => addEditItem('incidentals')}>+ ADD INCIDENTAL</button>
                      </div>
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:'#666', marginBottom:6, fontFamily:'var(--font-head)' }}>COMDATA / EXPRESS CODES</div>
                        {editData.comdatas.map((item, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                            <div style={{ fontSize:12, color:'#c62828', minWidth:70 }}>Comdata {i+1}</div>
                            <input style={{ ...editInputStyle, flex:1, borderColor:'#e57373' }} type="number" inputMode="decimal" value={item.amount} onChange={e => updateItemAmount('comdatas', i, e.target.value)} placeholder="0.00" />
                            <button onClick={() => removeEditItem('comdatas', i)} style={{ background:'transparent', border:'1px solid #ccc', color:'#999', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:13, fontWeight:700 }}>x</button>
                          </div>
                        ))}
                        <button className="scan-btn danger" style={{ width:'100%', padding:'8px', fontSize:12, marginTop:4 }} onClick={() => addEditItem('comdatas')}>+ ADD COMDATA / EXPRESS CODE</button>
                      </div>
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:'#666', marginBottom:4, fontFamily:'var(--font-head)' }}>NOTES</div>
                        <textarea value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} placeholder="Notes..." style={{ ...editInputStyle, minHeight:60, resize:'vertical' }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f5f5f5', borderRadius:8, padding:'10px 14px', marginBottom:10, border:'1px solid #ddd' }}>
                        <span style={{ fontFamily:'var(--font-head)', fontSize:12, color:'#666' }}>UPDATED NET TOTAL</span>
                        <span style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color: editNetPreview() >= 0 ? 'var(--navy)' : '#c62828' }}>{fmt(editNetPreview())}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#888', textAlign:'center', marginBottom:10 }}>Saving will update the app and download a corrected invoice PDF.</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        <button className="scan-btn secondary" style={{ padding:'10px', fontSize:13 }} onClick={closeEdit}>CANCEL</button>
                        <button className="scan-btn success" style={{ padding:'10px', fontSize:13 }} onClick={() => saveEdit(load, localIdx)}>SAVE + DOWNLOAD</button>
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
