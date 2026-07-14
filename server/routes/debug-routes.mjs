/**
 * Rotas de debug (dev ou DEBUG_AGENT_LOG=1).
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerDebugRoutes = (app, deps) => {
  const {
    isDev,
    appendDebugNdjsonToSessionFiles,
    appendFootballDebugNdjson,
    getSessionDebugSnapshot,
    clearSessionDebugRing,
  } = deps

  const debugEnabled = () => isDev || String(process.env.DEBUG_AGENT_LOG || '').trim() === '1'

  app.post('/api/debug/agent-log', (req, res) => {
    appendFootballDebugNdjson('H19', 'debug-routes:/api/debug/agent-log', 'agent_log_route_hit', {
      isDev,
      envDebugAgentLog: String(process.env.DEBUG_AGENT_LOG || '').trim(),
      hasBody: Boolean(req.body && typeof req.body === 'object'),
    })
    if (!debugEnabled()) {
      res.status(404).end()
      return
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      appendDebugNdjsonToSessionFiles({ ...body, _serverTs: Date.now() })
      res.status(204).end()
    } catch {
      res.status(500).end()
    }
  })

  app.get('/api/debug/session-ring', (_req, res) => {
    if (!debugEnabled()) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json(getSessionDebugSnapshot())
  })

  app.post('/api/debug/session-ring/clear', (_req, res) => {
    if (!debugEnabled()) {
      res.status(404).end()
      return
    }
    clearSessionDebugRing()
    appendFootballDebugNdjson('H20', 'debug-routes:/api/debug/session-ring/clear', 'session_ring_cleared', {})
    res.status(204).end()
  })
}
