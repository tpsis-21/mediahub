import { describe, expect, it, vi } from 'vitest'
import { isSafeExternalHttpUrl } from '../safe-url.mjs'
import { createPasswordDigest, verifyPassword } from '../password.mjs'
import { createRateLimiter } from '../rate-limit.mjs'
import { evaluateFreeDailySearchQuota } from '../search-quota.mjs'

describe('isSafeExternalHttpUrl', () => {
  it('aceita https público', () => {
    expect(isSafeExternalHttpUrl('https://cdn.example.com/crest.png')).toBe(true)
  })

  it('bloqueia loopback e redes privadas', () => {
    expect(isSafeExternalHttpUrl('http://127.0.0.1/x')).toBe(false)
    expect(isSafeExternalHttpUrl('http://localhost/x')).toBe(false)
    expect(isSafeExternalHttpUrl('http://192.168.0.1/x')).toBe(false)
    expect(isSafeExternalHttpUrl('http://10.0.0.5/x')).toBe(false)
    expect(isSafeExternalHttpUrl('http://172.16.1.1/x')).toBe(false)
    expect(isSafeExternalHttpUrl('http://0.0.0.0/x')).toBe(false)
    expect(isSafeExternalHttpUrl('http://100.64.1.1/x')).toBe(false)
  })

  it('bloqueia protocolo inválido', () => {
    expect(isSafeExternalHttpUrl('ftp://example.com/a')).toBe(false)
    expect(isSafeExternalHttpUrl('not-a-url')).toBe(false)
  })
})

describe('password digest', () => {
  it('verifica senha correta com timingSafeEqual', () => {
    const digest = createPasswordDigest('Segredo!123')
    expect(verifyPassword({ password: 'Segredo!123', digest })).toBe(true)
    expect(verifyPassword({ password: 'outra', digest })).toBe(false)
  })
})

describe('evaluateFreeDailySearchQuota', () => {
  const today = '2026-07-12'

  it('libera admin/premium sem contar', () => {
    expect(evaluateFreeDailySearchQuota({ type: 'admin', isActive: true, todayIso: today })).toEqual({ ok: true })
    expect(evaluateFreeDailySearchQuota({ type: 'premium', isActive: true, todayIso: today })).toEqual({ ok: true })
  })

  it('bloqueia free no limite', () => {
    const r = evaluateFreeDailySearchQuota({
      type: 'free',
      isActive: true,
      dailySearches: 50,
      lastSearchDate: today,
      todayIso: today,
      limit: 50,
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(429)
  })

  it('incrementa free abaixo do limite e reseta em novo dia', () => {
    expect(
      evaluateFreeDailySearchQuota({
        type: 'free',
        isActive: true,
        dailySearches: 3,
        lastSearchDate: today,
        todayIso: today,
        limit: 50,
      })
    ).toEqual({ ok: true, nextCount: 4, todayIso: today })

    expect(
      evaluateFreeDailySearchQuota({
        type: 'free',
        isActive: true,
        dailySearches: 49,
        lastSearchDate: '2026-07-11',
        todayIso: today,
        limit: 50,
      })
    ).toEqual({ ok: true, nextCount: 1, todayIso: today })
  })
})

describe('createRateLimiter', () => {
  it('retorna 429 após exceder max', () => {
    let t = 1_000_000
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, prefix: 'test', now: () => t })
    const headers = {}
    const res = {
      setHeader: (k, v) => {
        headers[k] = v
      },
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const req = { headers: {}, socket: { remoteAddress: '1.2.3.4' } }
    const next = vi.fn()

    limiter(req, res, next)
    limiter(req, res, next)
    expect(next).toHaveBeenCalledTimes(2)

    limiter(req, res, next)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(next).toHaveBeenCalledTimes(2)
  })
})
