import crypto from 'node:crypto'

/**
 * Gera ou reutiliza X-Request-Id, anexa em req/res e loga 5xx / requests lentas.
 * @param {{ slowMs?: number }} [opts]
 */
export const createRequestIdMiddleware = (opts = {}) => {
  const slowMs = Number(opts.slowMs) > 0 ? Number(opts.slowMs) : 3000

  return (req, res, next) => {
    const incoming = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : ''
    const requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID()
    req.requestId = requestId
    res.setHeader('X-Request-Id', requestId)

    const startedAt = Date.now()
    res.on('finish', () => {
      const elapsedMs = Date.now() - startedAt
      const status = res.statusCode
      const path = typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : req.path
      if (status >= 500 || elapsedMs >= slowMs) {
        console.warn('[http]', {
          requestId,
          method: req.method,
          path,
          status,
          elapsedMs,
        })
      }
    })

    next()
  }
}
