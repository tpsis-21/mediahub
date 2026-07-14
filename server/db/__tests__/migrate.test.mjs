import { describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../migrate.mjs'

describe('runMigrations', () => {
  it('cria schema_migrations e aplica arquivo pendente', async () => {
    const executed = []
    const db = {
      query: vi.fn(async (text, params) => {
        executed.push({ text: String(text).slice(0, 80), params })
        if (/SELECT id FROM schema_migrations/i.test(text)) {
          return { rows: [] }
        }
        return { rows: [] }
      }),
    }

    // Pasta real tem 001_*; com applied vazio deve tentar BEGIN + SQL + INSERT + COMMIT
    const result = await runMigrations(db, { logger: { log: () => {}, warn: () => {} } })
    expect(result.applied.length).toBeGreaterThanOrEqual(1)
    expect(db.query).toHaveBeenCalled()
    const texts = executed.map((e) => e.text)
    expect(texts.some((t) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(t))).toBe(true)
    expect(texts.some((t) => /^BEGIN$/i.test(t.trim()) || t.includes('BEGIN'))).toBe(true)
  })

  it('pula migrations já aplicadas', async () => {
    const db = {
      query: vi.fn(async (text) => {
        if (/SELECT id FROM schema_migrations/i.test(text)) {
          return { rows: [{ id: '001_tickets_football_settings' }] }
        }
        return { rows: [] }
      }),
    }
    const result = await runMigrations(db, { logger: { log: () => {}, warn: () => {} } })
    expect(result.applied).toEqual([])
    expect(result.skipped).toContain('001_tickets_football_settings')
  })
})
