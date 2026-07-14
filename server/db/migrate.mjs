/**
 * Runner de migrations SQL versionadas em `server/db/migrations/`.
 * Idempotente: registra em `schema_migrations` e só aplica pendentes.
 *
 * Uso:
 *   node --env-file=.env scripts/db-migrate.mjs
 *   (também chamado no boot da API)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

/**
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }} db
 * @param {{ logger?: Console }} [opts]
 */
export async function runMigrations(db, opts = {}) {
  const log = opts.logger || console

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    log.warn('[migrate] pasta migrations ausente:', MIGRATIONS_DIR)
    return { applied: [], skipped: [] }
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3,}_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'en'))

  const { rows: appliedRows } = await db.query(`SELECT id FROM schema_migrations`)
  const appliedSet = new Set(appliedRows.map((r) => String(r.id)))

  const applied = []
  const skipped = []

  for (const file of files) {
    const id = file.replace(/\.sql$/i, '')
    if (appliedSet.has(id)) {
      skipped.push(id)
      continue
    }

    const full = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(full, 'utf8').trim()
    if (!sql) {
      log.warn(`[migrate] arquivo vazio ignorado: ${file}`)
      continue
    }

    await db.query('BEGIN')
    try {
      await db.query(sql)
      await db.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id])
      await db.query('COMMIT')
      applied.push(id)
      log.log(`[migrate] aplicada: ${id}`)
    } catch (err) {
      await db.query('ROLLBACK')
      throw new Error(`[migrate] falhou em ${id}: ${err?.message || err}`)
    }
  }

  return { applied, skipped }
}

export const migrationsDir = MIGRATIONS_DIR
