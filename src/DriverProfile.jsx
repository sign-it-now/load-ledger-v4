// src/DriverProfile.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useEffect, useRef } from 'react'

const CREDENTIALS = [
  { key: 'dot_physical',    label: 'DOT Physical',     icon: '🏥' },
  { key: 'drivers_license', label: "Driver's License", icon: '🪪' },
  { key: 'plates',          label: 'Truck Plates',     icon: '🚛' },
  { key: 'authority',       label: 'Authority (MC#)',  icon: '📋' },
  { key: 'insurance',       label: 'Insurance',        icon: '🛡️' },
  { key: 'heavy_use_tax',   label: 'Heavy Use Tax',    icon: '💰' },
]

function daysUntil(dateStr) {
  if (!dateStr) return null
  const exp = new Date(dateStr)
  const now = new Date()
  now.setHours(0,0,0,0)
  exp.setHours(0,0,0,0)
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
}

function statusColor(days) {
  if (days === null) return 'var(--grey)'
  if (days < 0)      return '#e53935'
  if (days <= 30)    return '#ffb300'
  return 'var(--green)'
}

function statusLabel(days) {
  if (days === null)  return 'Not set'
  if (days < 0)       return 'EXPIRED ' + Math.abs(days) + ' days ago'
  if (days === 0)     return 'EXPIRES TODAY'
  if (days <= 30)     return 'Expires in ' + days + ' days'
  return 'Good — ' + days + ' days remaining'
}

