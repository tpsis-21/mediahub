/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerHistoryRoutes = (app, deps) => {
  const { requireAuth, query, ensureSearchHistorySchema } = deps

  app.get('/api/history', requireAuth, async (req, res) => {
    try {
      await ensureSearchHistorySchema()
      const result = await query(
        'select id, query, results, timestamp, type from app_search_history where user_id = $1 order by timestamp desc limit 10',
        [req.auth.userId]
      )
      res.json({ items: result.rows })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/history', requireAuth, async (req, res) => {
    const queryText = typeof req.body?.query === 'string' ? req.body.query.slice(0, 500) : ''
    const type = req.body?.type === 'bulk' ? 'bulk' : 'individual'
    const results = Array.isArray(req.body?.results) ? req.body.results : []
    const timestamp = typeof req.body?.timestamp === 'number' ? req.body.timestamp : Date.now()

    if (!queryText) {
      res.status(400).json({ message: 'Consulta inválida.' })
      return
    }

    try {
      await ensureSearchHistorySchema()
      await query('delete from app_search_history where user_id = $1 and query = $2 and type = $3', [
        req.auth.userId,
        queryText,
        type,
      ])
      await query(
        `
      insert into app_search_history (user_id, query, results, timestamp, type)
      values ($1, $2, $3::jsonb, $4, $5)
      `,
        [req.auth.userId, queryText, JSON.stringify(results), timestamp, type]
      )
      await query(
        `
      delete from app_search_history
      where user_id = $1
        and id not in (
          select id
          from app_search_history
          where user_id = $1
          order by timestamp desc
          limit 10
        )
      `,
        [req.auth.userId]
      )
      res.status(204).end()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })
}
