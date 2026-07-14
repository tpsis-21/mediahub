export const clientIp = (req) => {
  const xf = req?.headers?.['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 80)
  return String(req?.socket?.remoteAddress || 'unknown').slice(0, 80)
}

/**
 * Rate limit in-memory (processo único — adequado ao deploy EasyPanel atual).
 * @param {{ windowMs: number, max: number, prefix: string, now?: () => number }} opts
 */
export const createRateLimiter = ({ windowMs, max, prefix, now = () => Date.now() }) => {
  const hits = new Map()
  let lastPrune = now()
  const prune = (t) => {
    if (t - lastPrune < 60_000 && hits.size < 5000) return
    lastPrune = t
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= t) hits.delete(key)
    }
  }
  return (req, res, next) => {
    const t = now()
    prune(t)
    const id = req.auth?.userId ? `u:${req.auth.userId}` : `ip:${clientIp(req)}`
    const key = `${prefix}:${id}`
    let bucket = hits.get(key)
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs }
      hits.set(key, bucket)
    }
    bucket.count += 1
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - t) / 1000))))
      res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
      return
    }
    next()
  }
}
