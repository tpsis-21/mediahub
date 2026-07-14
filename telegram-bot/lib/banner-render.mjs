/**
 * Render de banners para o bot (Node / @napi-rs/canvas).
 * Fontes empacotadas — sem fonte registrada o fillText fica invisível no Linux.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 1080
const H_FEED = 1350
const H_STORY = 1920

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts')

export const FOOTBALL_MODELS = [
  { id: 'informativo', label: 'Informativo' },
  { id: 'promo', label: 'Destaque' },
  { id: 'clean', label: 'Compacto' },
]

export const TOP10_MODELS = [
  { id: 'lista', label: 'Lista' },
  { id: 'cartaz', label: 'Cartaz' },
]

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

const drawCover = (ctx, img, x, y, w, h) => {
  if (!img) return
  const iw = img.width || w
  const ih = img.height || h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

let fontsReady = false
let fontRegular = 'sans-serif'
let fontBold = 'sans-serif'

const ensureFonts = (GlobalFonts) => {
  if (fontsReady) return
  const tryRegister = (file, family) => {
    try {
      if (file && fs.existsSync(file) && GlobalFonts?.registerFromPath) {
        GlobalFonts.registerFromPath(file, family)
        return true
      }
    } catch {
      /* next */
    }
    return false
  }

  const boldCandidates = [
    path.join(FONT_DIR, 'Inter-Bold.ttf'),
    'C:/Windows/Fonts/arialbd.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ]
  const regularCandidates = [
    path.join(FONT_DIR, 'Inter-Regular.ttf'),
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ]

  let boldOk = false
  let regularOk = false
  for (const p of boldCandidates) {
    if (tryRegister(p, 'MediaHubBold')) {
      boldOk = true
      break
    }
  }
  for (const p of regularCandidates) {
    if (tryRegister(p, 'MediaHub')) {
      regularOk = true
      break
    }
  }

  fontBold = boldOk ? 'MediaHubBold' : regularOk ? 'MediaHub' : 'Arial'
  fontRegular = regularOk ? 'MediaHub' : boldOk ? 'MediaHubBold' : 'Arial'
  fontsReady = true
}

const font = (weight, size) => {
  const family = weight >= 700 ? fontBold : fontRegular
  return `${weight} ${size}px "${family}", Arial, sans-serif`
}

/**
 * @param {{ createCanvas: Function, loadImage?: Function, GlobalFonts?: any }} canvasApi
 */
