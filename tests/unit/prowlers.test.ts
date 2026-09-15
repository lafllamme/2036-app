import { describe, expect, it } from 'vitest'
import { darkness } from '../../app/rendering/world/life/prowlers'

/**
 * Somebody at a house at two in the morning.
 *
 * The burglary rate produced police callouts and nothing else — readable in a panel, invisible in
 * the city. The difficulty is that a burglar looks exactly like everybody else, so drawing more
 * pedestrians would have shown nothing at all. What is legible is the wrong place at the wrong time:
 * everybody else is on a pavement, and somebody against a house front off the footway at night is
 * not.
 *
 * The two signals multiply rather than add, and that is the design: a city with a burglary problem
 * looks exactly like any other at noon, which is correct. What the player sees is the same street at
 * two in the morning being a different street.
 */
describe('when the city is dark enough for this to mean anything', () => {
  it('shows nobody in daylight, however bad the city is', () => {
    for (const hour of [7, 9, 12, 15, 18, 21])
      expect(darkness(hour), `${hour}:00`).toBe(0)
  })

  it('is full in the small hours', () => {
    for (const hour of [0, 1, 2, 3])
      expect(darkness(hour), `${hour}:00`).toBe(1)
  })

  it('fades rather than switching, at both ends', () => {
    // A count that flips between two frames reads as a glitch; an hour of fade reads as nightfall.
    expect(darkness(23.5)).toBeGreaterThan(0)
    expect(darkness(23.5)).toBeLessThan(1)
    expect(darkness(4.5)).toBeGreaterThan(0)
    expect(darkness(4.5)).toBeLessThan(1)
  })

  it('never leaves the scale', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      expect(darkness(hour), `${hour}`).toBeGreaterThanOrEqual(0)
      expect(darkness(hour), `${hour}`).toBeLessThanOrEqual(1)
    }
  })
})
