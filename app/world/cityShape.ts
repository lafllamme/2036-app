/**
 * Where Lindenhafen ends.
 *
 * One wandering line, read by the generator that lays out the city and by the renderer that
 * scatters suburbs beyond it. They have to agree: when the built-up area was a square and the
 * suburbs a ring around it, the join was the most visible thing on the map.
 *
 * Pure and seeded — three harmonics with seeded phases, which is enough to read as a coastline
 * rather than as a circle and cheap enough to call for every parcel in the city.
 */

/** The city's mean radius. The edge wanders roughly a fifth of this either side of it. */
const MEAN_RADIUS = 1_430

/** Turns a seed into three phases, deterministically and without touching a random stream. */
function phaseOf(seed: number, index: number): number {
  const h = Math.sin(seed * 12.9898 + index * 78.233) * 43_758.5453
  return (h - Math.floor(h)) * Math.PI * 2
}

/**
 * How far the built-up area reaches in a given direction.
 *
 * @param angle Radians, measured the same way `Math.atan2(z, x)` reports them.
 */
export function cityEdgeRadius(angle: number, seed: number): number {
  return MEAN_RADIUS * (
    1
    + 0.17 * Math.sin(angle * 3 + phaseOf(seed, 0))
    + 0.10 * Math.sin(angle * 5 + phaseOf(seed, 1))
    + 0.06 * Math.sin(angle * 8 + phaseOf(seed, 2))
  )
}

/**
 * How far through the city a point is: 0 at the centre, 1 at the edge, above 1 outside it.
 *
 * Density, parcel size and building height all read this rather than a raw distance, so the city
 * thins out toward its own edge wherever that edge happens to be rather than toward a fixed circle.
 */
export function cityDepth(x: number, z: number, seed: number): number {
  const distance = Math.hypot(x, z)
  return distance / Math.max(1, cityEdgeRadius(Math.atan2(z, x), seed))
}
