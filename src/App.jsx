// src/App.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4

import { useState, useEffect } from 'react'
import RateCon       from './RateCon.jsx'
import Invoice       from './Invoice.jsx'
import Loads         from './Loads.jsx'
import DriverProfile from './DriverProfile.jsx'
import Maintenance   from './Maintenance.jsx'
import Assets        from './Assets.jsx'
import Tax           from './Tax.jsx'

const API = 'https://load-ledger-v4.d49rwgmpj9.workers.dev'

const CRED_LABELS = {
  dot_physical:    'DOT Physical',
  drivers_license: "Driver's License",
  plates:          'Truck Plates',
  authority:       'Authority (MC#)',
  insurance:       'Insurance',
  heavy_use_tax:   'Heavy Use Tax',
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const exp = new Date(dateStr), now = new Date()
  now.setHours(0,0,0,0); exp.setHours(0,0,0,0)
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
}

export default function App() {
  const [tab,       setTab]       = useState('ratecon')
  const [driver,    setDriver]    = useState(null)
  const [pin,       setPin]       = useState(null)
  const [load,      setLoad]      = useState(newLoad())
  const [loads,     setLoads]     = useState([])
  const [toast,     setToast]     = useState(null)
  const [pinInput,  setPinInput]  = useState('')
  const [pinError,  setPinError]  = useState(false)
  const [pinDriver, setPinDriver] = useState(null)

  const [maintenanceEntries, setMaintenanceEntries] = useState([])

  const [credAlerts,  setCredAlerts]  = useState([])
  const [alertIdx,    setAlertIdx]    = useState(0)
  const [snoozeInput, setSnoozeInput] = useState('')
  const [showSnooze,  setShowSnooze]  = useState(false)

  async function fetchLoads() {
    try {
      const res  = await fetch(API + '/api/loads')
      const data = await res.json()
      if (Array.isArray(data)) {
        setLoads(data)
        try { localStorage.setItem('ll_v4_loads', JSON.stringify(data)) } catch {}
      }
    } catch {
      try { const saved = localStorage.getItem('ll_v4_loads'); if (saved) setLoads(JSON.parse(saved)) } catch {}
    }
  }

  async function checkCredentials(driverName) {
    try {
      const res   = await fetch(API + '/api/credentials/' + driverName)
      const data  = await res.json()
      const today = new Date().toISOString().split('T')[0]
      const alerts = []
      Object.keys(CRED_LABELS).forEach(key => {
        const expDate    = data[key] || ''
        const snoozeDate = data[key + '_snooze'] || ''
        const days       = daysUntil(expDate)
        if (snoozeDate && snoozeDate > today) return
        if (days !== null && days <= 30) alerts.push({ key, label: CRED_LABELS[key], days, expDate })
        if (!expDate) alerts.push({ key, label: CRED_LABELS[key], days: null, expDate: '' })
      })
      if (alerts.length > 0) { setCredAlerts(alerts); setAlertIdx(0); setShowSnooze(false); setSnoozeInput('') }
    } catch (err) { console.error('Failed to check credentials:', err) }
  }

  useEffect(() => {
    if (driver) { fetchLoads(); checkCredentials(driver) }
  }, [driver])

  function newLoad() {
    return {
      id:null, broker_name:'', broker_email:'', load_number:'',
      origin:'', destination:'', pickup_date:'', delivery_date:'',
      base_pay:'', bols:[], lumpers:[], incidentals:[], comdatas:[],
      detention:'', pallets:'', notes:'', status:'draft',
    }
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }
  function resetLoad()    { setLoad(newLoad()); setTab('ratecon') }

  function logout() {
    setDriver(null)
    setPin(null)
    setPinInput('')
    setPinDriver(null)
    setPinError(false)
    resetLoad()
    setLoads([])
    setCredAlerts([])
    setMaintenanceEntries([])
  }

  function selectDriverForPin(d) { setPinDriver(d); setPinInput(''); setPinError(false) }

  async function handlePinKey(key) {
    if (key === 'DEL') { setPinInput(p => p.slice(0,-1)); setPinError(false); return }
    const next = pinInput + key
    setPinInput(next)
    if (next.length === 4) {
      try {
        const res  = await fetch(API + '/api/auth', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver: pinDriver, pin: next }),
        })
        const data = await res.json()
        if (data.ok) {
          setDriver(pinDriver)
          setPin(next)
          setPinInput('')
          setPinDriver(null)
          setPinError(false)
        } else {
          setPinError(true)
          setTimeout(() => { setPinInput(''); setPinError(false) }, 800)
        }
      } catch {
        setPinError(true)
        setTimeout(() => { setPinInput(''); setPinError(false) }, 800)
      }
    }
  }

  const currentAlert = credAlerts[alertIdx] || null

  function dismissAlert() {
    const next = alertIdx + 1
    if (next >= credAlerts.length) { setCredAlerts([]); setAlertIdx(0) } else { setAlertIdx(next) }
    setShowSnooze(false); setSnoozeInput('')
  }

  async function snoozeAlert() {
    if (!snoozeInput || !currentAlert) return
    try {
      const res  = await fetch(API + '/api/credentials/' + driver)
      const data = await res.json()
      await fetch(API + '/api/credentials/' + driver, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, [currentAlert.key + '_snooze']: snoozeInput }),
      })
    } catch {}
    dismissAlert()
  }

  function renderCredAlert() {
    if (!currentAlert || !driver) return null
    const { label, days, expDate } = currentAlert
    const isExpired = days !== null && days < 0
    const isUnset   = days === null
    const isSoon    = days !== null && days >= 0 && days <= 30
    const borderColor = isExpired ? '#e53935' : '#ffb300'
    const titleColor  = isExpired ? '#e53935' : '#ffb300'

    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ background: isExpired ? '#2a0a0a' : '#1a1200', border:'2px solid '+borderColor, borderRadius:14, padding:24, width:'100%', maxWidth:360 }}>
          <div style={{ fontSize:13, color:titleColor, fontFamily:'var(--font-head)', fontWeight:900, letterSpacing:'0.1em', marginBottom:8 }}>⚠️ CREDENTIAL ALERT</div>
          <div style={{ fontSize:20, fontFamily:'var(--font-head)', fontWeight:900, color:'var(--white)', marginBottom:8 }}>{label}</div>
          <div style={{ fontSize:14, color:titleColor, fontFamily:'var(--font-head)', fontWeight:700, marginBottom:16 }}>
            {isUnset   && 'No expiration date on file. Please update.'}
            {isExpired && 'EXPIRED ' + Math.abs(days) + ' days ago!'}
            {isSoon    && (days === 0 ? 'EXPIRES TODAY!' : 'Expires in ' + days + ' day' + (days !== 1 ? 's' : '') + '!')}
          </div>
          {expDate && <div style={{ fontSize:11, color:'var(--grey)', marginBottom:16 }}>Current expiration: {new Date(expDate+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>}
          {credAlerts.length > 1 && <div style={{ fontSize:11, color:'var(--grey)', marginBottom:16 }}>Alert {alertIdx+1} of {credAlerts.length}</div>}
          {!showSnooze ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={() => { dismissAlert(); setTab('profile') }} style={{ padding:'14px 0', borderRadius:8, border:'none', background:'var(--amber)', color:'var(--navy)', fontSize:14, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer' }}>UPDATE NOW</button>
              <button onClick={() => setShowSnooze(true)} style={{ padding:'12px 0', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--grey)', fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}>REMIND ME ON A SPECIFIC DATE</button>
              <button onClick={dismissAlert} style={{ padding:'12px 0', borderRadius:8, border:'1px solid #333', background:'transparent', color:'#666', fontSize:12, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}>OK — DISMISS FOR NOW</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.06em', marginBottom:8 }}>REMIND ME ON THIS DATE</div>
              <input type="date" value={snoozeInput} onChange={e => setSnoozeInput(e.target.value)}
                style={{ width:'100%', background:'var(--navy3)', border:'1px solid var(--amber)', color:'var(--white)', borderRadius:8, padding:'12px 14px', fontSize:16, fontFamily:'var(--font-body)', marginBottom:10, boxSizing:'border-box' }} />
              <div style={{ display:'flex', gap:8 }}>
                <button disabled={!snoozeInput} onClick={snoozeAlert} style={{ flex:1, padding:'12px 0', borderRadius:8, border:'none', background: snoozeInput ? 'var(--amber)' : '#555', color:'var(--navy)', fontSize:13, fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer' }}>SET REMINDER</button>
                <button onClick={() => { setShowSnooze(false); setSnoozeInput('') }} style={{ flex:1, padding:'12px 0', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--grey)', fontSize:13, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}>BACK</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── PIN SCREEN ───────────────────────────────────────────
  if (!driver) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'var(--navy)' }}>
        <div className="app-header">
          <div className="app-logo">LOAD<span>LEDGER</span></div>
          <div className="badge">V4</div>
        </div>
        <div className="tab-content" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          {!pinDriver ? (
            <>
              <div className="empty-state" style={{ paddingTop:0 }}>
                <div className="icon">🚛</div><h3>SELECT YOUR NAME</h3><p>Tap your name to enter your PIN</p>
              </div>
              <div style={{ display:'flex', gap:16, marginTop:8 }}>
                {['BRUCE','TIM'].map(d => (
                  <button key={d} className="driver-btn" style={{ fontSize:20, padding:'18px 36px' }} onClick={() => selectDriverForPin(d)}>{d}</button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ width:'100%', maxWidth:320, padding:'0 24px' }}>
              <div style={{ textAlign:'center', marginBottom:24 }}>
                <div style={{ fontSize:13, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.1em', marginBottom:6 }}>ENTER PIN FOR</div>
                <div style={{ fontSize:28, fontFamily:'var(--font-head)', fontWeight:900, color:'var(--amber)' }}>{pinDriver}</div>
              </div>
              <div style={{ display:'flex', justifyContent:'center', gap:16, marginBottom:32 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width:18, height:18, borderRadius:'50%',
                    background: pinError ? '#e53935' : pinInput.length > i ? 'var(--amber)' : 'var(--navy3)',
                    border:'2px solid ' + (pinError ? '#e53935' : 'var(--border)'),
                    transition:'background 0.15s',
                  }} />
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                {['1','2','3','4','5','6','7','8','9','','0','DEL'].map((k,i) => (
                  k === '' ? <div key={i} /> :
                  <button key={k} onClick={() => handlePinKey(k)} style={{
                    padding:'18px 0', borderRadius:12, border:'1px solid var(--border)',
                    background: k === 'DEL' ? 'var(--navy3)' : 'var(--navy2)',
                    color: k === 'DEL' ? 'var(--grey)' : 'var(--white)',
                    fontSize: k === 'DEL' ? 13 : 22,
                    fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer',
                    WebkitTapHighlightColor:'transparent',
                  }}>{k}</button>
                ))}
              </div>
              <button onClick={() => { setPinDriver(null); setPinInput(''); setPinError(false) }}
                style={{ width:'100%', marginTop:20, padding:'12px 0', background:'transparent', border:'none', color:'var(--grey)', fontSize:13, fontFamily:'var(--font-head)', cursor:'pointer' }}>
                ← BACK
              </button>
            </div>
          )}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  // ── MAIN APP ─────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh' }}>

      {renderCredAlert()}

      <div className="app-header">
        <div className="app-logo">LOAD<span>LEDGER</span></div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:12, color:'var(--grey)', fontFamily:'var(--font-head)' }}>{driver}</div>
          <div className="badge">V4</div>
          <button onClick={logout} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--grey)', fontSize:11, fontFamily:'var(--font-head)', fontWeight:700, cursor:'pointer' }}>LOGOUT</button>
        </div>
      </div>

      <div className="driver-bar" style={{ justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:12, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em' }}>LOGGED IN AS {driver}</div>
        <button className="driver-btn active" style={{ flex:'0 0 auto', padding:'10px 20px' }} onClick={resetLoad}>+ NEW</button>
      </div>

      <div className="tab-content">
        {tab === 'ratecon'     && <RateCon load={load} setLoad={setLoad} driver={driver} api={API} showToast={showToast} onNext={() => setTab('invoice')} />}
        {tab === 'invoice'     && <Invoice load={load} setLoad={setLoad} driver={driver} api={API} showToast={showToast} fetchLoads={fetchLoads} resetLoad={resetLoad} />}
        {tab === 'loads'       && <Loads loads={loads} setLoads={setLoads} api={API} showToast={showToast} fetchLoads={fetchLoads} />}
        {tab === 'profile'     && <DriverProfile driver={driver} api={API} showToast={showToast} pin={pin} />}
        {tab === 'maintenance' && <Maintenance driver={driver} api={API} showToast={showToast} onEntriesChange={setMaintenanceEntries} />}
        {tab === 'assets'      && <Assets driver={driver} api={API} showToast={showToast} maintenanceEntries={maintenanceEntries} />}
        {tab === 'tax'         && <Tax loads={loads} driver={driver} />}
      </div>

      {/* TAB BAR */}
      <div className="tab-bar">
        <button className={`tab-item ${tab==='ratecon'?'active':''}`} onClick={() => setTab('ratecon')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          Rate Con
        </button>
        <button className={`tab-item ${tab==='invoice'?'active':''}`} onClick={() => setTab('invoice')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Invoice
        </button>
        <button className={`tab-item ${tab==='loads'?'active':''}`} onClick={() => setTab('loads')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Loads
        </button>
        <button className={`tab-item ${tab==='profile'?'active':''}`} onClick={() => setTab('profile')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Profile
        </button>
        <button className={`tab-item ${tab==='maintenance'?'active':''}`} onClick={() => setTab('maintenance')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
          Repairs
        </button>
        <button className={`tab-item ${tab==='assets'?'active':''}`} onClick={() => setTab('assets')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          Assets
        </button>
        <button className={`tab-item ${tab==='tax'?'active':''}`} onClick={() => setTab('tax')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>
          Tax
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
