import pg from 'pg'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const raw = String(process.env.DATABASE_URL || '').trim()
const unquote = (s) => s.replace(/^["']|["']$/g, '')
const url = unquote(raw)

console.log(
  JSON.stringify({
    rawLen: raw.length,
    urlLen: url.length,
    hadQuotes: raw !== url,
    host: (() => {
      try {
        return new URL(url).host
      } catch {
        return 'invalid'
      }
    })(),
  }),
)

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  max: 1,
})

try {
  const r = await pool.query('select 1 as ok')
  console.log('LOCAL_DB_OK', r.rows[0])
} catch (e) {
  console.log('LOCAL_DB_FAIL', e.code || '', e.message)
} finally {
  await pool.end()
}
