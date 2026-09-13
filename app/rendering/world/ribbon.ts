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
