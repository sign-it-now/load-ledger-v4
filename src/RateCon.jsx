// src/RateCon.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState, useRef } from 'react'

export default function RateCon({ load, setLoad, driver, api, showToast, onNext }) {
  const [scanning, setScanning] = useState(false)
  const [scanned,  setScanned]  = useState(false)
  const fileRef = useRef()

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    showToast('📡 Scanning rate confirmation...')
    try {
      const base64    = await toBase64(file)
      const mediaType = file.type
      const res       = await fetch(`${api}/api/ocr`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mediaType, mode: 'rateconf' }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const data = JSON.parse(json.result)
      setLoad(prev => ({
        ...prev,
        broker_name:   data.broker_name   || '',
        load_number:   data.broker_load_number || '',
        origin:        data.pickup_location   || data.origin || '',
        destination:   data.delivery_location || data.destination || '',
        pickup_date:   data.pickup_date   || '',
        delivery_date: data.delivery_date || '',
        base_pay:      data.base_pay      || '',
      }))
      setScanned(true)
      showToast('✅ Rate con scanned!')
    } catch (err) {
      showToast('❌ Scan failed — fill in manually')
      console.error(err)
    } finally {
      setScanning(false)
    }
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function update(field, val) {
    setLoad(prev => ({ ...prev, [field]: val }))
  }

  const ready = load.broker_name && load.origin && load.destination && load.base_pay

  return (
    <div>

      {/* DRIVER BADGE */}
      <div style={{ marginBottom: 16, display:'flex', alignItems:'center', gap: 8 }}>
        <span style={{ fontFamily:'var(--font-head)', fontSize:13, color:'var(--grey)', letterSpacing:'0.1em', textTransform:'uppercase' }}>Driver</span>
        <span className="badge">{driver}</span>
      </div>

      {/* SCAN BUTTON */}
      <div className="card">
        <div className="section-title">① Rate Confirmation</div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          style={{ display:'none' }}
          onChange={handleFile}
        />
        <button
          className={`scan-btn ${scanned ? 'success' : ''}`}
          onClick={() => fileRef.current.click()}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <svg className="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:22,height:22}}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              SCANNING...
            </>
          ) : scanned ? (
            <>✓ RATE CON SCANNED — TAP TO RESCAN</>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:22,height:22}}>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              SCAN RATE CONFIRMATION
            </>
          )}
        </button>
      </div>

      {/* LOAD DETAILS FORM */}
      <div className="card">
        <div className="section-title">② Load Details — Edit if Needed</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="field-row" style={{ gridColumn:'1 / -1' }}>
            <div className="field-label">Broker Name</div>
            <input value={load.broker_name} onChange={e=>update('broker_name',e.target.value)} placeholder="e.g. CH Robinson" />
          </div>
          <div className="field-row" style={{ gridColumn:'1 / -1' }}>
            <div className="field-label">Broker Email</div>
            <input value={load.broker_email} onChange={e=>update('broker_email',e.target.value)} placeholder="billing@broker.com" type="email" />
          </div>
          <div className="field-row">
            <div className="field-label">Load #</div>
            <input value={load.load_number} onChange={e=>update('load_number',e.target.value)} placeholder="Load number" />
          </div>
          <div className="field-row">
            <div className="field-label">Base Pay</div>
            <input value={load.base_pay} onChange={e=>update('base_pay',e.target.value)} placeholder="0.00" type="number" inputMode="decimal" />
          </div>
          <div className="field-row">
            <div className="field-label">Origin</div>
            <input value={load.origin} onChange={e=>update('origin',e.target.value)} placeholder="City, ST" />
          </div>
          <div className="field-row">
            <div className="field-label">Destination</div>
            <input value={load.destination} onChange={e=>update('destination',e.target.value)} placeholder="City, ST" />
          </div>
          <div className="field-row">
            <div className="field-label">Pickup Date</div>
            <input value={load.pickup_date} onChange={e=>update('pickup_date',e.target.value)} placeholder="MM/DD/YYYY" />
          </div>
          <div className="field-row">
            <div className="field-label">Delivery Date</div>
            <input value={load.delivery_date} onChange={e=>update('delivery_date',e.target.value)} placeholder="MM/DD/YYYY" />
          </div>
        </div>
      </div>

      {/* NEXT BUTTON */}
      <button
        className="scan-btn"
        onClick={onNext}
        disabled={!ready}
        style={{ opacity: ready ? 1 : 0.4 }}
      >
        NEXT — ADD RECEIPTS & GENERATE INVOICE →
      </button>

    </div>
  )
}
