/**
 * The open country around Lindenhafen.
 *
 * This is only half of the ground. Inside the city the height comes from the relief the converter
 * worked out from where the water is — see `relief.ts`, which blends the two. What is here is what
 * lies beyond: hills that start where the city's own relief runs out and carry on to the horizon.
 *
 * Pure and seeded, so the terrain mesh and anything standing on it agree on the height without
 * having to pass a heightmap around.
 */

/** Inside this radius the ground is dead flat, because the city is built on it. */
export const CITY_FLAT_RADIUS = 1_450
/**
 * The distance over which the land works its way up from flat.
 *
 * It starts inside the extract on purpose. The city's own relief fades out at its edge, and if the
 * country's hills only began well beyond that, the two never overlapped and left a trough a
 * kilometre wide running right round the city.
 */
const TERRAIN_RAMP = 900

const HILL_SCALE = 2_600
const HILL_HEIGHT = 260
const DETAIL_SCALE = 840
const DETAIL_HEIGHT = 62

/** A cheap integer hash: the same lattice point always returns the same value for a given seed. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x2F5B_1D27) ^ Math.imul(y | 0, 0x27D4_EB2F) ^ Math.imul(seed | 0, 0x1656_67B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EB_CA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2_AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 0xFFFF_FFFF
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Value noise on a unit lattice, smoothed so the hills have no creases along the grid. */
function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smoothstep(0, 1, x - x0)
  const fy = smoothstep(0, 1, y - y0)
  const a = hash(x0, y0, seed)
  const b = hash(x0 + 1, y0, seed)
  const c = hash(x0, y0 + 1, seed)
  const d = hash(x0 + 1, y0 + 1, seed)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}

/** Two octaves is enough for hills read from two kilometres away through haze. */
function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.68 + noise(x * 2.3 + 11.7, y * 2.3 - 4.1, seed + 1) * 0.32
}

/**
 * How the ground colour varies from place to place, 0 … 1. Drawn from the same noise as the hills
 * so a rise and the drier grass on it agree, and used to keep the land from reading as one carpet.
 */
export function groundVariation(x: number, z: number, seed: number): number {
  return fbm(x / 1_450, z / 1_450, seed + 31)
}

/** Height of the open country at a point, in metres. Zero anywhere the city's own relief covers. */
export function terrainHeight(x: number, z: number, seed: number): number {
  const distance = Math.hypot(x, z)
  const ramp = smoothstep(CITY_FLAT_RADIUS, CITY_FLAT_RADIUS + TERRAIN_RAMP, distance)
  if (ramp <= 0)
    return 0

  const hills = (fbm(x / HILL_SCALE, z / HILL_SCALE, seed) - 0.42) * HILL_HEIGHT
  const detail = (fbm(x / DETAIL_SCALE, z / DETAIL_SCALE, seed + 7) - 0.5) * DETAIL_HEIGHT

  return Math.max(0, hills + detail) * ramp
}
