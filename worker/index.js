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

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ── AUTH ─────────────────────────────────────────────
    if (path === '/api/auth' && request.method === 'POST') {
      try {
        const { driver, pin } = await request.json();
        if (!driver || !pin) return json({ error: 'Missing driver or pin' }, 400);
        const valid = ['BRUCE', 'TIM'];
        if (!valid.includes(driver)) return json({ error: 'Invalid driver' }, 400);
        const stored = driver === 'BRUCE' ? env.BRUCE_PIN : env.TIM_PIN;
        if (!stored) return json({ error: 'PIN not configured on server' }, 500);
        if (String(pin) !== String(stored)) return json({ error: 'Wrong PIN' }, 401);
        return json({ ok: true, driver });
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
            messages: [{
              role:    'user',
              content: [contentBlock, { type: 'text', text: prompt }],
            }],
          }),
        });
        const raw = await res.text();
        if (!res.ok) {
          return json({ error: 'Claude API error', status: res.status, detail: raw }, 502);
        }
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
        // driver_id satisfies the NOT NULL constraint (same value as driver)
        const driverVal = b.driver || '';
        await env.DB.prepare(`
          INSERT INTO loads
            (id, driver_id, driver, broker_name, broker_email, load_number,
             origin, destination, pickup_date, delivery_date,
             base_pay, lumper_total, incidental_total, comdata_total,
             detention, pallets, net_pay, notes, bol_count, status, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        `).bind(
          id,
          driverVal,
          driverVal,
          b.broker_name      || '',
          b.broker_email     || '',
          b.load_number      || '',
          b.origin           || '',
          b.destination      || '',
          b.pickup_date      || '',
          b.delivery_date    || '',
          b.base_pay         || 0,
          b.lumper_total     || 0,
          b.incidental_total || 0,
          b.comdata_total    || 0,
          b.detention        || 0,
          b.pallets          || 0,
          b.net_pay          || 0,
          b.notes            || '',
          b.bol_count        || 0,
          b.status           || 'invoiced',
        ).run();
        return json({ id });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── LOADS PATCH (status update) ──────────────────────
    if (path.startsWith('/api/loads/') && request.method === 'PATCH') {
      try {
        const id = path.split('/')[3];
        const { status } = await request.json();
        await env.DB.prepare(
          'UPDATE loads SET status=? WHERE id=?'
        ).bind(status, id).run();
        return json({ ok: true });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── LOADS DELETE ─────────────────────────────────────
    if (path.startsWith('/api/loads/') && request.method === 'DELETE') {
      try {
        const id  = path.split('/')[3];
        const { driver } = await request.json();
        const row = await env.DB.prepare(
          'SELECT driver FROM loads WHERE id=?'
        ).bind(id).first();
        if (!row)                  return json({ error: 'Load not found' }, 404);
        if (row.driver !== driver) return json({ error: 'Not authorized' }, 403);
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
It may show as: Amount, Total, Advance, Value, Net, or just a number near a dollar sign.
Return ONLY valid JSON, nothing else: {"amount":"0.00"}
amount must be digits only like "250.00" with no dollar sign. If no clear amount found, look for any number that could represent dollars and return it. If truly nothing found return {"amount":"0.00"}`,

    incidental: `This is an expense receipt for a truck driver — could be fuel, repair, tolls, or any other expense.
Look for the total amount charged on this receipt.
Return ONLY valid JSON, nothing else: {"amount":"0.00"}
amount must be digits only like "45.00" with no dollar sign. If no amount found return {"amount":"0.00"}`,

    text: `Extract all visible text from this document. Return plain text only.`,
  };
  return prompts[mode] || null;
}
