/**
 * Lê PORT do .env (mesma regra que free-api-port) para scripts de dev.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')

/** Quando só existe VITE_API_BASE_URL=http://localhost:8080 e não há PORT, alinha API + proxy Vite. */
const parseLocalhostPortFromApiBase = (value) => {
  const v = String(value || '').trim().replace(/^["']|["']$/g, '')
  if (!v) return null
  try {
    const u = new URL(v.includes('://') ? v : `http://${v}`)
    const host = (u.hostname || '').toLowerCase()
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null
    if (!u.port) return null
    const n = Number(u.port)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function readEnvPort() {
  if (process.env.VITE_DEV_API_PORT) {
    const n = Number(String(process.env.VITE_DEV_API_PORT).trim())
    if (Number.isFinite(n) && n > 0) return n
  }
  if (process.env.PORT) {
    const n = Number(String(process.env.PORT).trim())
    if (Number.isFinite(n) && n > 0) return n
  }
  if (!existsSync(envPath)) return 8081
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const mDev = line.match(/^\s*VITE_DEV_API_PORT\s*=\s*(.+)$/i)
      if (mDev) {
        const v = mDev[1].trim().replace(/^["']|["']$/g, '')
        const n = Number(v)
        if (Number.isFinite(n) && n > 0) return n
      }
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*PORT\s*=\s*(.+)$/i)
      if (!m) continue
      const v = m[1].trim().replace(/^["']|["']$/g, '')
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*VITE_API_BASE_URL\s*=\s*(.+)$/i)
      if (!m) continue
      const derived = parseLocalhostPortFromApiBase(m[1])
      if (derived) return derived
    }
  } catch {
    void 0
  }
  return 8081
}
