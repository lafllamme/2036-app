import { describe, expect, it } from 'vitest'
import {
  acrossLane,
  CYCLE_MIN_WIDTH,
  CYCLE_SPREAD,
  CYCLE_WIDTH,
  cycleLane,
  DRIVING_SPREAD,
  drivingLane,
  PAVEMENT_SPREAD,
  PAVEMENT_WIDTH,
  pavementLane,
} from '../../app/rendering/world/lanes'

/**
 * Nobody walks in the road.
 *
 * Every lane used to be a fixed distance from the centre line, which is the same place as the
 * pavement on a residential street and the middle of the carriageway on a main road. The crowd was
 * walking down the middle of every main road in the city. These check the one thing that stops it,
 * across every width the extract actually contains.
 */
const WIDTHS = [5, 6, 7, 8, 8.5, 11, 14, 17, 20, 22]

describe('where a street puts you', () => {
  it('keeps people beyond the kerb on every road in the city', () => {
    for (const width of WIDTHS) {
      const kerb = width / 2
      // The middle of the pavement, so half a pavement clear of the traffic at the narrowest.
      expect(pavementLane(width), `${width} m`).toBeGreaterThan(kerb)
      expect(pavementLane(width) - kerb).toBeCloseTo(PAVEMENT_WIDTH / 2, 6)
    }
  })

  it('keeps cars inside the carriageway, and out of the cycle lane where there is one', () => {
    for (const width of WIDTHS) {
      expect(drivingLane(width), `${width} m`).toBeLessThan(width / 2)
      if (width >= CYCLE_MIN_WIDTH)
        expect(drivingLane(width) + 0.9, `${width} m`).toBeLessThan(width / 2 - CYCLE_WIDTH)
    }
  })

  it('puts a bike in its own lane where there is one and at the edge of the traffic where there is not', () => {
    for (const width of WIDTHS) {
      const lane = cycleLane(width)
      // Always on the carriageway — a bike does not belong on the pavement — and never over the kerb.
      expect(lane, `${width} m`).toBeLessThan(width / 2)
      expect(lane, `${width} m`).toBeGreaterThan(0)
      if (width >= CYCLE_MIN_WIDTH)
        expect(Math.abs(lane - (width / 2 - CYCLE_WIDTH / 2)), `${width} m`).toBeLessThan(0.001)
    }
  })

  it('never puts two of them in the same place', () => {
    /*
     * The order across a street is fixed: traffic, then bikes, then the kerb, then people. A width
     * where two of those swap is a width where a car drives through a cyclist.
     */
    for (const width of WIDTHS) {
      expect(drivingLane(width), `${width} m`).toBeLessThan(cycleLane(width))
      expect(cycleLane(width), `${width} m`).toBeLessThan(pavementLane(width))
    }
  })

  it('holds the spread inside the lane it belongs to, at both ends', () => {
    /*
     * Multiplying the whole offset by a factor was the obvious way to spread a crowd out and is
     * wrong: on an eleven-metre street the low end of it put a pedestrian at 5.45 m and the kerb is
     * at 5.5. A pavement that is a single file is a cosmetic problem; a pavement inside the
     * carriageway is not.
     */
    for (const width of WIDTHS) {
      for (const share of [0, 0.5, 1]) {
        expect(acrossLane(pavementLane(width), PAVEMENT_SPREAD, share), `${width} m at ${share}`)
          .toBeGreaterThan(width / 2)
        expect(acrossLane(cycleLane(width), CYCLE_SPREAD, share), `${width} m at ${share}`)
          .toBeLessThan(width / 2)
        expect(acrossLane(drivingLane(width), DRIVING_SPREAD, share), `${width} m at ${share}`)
          .toBeGreaterThan(0.5)
      }
    }
  })
})

describe('the pavement that is painted, and the pavement that is walked on', () => {
  /*
   * These were two decisions for most of the project's life and they disagreed. `roads.ts` painted a
   * ribbon two and a bit metres wider than the carriageway on both sides; the crowd walked at
   * `pavementLane`. On a normal street those land in the same place, which is why nobody noticed —
   * until a main road, where the painted surface stopped short of where people were walking and the
   * crowd looked like it was in the road because half of it was.
   *
   * The strip is now derived from `pavementLane`, so this is the shape of that one decision.
   */
  const PAVEMENT_WIDTH_HALF = PAVEMENT_WIDTH / 2

  for (const width of [4.5, 5, 6.5, 8, 11, 13, 17, 22, 30]) {
    it(`covers every walker on a ${width} m street`, () => {
      const middle = pavementLane(width)
      const inner = middle - PAVEMENT_WIDTH_HALF
      const outer = middle + PAVEMENT_WIDTH_HALF

      // The kerb is where the strip starts. Not a centimetre of it is on the carriageway.
      expect(inner).toBeCloseTo(width / 2, 10)
      // And nobody, at either end of their jitter, is off the far side of it.
      expect(acrossLane(middle, PAVEMENT_SPREAD, 0)).toBeGreaterThan(inner)
      expect(acrossLane(middle, PAVEMENT_SPREAD, 1)).toBeLessThan(outer)
    })
  }
})
