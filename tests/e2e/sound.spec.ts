import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

interface SoundTrace {
  event: string
  played: boolean
}

/**
 * The emitted cue sequence, read from the development hook. Asserting on this rather than on the
 * audio device proves the interface said the right thing at the right moment, which is the part
 * that can regress; whether a headless browser has a sound card is not our contract.
 */
async function trace(page: Page): Promise<SoundTrace[]> {
  return page.evaluate(() => {
    const hook = Reflect.get(window, '__sound') as { trace: () => SoundTrace[] } | undefined
    return hook ? [...hook.trace()] : []
  })
}

async function events(page: Page): Promise<string[]> {
  return (await trace(page)).map(entry => entry.event)
}

test.describe('interface sound', () => {
  test.beforeEach(async ({ page }) => {
    // Die Einarbeitung legt sich sonst über die Flächen, die dieser Test anfasst.
    await page.addInitScript(() => window.localStorage.setItem('2036-first-steps-done', 'true'))
    await page.goto('/?webgl')
    await expect(page.getByRole('button', { name: 'Neue Kampagne' })).toBeEnabled({ timeout: 30_000 })
  })

  test('sounds every step of the campaign setup and unlocks on the first gesture', async ({ page }) => {
    expect(await events(page)).not.toContain('ui.press')

    await page.getByRole('button', { name: 'Neue Kampagne' }).click()
    await expect(page.getByRole('heading', { name: 'Welche Richtung für Lindenhafen?' })).toBeVisible()
    expect(await events(page)).toContain('ui.press')
    expect(await events(page)).toContain('stage.forward')

    await page.getByRole('button', { name: 'AfD: Alternative für Demokratie auswählen' }).click()
    await expect(page.getByRole('heading', { name: 'AfD prüfen' })).toBeVisible()
    expect(await events(page)).toContain('stage.partySelected')

    await page.getByRole('button', { name: 'Diese Partei wählen' }).click()
    await page.getByRole('button', { name: /Bezahlbares Wohnen/ }).click()
    expect(await events(page)).toContain('entry.priorityAdded')

    await page.getByRole('button', { name: /Bezahlbares Wohnen/ }).click()
    expect(await events(page)).toContain('entry.priorityRemoved')

    await page.getByRole('button', { name: /Bezahlbares Wohnen/ }).click()
    await page.getByRole('button', { name: /Gute Arbeit/ }).click()
    await page.getByRole('button', { name: /Zusammenhalt/ }).click()
    // The third priority completes the stage rather than merely adding one more.
    expect(await events(page)).toContain('entry.prioritiesComplete')

    // A fourth is silently dropped by the store, so the refusal cue is its only feedback.
    await page.getByRole('button', { name: /Klimaresilienz/ }).click()
    expect(await events(page)).toContain('entry.priorityRejected')

    await page.getByRole('button', { name: 'Mandat bestätigen' }).click()
    await page.getByRole('button', { name: 'Lindenhafen übernehmen' }).click()
    // Das Lagebild fängt zu an, seit die Einarbeitung das Aufklappen beibringt.
    await page.getByRole('button', { name: 'Lagebild öffnen' }).click()
    await expect(page.getByLabel('Stadtkennzahlen')).toBeVisible()
    expect(await events(page)).toContain('stage.cityEntered')
  })

  test('keeps emitting but stops playing once the player mutes sound', async ({ page }) => {
    await page.getByRole('button', { name: 'Einstellungen' }).click()
    const dialog = page.getByRole('dialog', { name: 'Ton' })
    await expect(dialog).toBeVisible()

    const toggle = dialog.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await dialog.getByRole('button', { name: 'Einstellungen schließen' }).click()
    await page.getByRole('button', { name: 'Neue Kampagne' }).click()
    await expect(page.getByRole('heading', { name: 'Welche Richtung für Lindenhafen?' })).toBeVisible()

    const afterMute = (await trace(page)).filter(entry => entry.event === 'stage.forward')
    expect(afterMute.length).toBeGreaterThan(0)
    expect(afterMute.every(entry => entry.played)).toBe(false)
  })

  test('remembers the mute across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Einstellungen' }).click()
    await page.getByRole('dialog', { name: 'Ton' }).getByRole('switch').click()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Neue Kampagne' })).toBeEnabled({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Einstellungen' }).click()
    await expect(page.getByRole('dialog', { name: 'Ton' }).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })
})
