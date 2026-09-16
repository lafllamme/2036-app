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

/**
 * Welche Parzelle hier liegt, und was darauf wächst.
 *
 * Lindenhafens Umland war **eine einzige olivgrüne Fläche** mit einem weichen Verlauf darüber. Aus
 * zweitausend Metern Höhe las sich das als Bettlaken: kein Maßstab, keine Kante, nichts, woran das
 * Auge die Entfernung abschätzen könnte — und die vereinzelten Baumgruppen darauf wie Sprenkel auf
 * einem Tuch.
 *
 * Offenes Land sieht von oben nie so aus. Es ist ein **Flickenteppich aus Schlägen**: jeder Acker hat
 * seine eigene Frucht, seinen eigenen Schnitt und damit seine eigene Farbe, und die Kanten dazwischen
 * sind das Einzige, woran man aus der Höhe überhaupt eine Größe erkennt. Genau das fehlte.
 *
 * Gebaut wie die Hügel: aus einem Hash, ohne Daten und ohne Speicher. Das Raster ist in jeder Zelle
 * verzogen, damit keine zwei Schläge gleich groß sind und das Ganze kein Schachbrett wird — und die
 * Farbe steckt in der Vertexfarbe des Bodens, die es ohnehin gibt. **Kein Dreieck, kein Draw, keine
 * Textur.**
 */

/** Wie groß ein Schlag im Mittel ist, in Metern. Norddeutsche Feldgrößen liegen zwischen 3 und 12 ha. */
const FIELD_SIZE = 240

/**
 * Was auf den Schlägen steht, in linearem Raum.
 *
 * Nicht ausgedacht, sondern die Farben, die eine norddeutsche Feldflur im Sommer aus der Luft hat:
 * Wintergetreide grün, reifes Korn und Stoppel in Gold, frisch gepflügte Erde braun, Grünland und
 * Weide dunkler, Brache fahl. Bewusst **ohne** ein zweites Grün neben dem Grundton — die Abwechslung
 * kommt aus Helligkeit und Wärme, nicht aus mehr Buntheit, sonst wird aus einer Feldflur ein Teppich.
 */
const CROPS: [number, number, number][] = [
  [0.108, 0.140, 0.062], // Wintergetreide
  [0.170, 0.168, 0.058], // reifes Korn
  [0.205, 0.196, 0.078], // Stoppel
  [0.128, 0.098, 0.062], // gepflügt
  [0.086, 0.118, 0.056], // Grünland
  [0.148, 0.152, 0.086], // Brache
  [0.096, 0.126, 0.058], // Weide
  [0.192, 0.176, 0.062], // Raps, abgeerntet
]

/**
 * Die Frucht auf dem Schlag unter diesem Punkt — und wie weit man vom Rand des Schlages entfernt ist.
 *
 * Der Rand wird mitgegeben, weil er das ist, was man aus der Höhe sieht: ein Feldrand ist eine Kante,
 * kein Verlauf. Nah am Rand wird abgedunkelt, was als Saum, Graben oder Knick gelesen wird.
 */
export function fieldAt(x: number, z: number, seed: number): { crop: [number, number, number], edge: number } {
  // Das Raster verziehen, damit keine zwei Schläge gleich geschnitten sind.
  const warpX = x + (hash(Math.floor(x / 900), Math.floor(z / 900), seed + 71) - 0.5) * 260
  const warpZ = z + (hash(Math.floor(x / 900) + 17, Math.floor(z / 900), seed + 73) - 0.5) * 260
  const cellX = Math.floor(warpX / FIELD_SIZE)
  const cellZ = Math.floor(warpZ / FIELD_SIZE)
  const pick = hash(cellX, cellZ, seed + 97)
  const crop = CROPS[Math.min(CROPS.length - 1, Math.floor(pick * CROPS.length))]!

  // Abstand zum nächsten Zellenrand, auf die halbe Zellenbreite normiert.
  const localX = warpX / FIELD_SIZE - cellX
  const localZ = warpZ / FIELD_SIZE - cellZ
  const edge = Math.min(Math.min(localX, 1 - localX), Math.min(localZ, 1 - localZ)) * 2
  return { crop, edge }
}
