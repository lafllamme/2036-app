/**
 * The land Lindenhafen sits in.
 *
 * The city itself is flat and stays flat: every parcel, road and building the simulation places
 * assumes y = 0, and a hill under a housing block would be a rendering decision quietly overruling
 * a simulation one. The ground only starts to rise once it is past the built-up area, which is also
 * the point at which a flat plate stopped being believable and became a visible edge of the world.
 *
 * Pure and seeded, so the terrain mesh and anything standing on it agree on the height without
 * having to pass a heightmap around.
 */

/** Inside this radius the ground is dead flat, because the city is built on it. */
export const CITY_FLAT_RADIUS = 1_750
/** The distance over which the land is allowed to work its way up from flat. */
const TERRAIN_RAMP = 1_600

/** Where the river runs, and how wide a valley it keeps for itself. */
const RIVER_CENTRE_X = -1_050
const RIVER_VALLEY = 620

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

/**
 * Height of the land at a point, in metres. Zero everywhere the city stands, and zero along the
 * river's valley however far it runs — water does not climb a hill, and a river cut through one
 * looks wrong from the first frame.
 */
export function terrainHeight(x: number, z: number, seed: number): number {
  const distance = Math.hypot(x, z)
  const ramp = smoothstep(CITY_FLAT_RADIUS, CITY_FLAT_RADIUS + TERRAIN_RAMP, distance)
  if (ramp <= 0)
    return 0

  const hills = (fbm(x / HILL_SCALE, z / HILL_SCALE, seed) - 0.42) * HILL_HEIGHT
  const detail = (fbm(x / DETAIL_SCALE, z / DETAIL_SCALE, seed + 7) - 0.5) * DETAIL_HEIGHT
  const valley = smoothstep(0, RIVER_VALLEY, Math.abs(x - RIVER_CENTRE_X))

  return Math.max(0, hills + detail) * ramp * valley
}