export const createBannerRenderer = (canvasApi) => {
  const { createCanvas, loadImage, GlobalFonts } = canvasApi
  ensureFonts(GlobalFonts)

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
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(0, 0, width, height)
  }

  const formatDateLabel = (dateIso) => {
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
  }

  const renderFootballInformativo = (ctx, { dateIso, matches, brandName, p, s }) => {
    fillBrandBackground(ctx, W, H_FEED, p, s)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    roundRect(ctx, 48, 48, W - 96, 180, 28)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = font(900, 56)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('Jogos do Dia', 80, 68)
    ctx.font = font(600, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(formatDateLabel(dateIso), 80, 140)
    ctx.font = font(700, 24)
    ctx.fillText(truncate(ctx, brandName, 900), 80, 182)

    const list = matches.slice(0, 10)
    const top = 260
    const rowH = list.length > 8 ? 100 : 108
    list.forEach((m, i) => {
      const y = top + i * rowH
      ctx.fillStyle = 'rgba(0,0,0,0.38)'
      roundRect(ctx, 48, y, W - 96, rowH - 14, 18)
      ctx.fill()

      const time = String(m.time || '--:--')
      const midY = y + (rowH - 14) / 2
      ctx.fillStyle = rgba(s, 1)
      ctx.font = font(900, 28)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(time, 72, midY)

      ctx.fillStyle = '#fff'
      ctx.font = font(800, 26)
      ctx.fillText(truncate(ctx, m.home || '', 340), 200, midY)
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText('×', W / 2, midY)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      ctx.fillText(truncate(ctx, m.away || '', 340), W - 72, midY)
    })
  }

  const renderFootballPromo = (ctx, { dateIso, matches, brandName, p, s }) => {
    fillBrandBackground(ctx, W, H_FEED, p, s)
    ctx.fillStyle = rgba(s, 0.95)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(W, 0)
    ctx.lineTo(W, 280)
    ctx.lineTo(0, 360)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = font(900, 58)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('JOGOS DO DIA', 64, 70)
    ctx.font = font(600, 28)
    ctx.fillText(formatDateLabel(dateIso), 64, 150)
    ctx.font = font(700, 26)
    ctx.fillText(truncate(ctx, brandName, 900), 64, 200)

    const list = matches.slice(0, 8)
    list.forEach((m, i) => {
      const y = 390 + i * 112
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, 48, y, W - 96, 96, 16)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = font(900, 30)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(m.time || ''), 72, y + 48)
      ctx.font = font(700, 27)
      const line = `${m.home || ''}  ×  ${m.away || ''}`
      ctx.fillText(truncate(ctx, line, 760), 210, y + 48)
    })
  }

  const renderFootballClean = (ctx, { dateIso, matches, brandName, p, s }) => {
    ctx.fillStyle = rgba(p, 1)
    ctx.fillRect(0, 0, W, H_FEED)
    ctx.fillStyle = rgba(s, 0.18)
    ctx.fillRect(0, 0, W, 220)
    ctx.fillStyle = '#fff'
    ctx.font = font(900, 52)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('Jogos do Dia', W / 2, 64)
    ctx.font = font(600, 26)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(formatDateLabel(dateIso), W / 2, 132)
    ctx.font = font(700, 22)
    ctx.fillText(truncate(ctx, brandName, 900), W / 2, 172)

    const list = matches.slice(0, 12)
    const cols = 1
    list.forEach((m, i) => {
      const y = 250 + i * 86
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.15)'
      ctx.fillRect(40, y, W - 80, 78)
      ctx.fillStyle = rgba(s, 1)
      ctx.font = font(800, 24)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(m.time || ''), 64, y + 39)
      ctx.fillStyle = '#fff'
      ctx.font = font(700, 24)
      ctx.fillText(truncate(ctx, `${m.home || ''} × ${m.away || ''}`, 820), 180, y + 39)
    })
    void cols
  }

  const renderFootballBanner = async ({
    dateIso,
    matches,
    brandName = 'MediaHub',
    primary = '#0F172A',
    secondary = '#1D4ED8',
    model = 'informativo',
  }) => {
    ensureFonts(GlobalFonts)
    const canvas = createCanvas(W, H_FEED)
    const ctx = canvas.getContext('2d')
    const p = parseHex(primary, { r: 15, g: 23, b: 42 })
    let s = parseHex(secondary, { r: 29, g: 78, b: 216 })
    const list = Array.isArray(matches) ? matches : []

    if (model === 'promo') {
      s = parseHex(secondary || '#1F8A4C', { r: 31, g: 138, b: 76 })
      renderFootballPromo(ctx, { dateIso, matches: list, brandName, p, s })
    } else if (model === 'clean') {
      s = parseHex(secondary || '#22C55E', { r: 34, g: 197, b: 94 })
      renderFootballClean(ctx, { dateIso, matches: list, brandName, p, s })
    } else {
      renderFootballInformativo(ctx, { dateIso, matches: list, brandName, p, s })
    }

    if (!list.length) {
      ctx.textAlign = 'center'
      ctx.font = font(700, 36)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText('Nenhum jogo na agenda', W / 2, H_FEED / 2)
    }

    return canvas.toBuffer('image/png')
  }

  const renderTitleBanner = async ({
    title,
    year = '',
    overview = '',
    posterUrl = '',
    brandName = 'MediaHub',
    primary = '#0F172A',
    secondary = '#7C3AED',
  }) => {
    ensureFonts(GlobalFonts)
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
      drawCover(ctx, poster, px, py, pw, ph)
      ctx.restore()
    }

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    roundRect(ctx, 48, 900, W - 96, 380, 28)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = font(900, 46)
    ctx.fillText(truncate(ctx, title, 920), W / 2, 940)
    if (year) {
      ctx.font = font(700, 28)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(String(year), W / 2, 1005)
    }
    if (overview) {
      ctx.font = font(500, 24)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText(truncate(ctx, overview, 920), W / 2, 1060)
    }
    ctx.font = font(700, 26)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(truncate(ctx, brandName, 900), W / 2, 1180)

    return canvas.toBuffer('image/png')
  }

  const renderTop10Lista = async (ctx, { items, categoryLabel, brandName, p, s }) => {
    fillBrandBackground(ctx, W, H_STORY, p, s)
    ctx.fillStyle = '#fff'
    ctx.font = font(900, 58)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(categoryLabel, 64, 56)
    ctx.font = font(700, 26)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(truncate(ctx, brandName, 900), 64, 128)

    const list = items.slice(0, 10)
    const top = 200
    const rowH = 162

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]
      const y = top + i * rowH
      ctx.fillStyle = 'rgba(0,0,0,0.42)'
      roundRect(ctx, 48, y, W - 96, rowH - 16, 20)
      ctx.fill()

      const mid = y + (rowH - 16) / 2
      ctx.fillStyle = rgba(s, 1)
      ctx.font = font(900, 44)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1).padStart(2, '0'), 72, mid)

      const poster = await loadRemoteImage(item.posterUrl)
      const pw = 92
      const ph = 134
      const px = 170
      const py = y + 10
      if (poster) {
        ctx.save()
        roundRect(ctx, px, py, pw, ph, 12)
        ctx.clip()
        drawCover(ctx, poster, px, py, pw, ph)
        ctx.restore()
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        roundRect(ctx, px, py, pw, ph, 12)
        ctx.fill()
      }

      const titleX = 288
      ctx.fillStyle = '#fff'
      ctx.font = font(800, 30)
      ctx.fillText(truncate(ctx, item.title || 'Sem título', 700), titleX, mid - 16)
      if (item.year) {
        ctx.font = font(600, 22)
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.fillText(String(item.year), titleX, mid + 22)
      }
    }
  }

  const renderTop10Cartaz = async (ctx, { items, categoryLabel, brandName, p, s }) => {
    fillBrandBackground(ctx, W, H_STORY, p, s)
    ctx.fillStyle = '#fff'
    ctx.font = font(900, 54)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(categoryLabel, W / 2, 48)
    ctx.font = font(700, 24)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(truncate(ctx, brandName, 900), W / 2, 118)

    const list = items.slice(0, 10)
    const cols = 2
    const gap = 24
    const cardW = (W - 96 - gap) / cols
    const cardH = 300
    const startY = 180

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 48 + col * (cardW + gap)
      const y = startY + row * (cardH + gap)

      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      roundRect(ctx, x, y, cardW, cardH, 18)
      ctx.fill()

      const poster = await loadRemoteImage(item.posterUrl)
      const ph = 210
      ctx.save()
      roundRect(ctx, x + 12, y + 12, cardW - 24, ph, 14)
      ctx.clip()
      if (poster) drawCover(ctx, poster, x + 12, y + 12, cardW - 24, ph)
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        ctx.fillRect(x + 12, y + 12, cardW - 24, ph)
      }
      ctx.restore()

      ctx.fillStyle = rgba(s, 1)
      roundRect(ctx, x + 20, y + 20, 56, 40, 10)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = font(900, 24)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x + 48, y + 40)

      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = font(800, 22)
      ctx.fillText(truncate(ctx, item.title || '', cardW - 40), x + 16, y + ph + 28)
      if (item.year) {
        ctx.font = font(600, 18)
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.fillText(String(item.year), x + 16, y + ph + 56)
      }
    }
  }

  const renderTop10Banner = async ({
    items,
    categoryLabel = 'Top 10',
    brandName = 'MediaHub',
    primary = '#0B1220',
    secondary = '#DC2626',
    model = 'lista',
  }) => {
    ensureFonts(GlobalFonts)
    const canvas = createCanvas(W, H_STORY)
    const ctx = canvas.getContext('2d')
    const p = parseHex(primary, { r: 11, g: 18, b: 32 })
    const s = parseHex(secondary, { r: 220, g: 38, b: 38 })
    const list = Array.isArray(items) ? items : []

    if (model === 'cartaz') {
      await renderTop10Cartaz(ctx, { items: list, categoryLabel, brandName, p, s })
    } else {
      await renderTop10Lista(ctx, { items: list, categoryLabel, brandName, p, s })
    }

    return canvas.toBuffer('image/png')
  }

  return { renderFootballBanner, renderTitleBanner, renderTop10Banner, FOOTBALL_MODELS, TOP10_MODELS }
}
