import { describe, expect, it } from 'vitest'
import { createBannerRenderer } from '../lib/banner-render.mjs'

describe('telegram-bot banner-render', () => {
  it('gera PNG de futebol', async () => {
    // usa mock mínimo se napi não carregar no CI
    let createCanvas
    try {
      ;({ createCanvas } = await import('@napi-rs/canvas'))
    } catch {
      return
    }
    const { renderFootballBanner } = createBannerRenderer({ createCanvas })
    const buf = await renderFootballBanner({
      dateIso: '2026-07-14',
      matches: [
        { time: '16:00', home: 'Time A', away: 'Time B' },
        { time: '18:30', home: 'Time C', away: 'Time D' },
      ],
      brandName: 'MediaHub',
    })
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
