/**
 * Where the parts of a street are, across its width.
 *
 * One source for two questions that must never disagree: where a surface is *drawn*, and where
 * something *travels* on it. They were answered separately — `roads.ts` painted the pavement two and
 * a bit metres beyond the kerb, and the pedestrians walked at a fixed five metres from the centre
 * line whatever the road was. On a residential street those are the same place. On a main road the
 * kerb is eight and a half metres out, and five metres from the centre line is the middle of the
 * carriageway, which is where the crowd was walking.
 *
 * Pure arithmetic over one number. No THREE, no state, so the rule can be checked rather than
 * looked at.
 */

/** How wide a pavement is, and the painted cycle lane inside the carriageway. */
export const PAVEMENT_WIDTH = 2.3
export const CYCLE_WIDTH = 1.5
/**
 * The narrowest street that carries a painted cycle lane.
 *
 * Also the widest street that is parked on, and that is one decision rather than two: the lane and
 * the parked cars want the same metre and a half at the edge of the carriageway, and a city where
 * every bike lane is full of parked cars is not one anybody meant to build.
 */
export const CYCLE_MIN_WIDTH = 13

/** The middle of the pavement: beyond the kerb, which is at half the road's width. */
export function pavementLane(width: number): number {
  return width / 2 + PAVEMENT_WIDTH / 2
}

/**
 * Where a bike rides.
 *
 * In the painted lane where there is one, and otherwise at the edge of the traffic — which is both
 * what happens on a German street without one and what the law expects.
 */
export function cycleLane(width: number): number {
  return width >= CYCLE_MIN_WIDTH
    ? width / 2 - CYCLE_WIDTH / 2
    : Math.max(1.2, width / 2 - 0.9)
}

/**
 * Where a car sits: the middle of its own half of the carriageway.
 *
 * Pulled in where there is a cycle lane, so traffic does not drive down it, and never within a metre
 * of the kerb. The ceiling matters more than it looks: a floor of a metre and a half was there to
 * keep the two directions apart, and on a five-metre service road it put the car nearly a metre past
 * the kerb and onto the pavement. On a street that narrow the two directions genuinely do share the
 * space, which is what actually happens down a service road.
 */
export function drivingLane(width: number): number {
  const usable = width >= CYCLE_MIN_WIDTH ? width - CYCLE_WIDTH * 2 : width
  return Math.max(0.9, Math.min(usable * 0.25, width / 2 - 1))
}

/**
 * How wide each lane is, which is how far across it a traveller may sit.
 *
 * Needed because the jitter that keeps a pavement from being a single file has to stay *inside* the
 * lane. Multiplying the whole offset by a factor was the obvious way to do it and is wrong: on an
 * eleven-metre street the low end of that factor put a pedestrian at 5.45 m and the kerb is at 5.5,
 * so the crowd drifted into the carriageway wherever the road was a little wider than usual. A test
 * caught it; nobody would have caught it by looking.
 */
export const PAVEMENT_SPREAD = PAVEMENT_WIDTH * 0.7
export const CYCLE_SPREAD = CYCLE_WIDTH * 0.6
export const DRIVING_SPREAD = 1.2

/** Where across a lane somebody sits: `share` runs 0 to 1 and never leaves the lane. */
export function acrossLane(centre: number, spread: number, share: number): number {
  return centre + (share - 0.5) * spread
}
