// src/Maintenance.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useEffect, useRef } from 'react'

const CATEGORIES = ['Repair', 'Parts', 'Maintenance', 'Equipment', 'Fuel', 'Other']

const CAT_COLORS = {
  Repair:      '#e53935',
  Parts:       '#1e88e5',
  Maintenance: '#ffb300',
  Equipment:   '#8e24aa',
  Fuel:        '#00acc1',
  Other:       '#757575',
}

const CAT_ICONS = {
  Repair:      '🔧',
  Parts:       '⚙️',
  Maintenance: '🛠️',
  Equipment:   '📦',
  Fuel:        '⛽',
  Other:       '📝',
}

export default function Maintenance({ driver, api, showToast }) {
  const [entries,       setEntries]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [filter,        setFilter]        = useState('All')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [uploading,     setUploading]     = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [toggling,      setToggling]      = useState(null)
  const [scanning,      setScanning]      = useState(false)

  // Scanned image for the new entry — held in memory until saved
  const [scannedImage,  setScannedImage]  = useState(null) // { dataUrl, base64, w, h, name }

  const [form, setForm] = useState({
    entry_date:  new Date().toISOString().split('T')[0],
    category:    'Repair',
    description: '',
    amount:      '',
    paid_by:     'TIM',
  })

  const scanInputRef   = useRef()
  const receiptFileRef = useRef()
  const uploadId       = useRef(null)

  useEffect(() => {
    fetchEntries()
  }, [driver])

  async function fetchEntries() {
    setLoading(true)
    try {
      const res  = await fetch(api + '/api/maintenance/' + driver)
      const data = await res.json()
      setEntries(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load maintenance:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  // ── B&W PIPELINE — LOCKED DO NOT MODIFY ──────────────────
  // 1. Grayscale  2. Auto-levels  3. Gaussian blur
  // 4. Bradley-Roth adaptive threshold  5. Unsharp mask
  function applyBWPipeline(canvas) {
    const w    = canvas.width
    const h    = canvas.height
    const ctx  = canvas.getContext('2d')
    const id   = ctx.getImageData(0, 0, w, h)
    const data = id.data

    const gray = new Uint8ClampedArray(w * h)
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4
      gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p+1] + 0.114 * data[p+2])
    }
    let mn = 255, mx = 0
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] < mn) mn = gray[i]
      if (gray[i] > mx) mx = gray[i]
    }
    const range = mx - mn || 1
    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.round(((gray[i] - mn) / range) * 255)
    }
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
    const sharp  = new Uint8ClampedArray(w * h)
    const amount = 1.5
    for (let i = 0; i < bw.length; i++) {
      sharp[i] = Math.min(255, Math.max(0, Math.round(bw[i] + amount * (bw[i] - blurred[i]))))
    }
    for (let i = 0; i < sharp.length; i++) {
      const p = i * 4
      data[p] = data[p+1] = data[p+2] = sharp[i]
      data[p+3] = 255
    }
    ctx.putImageData(id, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const base64  = dataUrl.split(',')[1]
    return { dataUrl, base64, w, h }
  }

  // ── PROCESS FILE — image or PDF ───────────────────────────
  async function processFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    let canvas
    if (isPdf) {
      const pdfjsLib = window.pdfjsLib
      if (!pdfjsLib) throw new Error('PDF.js not loaded')
      const arrayBuf = await file.arrayBuffer()
      const pdf      = await pdfjsLib.getDocument({ data: arrayBuf }).promise
      const page     = await pdf.getPage(1)
      const MAX      = 1200
      const baseVP   = page.getViewport({ scale: 1 })
      const scale    = Math.min(MAX / baseVP.width, MAX / baseVP.height, 2.0)
      const viewport = page.getViewport({ scale })
      canvas         = document.createElement('canvas')
      canvas.width   = Math.round(viewport.width)
      canvas.height  = Math.round(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    } else {
      canvas = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload  = (ev) => {
          const img = new Image()
          img.onerror = reject
          img.onload  = () => {
            const MAX = 1200
            let w = img.naturalWidth || img.width || 800
            let h = img.naturalHeight || img.height || 1000
            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
            if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }
            const c = document.createElement('canvas')
            c.width  = w
            c.height = h
            c.getContext('2d').drawImage(img, 0, 0, w, h)
            resolve(c)
          }
          img.src = ev.target.result
        }
        reader.readAsDataURL(file)
      })
    }
    const result = applyBWPipeline(canvas)
    return { ...result, name: file.name, isPdf }
  }

  // ── SCAN RECEIPT — OCR auto-fill ─────────────────────────
  async function handleScan(e) {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    showToast('📡 Scanning receipt...')
    try {
      const processed = await processFile(file)

      // Send original file to OCR for best accuracy
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload  = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(file)
      })
      const isPdf     = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const mediaType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg')

      const res = await fetch(api + '/api/ocr', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType, mode: 'incidental' }),
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

      // Store scanned image in memory — uploaded to R2 when entry saves
      setScannedImage({ ...processed, name: file.name })

      // Auto-fill amount
      setForm(p => ({ ...p, amount }))
      showToast('✅ Receipt scanned! $' + amount)
    } catch (err) {
      showToast('❌ Scan failed — enter amount manually')
      console.error(err)
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  // ── SAVE NEW ENTRY ────────────────────────────────────────
  async function saveEntry() {
    if (!form.description.trim()) { showToast('Enter a description'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Enter a valid amount'); return }
    if (!form.entry_date) { showToast('Select a date'); return }
    setSaving(true)
    try {
      // Step 1 — save entry to D1
      const res = await fetch(api + '/api/maintenance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver,
          entry_date:  form.entry_date,
          category:    form.category,
          description: form.description.trim(),
          amount:      parseFloat(form.amount),
          paid_by:     form.paid_by,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      const newId = data.id

      // Step 2 — if scanned image exists, upload to R2
      if (scannedImage && newId) {
        try {
          await fetch(api + '/api/maintenance-receipt/' + newId, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ base64: scannedImage.base64, mediaType: 'image/jpeg' }),
          })
        } catch (uploadErr) {
          console.error('Receipt upload failed (non-fatal):', uploadErr)
        }
      }

      showToast('✅ Entry saved!')
      setForm({
        entry_date:  new Date().toISOString().split('T')[0],
        category:    'Repair',
        description: '',
        amount:      '',
        paid_by:     'TIM',
      })
      setScannedImage(null)
      setShowForm(false)
      await fetchEntries()
    } catch (err) {
      showToast('⚠️ Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── TOGGLE PAID BY ────────────────────────────────────────
  async function togglePaidBy(entry) {
    const newVal = entry.paid_by === 'EDGERTON' ? 'TIM' : 'EDGERTON'
    setToggling(entry.id)
    try {
      const res = await fetch(api + '/api/maintenance/' + entry.id, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paid_by: newVal }),
      })
      if (!res.ok) throw new Error('Update failed')
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, paid_by: newVal } : e))
      showToast(newVal === 'EDGERTON' ? '🏢 Marked as Edgerton Paid' : '✅ Marked as Tim Paid')
    } catch (err) {
      showToast('⚠️ Update failed: ' + err.message)
    } finally {
      setToggling(null)
    }
  }

  // ── DELETE ENTRY ─────────────────────────────────────────
  async function deleteEntry(entry) {
    setDeleting(true)
    try {
      const res = await fetch(api + '/api/maintenance/' + entry.id, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ driver }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast('⚠️ Delete failed: ' + (data.error || 'unknown'))
        return
      }
      showToast('✅ Entry deleted')
      setConfirmDelete(null)
      await fetchEntries()
    } catch (err) {
      showToast('⚠️ Delete failed: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── REPLACE RECEIPT ON EXISTING ENTRY ────────────────────
  function openReceiptUpload(id) {
    uploadId.current = id
    receiptFileRef.current.click()
  }

  async function handleReceiptUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const id = uploadId.current
    setUploading(id)
    showToast('📤 Uploading receipt...')
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload  = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(file)
      })
      const mediaType = file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg'
      const res = await fetch(api + '/api/maintenance-receipt/' + id, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType }),
      })
      if (!res.ok) throw new Error('Upload failed')
      showToast('✅ Receipt uploaded!')
      await fetchEntries()
    } catch (err) {
      showToast('⚠️ Upload failed: ' + err.message)
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  const filtered      = filter === 'All' ? entries : entries.filter(e => e.category === filter)
  const totalAll      = entries.reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
  const totalMonth    = entries.filter(e => {
    if (!e.entry_date) return false
    const d = new Date(e.entry_date), now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
  const totalEdgerton = entries.filter(e => e.paid_by === 'EDGERTON').reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
  const totalTimPaid  = entries.filter(e => e.paid_by !== 'EDGERTON').reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
  const totalFiltered = filtered.reduce((s,e) => s + (parseFloat(e.amount)||0), 0)

  if (loading) {
    return (
      <div className="empty-state">
        <div className="icon">🔧</div>
        <h3>LOADING...</h3>
      </div>
    )
  }

  return (
    <div>
      {/* Hidden inputs */}
      <input ref={scanInputRef}   type="file" accept="application/pdf,image/*" style={{ display:'none' }} onChange={handleScan} />
      <input ref={receiptFileRef} type="file" accept="application/pdf,image/*" style={{ display:'none' }} onChange={handleReceiptUpload} />

      {/* HEADER */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:8 }}>{driver} — MAINTENANCE LEDGER</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>THIS MONTH</div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:18, fontWeight:900, color:'#e53935' }}>{fmt(totalMonth)}</div>
          </div>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>ALL TIME</div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:18, fontWeight:900, color:'var(--amber)' }}>{fmt(totalAll)}</div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:8 }}>PAYMENT SUMMARY — ALL TIME</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div style={{ background:'#1a2a0a', borderRadius:8, padding:'10px 12px', border:'1px solid #2e7d32' }}>
              <div style={{ fontSize:10, color:'#66bb6a', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:4 }}>TIM PAID</div>
              <div style={{ fontFamily:'var(--font-head)', fontSize:16, fontWeight:900, color:'#66bb6a' }}>{fmt(totalTimPaid)}</div>
              <div style={{ fontSize:10, color:'var(--grey)', marginTop:2 }}>No reimbursement needed</div>
            </div>
            <div style={{ background:'#1a0a2a', borderRadius:8, padding:'10px 12px', border:'1px solid #7b1fa2' }}>
              <div style={{ fontSize:10, color:'#ce93d8', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:4 }}>EDGERTON PAID</div>
              <div style={{ fontFamily:'var(--font-head)', fontSize:16, fontWeight:900, color:'#ce93d8' }}>{fmt(totalEdgerton)}</div>
              <div style={{ fontSize:10, color:'var(--grey)', marginTop:2 }}>Tim owes Edgerton</div>
            </div>
          </div>
          {totalEdgerton > 0 && (
            <div style={{ marginTop:8, padding:'10px 12px', background:'#2a0a2a', border:'1px solid #ce93d8', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, fontFamily:'var(--font-head)', fontWeight:700, color:'#ce93d8' }}>TOTAL REIMBURSEMENT OWED</span>
              <span style={{ fontSize:18, fontFamily:'var(--font-head)', fontWeight:900, color:'#ce93d8' }}>{fmt(totalEdgerton)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ADD ENTRY BUTTON */}
      {!showForm && (
        <button className="scan-btn success" style={{ marginBottom:14 }} onClick={() => setShowForm(true)}>
          + ADD ENTRY
        </button>
      )}

      {/* NEW ENTRY FORM */}
      {showForm && (
        <div className="card" style={{ marginBottom:14, border:'1px solid var(--amber)' }}>
          <div className="section-title" style={{ marginBottom:12 }}>NEW ENTRY</div>

          {/* SCAN RECEIPT BUTTON — at top of form */}
          <div style={{ marginBottom:14 }}>
            <button
              disabled={scanning}
              onClick={() => scanInputRef.current.click()}
              style={{
                width:'100%', padding:'14px 0', borderRadius:8, border:'none',
                background: scanning ? '#555' : 'var(--navy3)',
                color: scanning ? 'var(--grey)' : 'var(--white)',
                fontSize:14, fontFamily:'var(--font-head)', fontWeight:900,
                cursor:'pointer', border:'1px solid var(--border)',
              }}
            >
              {scanning ? '📡 Scanning...' : '📷 SCAN RECEIPT — Auto-fill Amount'}
            </button>

            {/* SCANNED PREVIEW */}
            {scannedImage && (
              <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:10,
                            background:'var(--navy3)', borderRadius:8, padding:'8px 10px',
                            border:'1px solid var(--green)' }}>
                <img src={scannedImage.dataUrl} alt="Scanned receipt"
                  style={{ width:48, height:48, objectFit:'cover', borderRadius:6, border:'1px solid var(--border)', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--font-head)', fontWeight:700 }}>✅ Receipt scanned</div>
                  <div style={{ fontSize:10, color:'var(--grey)', marginTop:2 }}>{scannedImage.name}</div>
                </div>
                <button onClick={() => setScannedImage(null)} style={{
                  background:'transparent', border:'none', color:'var(--grey)',
                  fontSize:16, cursor:'pointer', padding:'4px 8px',
                }}>×</button>
              </div>
            )}
          </div>

          {/* DATE */}
          <div className="field-row" style={{ marginBottom:10 }}>
            <div className="field-label">Date</div>
            <input type="date" value={form.entry_date}
              onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))}
              style={{ background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--white)', borderRadius:8, padding:'10px 12px', fontSize:15, width:'100%', boxSizing:'border-box' }} />
          </div>

          {/* CATEGORY */}
          <div style={{ marginBottom:10 }}>
            <div className="field-label" style={{ marginBottom:6 }}>Category</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setForm(p => ({ ...p, category: cat }))} style={{
                  padding:'8px 4px', borderRadius:8, border:'none',
                  background: form.category === cat ? CAT_COLORS[cat] : 'var(--navy3)',
                  color: form.category === cat ? '#fff' : 'var(--grey)',
                  fontSize:11, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                }}>
                  {CAT_ICONS[cat]} {cat}
                </button>
              ))}
            </div>
          </div>

          {/* DESCRIPTION */}
          <div className="field-row" style={{ marginBottom:10 }}>
            <div className="field-label">Description</div>
            <input type="text" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="e.g. Oil change, new brake pads..."
              style={{ background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--white)', borderRadius:8, padding:'10px 12px', fontSize:15, width:'100%', boxSizing:'border-box' }} />
          </div>

          {/* AMOUNT — auto-filled by scanner, editable */}
          <div className="field-row" style={{ marginBottom:12 }}>
            <div className="field-label">Amount ($) {scannedImage ? '— auto-filled from receipt' : ''}</div>
            <input type="text" inputMode="decimal" pattern="[0-9.]*" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
              style={{
                background:'var(--navy3)',
                border: scannedImage ? '1px solid var(--green)' : '1px solid var(--amber)',
                color:'var(--white)', borderRadius:8, padding:'10px 12px',
                fontSize:22, fontFamily:'var(--font-head)', fontWeight:700,
                width:'100%', boxSizing:'border-box',
              }} />
          </div>

          {/* PAID BY */}
          <div style={{ marginBottom:14 }}>
            <div className="field-label" style={{ marginBottom:8 }}>Paid By</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <button onClick={() => setForm(p => ({ ...p, paid_by: 'TIM' }))} style={{
                padding:'12px 0', borderRadius:8, border:'none',
                background: form.paid_by === 'TIM' ? '#2e7d32' : 'var(--navy3)',
                color: form.paid_by === 'TIM' ? '#fff' : 'var(--grey)',
                fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                borderLeft: form.paid_by === 'TIM' ? '3px solid #66bb6a' : '3px solid transparent',
              }}>✅ TIM PAID</button>
              <button onClick={() => setForm(p => ({ ...p, paid_by: 'EDGERTON' }))} style={{
                padding:'12px 0', borderRadius:8, border:'none',
                background: form.paid_by === 'EDGERTON' ? '#4a148c' : 'var(--navy3)',
                color: form.paid_by === 'EDGERTON' ? '#fff' : 'var(--grey)',
                fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                borderLeft: form.paid_by === 'EDGERTON' ? '3px solid #ce93d8' : '3px solid transparent',
              }}>🏢 EDGERTON PAID</button>
            </div>
            {form.paid_by === 'EDGERTON' && (
              <div style={{ fontSize:11, color:'#ce93d8', marginTop:6, fontFamily:'var(--font-head)' }}>
                ⚠️ Tim will owe reimbursement to Edgerton for this amount
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button disabled={saving} onClick={saveEntry} style={{
              flex:1, padding:'14px 0', borderRadius:8, border:'none',
              background: saving ? '#555' : 'var(--amber)', color:'var(--navy)',
              fontSize:15, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
            }}>
              {saving ? 'SAVING...' : 'SAVE ENTRY'}
            </button>
            <button onClick={() => { setShowForm(false); setScannedImage(null); setForm({ entry_date: new Date().toISOString().split('T')[0], category:'Repair', description:'', amount:'', paid_by:'TIM' }) }} style={{
              flex:1, padding:'14px 0', borderRadius:8, border:'1px solid var(--border)',
              background:'transparent', color:'var(--grey)',
              fontSize:15, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
            }}>CANCEL</button>
          </div>
        </div>
      )}

      {/* CATEGORY FILTER */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:6, marginBottom:14 }}>
        {['All', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            padding:'8px 12px', borderRadius:8, border:'none',
            background: filter === cat ? (cat === 'All' ? 'var(--amber)' : CAT_COLORS[cat]) : 'var(--navy3)',
            color: filter === cat ? (cat === 'All' ? 'var(--navy)' : '#fff') : 'var(--grey)',
            fontSize:11, fontFamily:'var(--font-head)', fontWeight:700,
            cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          }}>
            {cat === 'All' ? 'ALL' : CAT_ICONS[cat] + ' ' + cat}
          </button>
        ))}
      </div>

      {filter !== 'All' && (
        <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13, color: CAT_COLORS[filter], letterSpacing:'0.08em', marginBottom:10 }}>
          {CAT_ICONS[filter]} {filter.toUpperCase()} TOTAL: {fmt(totalFiltered)}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">🔧</div>
          <h3>NO ENTRIES</h3>
          <p>{filter === 'All' ? 'Tap + ADD ENTRY to get started' : 'No ' + filter + ' entries yet'}</p>
        </div>
      )}

      {/* ENTRY LIST */}
      {filtered.map(entry => {
        const isPending   = confirmDelete === entry.id
        const isUploading = uploading === entry.id
        const isToggling  = toggling === entry.id
        const catColor    = CAT_COLORS[entry.category] || 'var(--grey)'
        const isEdgerton  = entry.paid_by === 'EDGERTON'

        return (
          <div className="load-card" key={entry.id} style={{ borderLeft:'3px solid ' + catColor }}>
            <div style={{ flex:1 }}>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:10, background: catColor, color:'#fff', fontSize:10, fontFamily:'var(--font-head)', fontWeight:700 }}>
                  {CAT_ICONS[entry.category]} {entry.category}
                </div>
                <div style={{ fontSize:11, color:'var(--grey)' }}>
                  {entry.entry_date ? new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '-'}
                </div>
              </div>

              <div style={{ fontSize:15, color:'var(--white)', fontWeight:600, marginBottom:4 }}>
                {entry.description || '-'}
              </div>

              <div style={{ fontFamily:'var(--font-head)', fontSize:22, fontWeight:900, color:'#e53935', marginBottom:8 }}>
                {fmt(entry.amount)}
              </div>

              {/* PAID BY TOGGLE */}
              <div style={{ marginBottom:10 }}>
                <button disabled={isToggling} onClick={() => togglePaidBy(entry)} style={{
                  padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer',
                  background: isEdgerton ? '#4a148c' : '#2e7d32',
                  color:'#fff', fontSize:12, fontFamily:'var(--font-head)', fontWeight:900,
                  opacity: isToggling ? 0.6 : 1,
                }}>
                  {isToggling ? 'SAVING...' : isEdgerton ? '🏢 EDGERTON PAID — tap to change' : '✅ TIM PAID — tap to change'}
                </button>
                {isEdgerton && (
                  <div style={{ fontSize:10, color:'#ce93d8', marginTop:4, fontFamily:'var(--font-head)' }}>
                    Reimbursement owed to Edgerton
                  </div>
                )}
              </div>

              {/* RECEIPT BUTTONS */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button disabled={isUploading} onClick={() => openReceiptUpload(entry.id)} style={{
                  flex:1, padding:'8px 0', borderRadius:8, border:'1px solid var(--border)',
                  background:'var(--navy3)', color: isUploading ? 'var(--grey)' : 'var(--white)',
                  fontSize:11, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                }}>
                  {isUploading ? '📤 Uploading...' : entry.receipt_url ? '📎 Replace Receipt' : '📎 Add Receipt'}
                </button>

                {entry.receipt_url && (
                  <a href={api + entry.receipt_url} target="_blank" rel="noopener noreferrer" style={{
                    flex:1, padding:'8px 0', borderRadius:8, border:'1px solid var(--amber)',
                    background:'transparent', color:'var(--amber)',
                    fontSize:11, fontFamily:'var(--font-head)', fontWeight:700,
                    textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    👁 VIEW RECEIPT
                  </a>
                )}

                {!isPending && (
                  <button onClick={() => setConfirmDelete(entry.id)} style={{
                    padding:'8px 12px', borderRadius:8, border:'1px solid #555',
                    background:'transparent', color:'#888',
                    fontSize:11, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                  }}>DELETE</button>
                )}
              </div>

              {/* INLINE CONFIRM DELETE */}
              {isPending && (
                <div style={{ marginTop:10, background:'#2a0a0a', border:'1px solid #e53935', borderRadius:8, padding:'12px 14px' }}>
                  <div style={{ fontSize:12, color:'#e53935', fontFamily:'var(--font-head)', fontWeight:700, marginBottom:10 }}>
                    DELETE THIS ENTRY? CANNOT BE UNDONE.
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button disabled={deleting} onClick={() => deleteEntry(entry)} style={{
                      flex:1, padding:'10px 0', borderRadius:8, border:'none',
                      background: deleting ? '#555' : '#e53935', color:'#fff',
                      fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                    }}>
                      {deleting ? 'DELETING...' : 'CONFIRM DELETE'}
                    </button>
                    <button disabled={deleting} onClick={() => setConfirmDelete(null)} style={{
                      flex:1, padding:'10px 0', borderRadius:8, border:'1px solid #555',
                      background:'transparent', color:'#aaa',
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
  )
}
