import { describe, expect, it, vi } from 'vitest'
import { createRequestIdMiddleware } from '../request-id.mjs'

const runMiddleware = (middleware, req, res) =>
  new Promise((resolve) => {
    middleware(req, res, () => resolve())
  })

describe('request-id middleware', () => {
  it('reusa X-Request-Id do cliente e echo no response', async () => {
    const middleware = createRequestIdMiddleware({ slowMs: 99999 })
    const req = { headers: { 'x-request-id': 'client-abc' }, method: 'GET', path: '/api/health', originalUrl: '/api/health' }
    const headers = {}
    const res = {
      setHeader: (k, v) => {
        headers[k] = v
      },
      statusCode: 200,
      on: () => {},
    }
    await runMiddleware(middleware, req, res)
    expect(req.requestId).toBe('client-abc')
    expect(headers['X-Request-Id']).toBe('client-abc')
  })

  it('gera UUID quando header ausente', async () => {
    const middleware = createRequestIdMiddleware({ slowMs: 99999 })
    const req = { headers: {}, method: 'GET', path: '/x', originalUrl: '/x' }
    const res = { setHeader: () => {}, statusCode: 200, on: () => {} }
    await runMiddleware(middleware, req, res)
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('loga 5xx no finish', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const middleware = createRequestIdMiddleware({ slowMs: 99999 })
    const req = { headers: { 'x-request-id': 'err-1' }, method: 'GET', path: '/api/x', originalUrl: '/api/x' }
    let finishHandler = null
    const res = {
      setHeader: () => {},
      statusCode: 500,
      on: (event, fn) => {
        if (event === 'finish') finishHandler = fn
      },
    }
    await runMiddleware(middleware, req, res)
    finishHandler?.()
    expect(warn).toHaveBeenCalled()
    const payload = warn.mock.calls[0][1]
    expect(payload.requestId).toBe('err-1')
    expect(payload.status).toBe(500)
    warn.mockRestore()
  })
})
