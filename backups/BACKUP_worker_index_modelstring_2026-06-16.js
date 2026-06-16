// worker/index.js — BACKUP before model string migration (Sonnet 4 retired June 15 2026)
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

    // (full live routes preserved in main worker/index.js — this is a point-in-time
    //  backup of the OCR model string state prior to the Sonnet 4.6 migration)

    return json({ message: 'Load Ledger V4 API — dbappsystems.com' });
  },
};

function getPrompt(mode) {
  const prompts = {
    rateconf: `rate confirmation prompt (see live file)`,
    lumper:   `lumper prompt (see live file)`,
    express:  `express prompt (see live file)`,
    incidental: `incidental prompt (see live file)`,
    fuel:     `fuel prompt (see live file)`,
    text:     `Extract all visible text from this document. Return plain text only.`,
  };
  return prompts[mode] || null;
}
