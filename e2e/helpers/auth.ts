import { type Page, expect } from '@playwright/test'

export async function loginFromLanding(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByTestId('landing-cta-register').click()
  const modal = page.getByTestId('auth-modal')
  await expect(modal).toBeVisible()
  await page.getByRole('tab', { name: /entrar|login/i }).click().catch(() => {})
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await modal.getByRole('button', { name: /entrar|login/i }).click()
  await expect(page).toHaveURL(/\/app/, { timeout: 20_000 })
}

export async function searchAndWaitResults(page: Page, query: string) {
  const searchInput = page.getByTestId('search-query-input')
  await expect(searchInput).toBeVisible({ timeout: 15_000 })
  await searchInput.fill(query)
  await page.getByRole('button', { name: /^Buscar$|^Search$/i }).click()
  await expect(page.getByTestId('movie-card').first()).toBeVisible({ timeout: 25_000 })
}
