/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerHealthRoutes = (app, deps) => {
  const { query } = deps

  app.get('/api/health', async (req, res) => {
    const startedAt = Date.now()
    try {
      await query('SELECT 1')
      res.json({
        ok: true,
        db: 'up',
        elapsedMs: Date.now() - startedAt,
        requestId: req.requestId || null,
      })
  } catch (e) {
    console.error('[health] db check failed', e?.message || e, { requestId: req.requestId || null })
    res.status(503).json({
      ok: false,
      db: 'down',
      elapsedMs: Date.now() - startedAt,
      requestId: req.requestId || null,
      message: 'Banco indisponível.',
      // código Postgres ajuda a diagnosticar sem vazar a connection string
      code: typeof e?.code === 'string' ? e.code : null,
    })
  }
  })
}
