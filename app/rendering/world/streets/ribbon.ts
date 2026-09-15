/**
 * Where a flat band laid along a path takes its cross-sections.
 *
 * Roads, footways, rails and country lanes are all the same shape: a centre line with a width, drawn
 * as a ribbon. What decides whether that ribbon lies on the ground or hangs over it is how often it
 * asks the ground how high it is — and the answer is *not* "wherever the path happens to have a
 * point". A surveyor puts a point where the street changes direction, which on a straight run can be
 * sixty metres. A ribbon that only reads the ground there draws a straight line over everything in
 * between, and on a slope that line floats: nine hundred and twenty-two buildings had their ground
 * floor cut off by a footway hanging up to three metres above the land it was supposed to lie on.
 *
 * So the sections are taken every few metres regardless of where the path's own points are. The
 * shape is unchanged — the offsets at the path's points are what they were, interpolated along each
 * segment — only the height is read often enough to follow the ground.
 *
 * Pure, and deliberately free of Three.js, because the invariant it exists for is worth testing.
 */

export interface RibbonSection {
  /** The centre of the cross-section. */
  x: number
  z: number
  /** Half the ribbon's width, perpendicular to the way it is running. One kerb is +, the other −. */
  ox: number
  oz: number
  /** How far along the path this section lies, for texture coordinates. */
  along: number
}

/** How far apart cross-sections are taken, in metres. */
export const RIBBON_STEP = 8
/**
 * How far the outside of a bend may be pushed out to keep the ribbon its own width round a corner.
 *
 * The correction is the reciprocal of the cosine of half the turn, which at a hairpin runs away — and
 * a residential street flaring to fifteen metres wide lands on the houses either side of it.
 */
export const MITRE_LIMIT = 1.8

export function ribbonSections(path: number[], half: number, step = RIBBON_STEP): RibbonSection[] {
  const count = path.length / 2
  if (count < 2)
    return []

  /*
   * The offset at each of the path's own points: the bisector of the two segments meeting there,
   * lengthened by how sharp the bend is. Without that correction the outer edge of a corner pinches
   * in and the ribbon narrows exactly where it should not.
   */
  const offset: number[] = []
  for (let i = 0; i < count; i += 1) {
    const x = path[i * 2]!
    const z = path[i * 2 + 1]!
    const previous = i > 0 ? i - 1 : 0
    const next = i < count - 1 ? i + 1 : count - 1
    const inX = x - path[previous * 2]!
    const inZ = z - path[previous * 2 + 1]!
    const outX = path[next * 2]! - x
    const outZ = path[next * 2 + 1]! - z
    const inLength = Math.hypot(inX, inZ) || 1
    const outLength = Math.hypot(outX, outZ) || 1
    const dx = inX / inLength + outX / outLength
    const dz = inZ / inLength + outZ / outLength
    const length = Math.hypot(dx, dz) || 1
    const mitre = Math.min(MITRE_LIMIT, 1 / Math.max(0.42, length / 2))
    // Perpendicular to the direction of travel, in the ground plane.
    offset.push((-dz / length) * half * mitre, (dx / length) * half * mitre)
  }

  const sections: RibbonSection[] = []
  let along = 0
  for (let i = 0; i < count - 1; i += 1) {
    const ax = path[i * 2]!
    const az = path[i * 2 + 1]!
    const bx = path[(i + 1) * 2]!
    const bz = path[(i + 1) * 2 + 1]!
    const span = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.ceil(span / step))

    for (let stride = i === 0 ? 0 : 1; stride <= steps; stride += 1) {
      const t = stride / steps
      sections.push({
        x: ax + (bx - ax) * t,
        z: az + (bz - az) * t,
        ox: offset[i * 2]! + (offset[(i + 1) * 2]! - offset[i * 2]!) * t,
        oz: offset[i * 2 + 1]! + (offset[(i + 1) * 2 + 1]! - offset[i * 2 + 1]!) * t,
        along: along + span * t,
      })
    }
    along += span
  }

  return sections
}

/**
 * How high a road's surface is at a point along it.
 *
 * On the ground it is the ground. On a bridge it is a deck: the straight line between the heights at
 * the two abutments, humped in the middle so the span clears what it crosses and coming back down to
 * meet the land at both ends. The map has forty-four of them and they were all drawn flat on the
 * terrain, which put the main road across the river *inside* the river, with the street lamps
 * standing in the water beside it.
 *
 * Pure, and the single source for the deck: the ribbon, the parapets, the piers and the traffic on
 * top all read this, so nothing can end up on a different bridge from anything else.
 */

/** The steepest a deck may climb, and the range its hump is allowed in. */
const DECK_GRADE = 0.11
const DECK_MIN_RISE = 2.2
const DECK_MAX_RISE = 7
/** The steepest the approach may be, as rise over half the span. */
const DECK_MAX_GRADE = 0.28
/** What a span has to leave under it, over the water it crosses. */
const DECK_CLEARANCE = 4.8
const WATER_SURFACE = 0.45

export interface Deck {
  /** The height of the surface at a distance along the path. */
  at: (along: number) => number
  /** How far the whole path runs. */
  length: number
  bridge: boolean
}

export function deckOf(path: number[], bridge: boolean, ground: (x: number, z: number) => number): Deck {
  const count = path.length / 2
  let length = 0
  for (let i = 1; i < count; i += 1)
    length += Math.hypot(path[i * 2]! - path[(i - 1) * 2]!, path[i * 2 + 1]! - path[(i - 1) * 2 + 1]!)

  if (!bridge || count < 2 || length < 1) {
    // An ordinary road simply lies on the land; its height is read where it is needed.
    return { at: () => 0, length, bridge: false }
  }

  const start = ground(path[0]!, path[1]!)
  const end = ground(path[(count - 1) * 2]!, path[(count - 1) * 2 + 1]!)
  const lowest = Math.min(start, end)
  const rise = Math.min(
    Math.max(
      Math.min(DECK_MAX_RISE, Math.max(DECK_MIN_RISE, length * DECK_GRADE)),
      // Whatever it takes to clear the water, if that is more than the span would otherwise need.
      WATER_SURFACE + DECK_CLEARANCE - lowest,
    ),
    /*
     * However much it wants to rise, never more than the span can climb. A quarter of the map's
     * bridges are three or four metres long — a kerb ramp over a cycle path — and a five-metre hump
     * on one of those is a ski jump.
     */
    length * DECK_MAX_GRADE,
  )

  return {
    length,
    bridge: true,
    at: (along) => {
      const t = Math.min(1, Math.max(0, along / length))
      const base = start + (end - start) * t
      /*
       * A hump rather than a ramp and a flat: raised to a power under one, the sine spends most of
       * the span near its top and turns down sharply at the abutments, which is the shape a road
       * bridge actually has.
       */
      return base + rise * Math.sin(Math.PI * t) ** 0.55
    },
  }
}
