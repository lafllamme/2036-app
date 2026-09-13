import { describe, expect, it } from 'vitest'
import { balanceFor } from '../../app/audio/mixer'

/**
 * Who is allowed to be heard, and when.
 *
 * There are three instruments in this game and they used to play at the player's volume setting
 * regardless of each other — which is not a mix, it is three things shouting, and it is loudest
 * exactly where the game is most interesting: down in the street at rush hour with a siren going
 * past. These pin the decisions that stop that, without needing an ear or a browser.
 */
const STREET = { cameraDistance: 120, nearestSiren: Number.POSITIVE_INFINITY }
const MAP = { cameraDistance: 2_400, nearestSiren: Number.POSITIVE_INFINITY }

describe('the mix', () => {
  it('never touches the interface', () => {
    // A cue is the sound of something the player just did. One they cannot hear is worse than none.
    for (const where of [STREET, MAP, { cameraDistance: 90, nearestSiren: 10 }])
      expect(balanceFor(where).cues).toBe(1)
  })

  it('lets the city win in the street and the score win on the map', () => {
    expect(balanceFor(STREET).score).toBeLessThan(balanceFor(MAP).score)
    // And the city itself is never pulled down for anything: it does its own distance work.
    expect(balanceFor(STREET).ambience).toBe(balanceFor(MAP).ambience)
  })

  it('gets out of the way of a siren', () => {
    const quiet = balanceFor({ cameraDistance: 120, nearestSiren: Number.POSITIVE_INFINITY })
    const passing = balanceFor({ cameraDistance: 120, nearestSiren: 20 })
    expect(passing.score).toBeLessThan(quiet.score * 0.5)
  })

  it('ignores a siren too far away to be heard anyway', () => {
    const far = balanceFor({ cameraDistance: 120, nearestSiren: 400 })
    expect(far.score).toBeCloseTo(balanceFor(STREET).score, 5)
  })

  it('never silences anything, so nothing is heard switching off', () => {
    const worst = balanceFor({ cameraDistance: 60, nearestSiren: 0 })
    expect(worst.score).toBeGreaterThan(0.05)
    expect(worst.ambience).toBeGreaterThan(0.5)
  })

  it('crossfades rather than switching, so zooming is not an audible event', () => {
    /*
     * Walk the camera out from the street to the map and check no single step changes the balance
     * by more than a little. A mix with a threshold in it is one the player hears every time.
     */
    let previous = balanceFor({ cameraDistance: 0, nearestSiren: Number.POSITIVE_INFINITY }).score
    for (let distance = 50; distance <= 2_000; distance += 50) {
      const score = balanceFor({ cameraDistance: distance, nearestSiren: Number.POSITIVE_INFINITY }).score
      expect(Math.abs(score - previous), `at ${distance} m`).toBeLessThan(0.03)
      previous = score
    }
  })

  it('keeps the total inside a budget wherever the listener stands', () => {
    // The three together must never add up to more than the city can carry without turning to mud.
    for (let distance = 40; distance <= 2_400; distance += 40) {
      for (const siren of [Number.POSITIVE_INFINITY, 150, 10]) {
        const balance = balanceFor({ cameraDistance: distance, nearestSiren: siren })
        expect(balance.ambience + balance.score, `${distance} m, siren ${siren}`).toBeLessThan(1.6)
      }
    }
  })
})
