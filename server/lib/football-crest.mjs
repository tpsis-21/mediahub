/**
 * Proxy de escudos de futebol (fetch seguro + raster SVG→PNG).
 * @param {Record<string, any>} deps
 */
export const setFootballCrestCorsHeaders = (res) => {
  // Imagem carregada no canvas no browser (crossOrigin=anonymous): precisa CORS + CORP permissivo.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}

export const createFootballCrestProxy = (deps) => {
  const {
    normalizeFootballCrestUrl,
    isSafeExternalHttpUrl,
    sniffImageMimeFromBuffer,
    loadImage,
    createCanvas,
    isCanvasRuntimeHealthy,
    appendDebugNdjsonToSessionFiles,
  } = deps

  const canvasHealthy = () =>
    typeof isCanvasRuntimeHealthy === 'function' ? Boolean(isCanvasRuntimeHealthy()) : Boolean(isCanvasRuntimeHealthy)

  let dbgFootballCrestServerLogs = 0

  const rasterizeFootballCrestSvgToPng = async (svgBuffer) => {
    if (!canvasHealthy()) return null
    try {
      const img = await loadImage(svgBuffer)
      let w = Number(img.width) || 0
      let h = Number(img.height) || 0
      if (!w || !h) {
        w = 512
        h = 512
      }
      const maxSide = 512
      if (w > maxSide || h > maxSide) {
        const scale = maxSide / Math.max(w, h)
        w = Math.max(1, Math.floor(w * scale))
        h = Math.max(1, Math.floor(h * scale))
      }
      const canvas = createCanvas(w, h)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      return canvas.toBuffer('image/png')
    } catch {
      return null
    }
  }

  const makeFootballCrestDbg = (routeTag) => (data) => {
    if (dbgFootballCrestServerLogs >= 30) return
    dbgFootballCrestServerLogs += 1
    if (typeof appendDebugNdjsonToSessionFiles === 'function') {
      appendDebugNdjsonToSessionFiles({
        sessionId: '3ee3aa',
        hypothesisId: 'H1',
        timestamp: Date.now(),
        location: `football-crest:${routeTag} /api/football/crest`,
        message: 'crest_proxy',
        data,
      })
    }
  }

  const processFootballCrestProxy = async (res, urlRaw, dbgFootballCrest) => {
    const dbg = typeof dbgFootballCrest === 'function' ? dbgFootballCrest : () => {}
    try {
      const normalized = normalizeFootballCrestUrl(urlRaw)
      if (!normalized || normalized.startsWith('data:')) {
        dbg({ sentStatus: 400, note: 'invalid_or_data_crest_url' })
        res.status(400).end()
        return
      }
      if (!isSafeExternalHttpUrl(normalized)) {
        dbg({ host: '', sentStatus: 403, note: 'unsafe_url' })
        res.status(403).end()
        return
      }
      const url = new URL(normalized)
      const response = await fetch(url.toString(), {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          referer: `${url.origin}/`,
          'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      })
      if (!response.ok) {
        dbg({ host: url.hostname, upstreamStatus: response.status, sentStatus: 502, note: 'upstream_not_ok' })
        res.status(502).end()
        return
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length < 8) {
        dbg({ host: url.hostname, upstreamStatus: response.status, sentStatus: 502, note: 'tiny_body' })
        res.status(502).end()
        return
      }
      const headerCt = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      let contentType = headerCt.startsWith('image/') ? headerCt : ''
      if (!contentType) contentType = sniffImageMimeFromBuffer(buffer)
      if (!contentType) {
        const headUtf8 = buffer.slice(0, Math.min(256, buffer.length)).toString('utf8').trimStart()
        if (headUtf8.startsWith('<svg') || headUtf8.startsWith('<?xml') || /<svg[\s>]/i.test(headUtf8)) {
          contentType = 'image/svg+xml'
        }
      }
      if (!contentType || !contentType.startsWith('image/')) {
        dbg({
          host: url.hostname,
          upstreamStatus: response.status,
          sentStatus: 502,
          note: 'not_image_mime',
          headerCt,
        })
        res.status(502).end()
        return
      }
      if (buffer.length > 2_500_000) {
        dbg({ host: url.hostname, sentStatus: 413, note: 'too_large' })
        res.status(413).end()
        return
      }
      let crestProxyNote
      if (contentType === 'image/svg+xml') {
        const pngBuf = await rasterizeFootballCrestSvgToPng(buffer)
        if (pngBuf && pngBuf.length >= 24) {
          dbg({
            host: url.hostname,
            upstreamStatus: response.status,
            sentStatus: 200,
            bytes: pngBuf.length,
            contentType: 'image/png',
            note: 'svg_rasterized',
          })
          res.setHeader('Content-Type', 'image/png')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.status(200).send(pngBuf)
          return
        }
        crestProxyNote = 'svg_rasterize_miss'
      }
      dbg({
        host: url.hostname,
        upstreamStatus: response.status,
        sentStatus: 200,
        bytes: buffer.length,
        contentType,
        ...(crestProxyNote
          ? { note: crestProxyNote, canvasHealthy: canvasHealthy() }
          : {}),
      })
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.status(200).send(buffer)
    } catch {
      dbg({ sentStatus: 400, note: 'catch' })
      res.status(400).end()
    }
  }

  return {
    setFootballCrestCorsHeaders,
    makeFootballCrestDbg,
    processFootballCrestProxy,
    rasterizeFootballCrestSvgToPng,
  }
}
