/**
 * Valida URLs HTTP(S) externas para proxies (crest/assets) — bloqueia loopback e redes privadas literais.
 * @param {unknown} raw
 * @returns {boolean}
 */
export const isSafeExternalHttpUrl = (raw) => {
  try {
    const url = new URL(String(raw || ''))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = (url.hostname || '').toLowerCase()
    if (!host) return false
    if (host === 'localhost') return false
    if (host === '127.0.0.1') return false
    if (host === '::1') return false

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split('.').map((n) => Number(n))
      if (a === 0) return false
      if (a === 10) return false
      if (a === 127) return false
      if (a === 169 && b === 254) return false
      if (a === 192 && b === 168) return false
      if (a === 172 && b >= 16 && b <= 31) return false
      // CGNAT / shared address space
      if (a === 100 && b >= 64 && b <= 127) return false
    }

    if (host.includes(':')) {
      const normalized = host.replace(/^\[|\]$/g, '')
      const compact = normalized.toLowerCase()
      if (compact === '::1') return false
      if (compact.startsWith('fe80:')) return false
      if (compact.startsWith('fc') || compact.startsWith('fd')) return false
    }

    return true
  } catch {
    return false
  }
}
