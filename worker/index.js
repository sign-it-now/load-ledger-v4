// worker/index.js
// (c) dbappsystems.com | daddyboyapps.com
// Load Ledger V4 — Cloudflare Worker

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── USER VALIDATION — checks D1 users table, falls back to env PIN ──
async function validUser(driver, credential, env) {
  if (!driver || !credential) return false
  try {
    const user = await env.DB.prepare(
      'SELECT password FROM users WHERE UPPER(driver_name) = UPPER(?)'
    ).bind(driver).first()
    if (user && user.password === credential) return true
  } catch {}
  const stored = driver === 'BRUCE' ? env.BRUCE_PIN : driver === 'TIM' ? env.TIM_PIN : null
  return stored ? String(credential) === String(stored) : false
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ── AUTH LOGIN ───────────────────────────────────────
    if (path === '/api/auth/login' && request.method === 'POST') {
      try {
        const { email, password } = await request.json();
        if (!email || !password) return json({ error: 'Missing email or password' }, 400);
        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE LOWER(email) = LOWER(?)'
        ).bind(email.trim()).first();
        if (!user || user.password !== password) {
          return json({ error: 'Invalid email or password' }, 401);
        }
        return json({ ok: true, driver_name: user.driver_name, role: user.role });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── OCR ──────────────────────────────────────────────
    if (path === '/api/ocr' && request.method === 'POST') {
      try {
        const { base64, mediaType, mode } = await request.json();
        if (!base64 || !mediaType || !mode) {
          return json({ error: 'Missing fields: base64, mediaType, mode' }, 400);
        }
        if (!env.ANTHROPIC_API_KEY) {
          return json({ error: 'ANTHROPIC_API_KEY not set in Worker secrets' }, 500);
        }
        const prompt = getPrompt(mode);
        if (!prompt) return json({ error: 'Invalid mode: ' + mode }, 400);
        const isPdf = mediaType === 'application/pdf';
        const contentBlock = isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image',    source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } };
        const headers = {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        };
        if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
          }),
        });
        const raw = await res.text();
        if (!res.ok) return json({ error: 'Claude API error', status: res.status, detail: raw }, 502);
        const data = JSON.parse(raw);
        return json({ result: data?.content?.[0]?.text ?? '' });
      } catch (e) {
        return json({ error: 'Worker exception', detail: e.message }, 500);
      }
    }

    // ── LOADS GET ────────────────────────────────────────
    if (path === '/api/loads' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT * FROM loads ORDER BY created_at DESC LIMIT 100'
        ).all();
        return json(results);
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── LOADS POST ───────────────────────────────────────
    if (path === '/api/loads' && request.method === 'POST') {
      try {
        const b  = await request.json();
        const id = crypto.randomUUID();
        const driverVal = b.driver || '';
        await env.DB.prepare(`
          INSERT INTO loads
            (id, driver_id, driver, broker_name, broker_email, load_number,
             origin, destination, pickup_date, delivery_date,
             base_pay, lumper_total, incidental_total, comdata_total,
             detention, pallets, net_pay, notes, bol_count, fuel, status, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        `).bind(
          id, driverVal, driverVal,
          b.broker_name || '', b.broker_email || '', b.load_number || '',
          b.origin || '', b.destination || '', b.pickup_date || '', b.delivery_date || '',
          b.base_pay || 0, b.lumper_total || 0, b.incidental_total || 0,
          b.comdata_total || 0, b.detention || 0, b.pallets || 0,
          b.net_pay || 0, b.notes || '', b.bol_count || 0, b.fuel || 0,
          b.status || 'invoiced',
        ).run();
        return json({ id });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── UPLOAD INVOICE PDF TO R2 ─────────────────────────
    if (path === '/api/upload-pdf' && request.method === 'POST') {
      try {
        const { base64, loadId } = await request.json();
        if (!base64 || !loadId) return json({ error: 'Missing base64 or loadId' }, 400);
        if (!env.R2) return json({ error: 'R2 not configured' }, 500);
        const binary = atob(base64)
        const bytes  = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        await env.R2.put('invoices/' + loadId + '.pdf', bytes, { httpMetadata: { contentType: 'application/pdf' } })
        const invoiceUrl = '/api/invoice/' + loadId
        await env.DB.prepare('UPDATE loads SET invoice_url=? WHERE id=?').bind(invoiceUrl, loadId).run()
        return json({ ok: true, url: invoiceUrl })
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── SERVE INVOICE PDF FROM R2 ────────────────────────
    if (path.startsWith('/api/invoice/') && request.method === 'GET') {
      try {
        const loadId = path.replace('/api/invoice/', '')
        if (!env.R2) return json({ error: 'R2 not configured' }, 500);
        const object = await env.R2.get('invoices/' + loadId + '.pdf')
        if (!object) return new Response('Invoice not found', { status: 404, headers: CORS })
        return new Response(object.body, {
          headers: { ...CORS, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=3600' },
        })
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── CREDENTIALS GET ──────────────────────────────────
    if (path.startsWith('/api/credentials/') && !path.includes('/file/') && request.method === 'GET') {
      try {
        const driver = path.split('/')[3].toUpperCase()
        let row = await env.DB.prepare('SELECT * FROM driver_credentials WHERE driver=?').bind(driver).first()
        if (!row) {
          row = {
            driver,
            dot_physical: '', drivers_license: '', plates: '',
            authority: '', insurance: '', heavy_use_tax: '',
            dot_physical_snooze: '', drivers_license_snooze: '',
            plates_snooze: '', authority_snooze: '',
            insurance_snooze: '', heavy_use_tax_snooze: '',
          }
        }
        return json(row)
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── CREDENTIALS PATCH ────────────────────────────────
    if (path.startsWith('/api/credentials/') && !path.includes('/file/') && request.method === 'PATCH') {
      try {
        const driver = path.split('/')[3].toUpperCase()
        const b = await request.json()
        await env.DB.prepare(`
          INSERT INTO driver_credentials
            (driver, dot_physical, drivers_license, plates, authority, insurance, heavy_use_tax,
             dot_physical_snooze, drivers_license_snooze, plates_snooze,
             authority_snooze, insurance_snooze, heavy_use_tax_snooze, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(driver) DO UPDATE SET
            dot_physical=excluded.dot_physical, drivers_license=excluded.drivers_license,
            plates=excluded.plates, authority=excluded.authority,
            insurance=excluded.insurance, heavy_use_tax=excluded.heavy_use_tax,
            dot_physical_snooze=excluded.dot_physical_snooze,
            drivers_license_snooze=excluded.drivers_license_snooze,
            plates_snooze=excluded.plates_snooze, authority_snooze=excluded.authority_snooze,
            insurance_snooze=excluded.insurance_snooze,
            heavy_use_tax_snooze=excluded.heavy_use_tax_snooze,
            updated_at=excluded.updated_at
        `).bind(
          driver,
          b.dot_physical||'', b.drivers_license||'', b.plates||'',
          b.authority||'', b.insurance||'', b.heavy_use_tax||'',
          b.dot_physical_snooze||'', b.drivers_license_snooze||'',
          b.plates_snooze||'', b.authority_snooze||'',
          b.insurance_snooze||'', b.heavy_use_tax_snooze||'',
        ).run()
        return json({ ok: true })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── UPLOAD CREDENTIAL FILE TO R2 ─────────────────────
    if (path.includes('/api/credentials/') && path.includes('/file/') && request.method === 'POST') {
      try {
        const parts   = path.split('/')
        const driver  = parts[3].toUpperCase()
        const credKey = parts[5]
        if (!env.R2) return json({ error: 'R2 not configured' }, 500)
        const { base64, mediaType, pin } = await request.json()
        if (!(await validUser(driver, pin, env))) {
          return json({ error: 'Unauthorized' }, 401)
        }
        const binary = atob(base64)
        const bytes  = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const ext = mediaType === 'application/pdf' ? 'pdf' : 'jpg'
        await env.R2.put('credentials/' + driver + '/' + credKey + '.' + ext, bytes, { httpMetadata: { contentType: mediaType } })
        return json({ ok: true, url: '/api/credentials/' + driver + '/file/' + credKey })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── SERVE CREDENTIAL FILE FROM R2 ────────────────────
    if (path.includes('/api/credentials/') && path.includes('/file/') && request.method === 'GET') {
      try {
        const parts   = path.split('/')
        const driver  = parts[3].toUpperCase()
        const credKey = parts[5]
        const pin     = url.searchParams.get('pin')
        if (!(await validUser(driver, pin, env))) {
          return new Response('Unauthorized', { status: 401, headers: CORS })
        }
        if (!env.R2) return json({ error: 'R2 not configured' }, 500)
        let object = await env.R2.get('credentials/' + driver + '/' + credKey + '.pdf')
        let contentType = 'application/pdf'
        if (!object) {
          object = await env.R2.get('credentials/' + driver + '/' + credKey + '.jpg')
          contentType = 'image/jpeg'
        }
        if (!object) return new Response('File not found', { status: 404, headers: CORS })
        return new Response(object.body, {
          headers: { ...CORS, 'Content-Type': contentType, 'Content-Disposition': 'inline', 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── MAINTENANCE GET ──────────────────────────────────
    if (path.startsWith('/api/maintenance/') && request.method === 'GET') {
      try {
        const driver = path.split('/')[3].toUpperCase()
        const { results } = await env.DB.prepare(
          'SELECT * FROM maintenance_ledger WHERE driver=? ORDER BY entry_date DESC, created_at DESC LIMIT 200'
        ).bind(driver).all()
        return json(results)
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── MAINTENANCE POST ─────────────────────────────────
    if (path === '/api/maintenance' && request.method === 'POST') {
      try {
        const b  = await request.json()
        const id = crypto.randomUUID()
        if (!b.driver) return json({ error: 'Missing driver' }, 400)
        await env.DB.prepare(`
          INSERT INTO maintenance_ledger
            (id, driver, entry_date, category, description, amount, paid_by, asset_id, receipt_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          id, b.driver.toUpperCase(), b.entry_date || '',
          b.category || 'Other', b.description || '',
          parseFloat(b.amount) || 0,
          b.paid_by   || 'TIM',
          b.asset_id  || '',
          b.receipt_url || '',
        ).run()
        return json({ id })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── MAINTENANCE PATCH ────────────────────────────────
    if (path.startsWith('/api/maintenance/') && path.split('/').length === 4 && request.method === 'PATCH') {
      try {
        const id = path.split('/')[3]
        const b  = await request.json()
        const fields = []; const values = []
        if (b.paid_by  !== undefined) { fields.push('paid_by=?');  values.push(b.paid_by); }
        if (b.asset_id !== undefined) { fields.push('asset_id=?'); values.push(b.asset_id); }
        if (fields.length === 0) return json({ error: 'Nothing to update' }, 400)
        values.push(id)
        await env.DB.prepare('UPDATE maintenance_ledger SET ' + fields.join(', ') + ' WHERE id=?').bind(...values).run()
        return json({ ok: true })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── MAINTENANCE DELETE ───────────────────────────────
    if (path.startsWith('/api/maintenance/') && path.split('/').length === 4 && request.method === 'DELETE') {
      try {
        const id = path.split('/')[3]
        const { driver } = await request.json()
        const row = await env.DB.prepare('SELECT driver FROM maintenance_ledger WHERE id=?').bind(id).first()
        if (!row) return json({ error: 'Entry not found' }, 404)
        if (row.driver !== driver.toUpperCase() && driver.toUpperCase() !== 'NICOLE') {
          return json({ error: 'Not authorized' }, 403)
        }
        if (env.R2) {
          await env.R2.delete('maintenance/' + id + '.pdf').catch(() => {})
          await env.R2.delete('maintenance/' + id + '.jpg').catch(() => {})
        }
        await env.DB.prepare('DELETE FROM maintenance_ledger WHERE id=?').bind(id).run()
        return json({ ok: true })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── UPLOAD MAINTENANCE RECEIPT ───────────────────────
    if (path.startsWith('/api/maintenance-receipt/') && request.method === 'POST') {
      try {
        const entryId = path.split('/')[3]
        if (!env.R2) return json({ error: 'R2 not configured' }, 500)
        const { base64, mediaType } = await request.json()
        const binary = atob(base64); const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const ext = mediaType === 'application/pdf' ? 'pdf' : 'jpg'
        await env.R2.put('maintenance/' + entryId + '.' + ext, bytes, { httpMetadata: { contentType: mediaType } })
        const receiptUrl = '/api/maintenance-receipt/' + entryId
        await env.DB.prepare('UPDATE maintenance_ledger SET receipt_url=? WHERE id=?').bind(receiptUrl, entryId).run()
        return json({ ok: true, url: receiptUrl })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── SERVE MAINTENANCE RECEIPT ────────────────────────
    if (path.startsWith('/api/maintenance-receipt/') && request.method === 'GET') {
      try {
        const entryId = path.split('/')[3]
        if (!env.R2) return json({ error: 'R2 not configured' }, 500)
        let object = await env.R2.get('maintenance/' + entryId + '.pdf')
        let contentType = 'application/pdf'
        if (!object) { object = await env.R2.get('maintenance/' + entryId + '.jpg'); contentType = 'image/jpeg' }
        if (!object) return new Response('Receipt not found', { status: 404, headers: CORS })
        return new Response(object.body, {
          headers: { ...CORS, 'Content-Type': contentType, 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=3600' },
        })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSETS GET ───────────────────────────────────────
    if (path.startsWith('/api/assets/') && !path.includes('/payments') && request.method === 'GET') {
      try {
        const driver = path.split('/')[3].toUpperCase()
        const { results } = await env.DB.prepare(
          'SELECT * FROM assets WHERE driver=? ORDER BY created_at ASC'
        ).bind(driver).all()
        return json(results)
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSETS POST ──────────────────────────────────────
    if (path === '/api/assets' && request.method === 'POST') {
      try {
        const b  = await request.json()
        const id = crypto.randomUUID()
        if (!b.driver) return json({ error: 'Missing driver' }, 400)
        await env.DB.prepare(`
          INSERT INTO assets
            (id, driver, asset_name, asset_type, year, make, model, vin_last6,
             notes, purchase_price, balance_owed, owed_to, purchase_date,
             estimated_value, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        `).bind(
          id, b.driver.toUpperCase(),
          b.asset_name || '', b.asset_type || '',
          b.year || '', b.make || '', b.model || '', b.vin_last6 || '',
          b.notes || '',
          parseFloat(b.purchase_price)  || 0,
          parseFloat(b.balance_owed)    || 0,
          b.owed_to || '',
          b.purchase_date || '',
          parseFloat(b.estimated_value) || 0,
        ).run()
        return json({ id })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSETS PATCH ─────────────────────────────────────
    if (path.startsWith('/api/assets/') && !path.includes('/payments') && request.method === 'PATCH') {
      try {
        const id = path.split('/')[3]
        const b  = await request.json()
        const fields = []; const values = []
        const allowed = ['asset_name','asset_type','year','make','model','vin_last6','notes',
                         'purchase_price','balance_owed','owed_to','purchase_date','estimated_value']
        allowed.forEach(key => {
          if (b[key] !== undefined) {
            fields.push(key + '=?')
            values.push(['purchase_price','balance_owed','estimated_value'].includes(key) ? parseFloat(b[key])||0 : b[key])
          }
        })
        if (fields.length === 0) return json({ error: 'Nothing to update' }, 400)
        values.push(id)
        await env.DB.prepare('UPDATE assets SET ' + fields.join(', ') + ' WHERE id=?').bind(...values).run()
        return json({ ok: true })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSETS DELETE ────────────────────────────────────
    if (path.startsWith('/api/assets/') && !path.includes('/payments') && request.method === 'DELETE') {
      try {
        const id = path.split('/')[3]
        const { driver } = await request.json()
        const row = await env.DB.prepare('SELECT driver FROM assets WHERE id=?').bind(id).first()
        if (!row) return json({ error: 'Asset not found' }, 404)
        if (row.driver !== driver.toUpperCase() && driver.toUpperCase() !== 'NICOLE') {
          return json({ error: 'Not authorized' }, 403)
        }
        await env.DB.prepare('DELETE FROM assets WHERE id=?').bind(id).run()
        await env.DB.prepare('DELETE FROM asset_payments WHERE asset_id=?').bind(id).run()
        return json({ ok: true })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSET PAYMENTS GET ───────────────────────────────
    if (path.includes('/api/assets/') && path.includes('/payments') && request.method === 'GET') {
      try {
        const assetId = path.split('/')[3]
        const { results } = await env.DB.prepare(
          'SELECT * FROM asset_payments WHERE asset_id=? ORDER BY payment_date DESC, created_at DESC'
        ).bind(assetId).all()
        return json(results)
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSET PAYMENTS POST ──────────────────────────────
    if (path.includes('/api/assets/') && path.includes('/payments') && !path.includes('/payments/') && request.method === 'POST') {
      try {
        const assetId = path.split('/')[3]
        const b       = await request.json()
        const id      = crypto.randomUUID()
        if (!b.driver) return json({ error: 'Missing driver' }, 400)
        const amount = parseFloat(b.amount) || 0
        await env.DB.prepare(`
          INSERT INTO asset_payments (id, asset_id, driver, payment_date, amount, notes, created_at)
          VALUES (?,?,?,?,?,?,datetime('now'))
        `).bind(id, assetId, b.driver.toUpperCase(), b.payment_date || '', amount, b.notes || '').run()
        await env.DB.prepare(
          'UPDATE assets SET balance_owed = MAX(0, balance_owed - ?) WHERE id=?'
        ).bind(amount, assetId).run()
        return json({ id })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── ASSET PAYMENTS DELETE ────────────────────────────
    if (path.includes('/api/assets/') && path.includes('/payments/') && request.method === 'DELETE') {
      try {
        const parts     = path.split('/')
        const assetId   = parts[3]
        const paymentId = parts[5]
        const { driver } = await request.json()
        const row = await env.DB.prepare('SELECT driver, amount FROM asset_payments WHERE id=?').bind(paymentId).first()
        if (!row) return json({ error: 'Payment not found' }, 404)
        if (row.driver !== driver.toUpperCase() && driver.toUpperCase() !== 'NICOLE') {
          return json({ error: 'Not authorized' }, 403)
        }
        await env.DB.prepare('DELETE FROM asset_payments WHERE id=?').bind(paymentId).run()
        await env.DB.prepare('UPDATE assets SET balance_owed = balance_owed + ? WHERE id=?').bind(row.amount, assetId).run()
        return json({ ok: true })
      } catch(e) {
        return json({ error: e.message }, 500)
      }
    }

    // ── LOADS PATCH ──────────────────────────────────────
    // Handles status/fuel updates AND full invoice edits from the EDIT drawer
    if (path.startsWith('/api/loads/') && request.method === 'PATCH') {
      try {
        const id = path.split('/')[3];
        const b  = await request.json();
        const fields = []; const values = []

        // Status and fuel
        if (b.status !== undefined)  { fields.push('status=?');  values.push(b.status); }
        if (b.fuel   !== undefined)  { fields.push('fuel=?');    values.push(parseFloat(b.fuel) || 0); }

        // Invoice edit fields
        if (b.base_pay    !== undefined) { fields.push('base_pay=?');    values.push(parseFloat(b.base_pay)  || 0); }
        if (b.detention   !== undefined) { fields.push('detention=?');   values.push(parseFloat(b.detention) || 0); }
        if (b.pallets     !== undefined) { fields.push('pallets=?');     values.push(parseFloat(b.pallets)   || 0); }
        if (b.net_pay     !== undefined) { fields.push('net_pay=?');     values.push(parseFloat(b.net_pay)   || 0); }
        if (b.notes       !== undefined) { fields.push('notes=?');       values.push(b.notes); }
        if (b.lumpers     !== undefined) { fields.push('lumpers=?');     values.push(typeof b.lumpers     === 'string' ? b.lumpers     : JSON.stringify(b.lumpers)); }
        if (b.incidentals !== undefined) { fields.push('incidentals=?'); values.push(typeof b.incidentals === 'string' ? b.incidentals : JSON.stringify(b.incidentals)); }
        if (b.comdatas    !== undefined) { fields.push('comdatas=?');    values.push(typeof b.comdatas    === 'string' ? b.comdatas    : JSON.stringify(b.comdatas)); }
        if (b.edited      !== undefined) { fields.push('edited=?');      values.push(b.edited); }
        if (b.edited_date !== undefined) { fields.push('edited_date=?'); values.push(b.edited_date); }

        if (fields.length === 0) return json({ error: 'Nothing to update' }, 400);
        values.push(id);
        await env.DB.prepare('UPDATE loads SET ' + fields.join(', ') + ' WHERE id=?').bind(...values).run();
        return json({ ok: true });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── LOADS DELETE ─────────────────────────────────────
    // Driver is read from D1 — no body required from client
    if (path.startsWith('/api/loads/') && request.method === 'DELETE') {
      try {
        const id  = path.split('/')[3];
        const row = await env.DB.prepare('SELECT driver FROM loads WHERE id=?').bind(id).first();
        if (!row) return json({ error: 'Load not found' }, 404);
        if (env.R2) await env.R2.delete('invoices/' + id + '.pdf').catch(() => {})
        await env.DB.prepare('DELETE FROM loads WHERE id=?').bind(id).run();
        return json({ ok: true });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ message: 'Load Ledger V4 API — dbappsystems.com' });
  },
};

function getPrompt(mode) {
  const prompts = {
    rateconf: `You are reading a freight rate confirmation document.
Extract ONLY these fields and return ONLY valid JSON, nothing else:
{"broker_name":"","broker_load_number":"","pickup_location":"","delivery_location":"","pickup_date":"","delivery_date":"","base_pay":""}
base_pay must be a number string like "1250.00". Leave unknown fields as empty string.`,
    lumper: `This is a lumper receipt for a trucking company.
Look for any dollar amount on this document — it may say Total, Amount, Fee, or just show a number with a dollar sign.
Return ONLY valid JSON, nothing else: {"amount":"0.00"}
amount must be digits only like "125.00" with no dollar sign. If no amount found return {"amount":"0.00"}`,
    express: `This is a Comdata express code or cash advance document used in the trucking industry.
Look for any dollar amount, advance amount, transaction amount, or value on this document.
Return ONLY valid JSON, nothing else: {"amount":"0.00"}
amount must be digits only like "250.00" with no dollar sign. If truly nothing found return {"amount":"0.00"}`,
    incidental: `This is an expense receipt for a truck driver — could be fuel, repair, tolls, or any other expense.
Look for the total amount charged on this receipt.
Return ONLY valid JSON, nothing else: {"amount":"0.00"}
amount must be digits only like "45.00" with no dollar sign. If no amount found return {"amount":"0.00"}`,
    text: `Extract all visible text from this document. Return plain text only.`,
  };
  return prompts[mode] || null;
}
