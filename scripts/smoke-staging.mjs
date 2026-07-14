/**
 * Smoke HTTP de staging/local — sem browser.
 *
 * Uso:
 *   SMOKE_API_BASE_URL=https://api.exemplo.com npm run smoke:staging
 *   SMOKE_API_BASE_URL=http://127.0.0.1:8081 SMOKE_EMAIL=… SMOKE_PASSWORD=… npm run smoke:staging
 *
 * Opcional: SMOKE_APP_BASE_URL (SPA) — checa HTML da landing.
 */

const apiBase = String(process.env.SMOKE_API_BASE_URL || process.env.E2E_API_BASE_URL || '')
  .trim()
  .replace(/\/$/, '')
const appBase = String(process.env.SMOKE_APP_BASE_URL || process.env.E2E_BASE_URL || '')
  .trim()
  .replace(/\/$/, '')
const email = String(process.env.SMOKE_EMAIL || process.env.E2E_EMAIL || '').trim()
const password = String(process.env.SMOKE_PASSWORD || process.env.E2E_PASSWORD || '').trim()

if (!apiBase && !appBase) {
  console.error('Defina SMOKE_API_BASE_URL e/ou SMOKE_APP_BASE_URL')
  process.exit(2)
}

const results = []

const check = async (name, fn) => {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`OK   ${name} (${Date.now() - started}ms)`)
  } catch (err) {
    const message = err?.message || String(err)
    results.push({ name, ok: false, ms: Date.now() - started, message })
    console.error(`FAIL ${name}: ${message}`)
  }
}

const fetchJson = async (url, init = {}) => {
  const res = await fetch(url, init)
  let body = null
  const text = await res.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body }
}

if (appBase) {
  await check('SPA landing HTML', async () => {
    const res = await fetch(`${appBase}/`)
    if (!res.ok) throw new Error(`status ${res.status}`)
    const html = await res.text()
    if (!/mediahub|root|vite/i.test(html)) throw new Error('HTML sem marcadores esperados')
  })
}

if (apiBase) {
  await check('GET /api/health', async () => {
    const { res, body } = await fetchJson(`${apiBase}/api/health`)
    if (![200, 503].includes(res.status)) throw new Error(`status ${res.status}`)
    if (!body || typeof body !== 'object') throw new Error('body inválido')
  })

  await check('GET /api/search/query sem auth → 401', async () => {
    const { res } = await fetchJson(`${apiBase}/api/search/query?query=test`)
    if (res.status !== 401) throw new Error(`esperado 401, veio ${res.status}`)
  })

  await check('GET /api/football/crest sem auth → 401', async () => {
    const { res } = await fetchJson(`${apiBase}/api/football/crest?url=https://example.com/x.png`)
    if (res.status !== 401) throw new Error(`esperado 401, veio ${res.status}`)
  })

  if (email && password) {
    let token = ''
    await check('POST /api/auth/login', async () => {
      const { res, body } = await fetchJson(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error(`status ${res.status} body=${JSON.stringify(body)}`)
      token = typeof body?.token === 'string' ? body.token : ''
      if (!token) throw new Error('login sem token')
    })

    if (token) {
      await check('GET /api/me com token', async () => {
        const { res, body } = await fetchJson(`${apiBase}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        if (!body?.email && !body?.user?.email) throw new Error('resposta /me sem email')
      })

      await check('GET /api/search/query autenticado', async () => {
        const { res, body } = await fetchJson(
          `${apiBase}/api/search/query?query=matrix&type=multi`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (![200, 429, 502, 503].includes(res.status)) {
          throw new Error(`status inesperado ${res.status} body=${JSON.stringify(body)}`)
        }
        if (res.status === 200 && body && typeof body !== 'object') {
          throw new Error('body de busca inválido')
        }
      })
    }
  } else {
    console.log('SKIP login/me/search (defina SMOKE_EMAIL e SMOKE_PASSWORD)')
  }
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`Smoke: ${results.length - failed.length}/${results.length} ok`)
if (failed.length) process.exit(1)
