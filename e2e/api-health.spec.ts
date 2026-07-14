import { expect, test } from '@playwright/test'

/**
 * Smoke da API — só roda quando E2E_API_BASE_URL está definido
 * (ex.: http://127.0.0.1:3001 com `npm run dev:api`).
 */
const apiBase = (process.env.E2E_API_BASE_URL || '').replace(/\/$/, '')

test.describe('smoke API', () => {
  test.skip(!apiBase, 'Defina E2E_API_BASE_URL para exercitar /api/health')

  test('GET /api/health responde JSON', async ({ request }) => {
    const res = await request.get(`${apiBase}/api/health`)
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    expect(body).toBeTruthy()
  })

  test('GET /api/search/query sem auth retorna 401', async ({ request }) => {
    const res = await request.get(`${apiBase}/api/search/query?query=test`)
    expect(res.status()).toBe(401)
  })
})
