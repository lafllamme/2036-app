import { expect, test } from '@playwright/test'

/** The campaign clock: that it runs on its own, follows the speed, and stops when asked to. */
test.describe('campaign clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('2036-sound-enabled', 'false'))
    await page.goto('/?webgl')
    await expect(page.getByRole('button', { name: 'Neue Kampagne' })).toBeEnabled({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Neue Kampagne' }).click()
    await page.getByRole('button', { name: 'SPD: Sozialer Progress Deutschland auswählen' }).click()
    await page.getByRole('button', { name: 'Diese Partei wählen' }).click()
    const priorities = page.locator('.priority-grid button')
    await priorities.nth(0).click()
    await priorities.nth(2).click()
    await priorities.nth(4).click()
    await page.getByRole('button', { name: 'Mandat bestätigen' }).click()
    await page.getByRole('button', { name: 'Lindenhafen übernehmen' }).click()
    await expect(page.getByLabel('Stadtkennzahlen')).toBeVisible()
  })

  test('runs by itself and does not wait for the player to pick a speed', async ({ page }) => {
    const clock = page.locator('.date-block__clock')
    await expect(clock).toHaveText(/^\d{2}:\d{2}$/)
    const first = await clock.textContent()

    await expect.poll(async () => clock.textContent(), { timeout: 15_000 }).not.toBe(first)
  })

  test('stops dead on pause and resumes on a speed', async ({ page }) => {
    const clock = page.locator('.date-block__clock')
    await page.getByRole('button', { name: 'Ⅱ' }).click()
    // Let any tick already in flight land before taking the reference reading.
    await page.waitForTimeout(600)

    const paused = await clock.textContent()
    await page.waitForTimeout(2_500)
    expect(await clock.textContent()).toBe(paused)

    await page.getByRole('button', { name: '4×' }).click()
    await expect.poll(async () => clock.textContent(), { timeout: 15_000 }).not.toBe(paused)
  })

  test('reads the sky next to the clock and the sun times in the Lagebericht', async ({ page }) => {
    await page.getByRole('button', { name: 'Ⅱ' }).click()
    await expect(page.locator('.date-block__temp')).toHaveText(/-?\d+°C/)
    await expect(page.locator('.date-block__sky')).toBeVisible()

    await page.getByLabel('Stadtkennzahlen').getByRole('button', { name: 'Lagebericht' }).click()
    const rail = page.getByLabel('Stadtkennzahlen')
    await expect(rail).toContainText('Sonnenaufgang')
    await expect(rail).toContainText('Sonnenuntergang')
    await expect(rail).toContainText('Tageslänge')
  })
})
