// src/App.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4

import { useState, useEffect } from 'react'
import RateCon from './RateCon.jsx'
import Invoice from './Invoice.jsx'
import Loads   from './Loads.jsx'

const API = 'https://load-ledger-v4.d49rwgmpj9.workers.dev'

export default function App() {
  const [tab,    setTab]    = useState('ratecon')
  const [load,   setLoad]   = useState(newLoad())
  const [toast,  setToast]  = useState(null)
  const [loads,  setLoads]  = useState([])

  // Auth state — check localStorage on startup for auto-login
  const [driver,     setDriver]     = useState(() => localStorage.getItem('ll_v4_driver') || null)
  const [pinDriver,  setPinDriver]  = useState(null)
  const [pinValue,   setPinValue]   = useState('')
  const [pinError,   setPinError]   = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  // Fetch loads from D1 any time driver is set
  useEffect(() => {
    if (driver) fetchLoads()
  }, [driver])

  async function fetchLoads() {
    try {
      const res  = await fetch(API + '/api/loads')
      const data = await res.json()
      if (Array.isArray(data)) setLoads(data)
    } catch {
      showToast('Could not load data — check connection')
    }
  }

  async function submitPin() {
    if (!pinValue) return
    setPinLoading(true)
    setPinError('')
    try {
      const res  = await fetch(API + '/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ driver: pinDriver, pin: pinValue }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPinError(data.error || 'Wrong PIN — try again')
        setPinValue('')
      } else {
        localStorage.setItem('ll_v4_driver', pinDriver)
        setDriver(pinDriver)
        setPinDriver(null)
        setPinValue('')
      }
    } catch {
      setPinError('Connection error — try again')
      setPinValue('')
    } finally {
      setPinLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('ll_v4_driver')
    setDriver(null)
    setLoad(newLoad())
    setLoads([])
    setTab('ratecon')
    setPinDriver(null)
    setPinValue('')
    setPinError('')
  }

  function newLoad() {
    return {
      id:            null,
      broker_name:   '',
      broker_email:  '',
      load_number:   '',
      origin:        '',
      destination:   '',
      pickup_date:   '',
      delivery_date: '',
      base_pay:      '',
      bols:          [],
      lumpers:       [],
      incidentals:   [],
      comdatas:      [],
      detention:     '',
      pallets:       '',
      notes:         '',
      status:        'draft',
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function resetLoad() {
    setLoad(newLoad())
    setTab('ratecon')
  }

  // ── PIN SCREEN ────────────────────────────────────────
  if (!driver) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'var(--navy)' }}>

        <div className="app-header">
          <div className="app-logo">LOAD<span>LEDGER</span></div>
          <div className="badge">V4</div>
        </div>

        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32 }}>

          {!pinDriver ? (
            <>
              <div style={{ fontFamily:'var(--font-head)', fontSize:13, letterSpacing:'0.15em', color:'var(--grey)', marginBottom:28 }}>
                WHO ARE YOU?
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <button
                  className="driver-btn active"
                  style={{ fontSize:18, padding:'18px 36px' }}
                  onClick={() => { setPinDriver('BRUCE'); setPinError('') }}
                >
                  BRUCE
                </button>
                <button
                  className="driver-btn active"
                  style={{ fontSize:18, padding:'18px 36px' }}
                  onClick={() => { setPinDriver('TIM'); setPinError('') }}
                >
                  TIM
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, letterSpacing:'0.1em', color:'var(--amber)', marginBottom:6 }}>
                {pinDriver}
              </div>
              <div style={{ fontFamily:'var(--font-head)', fontSize:12, letterSpacing:'0.15em', color:'var(--grey)', marginBottom:24 }}>
                ENTER YOUR PIN
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinValue}
                autoFocus
                onChange={e => { setPinValue(e.target.value); setPinError('') }}
                onKeyDown={e => e.key === 'Enter' && submitPin()}
                placeholder="••••"
                style={{
                  fontSize:       28,
                  letterSpacing:  '0.3em',
                  textAlign:      'center',
                  padding:        '14px 20px',
                  borderRadius:   12,
                  border:         pinError ? '2px solid var(--red)' : '2px solid var(--border)',
                  background:     'var(--navy3)',
                  color:          'var(--white)',
                  width:          180,
                  marginBottom:   12,
                  fontFamily:     'var(--font-head)',
                  outline:        'none',
                }}
              />
              {pinError && (
                <div style={{ color:'var(--red)', fontSize:13, marginBottom:12, fontFamily:'var(--font-head)', fontWeight:700 }}>
                  {pinError}
                </div>
              )}
              <button
                className="scan-btn success"
                style={{ width:180, marginBottom:12 }}
                onClick={submitPin}
                disabled={pinLoading || !pinValue}
              >
                {pinLoading ? 'CHECKING...' : 'ENTER'}
              </button>
              <button
                className="scan-btn secondary"
                style={{ width:180 }}
                onClick={() => { setPinDriver(null); setPinValue(''); setPinError('') }}
              >
                BACK
              </button>
            </>
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  // ── MAIN APP ──────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh' }}>

      {/* HEADER */}
      <div className="app-header">
        <div className="app-logo">LOAD<span>LEDGER</span></div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontSize:12, color:'var(--amber)', fontFamily:'var(--font-head)', fontWeight:700 }}>
            {driver}
          </div>
          <div className="badge">V4</div>
          <button
            onClick={logout}
            style={{
              background:  'transparent',
              border:      '1px solid var(--border)',
              color:       'var(--grey)',
              borderRadius: 6,
              padding:     '4px 10px',
              fontSize:    11,
              fontFamily:  'var(--font-head)',
              fontWeight:  700,
              cursor:      'pointer',
              letterSpacing: '0.05em',
            }}
          >
            LOGOUT
          </button>
        </div>
      </div>

      {/* NEW LOAD BAR */}
      <div className="driver-bar" style={{ justifyContent:'space-between' }}>
        <div style={{ fontSize:12, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em' }}>
          LOGGED IN AS {driver}
        </div>
        <button
          className="driver-btn"
          style={{ flex:'0 0 auto', padding:'10px 14px' }}
          onClick={resetLoad}
        >
          + NEW
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="tab-content">
        {tab === 'ratecon' && (
          <RateCon
            load={load}
            setLoad={setLoad}
            driver={driver}
            api={API}
            showToast={showToast}
            onNext={() => setTab('invoice')}
          />
        )}
        {tab === 'invoice' && (
          <Invoice
            load={load}
            setLoad={setLoad}
            driver={driver}
            api={API}
            showToast={showToast}
            fetchLoads={fetchLoads}
            resetLoad={resetLoad}
          />
        )}
        {tab === 'loads' && (
          <Loads
            loads={loads}
            fetchLoads={fetchLoads}
            driver={driver}
            api={API}
            showToast={showToast}
          />
        )}
      </div>

      {/* TAB BAR */}
      <div className="tab-bar">
        <button className={`tab-item ${tab==='ratecon'?'active':''}`} onClick={()=>setTab('ratecon')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          Rate Con
        </button>
        <button className={`tab-item ${tab==='invoice'?'active':''}`} onClick={()=>setTab('invoice')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          Invoice
        </button>
        <button className={`tab-item ${tab==='loads'?'active':''}`} onClick={()=>setTab('loads')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8"  y1="6"  x2="21" y2="6"/>
            <line x1="8"  y1="12" x2="21" y2="12"/>
            <line x1="8"  y1="18" x2="21" y2="18"/>
            <line x1="3"  y1="6"  x2="3.01" y2="6"/>
            <line x1="3"  y1="12" x2="3.01" y2="12"/>
            <line x1="3"  y1="18" x2="3.01" y2="18"/>
          </svg>
          Loads
        </button>
      </div>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}

    </div>
  )
}
