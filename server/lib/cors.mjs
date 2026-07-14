/**
 * Helpers de CORS / origem permitida.
 */

export const originsMatchModuloWww = (allowed, requestOrigin) => {
  try {
    const a = new URL(allowed)
    const b = new URL(requestOrigin)
    if (a.protocol !== b.protocol) return false
    if (String(a.port || '') !== String(b.port || '')) return false
    const ha = (a.hostname || '').toLowerCase().replace(/^www\./, '')
    const hb = (b.hostname || '').toLowerCase().replace(/^www\./, '')
    return ha === hb
  } catch {
    return false
  }
}

/** Host após remover [ ] do IPv6 — compara localhost, 127.0.0.1 e ::1 como equivalentes em dev. */
export const normalizeLoopbackHostname = (hostname) =>
  String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')

export const isNormalizedLoopbackHost = (h) =>
  h === 'localhost' ||
  h === '127.0.0.1' ||
  h === '::1' ||
  h === '0:0:0:0:0:0:0:1' ||
  h === '::ffff:127.0.0.1'

/** Vite com host `::` → Origin `http://[::1]:5173` enquanto ALLOWED_ORIGIN pode ser `http://localhost:5173`. */
export const isDevLoopbackOriginEquivalent = (origin, allowedList, isDev) => {
  if (!isDev || !Array.isArray(allowedList) || allowedList.length === 0) return false
  try {
    const o = new URL(origin)
    const op = o.port || (o.protocol === 'https:' ? '443' : '80')
    const oh = normalizeLoopbackHostname(o.hostname)
    if (!isNormalizedLoopbackHost(oh)) return false
    for (const allowed of allowedList) {
      try {
        const a = new URL(allowed)
        const ap = a.port || (a.protocol === 'https:' ? '443' : '80')
        const ah = normalizeLoopbackHostname(a.hostname)
        if (!isNormalizedLoopbackHost(ah)) continue
        if (ap === op && o.protocol === a.protocol) return true
      } catch {
        void 0
      }
    }
  } catch {
    void 0
  }
  return false
}

/**
 * @param {{ allowedOrigins: string[], isDev: boolean }} opts
 */
export const createIsAllowedOrigin = ({ allowedOrigins, isDev }) => {
  const list = Array.isArray(allowedOrigins) ? allowedOrigins : []

  return (origin) => {
    if (list.length === 0) return true
    if (!origin) return false
    if (list.includes(origin)) return true
    for (const allowed of list) {
      if (originsMatchModuloWww(allowed, origin)) return true
    }
    if (isDevLoopbackOriginEquivalent(origin, list, isDev)) return true
    if (!isDev) return false
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true
    if (/^https?:\/\/\[::1\](:\d+)?$/i.test(origin)) return true
    if (/^https?:\/\/\[::ffff:127\.0\.0\.1\](:\d+)?$/i.test(origin)) return true
    if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true
    return false
  }
}
