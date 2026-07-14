import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { createAuthMiddleware, publicUserFromRow } from '../auth-middleware.mjs'

describe('auth-middleware', () => {
  it('publicUserFromRow mapeia campos', () => {
    const user = publicUserFromRow({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      type: 'free',
      is_active: true,
    })
    expect(user.email).toBe('a@b.com')
    expect(user.isActive).toBe(true)
  })

  it('requireAuth retorna 401 sem token', async () => {
    const { requireAuth } = createAuthMiddleware({
      query: vi.fn(),
      jwt,
      JWT_SECRET: 'test-secret-at-least-16',
      validateUserId: (id) => (typeof id === 'string' && id ? id : null),
      evaluateFreeDailySearchQuota: () => ({ ok: true }),
      getSearchIntegrationKeyColumn: async () => null,
    })

    const res = {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        this.body = payload
        return this
      },
    }
    const next = vi.fn()
    await requireAuth({ headers: {}, path: '/x', method: 'GET' }, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('deactivateExpiredPremiumByUserId seta type=free', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { deactivateExpiredPremiumByUserId } = createAuthMiddleware({
      query,
      jwt,
      JWT_SECRET: 'test-secret-at-least-16',
      validateUserId: (id) => id,
      evaluateFreeDailySearchQuota: () => ({ ok: true }),
      getSearchIntegrationKeyColumn: async () => null,
    })
    await deactivateExpiredPremiumByUserId('user-1')
    expect(query).toHaveBeenCalled()
    const sql = String(query.mock.calls[0][0])
    expect(sql).toMatch(/set type = 'free'/i)
    expect(sql).not.toMatch(/is_active\s*=\s*false/i)
  })
})
