import { expect, test } from '@playwright/test'

test.describe('smoke SPA', () => {
  test('landing exibe marca e abre modal de auth', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('landing-hero-title')).toContainText('MediaHub')
    await page.getByTestId('landing-cta-register').click()
    await expect(page.getByTestId('auth-modal')).toBeVisible()
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
  })

  test('rota inexistente mostra 404', async ({ page }) => {
    await page.goto('/rota-que-nao-existe')
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByRole('link', { name: /home/i })).toBeVisible()
  })

  test('página de reset renderiza formulário', async ({ page }) => {
    await page.goto('/reset')
    await expect(page.getByRole('heading', { name: /redefinir senha/i })).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('link', { name: /voltar ao login/i })).toBeVisible()
  })
})
