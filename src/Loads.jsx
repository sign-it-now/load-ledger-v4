// src/Loads.jsx
// (c) dbappsystems.com | daddyboyapps.com

import { useState } from 'react'

export default function Loads({ loads, setLoads, api, showToast, fetchLoads }) {

  const [view,          setView]          = useState('all')
  const [period,        setPeriod]        = useState('monthly')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(false)

  function markPaid(idx) {
    setLoads(prev => prev.map((l,i) => i === idx ? { ...l, status:'paid' } : l))
    showToast('Marked as paid!')
  }

  function markBilled(idx) {
    setLoads(prev => prev.map((l,i) => i === idx ? { ...l, status:'billed' } : l))
    showToast('Marked as billed!')
  }

  // ── DELETE FROM D1 FIRST THEN REFRESH ───────────────────
  async function deleteLoad(load, localIdx) {
    setDeleting(true)
    try {
      // If load has a D1 id, delete from D1
      if (load.id) {
        const res = await fetch(api + '/api/loads/' + load.id, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ driver: load.driver }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          showToast('⚠️ Delete failed: ' + (data.error || 'unknown'))
          setDeleting(false)
          return
        }
        // Refresh from D1
        await fetchLoads()
      } else {
        // localStorage-only load — just remove from local state
        setLoads(prev => prev.filter((_,i) => i !== localIdx))
      }
      setConfirmDelete(null)
      showToast('✅ Load deleted')
    } catch (err) {
      showToast('⚠️ Delete failed: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  function fmt(n) { return '$' + (parseFloat(n)||0).toFixed(2) }

  function inPeriod(dateStr, period) {
    if (!dateStr) return false
    const d   = new Date(dateStr)
    const now = new Date()
    if (period === 'daily') {
      return d.toDateString() === now.toDateString()
    }
    if (period === 'weekly') {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      start.setHours(0,0,0,0)
      return d >= start
    }
    if (period === 'monthly') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }
    if (period === 'yearly') {
      return d.getFullYear() === now.getFullYear()
    }
    return false
  }

  const bruceLoads = loads.filter(l => l.driver === 'BRUCE')
  const timLoads   = loads.filter(l => l.driver === 'TIM')

  function driverStats(dLoads, period) {
    const inRange = dLoads.filter(l => inPeriod(l.date || l.created_at, period))
    const billed  = inRange.filter(l => l.status === 'billed' || l.status === 'paid')
    const paid    = inRange.filter(l => l.status === 'paid')
    return {
      count:  inRange.length,
      billed: billed.reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0),
      paid:   paid.reduce((s,l)   => s + (parseFloat(l.net_pay || l.netPay)||0), 0),
      total:  inRange.reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0),
    }
  }

  const bruceTotalAllTime = bruceLoads.reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const timTotalAllTime   = timLoads.reduce((s,l)   => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const grandTotal        = bruceTotalAllTime + timTotalAllTime
  const brucePercent      = grandTotal > 0 ? Math.round((bruceTotalAllTime / grandTotal) * 100) : 50
  const timPercent        = 100 - brucePercent
  const leader            = bruceTotalAllTime > timTotalAllTime ? 'BRUCE' :
                            timTotalAllTime > bruceTotalAllTime ? 'TIM'   : 'TIE'

  // ── SORT OLDEST TO NEWEST BY DELIVERY DATE ───────────────
  function sortByDeliveryDate(arr) {
    return [...arr].sort((a, b) => {
      const da = a.delivery_date ? new Date(a.delivery_date) : null
      const db = b.delivery_date ? new Date(b.delivery_date) : null
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da - db
    })
  }

  const rawFiltered   = view === 'all'   ? loads :
                        view === 'BRUCE' ? bruceLoads :
                        view === 'TIM'   ? timLoads   : []

  const filteredLoads = sortByDeliveryDate(rawFiltered)

  const totalNet    = filteredLoads.reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const totalPaid   = filteredLoads.filter(l=>l.status==='paid').reduce((s,l) => s + (parseFloat(l.net_pay || l.netPay)||0), 0)
  const totalUnpaid = totalNet - totalPaid

  const bruceStats = driverStats(bruceLoads, period)
  const timStats   = driverStats(timLoads,   period)

  const periodLabel = { daily:'TODAY', weekly:'THIS WEEK', monthly:'THIS MONTH', yearly:'THIS YEAR' }

  if (loads.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div>
        <h3>NO LOADS YET</h3>
        <p>Complete and invoice a load to see it here</p>
      </div>
    )
  }

  return (
    <div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
        {['all','BRUCE','TIM','reports'].map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding:'9px 4px',
              borderRadius:8,
              border:'none',
              fontFamily:'var(--font-head)',
              fontWeight:700,
              fontSize:12,
              letterSpacing:'0.05em',
              cursor:'pointer',
              background: view === v ? 'var(--amber)' : 'var(--navy3)',
              color:       view === v ? 'var(--navy)' : 'var(--grey)',
            }}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div className="section-title" style={{ marginBottom:10 }}>
          LEADERBOARD - ALL TIME
          {leader !== 'TIE' && (
            <span style={{ marginLeft:8, fontSize:12, color:'var(--amber)' }}>
              {leader} IS WINNING!
            </span>
          )}
        </div>
        <div style={{ display:'flex', height:18, borderRadius:9, overflow:'hidden', marginBottom:10 }}>
          <div style={{ width:brucePercent + '%', background:'#1e88e5', transition:'width 0.4s' }} />
          <div style={{ width:timPercent + '%',   background:'#e53935', transition:'width 0.4s' }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #1e88e5' }}>
            <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:4 }}>
              BRUCE {leader === 'BRUCE' ? '👑' : ''}
            </div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#1e88e5' }}>
              {fmt(bruceTotalAllTime)}
            </div>
            <div style={{ fontSize:11, color:'var(--grey)', marginTop:2 }}>
              {bruceLoads.length} load{bruceLoads.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ background:'var(--navy3)', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #e53935' }}>
            <div style={{ fontSize:11, color:'var(--grey)', fontFamily:'var(--font-head)', marginBottom:4 }}>
              TIM {leader === 'TIM' ? '👑' : ''}
            </div>
            <div style={{ fontFamily:'var(--font-head)', fontSize:20, fontWeight:900, color:'#e53935' }}>
              {fmt(timTotalAllTime)}
            </div>
            <div style={{ fontSize:11, color:'var(--grey)', marginTop:2 }}>
              {timLoads.length} load{timLoads.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {view === 'reports' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14 }}>
            {['daily','weekly','monthly','yearly'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding:'9px 4px',
                  borderRadius:8,
                  border:'none',
                  fontFamily:'var(--font-head)',
                  fontWeight:700,
                  fontSize:11,
                  letterSpacing:'0.05em',
                  cursor:'pointer',
                  background: period === p ? 'var(--white)' : 'var(--navy3)',
                  color:       period === p ? 'var(--navy)' : 'var(--grey)',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ textAlign:'center', fontFamily:'var(--font-head)', fontSize:13,
                        color:'var(--amber)', letterSpacing:'0.1em', marginBottom:12 }}>
            {periodLabel[period]} - PER DRIVER REPORT
          </div>

          <div className="card" style={{ borderLeft:'3px solid #1e88e5', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#1e88e5', marginBottom:10 }}>
              BRUCE {leader === 'BRUCE' ? '👑' : ''}
            </div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{bruceStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(bruceStats.billed - bruceStats.paid)}</span></div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid #e53935', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'#e53935', marginBottom:10 }}>
              TIM {leader === 'TIM' ? '👑' : ''}
            </div>
            <div className="amount-row"><span className="label">Loads</span><span className="value">{timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt(timStats.billed - timStats.paid)}</span></div>
          </div>

          <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontWeight:900, fontSize:15, color:'var(--amber)', marginBottom:10 }}>
              COMBINED {periodLabel[period]}
            </div>
            <div className="amount-row"><span className="label">Total Loads</span><span className="value">{bruceStats.count + timStats.count}</span></div>
            <div className="amount-row"><span className="label">Total Billed</span><span className="value" style={{color:'var(--amber)'}}>{fmt(bruceStats.billed + timStats.billed)}</span></div>
            <div className="amount-row"><span className="label">Total Paid</span><span className="value" style={{color:'var(--green)'}}>{fmt(bruceStats.paid + timStats.paid)}</span></div>
            <div className="amount-row"><span className="label">Outstanding</span><span className="value" style={{color:'var(--red)'}}>{fmt((bruceStats.billed + timStats.billed) - (bruceStats.paid + timStats.paid))}</span></div>
          </div>
        </div>
      )}

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

          <div style={{ fontSize:10, color:'var(--grey)', fontFamily:'var(--font-head)',
                        letterSpacing:'0.08em', marginBottom:10, textAlign:'center' }}>
            SORTED BY DELIVERY DATE — OLDEST FIRST
          </div>

          {filteredLoads.length === 0 && (
            <div className="empty-state">
              <div className="icon">📋</div>
              <h3>NO LOADS</h3>
              <p>No loads found for this driver yet</p>
            </div>
          )}

          {filteredLoads.map((load, idx) => {
            const realIdx   = loads.indexOf(load)
            const netPayVal = parseFloat(load.net_pay || load.netPay) || 0
            const isPending = confirmDelete === (load.id || realIdx)

            return (
              <div className="load-card" key={load.id || idx}>
                <div className="load-card-info" style={{ flex:1 }}>

                  <div style={{
                    display:'inline-block',
                    padding:'2px 8px',
                    borderRadius:10,
                    fontSize:10,
                    fontFamily:'var(--font-head)',
                    fontWeight:700,
                    marginBottom:6,
                    background: load.driver === 'BRUCE' ? '#1e88e5' : '#e53935',
                    color:'#fff',
                  }}>
                    {load.driver || '-'}
                  </div>

                  <h4>{load.broker_name || 'Unknown Broker'}</h4>
                  <p>Load # {load.load_number || '-'}</p>
                  <p>{load.origin || '-'} to {load.destination || '-'}</p>

                  <p style={{ color:'var(--amber)', fontSize:12, fontFamily:'var(--font-head)', fontWeight:700, marginTop:2 }}>
                    Delivery: {load.delivery_date || '-'}
                  </p>
                  <p style={{ color:'var(--grey)', fontSize:11 }}>
                    Invoiced: {(load.created_at || load.date) ? new Date(load.created_at || load.date).toLocaleDateString() : '-'}
                  </p>

                  <div style={{
                    marginTop:8,
                    fontFamily:'var(--font-head)',
                    fontSize:22,
                    fontWeight:900,
                    color:'var(--amber)',
                  }}>
                    {fmt(netPayVal)}
                  </div>

                  <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                    {load.status !== 'billed' && load.status !== 'paid' && (
                      <button
                        className="scan-btn secondary"
                        style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                        onClick={() => markBilled(realIdx)}
                      >
                        MARK BILLED
                      </button>
                    )}
                    {load.status !== 'paid' && (
                      <button
                        className="scan-btn success"
                        style={{ flex:1, padding:'8px 12px', fontSize:13 }}
                        onClick={() => markPaid(realIdx)}
                      >
                        MARK PAID
                      </button>
                    )}
                    {load.status === 'paid' && (
                      <div style={{ fontSize:13, color:'var(--green)', fontFamily:'var(--font-head)',
                                    fontWeight:700, paddingTop:4 }}>
                        PAYMENT RECEIVED
                      </div>
                    )}

                    {!isPending && (
                      <button
                        style={{
                          padding:'8px 12px',
                          borderRadius:8,
                          border:'1px solid #555',
                          background:'transparent',
                          color:'#888',
                          fontSize:13,
                          fontFamily:'var(--font-head)',
                          fontWeight:700,
                          cursor:'pointer',
                        }}
                        onClick={() => setConfirmDelete(load.id || realIdx)}
                      >
                        DELETE
                      </button>
                    )}
                  </div>

                  {/* INLINE CONFIRM — no popup, calls D1 DELETE */}
                  {isPending && (
                    <div style={{
                      marginTop:12,
                      background:'#2a0a0a',
                      border:'1px solid #e53935',
                      borderRadius:8,
                      padding:'12px 14px',
                    }}>
                      <div style={{ fontSize:12, color:'#e53935', fontFamily:'var(--font-head)',
                                    fontWeight:700, marginBottom:10 }}>
                        DELETE THIS LOAD? THIS CANNOT BE UNDONE.
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button
                          disabled={deleting}
                          onClick={() => deleteLoad(load, realIdx)}
                          style={{
                            flex:1, padding:'10px 0', borderRadius:8, border:'none',
                            background: deleting ? '#555' : '#e53935',
                            color:'#fff', fontSize:13,
                            fontFamily:'var(--font-head)', fontWeight:900, cursor:'pointer',
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
                            color:'#aaa', fontSize:13, fontFamily:'var(--font-head)',
                            fontWeight:700, cursor:'pointer',
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                <div style={{ marginLeft:12, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                  <span className={'status-chip ' + load.status}>
                    {load.status}
                  </span>
                  {load.bol_count > 0 && (
                    <div style={{ fontSize:10, color:'var(--grey)', marginTop:6 }}>
                      {load.bol_count} BOL{load.bol_count !== 1 ? 's' : ''}
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
