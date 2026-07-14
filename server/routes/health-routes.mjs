/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerHealthRoutes = (app, deps) => {
  const { query } = deps

  const describeDbTarget = () => {
    const raw = String(process.env.DATABASE_URL || '').trim()
    const unquoted =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1).trim()
        : raw
    if (!unquoted) return { configured: false, target: null, hadQuotes: false }
    try {
      const u = new URL(unquoted)
      return {
        configured: true,
        target: `${u.hostname}:${u.port || '5432'}`,
        hadQuotes:
          (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")),
        userPrefix: String(u.username || '').slice(0, 12),
      }
    } catch {
      return { configured: true, target: 'invalid_url', hadQuotes: false, userPrefix: null }
    }
  }

  app.get('/api/health', async (req, res) => {
    const startedAt = Date.now()
    const dbMeta = describeDbTarget()
    try {
      await query('SELECT 1')
      res.json({
        ok: true,
        db: 'up',
        elapsedMs: Date.now() - startedAt,
        requestId: req.requestId || null,
        buildHint: 'health-v2',
        dbTarget: dbMeta.target,
      })
    } catch (e) {
      const msg = String(e?.message || e || '')
      console.error('[health] db check failed', msg, { requestId: req.requestId || null })
      res.status(503).json({
        ok: false,
        db: 'down',
        elapsedMs: Date.now() - startedAt,
        requestId: req.requestId || null,
        message: 'Banco indisponível.',
        buildHint: 'health-v2',
        code: typeof e?.code === 'string' ? e.code : null,
        errno: e?.errno ?? null,
        dbTarget: dbMeta.target,
        dbUserPrefix: dbMeta.userPrefix,
        hadQuotes: dbMeta.hadQuotes,
        // trecho curto sem senha (Postgres costuma não incluir a URI na mensagem)
        errSample: msg.replace(/:[^:@/]+@/g, ':***@').slice(0, 160),
      })
    }
  })
}
