/**
 * Aguarda /api/health ficar responsivo (CI / smoke local).
 * Uso: API_WAIT_URL=http://127.0.0.1:8081/api/health node scripts/wait-api.mjs
 */
const url = String(process.env.API_WAIT_URL || 'http://127.0.0.1:8081/api/health').trim()
const attempts = Math.max(1, Number(process.env.API_WAIT_ATTEMPTS || 60))
const delayMs = Math.max(200, Number(process.env.API_WAIT_DELAY_MS || 1000))

for (let i = 1; i <= attempts; i++) {
  try {
    const res = await fetch(url)
    if ([200, 503].includes(res.status)) {
      console.log(`API ok (${res.status}) em ${i} tentativa(s): ${url}`)
      process.exit(0)
    }
    console.log(`[${i}/${attempts}] status ${res.status}`)
  } catch (err) {
    console.log(`[${i}/${attempts}] ${err?.cause?.code || err?.message || err}`)
  }
  await new Promise((r) => setTimeout(r, delayMs))
}

console.error(`Timeout aguardando API: ${url}`)
process.exit(1)
