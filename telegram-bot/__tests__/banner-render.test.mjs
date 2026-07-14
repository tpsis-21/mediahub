import { describe, expect, it } from 'vitest'
import { createBannerRenderer } from '../lib/banner-render.mjs'

describe('telegram-bot banner-render', () => {
  it('gera PNG de futebol com texto (fontes registradas)', async () => {
    let createCanvas
    let GlobalFonts
    let loadImage
    try {
      ;({ createCanvas, GlobalFonts, loadImage } = await import('@napi-rs/canvas'))
    } catch {
      return
    }
    const { renderFootballBanner, renderTop10Banner } = createBannerRenderer({
      createCanvas,
      loadImage,
      GlobalFonts,
    })
    const buf = await renderFootballBanner({
      dateIso: '2026-07-14',
      matches: [
        { time: '16:00', home: 'Time A', away: 'Time B' },
        { time: '18:30', home: 'Time C', away: 'Time D' },
      ],
      brandName: 'MediaHub',
      model: 'informativo',
    })
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(buf.length).toBeGreaterThan(20_000)

    const top = await renderTop10Banner({
      items: [
        { title: 'Filme Um', year: '2024' },
        { title: 'Filme Dois', year: '2025' },
      ],
      categoryLabel: 'Top 10',
      brandName: 'MediaHub',
      model: 'lista',
    })
    expect(top.length).toBeGreaterThan(15_000)
  })
})
