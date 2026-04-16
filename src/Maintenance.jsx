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

  // New entry form state
  const [form, setForm] = useState({
    entry_date:  new Date().toISOString().split('T')[0],
    category:    'Repair',
    description: '',
    amount:      '',
  })

  const fileInputRef = useRef()
  const uploadId     = useRef(null)

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

  async function saveEntry() {
    if (!form.description.trim()) { showToast('Enter a description'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Enter a valid amount'); return }
    if (!form.entry_date) { showToast('Select a date'); return }
    setSaving(true)
    try {
      const res = await fetch(api + '/api/maintenance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver,
          entry_date:  form.entry_date,
          category:    form.category,
          description: form.description.trim(),
          amount:      parseFloat(form.amount),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      showToast('✅ Entry saved!')
      setForm({
        entry_date:  new Date().toISOString().split('T')[0],
        category:    'Repair',
        description: '',
        amount:      '',
      })
      setShowForm(false)
      await fetchEntries()
    } catch (err) {
      showToast('⚠️ Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

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

  // ── RECEIPT UPLOAD ───────────────────────────────────────
  function openReceiptUpload(id) {
    uploadId.current = id
    fileInputRef.current.click()
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

  // ── FILTERED ENTRIES ─────────────────────────────────────
  const filtered = filter === 'All' ? entries : entries.filter(e => e.category === filter)

  // ── TOTALS ───────────────────────────────────────────────
  const totalAll   = entries.reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
  const totalMonth = entries.filter(e => {
    if (!e.entry_date) return false
    const d   = new Date(e.entry_date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s,e) => s + (parseFloat(e.amount)||0), 0)

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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display:'none' }}
        onChange={handleReceiptUpload}
      />

      {/* HEADER CARD */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:8 }}>
          {driver} — MAINTENANCE LEDGER
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>THIS MONTH</div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#e53935' }}>{fmt(totalMonth)}</div>
          </div>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>ALL TIME</div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'var(--amber)' }}>{fmt(totalAll)}</div>
          </div>
        </div>
      </div>

      {/* ADD ENTRY BUTTON */}
      {!showForm && (
        <button
          className="scan-btn success"
          style={{ marginBottom:14 }}
          onClick={() => setShowForm(true)}
        >
          + ADD ENTRY
        </button>
      )}

      {/* NEW ENTRY FORM */}
      {showForm && (
        <div className="card" style={{ marginBottom:14, border:'1px solid var(--amber)' }}>
          <div className="section-title" style={{ marginBottom:12 }}>NEW ENTRY</div>

          {/* DATE */}
          <div className="field-row" style={{ marginBottom:10 }}>
            <div className="field-label">Date</div>
            <input
              type="date"
              value={form.entry_date}
              onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))}
              style={{ background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--white)', borderRadius:8, padding:'10px 12px', fontSize:15, width:'100%', boxSizing:'border-box' }}
            />
          </div>

          {/* CATEGORY */}
          <div style={{ marginBottom:10 }}>
            <div className="field-label" style={{ marginBottom:6 }}>Category</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setForm(p => ({ ...p, category: cat }))}
                  style={{
                    padding:'8px 4px', borderRadius:8, border:'none',
                    background: form.category === cat ? CAT_COLORS[cat] : 'var(--navy3)',
                    color: form.category === cat ? '#fff' : 'var(--grey)',
                    fontSize:11, fontFamily:'var(--font-head)', fontWeight:700,
                    cursor:'pointer',
                  }}
                >
                  {CAT_ICONS[cat]} {cat}
                </button>
              ))}
            </div>
          </div>

          {/* DESCRIPTION */}
          <div className="field-row" style={{ marginBottom:10 }}>
            <div className="field-label">Description</div>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="e.g. Oil change, new brake pads..."
              style={{ background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--white)', borderRadius:8, padding:'10px 12px', fontSize:15, width:'100%', boxSizing:'border-box' }}
            />
          </div>

          {/* AMOUNT */}
          <div className="field-row" style={{ marginBottom:14 }}>
            <div className="field-label">Amount ($)</div>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.]*"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
              style={{ background:'var(--navy3)', border:'1px solid var(--amber)', color:'var(--white)', borderRadius:8, padding:'10px 12px', fontSize:22, fontFamily:'var(--font-head)', fontWeight:700, width:'100%', boxSizing:'border-box' }}
            />
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button
              disabled={saving}
              onClick={saveEntry}
              style={{
                flex:1, padding:'14px 0', borderRadius:8, border:'none',
                background: saving ? '#555' : 'var(--amber)',
                color:'var(--navy)', fontSize:15,
                fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
              }}
            >
              {saving ? 'SAVING...' : 'SAVE ENTRY'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm({ entry_date: new Date().toISOString().split('T')[0], category:'Repair', description:'', amount:'' }) }}
              style={{
                flex:1, padding:'14px 0', borderRadius:8,
                border:'1px solid var(--border)', background:'transparent',
                color:'var(--grey)', fontSize:15,
                fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* CATEGORY FILTER */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:6, marginBottom:14 }}>
        {['All', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding:'8px 12px', borderRadius:8, border:'none',
              background: filter === cat
                ? (cat === 'All' ? 'var(--amber)' : CAT_COLORS[cat])
                : 'var(--navy3)',
              color: filter === cat ? (cat === 'All' ? 'var(--navy)' : '#fff') : 'var(--grey)',
              fontSize:11, fontFamily:'var(--font-head)', fontWeight:700,
              cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
            }}
          >
            {cat === 'All' ? 'ALL' : CAT_ICONS[cat] + ' ' + cat}
          </button>
        ))}
      </div>

      {/* FILTERED TOTAL */}
      {filter !== 'All' && (
        <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13,
                      color: CAT_COLORS[filter], letterSpacing:'0.08em', marginBottom:10 }}>
          {CAT_ICONS[filter]} {filter.toUpperCase()} TOTAL: {fmt(totalFiltered)}
        </div>
      )}

      {/* EMPTY STATE */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">🔧</div>
          <h3>NO ENTRIES</h3>
          <p>{filter === 'All' ? 'Tap + ADD ENTRY to get started' : 'No ' + filter + ' entries yet'}</p>
        </div>
      )}

      {/* ENTRY LIST */}
      {filtered.map(entry => {
        const isPending = confirmDelete === entry.id
        const isUploading = uploading === entry.id
        const catColor = CAT_COLORS[entry.category] || 'var(--grey)'

        return (
          <div className="load-card" key={entry.id} style={{ borderLeft:'3px solid ' + catColor }}>
            <div style={{ flex:1 }}>

              {/* CATEGORY + DATE */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:4,
                  padding:'2px 8px', borderRadius:10,
                  background: catColor, color:'#fff',
                  fontSize:10, fontFamily:'var(--font-head)', fontWeight:700,
                }}>
                  {CAT_ICONS[entry.category]} {entry.category}
                </div>
                <div style={{ fontSize:11, color:'var(--grey)' }}>
                  {entry.entry_date ? new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '-'}
                </div>
              </div>

              {/* DESCRIPTION */}
              <div style={{ fontSize:15, color:'var(--white)', fontWeight:600, marginBottom:4 }}>
                {entry.description || '-'}
              </div>

              {/* AMOUNT */}
              <div style={{ fontFamily:'var(--font-head)', fontSize:22, fontWeight:900, color:'#e53935', marginBottom:8 }}>
                {fmt(entry.amount)}
              </div>

              {/* RECEIPT + DELETE BUTTONS */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>

                {/* UPLOAD RECEIPT */}
                <button
                  disabled={isUploading}
                  onClick={() => openReceiptUpload(entry.id)}
                  style={{
                    flex:1, padding:'8px 0', borderRadius:8,
                    border:'1px solid var(--border)',
                    background:'var(--navy3)',
                    color: isUploading ? 'var(--grey)' : 'var(--white)',
                    fontSize:11, fontFamily:'var(--font-head)', fontWeight:700,
                    cursor:'pointer',
                  }}
                >
                  {isUploading ? '📤 Uploading...' : entry.receipt_url ? '📎 Replace Receipt' : '📎 Add Receipt'}
                </button>

                {/* VIEW RECEIPT */}
                {entry.receipt_url && (
                  <a
                    href={api + entry.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex:1, padding:'8px 0', borderRadius:8,
                      border:'1px solid var(--amber)',
                      background:'transparent', color:'var(--amber)',
                      fontSize:11, fontFamily:'var(--font-head)', fontWeight:700,
                      textDecoration:'none',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}
                  >
                    👁 VIEW RECEIPT
                  </a>
                )}

                {/* DELETE */}
                {!isPending && (
                  <button
                    onClick={() => setConfirmDelete(entry.id)}
                    style={{
                      padding:'8px 12px', borderRadius:8,
                      border:'1px solid #555', background:'transparent',
                      color:'#888', fontSize:11,
                      fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                    }}
                  >
                    DELETE
                  </button>
                )}
              </div>

              {/* INLINE CONFIRM DELETE */}
              {isPending && (
                <div style={{
                  marginTop:10, background:'#2a0a0a',
                  border:'1px solid #e53935', borderRadius:8, padding:'12px 14px',
                }}>
                  <div style={{ fontSize:12, color:'#e53935', fontFamily:'var(--font-head)', fontWeight:700, marginBottom:10 }}>
                    DELETE THIS ENTRY? CANNOT BE UNDONE.
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      disabled={deleting}
                      onClick={() => deleteEntry(entry)}
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
                        flex:1, padding:'10px 0', borderRadius:8,
                        border:'1px solid #555', background:'transparent',
                        color:'#aaa', fontSize:13,
                        fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                      }}
                    >
                      CANCEL
                    </button>
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
