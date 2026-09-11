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
    /*
     * These prove the game, not its sound. Every click otherwise synthesises a cue, which on a
     * CI runner already saturated by software rendering is enough to push the council flow past
     * its timeout. `tests/e2e/sound.spec.ts` owns the audible surface.
     */
    await page.addInitScript(() => window.localStorage.setItem('2036-sound-enabled', 'false'))
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
    await expect(page.getByLabel('Ratsvorlagen und Entscheidungen')).toContainText('Wohnungsbau-Turbo')
    await expect(page.locator('.render-badge')).toContainText('WebGL')
    await expect(page.locator('.brand-block')).toContainText('AfD')
  })

  test('puts a motion to the council, shows the odds, and records the result', async ({ page }) => {
    await enterLindenhafen(page)
    const housingMotion = page.locator('.policy-card').filter({ hasText: 'Wohnungsbau-Turbo' })
    await housingMotion.getByRole('button', { name: 'Zur Abstimmung' }).click()

    const sheet = page.getByRole('dialog', { name: 'Wohnungsbau-Turbo' })
    await expect(sheet).toBeVisible()
    // The forecast is computed from the party position vectors, not authored per party.
    await expect(sheet.getByText(/Mehrheit \d+ %/)).toBeVisible()
    await expect(sheet.locator('.party-chip')).toHaveCount(6)

    await sheet.getByRole('button', { name: 'Abstimmen lassen' }).click()

    const result = page.getByRole('dialog', { name: /Angenommen|Abgelehnt/ })
    await expect(result).toBeVisible()
    await expect(result).toContainText('Enthaltungen')
    await expect(result.locator('.vote-rows li')).toHaveCount(6)
    await result.getByRole('button', { name: 'Weiter' }).click()
    await expect(result).toBeHidden()

    await page.getByRole('button', { name: 'Nächster Monat' }).click()
    await expect(page.getByText('FEB 2026', { exact: true })).toBeVisible()
  })

  test('expands the city-state dashboard with the sensitive-indicator disclosure', async ({ page }) => {
    await enterLindenhafen(page)
    const rail = page.getByLabel('Stadtkennzahlen')
    await expect(rail).toContainText('Freie Wohnungen')
    await expect(rail).toContainText('Kriminalität')

    await rail.getByRole('button', { name: 'Lagebericht' }).click()
    await expect(rail).toContainText('Sanierungsstau')
    await expect(rail).toContainText('Zuwanderungsanteil')
    await expect(rail).toContainText('geht in keine Bewertung und in keinen Ereignisauslöser ein')
    await expect(rail).toContainText('Wahrnehmung')
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
