// src/App.jsx
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4

import { useState } from 'react'
import RateCon from './RateCon.jsx'
import Invoice from './Invoice.jsx'
import Loads from './Loads.jsx'

const API = import.meta.env.VITE_API_URL

export default function App() {
  const [tab, setTab]       = useState('ratecon')
  const [driver, setDriver] = useState(null)
  const [load, setLoad]     = useState(newLoad())
  const [loads, setLoads]   = useState([])
  const [toast, setToast]   = useState(null)

  function newLoad() {
    return {
      id:           null,
      broker_name:  '',
      broker_email: '',
      load_number:  '',
      origin:       '',
      destination:  '',
      pickup_date:  '',
      delivery_date:'',
      base_pay:     '',
      bols:         [],
      lumpers:      [],
      incidentals:  [],
      comdatas:     [],
      detention:    '',
      pallets:      '',
      status:       'draft',
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

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh' }}>

      {/* HEADER */}
      <div className="app-header">
        <div className="app-logo">LOAD<span>LEDGER</span></div>
        <div className="badge">V4</div>
      </div>

      {/* DRIVER SELECT */}
      <div className="driver-bar">
        {['BRUCE','TIM'].map(d => (
          <button
            key={d}
            className={`driver-btn ${driver === d ? 'active' : ''}`}
            onClick={() => setDriver(d)}
          >
            {driver === d ? '✓ ' : ''}{d}
          </button>
        ))}
        {driver && (
          <button
            className="driver-btn"
            style={{ flex:'0 0 auto', padding:'10px 14px' }}
            onClick={resetLoad}
            title="New Load"
          >
            + NEW
          </button>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="tab-content">
        {!driver ? (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <div className="icon">🚛</div>
            <h3>SELECT YOUR NAME</h3>
            <p>Tap BRUCE or TIM above to start</p>
          </div>
        ) : (
          <>
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
                loads={loads}
                setLoads={setLoads}
                resetLoad={resetLoad}
              />
            )}
            {tab === 'loads' && (
              <Loads
                loads={loads}
                setLoads={setLoads}
                api={API}
                showToast={showToast}
              />
            )}
          </>
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
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Loads
        </button>
      </div>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}

    </div>
  )
}
