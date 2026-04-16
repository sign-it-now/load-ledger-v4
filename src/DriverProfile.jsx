// src/DriverProfile.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useEffect } from 'react'

const CREDENTIALS = [
  { key: 'dot_physical',    label: 'DOT Physical',    icon: '🏥' },
  { key: 'drivers_license', label: "Driver's License", icon: '🪪' },
  { key: 'plates',          label: 'Truck Plates',    icon: '🚛' },
  { key: 'authority',       label: 'Authority (MC#)', icon: '📋' },
  { key: 'insurance',       label: 'Insurance',       icon: '🛡️' },
  { key: 'heavy_use_tax',   label: 'Heavy Use Tax',   icon: '💰' },
]

function daysUntil(dateStr) {
  if (!dateStr) return null
  const exp  = new Date(dateStr)
  const now  = new Date()
  now.setHours(0,0,0,0)
  exp.setHours(0,0,0,0)
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
}

function statusColor(days) {
  if (days === null) return 'var(--grey)'
  if (days < 0)   return '#e53935'  // expired — red
  if (days <= 30) return '#ffb300'  // expiring soon — amber
  return 'var(--green)'             // good — green
}

function statusLabel(days) {
  if (days === null)  return 'Not set'
  if (days < 0)       return 'EXPIRED ' + Math.abs(days) + ' days ago'
  if (days === 0)     return 'EXPIRES TODAY'
  if (days <= 30)     return 'Expires in ' + days + ' days'
  return 'Good — ' + days + ' days remaining'
}

export default function DriverProfile({ driver, api, showToast }) {
  const [creds,   setCreds]   = useState(null)
  const [editing, setEditing] = useState(null) // key of field being edited
  const [editVal, setEditVal] = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetchCreds()
  }, [driver])

  async function fetchCreds() {
    try {
      const res  = await fetch(api + '/api/credentials/' + driver)
      const data = await res.json()
      setCreds(data)
    } catch (err) {
      console.error('Failed to load credentials:', err)
    }
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
      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:4 }}>
          DRIVER CREDENTIALS
        </div>
        <div style={{ fontSize:11, color:'var(--grey)', marginBottom:4 }}>
          {driver} — tap any credential to update expiration date
        </div>
      </div>

      {CREDENTIALS.map(({ key, label, icon }) => {
        const dateVal = creds[key] || ''
        const days    = daysUntil(dateVal)
        const color   = statusColor(days)
        const isEdit  = editing === key

        return (
          <div className="card" key={key} style={{
            borderLeft: '3px solid ' + color,
            marginBottom: 10,
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: isEdit ? 12 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:22 }}>{icon}</span>
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
              {!isEdit && (
                <button
                  onClick={() => startEdit(key)}
                  style={{
                    padding:'8px 14px', borderRadius:8,
                    border:'1px solid var(--border)',
                    background:'var(--navy3)', color:'var(--grey)',
                    fontSize:12, fontFamily:'var(--font-head)',
                    fontWeight:700, cursor:'pointer', flexShrink:0,
                  }}
                >
                  {dateVal ? 'UPDATE' : 'SET DATE'}
                </button>
              )}
            </div>

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