export default function DriverProfile({ driver, api, showToast }) {
  const [creds,       setCreds]       = useState(null)
  const [editing,     setEditing]     = useState(null)
  const [editVal,     setEditVal]     = useState('')
  const [saving,      setSaving]      = useState(false)
  const [uploading,   setUploading]   = useState(null) // key of file uploading
  const [fileUrls,    setFileUrls]    = useState({})   // keyed by cred key — tracks which have files

  const fileInputRef = useRef()
  const uploadKey    = useRef(null)

  useEffect(() => {
    fetchCreds()
  }, [driver])

  async function fetchCreds() {
    try {
      const res  = await fetch(api + '/api/credentials/' + driver)
      const data = await res.json()
      setCreds(data)
      // Check which credentials have files in R2
      checkFilesExist(data)
    } catch (err) {
      console.error('Failed to load credentials:', err)
    }
  }

  // Check R2 for each credential file by doing a HEAD-style GET
  // If the file exists the URL will load, if not it 404s — we track this in state
  async function checkFilesExist(data) {
    const checks = {}
    await Promise.all(
      CREDENTIALS.map(async ({ key }) => {
        try {
          const url = api + '/api/credentials/' + driver + '/file/' + key
          const res = await fetch(url, { method: 'GET' })
          if (res.ok) {
            checks[key] = url
          }
        } catch {
          // file doesn't exist — that's fine
        }
      })
    )
    setFileUrls(checks)
  }

  async function saveCred(key, value) {
    if (!creds) return
    setSaving(true)
    const updated = { ...creds, [key]: value, [key + '_snooze']: '' }
    try {
      const res = await fetch(api + '/api/credentials/' + driver, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Save failed')
      setCreds(updated)
      setEditing(null)
      setEditVal('')
      showToast('✅ Credential saved!')
    } catch (err) {
      showToast('⚠️ Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── FILE UPLOAD ──────────────────────────────────────────
  function openFileUpload(key) {
    uploadKey.current = key
    fileInputRef.current.click()
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const key = uploadKey.current
    setUploading(key)
    showToast('📤 Uploading...')

    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload  = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(file)
      })

      const mediaType = file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg'

      const res = await fetch(api + '/api/credentials/' + driver + '/file/' + key, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType }),
      })

      if (!res.ok) throw new Error('Upload failed')

      // Update local file URL so VIEW button appears immediately
      setFileUrls(prev => ({
        ...prev,
        [key]: api + '/api/credentials/' + driver + '/file/' + key,
      }))
      showToast('✅ File uploaded!')
    } catch (err) {
      showToast('⚠️ Upload failed: ' + err.message)
      console.error(err)
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  function startEdit(key) {
    setEditing(key)
    setEditVal(creds?.[key] || '')
  }

  function cancelEdit() {
    setEditing(null)
    setEditVal('')
  }

  if (!creds) {
    return (
      <div className="empty-state">
        <div className="icon">🪪</div>
        <h3>LOADING...</h3>
      </div>
    )
  }

  return (
    <div>
      {/* Hidden file input — shared across all credentials */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display:'none' }}
        onChange={handleFileUpload}
      />

      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:4 }}>
          DRIVER CREDENTIALS
        </div>
        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4 }}>
          {driver} — set expiration dates and upload documents
        </div>
      </div>

      {CREDENTIALS.map(({ key, label, icon }) => {
        const dateVal   = creds[key] || ''
        const days      = daysUntil(dateVal)
        const color     = statusColor(days)
        const isEdit    = editing === key
        const isUploading = uploading === key
        const fileUrl   = fileUrls[key] || null

        return (
          <div className="card" key={key} style={{
            borderLeft: '3px solid ' + color,
            marginBottom: 10,
          }}>
            {/* HEADER ROW */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: isEdit ? 14 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
                <span style={{ fontSize:22, flexShrink:0 }}>{icon}</span>
                <div>
                  <div style={{ fontFamily:'var(--font-head)', fontWeight:700, fontSize:14, color:'var(--white)' }}>
                    {label}
                  </div>
                  <div style={{ fontSize:11, color: color, marginTop:2, fontFamily:'var(--font-head)', fontWeight:700 }}>
                    {statusLabel(days)}
                  </div>
                  {dateVal && (
                    <div style={{ fontSize:10, color:'var(--grey)', marginTop:1 }}>
                      Expires: {new Date(dateVal + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION BUTTONS — only show when not editing */}
              {!isEdit && (
                <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0, marginLeft:8 }}>
                  <button
                    onClick={() => startEdit(key)}
                    style={{
                      padding:'7px 12px', borderRadius:8,
                      border:'1px solid var(--border)',
                      background:'var(--navy3)', color:'var(--grey)',
                      fontSize:11, fontFamily:'var(--font-head)',
                      fontWeight:700, cursor:'pointer',
                    }}
                  >
                    {dateVal ? 'UPDATE' : 'SET DATE'}
                  </button>
                </div>
              )}
            </div>

            {/* FILE BUTTONS — always visible below header when not editing */}
            {!isEdit && (
              <div style={{ display:'flex', gap:8, marginTop: dateVal || fileUrl ? 10 : 6 }}>
                {/* UPLOAD BUTTON */}
                <button
                  disabled={isUploading}
                  onClick={() => openFileUpload(key)}
                  style={{
                    flex:1, padding:'9px 0', borderRadius:8,
                    border:'1px solid var(--border)',
                    background:'var(--navy3)',
                    color: isUploading ? 'var(--grey)' : 'var(--white)',
                    fontSize:12, fontFamily:'var(--font-head)',
                    fontWeight:700, cursor:'pointer',
                  }}
                >
                  {isUploading ? '📤 Uploading...' : fileUrl ? '📎 Replace File' : '📎 Upload File'}
                </button>

                {/* VIEW BUTTON — only if file exists in R2 */}
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex:1, padding:'9px 0', borderRadius:8,
                      border:'1px solid var(--amber)',
                      background:'transparent', color:'var(--amber)',
                      fontSize:12, fontFamily:'var(--font-head)',
                      fontWeight:700, cursor:'pointer',
                      textDecoration:'none',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}
                  >
                    👁 VIEW FILE
                  </a>
                )}
              </div>
            )}

            {/* INLINE DATE EDITOR */}
            {isEdit && (
              <div>
                <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)',
                              letterSpacing:'0.06em', marginBottom:8 }}>
                  SET EXPIRATION DATE FOR {label.toUpperCase()}
                </div>
                <input
                  type="date"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  style={{
                    width:'100%', background:'var(--navy3)',
                    border:'1px solid var(--amber)', color:'var(--white)',
                    borderRadius:8, padding:'12px 14px', fontSize:16,
                    fontFamily:'var(--font-body)', marginBottom:10,
                    boxSizing:'border-box',
                  }}
                />
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    disabled={saving || !editVal}
                    onClick={() => saveCred(key, editVal)}
                    style={{
                      flex:1, padding:'12px 0', borderRadius:8, border:'none',
                      background: saving || !editVal ? '#555' : 'var(--amber)',
                      color:'var(--navy)', fontSize:14,
                      fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
                    }}
                  >
                    {saving ? 'SAVING...' : 'SAVE'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      flex:1, padding:'12px 0', borderRadius:8,
                      border:'1px solid var(--border)', background:'transparent',
                      color:'var(--grey)', fontSize:14,
                      fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                    }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* LEGEND */}
      <div className="card" style={{ marginTop:6 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:'var(--green)', flexShrink:0 }} />
            <span style={{ fontSize:11, color:'var(--grey)' }}>Good — more than 30 days remaining</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:'#ffb300', flexShrink:0 }} />
            <span style={{ fontSize:11, color:'var(--grey)' }}>Expiring soon — within 30 days</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:'#e53935', flexShrink:0 }} />
            <span style={{ fontSize:11, color:'var(--grey)' }}>Expired — update immediately</span>
          </div>
        </div>
      </div>
    </div>
  )
}
