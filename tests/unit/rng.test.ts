import { describe, expect, it } from 'vitest'
import { createRandomStream } from '../../app/core/rng'

describe('named random streams', () => {
  it('repeats the same sequence for the same seed and namespace', () => {
    const first = createRandomStream(2036, 'buildings')
    const second = createRandomStream(2036, 'buildings')
    expect(Array.from({ length: 12 }, () => first.next())).toEqual(Array.from({ length: 12 }, () => second.next()))
  })

  it('isolates systems by namespace', () => {
    const buildings = createRandomStream(2036, 'buildings')
    const vegetation = createRandomStream(2036, 'vegetation')
    expect(buildings.next()).not.toBe(vegetation.next())
  })
})
