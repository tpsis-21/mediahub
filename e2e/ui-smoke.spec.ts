import { expect, test } from '@playwright/test'
import { loginFromLanding, searchAndWaitResults } from './helpers/auth'

const email = String(process.env.E2E_EMAIL || '').trim()
const password = String(process.env.E2E_PASSWORD || '').trim()
const hasCreds = Boolean(email && password)

/**
 * Smoke UI autenticado — abre painéis de banner/vídeo/Telegram/futebol/Top 10.
 * Não gera download nem envia Telegram (só valida que a UI abre).
 * Skip no CI sem E2E_EMAIL/E2E_PASSWORD. Precisa API no proxy (ex. :8081).
 */
test.describe('ui smoke (premium panels)', () => {
  test.skip(!hasCreds, 'Defina E2E_EMAIL e E2E_PASSWORD para smoke UI')

  test('ações: banner, vídeo e Telegram abrem', async ({ page }) => {
    await loginFromLanding(page, email, password)
    await searchAndWaitResults(page, 'Matrix')

    await page.getByTestId('movie-card-actions').first().click()
    const actions = page.getByTestId('movie-actions-modal')
    await expect(actions).toBeVisible({ timeout: 15_000 })

    await actions.getByTestId('movie-actions-banner').click()
    await expect(page.getByTestId('professional-banner-modal')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Gerar Banner -/i)).toBeVisible()

    await actions.getByTestId('movie-actions-video').click()
    await expect(page.getByTestId('movie-actions-video-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/^Trailer$/)).toBeVisible()

    await actions.getByTestId('movie-actions-telegram').click()
    await expect(page.getByTestId('movie-actions-telegram-panel')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Telegram — Capa/i)).toBeVisible()
  })

  test('sidebar abre Banner Futebol e Top 10', async ({ page }) => {
    await loginFromLanding(page, email, password)
    await expect(page.getByTestId('search-query-input')).toBeVisible({ timeout: 15_000 })

    // Sidebar pode estar colapsada; dispara eventos direto se o botão não for clicável.
    const footballBtn = page.getByTestId('sidebar-football-banner')
    if (await footballBtn.isVisible().catch(() => false)) {
      await footballBtn.click()
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event('mediahub:openFootballBannerModal')))
    }
    await expect(page.getByTestId('football-banner-modal')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /Banner Futebol/i })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('football-banner-modal')).toBeHidden({ timeout: 10_000 })

    const top10Btn = page.getByTestId('sidebar-top10-banner')
    if (await top10Btn.isVisible().catch(() => false)) {
      await top10Btn.click()
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event('mediahub:openTop10BannerModal')))
    }
    await expect(page.getByTestId('bulk-banner-modal')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Top 10/i).first()).toBeVisible()
  })
})
