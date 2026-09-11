import { expect, test } from '@playwright/test'

async function enterLindenhafen(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Neue Kampagne' }).click()
  await expect(page.getByRole('heading', { name: 'Welche Richtung für Lindenhafen?' })).toBeVisible()
  await page.getByRole('button', { name: 'AfD: Alternative für Demokratie auswählen' }).click()
  await expect(page.getByRole('heading', { name: 'AfD prüfen' })).toBeVisible()
  await page.getByRole('button', { name: 'Diese Partei wählen' }).click()
  await expect(page.getByRole('heading', { name: 'Drei Prioritäten festlegen' })).toBeVisible()
  await page.getByRole('button', { name: /Bezahlbares Wohnen/ }).click()
  await page.getByRole('button', { name: /Gute Arbeit/ }).click()
  await page.getByRole('button', { name: /Zusammenhalt/ }).click()
  await page.getByRole('button', { name: 'Mandat bestätigen' }).click()
  await expect(page.getByRole('heading', { name: 'Das Jahrzehnt beginnt.' })).toBeVisible()
  await page.getByRole('button', { name: 'Lindenhafen übernehmen' }).click()
  await expect(page.getByLabel('Stadtkennzahlen')).toBeVisible()
}

test.describe('2036 vertical slice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?webgl')
    await expect(page.getByRole('button', { name: 'Neue Kampagne' })).toBeEnabled({ timeout: 30_000 })
  })

  test('boots WebGL and completes the fictional-party campaign setup', async ({ page }) => {
    await expect(page).toHaveTitle('2036 — Lindenhafen')
    await expect(page.getByLabel('Interaktive 3D-Stadt Lindenhafen')).toBeVisible()
    await page.getByRole('button', { name: 'Neue Kampagne' }).click()
    await expect(page.getByRole('button', { name: 'AfD: Alternative für Demokratie auswählen' })).toBeVisible()
    await page.getByRole('button', { name: 'AfD: Alternative für Demokratie auswählen' }).click()
    await expect(page.getByRole('heading', { name: 'AfD prüfen' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Alternative für Demokratie', exact: true })).toBeVisible()
    await expect(page.getByText('Fiktive Partei · Quellenstand 2026-09-11')).toBeVisible()
    await page.getByRole('button', { name: 'Diese Partei wählen' }).click()
    await expect(page.getByRole('button', { name: 'Noch 3 auswählen' })).toBeDisabled()
    await page.getByRole('button', { name: /Bezahlbares Wohnen/ }).click()
    await page.getByRole('button', { name: /Gute Arbeit/ }).click()
    await page.getByRole('button', { name: /Zusammenhalt/ }).click()
    await expect(page.getByRole('button', { name: 'Mandat bestätigen' })).toBeEnabled()
    await page.getByRole('button', { name: 'Mandat bestätigen' }).click()
    await page.getByRole('button', { name: 'Lindenhafen übernehmen' }).click()
    await expect(page.getByLabel('Stadtkennzahlen')).toContainText('Einwohner')
    await expect(page.getByLabel('Politische Vorhaben')).toContainText('Wohnungsbau-Turbo')
    await expect(page.locator('.render-badge')).toContainText('WebGL')
    await expect(page.locator('.brand-block')).toContainText('AfD')
  })

  test('adopts a policy and advances the deterministic calendar', async ({ page }) => {
    await enterLindenhafen(page)
    const housingPolicy = page.locator('.policy-card').filter({ hasText: 'Wohnungsbau-Turbo' })

    await housingPolicy.getByRole('button', { name: 'Zur Abstimmung' }).click()
    await expect(housingPolicy.getByRole('button', { name: 'Beschlossen' })).toBeDisabled()
    await expect(page.getByLabel('Aktuelle Meldungen')).toContainText('Wohnungsbau-Turbo')

    await page.getByRole('button', { name: 'Nächster Monat' }).click()
    await expect(page.getByText('FEB 2026', { exact: true })).toBeVisible()
  })

  test('opens a causal news detail from the ticker', async ({ page }) => {
    await enterLindenhafen(page)
    await page.getByLabel('Aktuelle Meldungen').getByRole('button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('deterministischen Stadtmodell')
    await page.getByRole('button', { name: 'Meldung schließen' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
