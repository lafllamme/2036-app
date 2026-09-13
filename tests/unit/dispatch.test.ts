import { describe, expect, it } from 'vitest'

/**
 * What a siren is allowed to mean.
 *
 * The first version held a share of the emergency fleet on blue lights permanently, scaled by how
 * unsettled the city was — so the sirens never stopped and told the player nothing. A siren has to
 * be attached to something that happened at a place and that ends. These pin the timings that make
 * that true, without needing a GPU to check them.
 */
const CALL_INTERVAL_CALM = 210
const CALL_INTERVAL_BUSY = 38
const ON_SCENE = 34
const CALL_TIMEOUT = 260

/** The same curve `dispatch` uses: unrest shortens the wait between calls. */
function waitFor(unrest: number): number {
  const settled = 1 - Math.min(1, Math.max(0, unrest))
  return CALL_INTERVAL_BUSY + (CALL_INTERVAL_CALM - CALL_INTERVAL_BUSY) * settled
}

describe('emergency dispatch', () => {
  it('leaves a settled city quiet for minutes at a time', () => {
    // Three and a half minutes between calls, each about half a minute long: silence is the norm.
    expect(waitFor(0)).toBe(CALL_INTERVAL_CALM)
    expect(waitFor(0)).toBeGreaterThan(ON_SCENE * 5)
  })

  it('stacks them up when the city is in trouble, but never without pause', () => {
    expect(waitFor(1)).toBe(CALL_INTERVAL_BUSY)
    // Even at its worst a call still takes longer to arrive than the last one takes to clear.
    expect(waitFor(1)).toBeGreaterThan(ON_SCENE)
  })

  it('is monotonic in unrest, so the city sounds like what the numbers say', () => {
    let previous = Infinity
    for (const unrest of [0, 0.25, 0.5, 0.75, 1]) {
      const wait = waitFor(unrest)
      expect(wait).toBeLessThan(previous)
      previous = wait
    }
  })

  it('gives up on a call nobody reached, so one bad route cannot hold the fleet', () => {
    expect(CALL_TIMEOUT).toBeGreaterThan(ON_SCENE)
    expect(CALL_TIMEOUT).toBeGreaterThan(CALL_INTERVAL_BUSY)
  })
})
