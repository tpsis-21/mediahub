/**
 * Lê PORT do .env (mesma regra que free-api-port) para scripts de dev.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')

export function readEnvPort() {
  if (process.env.PORT) {
    const n = Number(String(process.env.PORT).trim())
    if (Number.isFinite(n) && n > 0) return n
  }
  if (!existsSync(envPath)) return 8081
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*PORT\s*=\s*(.+)$/i)
      if (!m) continue
      const v = m[1].trim().replace(/^["']|["']$/g, '')
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }
  } catch {
    void 0
  }
  return 8081
}
