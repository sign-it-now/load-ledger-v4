// src/Loads.jsx
// (c) dbappsystems.com | daddyboyapps.com

export default function Loads({ loads, setLoads, showToast }) {

  function markPaid(idx) {
    setLoads(prev => prev.map((l,i) => i === idx ? { ...l, status:'paid' } : l))
    showToast('✅ Marked as paid!')
  }

  function markBilled(idx) {
    setLoads(prev => prev.map((l,i) => i === idx ? { ...l, status:'billed' } : l))
    showToast('✅ Marked as billed!')
  }

  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  if (loads.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div>
        <h3>NO LOADS YET</h3>
        <p>Complete and invoice a load to see it here</p>
      </div>
    )
  }

  // Totals
  const totalNet    = loads.reduce((s,l) => s + (parseFloat(l.netPay)||0), 0)
  const totalPaid   = loads.filter(l=>l.status==='paid').reduce((s,l) => s + (parseFloat(l.netPay)||0), 0)
  const totalUnpaid = totalNet - totalPaid

  return (
    <div>

      {/* SUMMARY CARDS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
        <div className="card" style={{ padding:12, textAlign:'center', marginBottom:0 }}>
          <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>TOTAL</div>
          <div style={{ fontFamily:'var(--font-head)', fontSize:18, fontWeight:900, color:'var(--amber)' }}>{fmt(totalNet)}</div>
        </div>
        <div className="card" style={{ padding:12, textAlign:'center', marginBottom:0 }}>
          <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>PAID</div>
          <div style={{ fontFamily:'var(--font-head)', fontSize:18, fontWeight:900, color:'var(--green)' }}>{fmt(totalPaid)}</div>
        </div>
        <div className="card" style={{ padding:12, textAlign:'center', marginBottom:0 }}>
          <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', letterSpacing:'0.08em', marginBottom:4 }}>OWED</div>
          <div style={{ fontFamily:'var(--font-head)', fontSize:18, fontWeight:900, color:'var(--red)' }}>{fmt(totalUnpaid)}</div>
        </div>
      </div>

      {/* LOAD LIST */}
      {loads.map((load, idx) => (
        <div className="load-card" key={idx}>
          <div className="load-card-info" style={{ flex:1 }}>
            <h4>{load.broker_name || 'Unknown Broker'}</h4>
            <p>Load # {load.load_number || '—'}</p>
            <p>{load.origin || '—'} → {load.destination || '—'}</p>
            <p style={{ color:'var(--grey)', fontSize:11 }}>{load.driver} · {load.date ? new Date(load.date).toLocaleDateString() : '—'}</p>

            {/* NET PAY */}
            <div style={{
              marginTop: 8,
              fontFamily: 'var(--font-head)',
              fontSize: 20,
              fontWeight: 900,
              color: 'var(--amber)'
            }}>
              {fmt(load.netPay)}
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              {load.status !== 'billed' && load.status !== 'paid' && (
                <button
                  className="scan-btn secondary"
                  style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                  onClick={() => markBilled(idx)}
                >
                  MARK BILLED
                </button>
              )}
              {load.status !== 'paid' && (
                <button
                  className="scan-btn success"
                  style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                  onClick={() => markPaid(idx)}
                >
                  MARK PAID
                </button>
              )}
            </div>
          </div>

          {/* STATUS */}
          <div style={{ marginLeft:12 }}>
            <span className={`status-chip ${load.status}`}>
              {load.status}
            </span>
          </div>
        </div>
      ))}

    </div>
  )
}
