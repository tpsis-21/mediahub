import { expect, test } from '@playwright/test'
import { loginFromLanding, searchAndWaitResults } from './helpers/auth'

const email = String(process.env.E2E_EMAIL || '').trim()
const password = String(process.env.E2E_PASSWORD || '').trim()
const hasCreds = Boolean(email && password)

/**
 * Fluxo autenticado — skip no CI sem E2E_EMAIL/E2E_PASSWORD.
 * Precisa de SPA (preview/dev) + API no proxy (ex.: `npm run dev:api` em :8081).
 */
test.describe('auth app', () => {
  test.skip(!hasCreds, 'Defina E2E_EMAIL e E2E_PASSWORD para login E2E')

  test('login abre /app, busca e mostra resultados', async ({ page }) => {
    await loginFromLanding(page, email, password)
    await searchAndWaitResults(page, 'Matrix')
    await expect(page.getByTestId('movie-card').first()).toBeVisible()
  })
})
