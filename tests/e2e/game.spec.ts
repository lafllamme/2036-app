import { expect, test } from '@playwright/test'

test.describe('2036 vertical slice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?webgl')
    await expect(page.getByText('Lindenhafen wird aufgebaut')).toBeHidden({ timeout: 30_000 })
  })

  test('boots the forced WebGL fallback with the playable HUD', async ({ page }) => {
    await expect(page).toHaveTitle('2036 — Lindenhafen')
    await expect(page.getByLabel('Interaktive 3D-Stadt Lindenhafen')).toBeVisible()
    await expect(page.getByLabel('Stadtkennzahlen')).toContainText('Einwohner')
    await expect(page.getByLabel('Politische Vorhaben')).toContainText('Wohnungsbau-Turbo')
    await expect(page.locator('.render-badge')).toContainText('WebGL')
  })

  test('adopts a policy and advances the deterministic calendar', async ({ page }) => {
    const housingPolicy = page.locator('.policy-card').filter({ hasText: 'Wohnungsbau-Turbo' })

    await housingPolicy.getByRole('button', { name: 'Zur Abstimmung' }).click()
    await expect(housingPolicy.getByRole('button', { name: 'Beschlossen' })).toBeDisabled()
    await expect(page.getByLabel('Aktuelle Meldungen')).toContainText('Wohnungsbau-Turbo')

    await page.getByRole('button', { name: 'Nächster Monat' }).click()
    await expect(page.getByText('FEB 2026', { exact: true })).toBeVisible()
  })

  test('opens a causal news detail from the ticker', async ({ page }) => {
    await page.getByLabel('Aktuelle Meldungen').getByRole('button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('deterministischen Stadtmodell')
    await page.getByRole('button', { name: 'Meldung schließen' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
