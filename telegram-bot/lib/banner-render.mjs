/**
 * Render de banners para o bot (Node / @napi-rs/canvas).
 * Layouts simplificados da Fase 2 — paridade visual total fica na web.
 */

const W = 1080
const H_FEED = 1350
const H_STORY = 1920

const parseHex = (hex, fallback) => {
  const raw = String(hex || '').trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const rgba = (c, a = 1) => `rgba(${c.r},${c.g},${c.b},${a})`

const truncate = (ctx, text, maxWidth) => {
  const t = String(text || '').trim()
  if (!t) return ''
  if (ctx.measureText(t).width <= maxWidth) return t
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const sample = `${t.slice(0, mid).trim()}…`
    if (ctx.measureText(sample).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${t.slice(0, Math.max(0, lo)).trim()}…`
}

const roundRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * @param {{ createCanvas: Function, loadImage?: Function }} canvasApi
 */
export const createBannerRenderer = (canvasApi) => {
  const { createCanvas, loadImage } = canvasApi

  const loadRemoteImage = async (url) => {
    if (!url || typeof loadImage !== 'function') return null
    try {
      return await loadImage(url)
    } catch {
      return null
    }
  }

  const fillBrandBackground = (ctx, width, height, primary, secondary) => {
    const g = ctx.createLinearGradient(0, 0, width, height)
    g.addColorStop(0, rgba(primary, 1))
    g.addColorStop(1, rgba(secondary, 1))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, width, height)
  }

  /**
   * Banner de jogos do dia (até 10 confrontos).
   */
  const renderFootballBanner = async ({
    dateIso,
    matches,
    brandName = 'MediaHub',
    primary = '#0F172A',
    secondary = '#1D4ED8',
  }) => {
    const canvas = createCanvas(W, H_FEED)
    const ctx = canvas.getContext('2d')
    const p = parseHex(primary, { r: 15, g: 23, b: 42 })
    const s = parseHex(secondary, { r: 29, g: 78, b: 216 })
    fillBrandBackground(ctx, W, H_FEED, p, s)

    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, 48, 48, W - 96, 200, 28)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = '900 64px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('Jogos do Dia', 80, 72)
    ctx.font = '700 32px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    const dateLabel = (() => {
      try {
        const [y, m, d] = String(dateIso).split('-').map(Number)
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          timeZone: 'UTC',
        })
      } catch {
        return String(dateIso || '')
      }
    })()
    ctx.fillText(dateLabel, 80, 150)
    ctx.font = '700 26px sans-serif'
    ctx.fillText(truncate(ctx, brandName, 900), 80, 198)

    const list = Array.isArray(matches) ? matches.slice(0, 10) : []
    const top = 280
    const rowH = list.length > 8 ? 96 : 104
    list.forEach((m, i) => {
      const y = top + i * rowH
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      roundRect(ctx, 48, y, W - 96, rowH - 12, 18)
      ctx.fill()

      const time = String(m.time || '').replace(':', 'H')
      const home = String(m.home || '')
      const away = String(m.away || '')
      const midY = y + (rowH - 12) / 2

      ctx.fillStyle = '#fff'
      ctx.font = '900 28px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(time, 72, midY)

      ctx.font = '800 26px sans-serif'
      const left = truncate(ctx, home, 340)
      const right = truncate(ctx, away, 340)
      ctx.fillText(left, 200, midY)
      ctx.textAlign = 'center'
      ctx.fillText('x', W / 2, midY)
      ctx.textAlign = 'right'
      ctx.fillText(right, W - 72, midY)
    })

    if (!list.length) {
      ctx.textAlign = 'center'
      ctx.font = '700 36px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText('Nenhum jogo na agenda', W / 2, H_FEED / 2)
    }

    return canvas.toBuffer('image/png')
  }

  /**
   * Banner de um título (capa + nome).
   */
  const renderTitleBanner = async ({
    title,
    year = '',
    overview = '',
    posterUrl = '',
    brandName = 'MediaHub',
    primary = '#0F172A',
    secondary = '#7C3AED',
  }) => {
    const canvas = createCanvas(W, H_FEED)
    const ctx = canvas.getContext('2d')
    const p = parseHex(primary, { r: 15, g: 23, b: 42 })
    const s = parseHex(secondary, { r: 124, g: 58, b: 237 })
    fillBrandBackground(ctx, W, H_FEED, p, s)

    const poster = await loadRemoteImage(posterUrl)
    if (poster) {
      const pw = 520
      const ph = 780
      const px = (W - pw) / 2
      const py = 80
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, px - 12, py - 12, pw + 24, ph + 24, 24)
      ctx.fill()
      ctx.save()
      roundRect(ctx, px, py, pw, ph, 18)
      ctx.clip()
      const scale = Math.max(pw / (poster.width || 1), ph / (poster.height || 1))
      const dw = (poster.width || pw) * scale
      const dh = (poster.height || ph) * scale
      ctx.drawImage(poster, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh)
      ctx.restore()
    }

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    roundRect(ctx, 48, 900, W - 96, 380, 28)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '900 48px sans-serif'
    ctx.fillText(truncate(ctx, title, 920), W / 2, 940)
    if (year) {
      ctx.font = '700 30px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(String(year), W / 2, 1010)
    }
    if (overview) {
      ctx.font = '600 26px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      const line = truncate(ctx, overview, 920)
      ctx.fillText(line, W / 2, 1070)
    }
    ctx.font = '700 28px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(truncate(ctx, brandName, 900), W / 2, 1180)

    return canvas.toBuffer('image/png')
  }

  /**
   * Top 10 (lista ranqueada).
   */
  const renderTop10Banner = async ({
    items,
    categoryLabel = 'Top 10',
    brandName = 'MediaHub',
    primary = '#0B1220',
    secondary = '#DC2626',
  }) => {
    const canvas = createCanvas(W, H_STORY)
    const ctx = canvas.getContext('2d')
    const p = parseHex(primary, { r: 11, g: 18, b: 32 })
    const s = parseHex(secondary, { r: 220, g: 38, b: 38 })
    fillBrandBackground(ctx, W, H_STORY, p, s)

    ctx.fillStyle = '#fff'
    ctx.font = '900 64px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(categoryLabel, 64, 64)
    ctx.font = '700 28px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(truncate(ctx, brandName, 900), 64, 140)

    const list = Array.isArray(items) ? items.slice(0, 10) : []
    const top = 220
    const rowH = 160

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]
      const y = top + i * rowH
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      roundRect(ctx, 48, y, W - 96, rowH - 16, 20)
      ctx.fill()

      ctx.fillStyle = rgba(s, 1)
      ctx.font = '900 48px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1).padStart(2, '0'), 72, y + (rowH - 16) / 2)

      const poster = await loadRemoteImage(item.posterUrl)
      if (poster) {
        const pw = 90
        const ph = 130
        const px = 180
        const py = y + 8
        ctx.save()
        roundRect(ctx, px, py, pw, ph, 12)
        ctx.clip()
        ctx.drawImage(poster, px, py, pw, ph)
        ctx.restore()
      }

      ctx.fillStyle = '#fff'
      ctx.font = '800 32px sans-serif'
      ctx.textAlign = 'left'
      const titleX = poster ? 290 : 200
      ctx.fillText(truncate(ctx, item.title || 'Sem título', 700), titleX, y + (rowH - 16) / 2 - 18)
      if (item.year) {
        ctx.font = '600 24px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.fillText(String(item.year), titleX, y + (rowH - 16) / 2 + 22)
      }
    }

    return canvas.toBuffer('image/png')
  }

  return { renderFootballBanner, renderTitleBanner, renderTop10Banner }
}
