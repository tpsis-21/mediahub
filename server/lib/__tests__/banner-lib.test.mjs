import { describe, expect, it } from 'vitest'
import { drawRoundedRect, hexToRgba, parseHex, wrapTextSimple } from '../../../src/lib/banner/index.ts'

describe('banner lib', () => {
  it('parseHex / hexToRgba', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgba('#112233', 0.5)).toBe('rgba(17,34,51,0.5)')
  })

  it('drawRoundedRect não lança', () => {
    const ops = []
    const ctx = {
      beginPath: () => ops.push('begin'),
      moveTo: () => ops.push('move'),
      arcTo: () => ops.push('arc'),
      closePath: () => ops.push('close'),
    }
    drawRoundedRect(ctx, 0, 0, 100, 40, 8)
    expect(ops[0]).toBe('begin')
    expect(ops.includes('close')).toBe(true)
  })

  it('wrapTextSimple quebra linha', () => {
    const ctx = { measureText: (t) => ({ width: String(t).length * 10 }) }
    const lines = wrapTextSimple(ctx, 'aa bb cc', 25)
    expect(lines.length).toBeGreaterThan(1)
  })
})

describe('football-layout helpers', async () => {
  const { footballMatchKey, parseClockTime } = await import('../../../src/lib/banner/football-layout.ts')

  it('parseClockTime normaliza horário', () => {
    expect(parseClockTime('9:05')).toBe('09:05')
    expect(parseClockTime('21h30')).toBe('21:30')
    expect(parseClockTime('xx')).toBeNull()
  })

  it('footballMatchKey é estável', () => {
    const a = footballMatchKey({ time: '21h00', home: '  Flamengo ', away: 'Palmeiras' })
    const b = footballMatchKey({ time: '21:00', home: 'Flamengo', away: 'Palmeiras' })
    expect(a).toBe(b)
  })
})
