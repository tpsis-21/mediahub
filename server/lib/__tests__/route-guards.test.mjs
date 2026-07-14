import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const serverSrc = read('server.mjs')
const authMiddlewareSrc = read('lib', 'auth-middleware.mjs')
const searchRoutes = read('routes', 'search-routes.mjs')
const footballRoutes = read('routes', 'football-routes.mjs')
const authRoutes = read('routes', 'auth-routes.mjs')

describe('P0 route guards', () => {
  it('registra módulos de rotas no boot', () => {
    expect(serverSrc).toMatch(/registerSearchRoutes\(app/)
    expect(serverSrc).toMatch(/registerAuthRoutes\(app/)
    expect(serverSrc).toMatch(/registerFootballRoutes\(app/)
    expect(serverSrc).toMatch(/registerHealthRoutes\(app/)
    expect(serverSrc).toMatch(/registerHistoryRoutes\(app/)
    expect(serverSrc).toMatch(/registerTicketRoutes\(app/)
    expect(serverSrc).toMatch(/registerMeRoutes\(app/)
    expect(serverSrc).toMatch(/registerTelegramRoutes\(app/)
    expect(serverSrc).toMatch(/registerAdminRoutes\(app/)
    expect(serverSrc).toMatch(/registerVideoRoutes\(app/)
    expect(serverSrc).toMatch(/createSearchProviderService\(/)
    expect(serverSrc).toMatch(/createFootballScheduleService\(/)
    expect(serverSrc).toMatch(/createAuthMiddleware\(/)
    expect(serverSrc).toMatch(/createAppSettingsService\(/)
    expect(serverSrc).toMatch(/createFootballCrestProxy\(/)
    expect(serverSrc).toMatch(/createIsAllowedOrigin\(/)
    expect(serverSrc).toMatch(/createTelegramConfigService\(/)
    expect(serverSrc).toMatch(/bootstrapCanvasRuntime\(/)
    expect(serverSrc).toMatch(/createDebugSession\(/)
    expect(serverSrc).toMatch(/registerDebugRoutes\(app/)
  })

  it('exige auth em search query/videos/image', () => {
    expect(searchRoutes).toMatch(/app\.get\('\/api\/search\/query',\s*requireAuth/)
    expect(searchRoutes).toMatch(/app\.get\('\/api\/search\/videos',\s*requireAuth/)
    expect(searchRoutes).toMatch(/app\.get\('\/api\/search\/image',\s*requireAuth/)
  })

  it('exige auth + premium em crest, refresh e schedule', () => {
    expect(footballRoutes).toMatch(/app\.get\('\/api\/football\/crest',\s*requireAuth,\s*requirePremiumOrAdmin/)
    expect(footballRoutes).toMatch(/app\.post\('\/api\/football\/crest',\s*requireAuth,\s*requirePremiumOrAdmin/)
    expect(footballRoutes).toMatch(/app\.get\('\/api\/football\/schedule\/refresh',\s*requireAuth,\s*requirePremiumOrAdmin/)
    expect(footballRoutes).toMatch(/app\.get\(\['\/api\/football\/schedule'/)
    expect(footballRoutes).toMatch(/requireAuth,\s*requirePremiumOrAdmin/)
  })

  it('auth login/register usam rateLimitAuth', () => {
    expect(authRoutes).toMatch(/app\.post\('\/api\/auth\/register',\s*rateLimitAuth/)
    expect(authRoutes).toMatch(/app\.post\('\/api\/auth\/login',\s*rateLimitAuth/)
  })

  it('downgrade de premium expirado usa type=free', () => {
    expect(authMiddlewareSrc).toMatch(/set type = 'free'/)
    expect(authMiddlewareSrc).not.toMatch(/is_active\s*=\s*false/)
  })
})
