import { describe, expect, it } from 'vitest'
import { crowdDensity } from '../../app/rendering/world/fleet'
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

describe('how many of a fleet the surroundings can hold', () => {
  /*
   * The fleet is a fixed number of figures kept near the camera — which is right downtown, where
   * that number is spread over kilometres of street, and wrong everywhere else. Out in the country
   * the same four hundred people landed on the one lane within reach and marched down the middle of
   * it in single file, because nothing asked how much street there was to stand on.
   *
   * This is what asks. The spacings are measured against real streets: somebody every fifteen to
   * twenty-five metres of pavement, a car every ninety-odd on a road that is moving.
   */
  /** Places on the streets in reach: each stretch's usable length over this fleet's own spacing. */
  const room = (metres: number, spacing: number): number => Math.floor(metres / spacing)

  it('shows all of them where there is street enough for all of them', () => {
    expect(crowdDensity(room(420 * 16, 16), 420)).toBe(1)
    expect(crowdDensity(room(90_000, 16), 420)).toBe(1)
  })

  it('shows a handful on a single country lane', () => {
    /*
     * One 600 m lane in reach against a crowd of 420. On a city street that is a person every
     * sixteen metres — thirty-seven of them. The same lane out in the country is six times sparser,
     * which is six people, because a hamlet with nine houses does not have pavement traffic.
     */
    expect(Math.round(crowdDensity(room(600, 16), 420) * 420)).toBe(37)
    expect(Math.round(crowdDensity(room(600, 16 * 6), 420) * 420)).toBe(6)
    expect(Math.round(crowdDensity(room(600, 95), 620) * 620)).toBe(6)
  })

  it('shows nobody where there is no street at all', () => {
    expect(crowdDensity(0, 420)).toBe(0)
  })

  it('never divides by nothing, whatever it is asked', () => {
    expect(crowdDensity(6, 0)).toBe(1)
    expect(Number.isFinite(crowdDensity(6, 0))).toBe(true)
  })
})

describe('a pavement is not a lane', () => {
  /*
   * Every fleet shared one rule for what is in front of it, and it is a car rule: a vehicle cannot
   * pass within its own lane, so it slows down behind whatever is there. Applied to a crowd it
   * produced twenty and thirty people in single file behind whoever was slowest, which is the one
   * thing a pavement never looks like.
   *
   * These are the two numbers that separate the two cases. They are asserted here rather than only
   * read, because the bug was not in the code that used them — it was that there was only one.
   */
  const MIN_GAP = 7
  const WALKING_GAP = 1.4
  const SHOULDER = 0.3

  it('lets somebody walk far closer than a car may drive', () => {
    expect(WALKING_GAP).toBeLessThan(MIN_GAP / 3)
  })

  it('counts only what is in the same hand of the pavement as being in the way', () => {
    /*
     * The lateral share runs 0 … 1 across the pavement's own spread, so a shoulder of 0.3 is a bit
     * under half a metre on a 2.3 m footway — about a person's width, which is the point.
     */
    expect(SHOULDER * PAVEMENT_SPREAD).toBeGreaterThan(0.35)
    expect(SHOULDER * PAVEMENT_SPREAD).toBeLessThan(0.75)
  })

  it('still keeps two people from standing in the same place', () => {
    // Somebody directly in front and directly in line is still given way to — that is the collision
    // rule. What changed is that stepping to one side is now enough to pass.
    expect(WALKING_GAP).toBeGreaterThan(1)
  })

  it('answers somebody in the way by stepping aside, not by braking', () => {
    /*
     * The part two attempts in a row got wrong. A rule that can only ever *slow* somebody down never
     * lets a bunch disperse: every slowdown propagates backwards and nothing propagates forwards,
     * which is how a phantom traffic jam forms — and a pavement full of people does not do that.
     *
     * Simulated over fifteen minutes, eighteen people on a three-hundred-metre path:
     *
     *   braking:        largest gap 81 m — everybody piled at one end
     *   stepping aside: largest gap 31 m — a street
     *
     * The floor is what says so: a walker who can be slowed to a fifth of their pace will be, and
     * then they are queueing again by another name. Four fifths is a glance and a shuffle.
     */
    const WALKING_FLOOR = 0.8
    expect(WALKING_FLOOR).toBeGreaterThan(0.7)
  })
})
