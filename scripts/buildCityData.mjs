#!/usr/bin/env node
/**
 * Turn an OpenStreetMap extract into Lindenhafen.
 *
 * Lindenhafen is fictional, but a city laid out by a procedural grid reads as a grid however much
 * jitter is thrown at it: the blocks are the same size, the streets meet at the same angle and the
 * edge is a square. This takes the ground plan of a real German city instead — three kilometres of
 * Bremen either side of the Weser — and keeps its footprints, its street network, its water and its
 * land use. The names, the districts and everything the simulation decides stay ours.
 *
 * Run once, commit the output. It is deliberately not part of the build: the data does not change,
 * and no player should wait on Overpass.
 *
 *   node scripts/buildCityData.mjs path/to/overpass.json
 *
 * The extract is fetched with the Overpass query in `docs/CITY_DATA.md`. Source and licence are
 * recorded in `docs/ASSET_SOURCES.md`; OpenStreetMap data is ODbL and requires attribution.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'

/** The centre of the extract, and how far the city reaches from it in metres. */
const ORIGIN = { lat: 53.0758, lon: 8.8072 }
const EXTENT = 1_500
/** Metres per degree at this latitude. Good to a few centimetres over three kilometres. */
const METRES_PER_LAT = 110_574
const METRES_PER_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)

/** A storey, and the plinth under the ground floor, in metres. */
const STOREY = 3.1
const PLINTH = 1.1
/** Anything shorter than this is a shed, a bin store or a canopy, and is not worth a draw call. */
const MIN_HEIGHT = 2.6
const MIN_AREA = 24

const ROAD_WIDTH = {
  motorway: 22,
  trunk: 20,
  primary: 17,
  secondary: 14,
  tertiary: 11,
  residential: 8.5,
  unclassified: 8,
  living_street: 7,
  pedestrian: 6,
  service: 5,
}
const ARTERIAL = new Set(['motorway', 'trunk', 'primary', 'secondary'])

/** Which of our own surface kinds a piece of land is. Everything else is left as plain ground. */
function areaKind(tags) {
  if (tags.natural === 'water' || tags.waterway === 'riverbank')
    return 'water'
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse === 'village_green')
    return 'park'
  if (tags.leisure === 'pitch' || tags.leisure === 'playground')
    return 'pitch'
  if (tags.landuse === 'forest' || tags.natural === 'wood')
    return 'forest'
  if (tags.landuse === 'grass' || tags.landuse === 'meadow' || tags.landuse === 'cemetery')
    return 'grass'
  if (tags.landuse === 'industrial' || tags.landuse === 'railway' || tags.landuse === 'port')
    return 'industrial'
  if (tags.landuse === 'retail' || tags.landuse === 'commercial')
    return 'commercial'
  if (tags.landuse === 'construction' || tags.landuse === 'brownfield')
    return 'construction'
  return null
}

/**
 * Our own building types, read off what the map says a building is and what shape its roof has.
 * A pitched roof on four storeys is a Gründerzeit block; a flat one is post-war.
 */
function buildingType(tags, height) {
  const kind = tags.building
  if (['industrial', 'warehouse', 'factory', 'hangar', 'storage_tank', 'silo'].includes(kind))
    return 'industrial'
  if (['church', 'cathedral', 'chapel', 'school', 'university', 'hospital', 'civic', 'public', 'government', 'train_station', 'museum'].includes(kind) || tags.amenity)
    return 'civic'
  if (['office', 'commercial', 'retail', 'supermarket', 'hotel', 'kiosk'].includes(kind))
    return 'commercial'
  const pitched = tags['roof:shape'] && tags['roof:shape'] !== 'flat'
  if (pitched && height >= 11)
    return 'altbau'
  if (!pitched && height >= 18)
    return 'modern'
  return 'residential'
}

function parseMetres(value) {
  if (!value)
    return null
  const number = Number.parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function heightOf(tags) {
  const explicit = parseMetres(tags.height)
  if (explicit)
    return explicit
  const levels = parseMetres(tags['building:levels'])
  if (levels)
    return levels * STOREY + PLINTH
  const kind = tags.building
  if (kind === 'house' || kind === 'detached' || kind === 'semidetached_house')
    return 8.5
  if (kind === 'garage' || kind === 'garages' || kind === 'shed' || kind === 'roof')
    return 3.2
  if (kind === 'apartments')
    return 14
  if (kind === 'industrial' || kind === 'warehouse')
    return 9
  return 10
}

function roofHeightOf(tags) {
  const shape = tags['roof:shape']
  if (!shape || shape === 'flat')
    return 0
  const explicit = parseMetres(tags['roof:height'])
  if (explicit)
    return Math.min(explicit, 12)
  const levels = parseMetres(tags['roof:levels'])
  return Math.min(levels ? levels * 2.5 : 3.6, 12)
}

function project(point) {
  return [
    (point.lon - ORIGIN.lon) * METRES_PER_LON,
    -(point.lat - ORIGIN.lat) * METRES_PER_LAT,
  ]
}

/** Shoelace area, which also tells us the winding. */
function signedArea(ring) {
  let sum = 0
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
    sum += (ring[j] * ring[i + 1]) - (ring[i] * ring[j + 1])
  return sum / 2
}

function round(value) {
  return Math.round(value * 10) / 10
}

/** Drop points that sit on the line between their neighbours. OSM footprints are full of them. */
function simplify(ring, tolerance = 0.35) {
  const out = []
  const count = ring.length / 2
  for (let i = 0; i < count; i += 1) {
    const [px, pz] = [ring[((i - 1 + count) % count) * 2], ring[((i - 1 + count) % count) * 2 + 1]]
    const [cx, cz] = [ring[i * 2], ring[i * 2 + 1]]
    const [nx, nz] = [ring[((i + 1) % count) * 2], ring[((i + 1) % count) * 2 + 1]]
    const cross = Math.abs((cx - px) * (nz - pz) - (cz - pz) * (nx - px))
    const span = Math.hypot(nx - px, nz - pz)
    if (span < 0.01 || cross / span > tolerance)
      out.push(round(cx), round(cz))
  }
  return out.length >= 6 ? out : ring.map(round)
}

/** A closed ring in metres, wound counter-clockwise, with the repeated last point removed. */
function ringOf(geometry) {
  const points = geometry.map(project).flat()
  const closed = points.length >= 4
    && points[0] === points[points.length - 2]
    && points[1] === points[points.length - 1]
  const ring = closed ? points.slice(0, -2) : points
  if (ring.length < 6)
    return null
  return signedArea(ring) < 0 ? flip(ring) : ring
}

function flip(ring) {
  const out = []
  for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1])
  return out
}

function insideExtent(ring, margin = 0) {
  for (let i = 0; i < ring.length; i += 2) {
    if (Math.abs(ring[i]) <= EXTENT + margin && Math.abs(ring[i + 1]) <= EXTENT + margin)
      return true
  }
  return false
}

function centroidOf(ring) {
  let x = 0
  let z = 0
  const count = ring.length / 2
  for (let i = 0; i < ring.length; i += 2) {
    x += ring[i]
    z += ring[i + 1]
  }
  return [x / count, z / count]
}

/** The smallest rectangle around a footprint, and the angle it stands at. The simulation reads it. */
function orientedBox(ring) {
  let best = null
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length
    const angle = Math.atan2(ring[j + 1] - ring[i + 1], ring[j] - ring[i])
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (let k = 0; k < ring.length; k += 2) {
      const u = ring[k] * cos - ring[k + 1] * sin
      const v = ring[k] * sin + ring[k + 1] * cos
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    const area = (maxU - minU) * (maxV - minV)
    if (!best || area < best.area)
      best = { area, width: maxU - minU, depth: maxV - minV, angle }
  }
  return best
}

/**
 * The lie of the land inside the city, worked out from where its water is.
 *
 * A river city is flat on its floodplain and rises away from it — Bremen does exactly this, and so
 * does every other city on a river. Rather than inventing hills and having them cut through the
 * Weser, the relief is a distance field: zero on the water and on the bank beside it, climbing to a
 * few metres at the far edge, roughened by noise so it is not a cone.
 *
 * A 128² grid over three kilometres is a cell every twenty-three metres, which is finer than any
 * slope the eye can pick out at this scale, and nine thousand numbers in the file.
 */
const RELIEF_SIZE = 128
const RELIEF_RISE = 9.5
const RELIEF_REACH = 620

function buildRelief(areas) {
  const cell = (EXTENT * 2) / RELIEF_SIZE
  const water = new Float64Array(RELIEF_SIZE * RELIEF_SIZE).fill(Infinity)
  const rings = areas.filter(area => area.k === 'water').map(area => area.p)

  // Seed the field: every cell whose centre is in the water starts at zero.
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      const x = -EXTENT + (column + 0.5) * cell
      const z = -EXTENT + (row + 0.5) * cell
      if (rings.some(ring => contains(ring, x, z)))
        water[row * RELIEF_SIZE + column] = 0
    }
  }

  // Two sweeps of a chamfer distance transform: forward, then backward. Close enough to Euclidean.
  const step = (row, column, dr, dc, cost) => {
    const from = (row + dr) * RELIEF_SIZE + (column + dc)
    const to = row * RELIEF_SIZE + column
    if (water[from] + cost < water[to])
      water[to] = water[from] + cost
  }
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      if (row > 0)
        step(row, column, -1, 0, cell)
      if (column > 0)
        step(row, column, 0, -1, cell)
      if (row > 0 && column > 0)
        step(row, column, -1, -1, cell * 1.41421)
    }
  }
  for (let row = RELIEF_SIZE - 1; row >= 0; row -= 1) {
    for (let column = RELIEF_SIZE - 1; column >= 0; column -= 1) {
      if (row < RELIEF_SIZE - 1)
        step(row, column, 1, 0, cell)
      if (column < RELIEF_SIZE - 1)
        step(row, column, 0, 1, cell)
      if (row < RELIEF_SIZE - 1 && column < RELIEF_SIZE - 1)
        step(row, column, 1, 1, cell * 1.41421)
    }
  }

  const data = []
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      const distance = water[row * RELIEF_SIZE + column]
      const t = Math.min(1, distance / RELIEF_REACH)
      const eased = t * t * (3 - 2 * t)
      // Enough noise that the terraces wander; never enough to fold back toward the river.
      const grain = 0.72 + 0.28 * valueNoise(column / 11, row / 11)
      data.push(Math.round(eased * RELIEF_RISE * grain * 10) / 10)
    }
  }
  return { size: RELIEF_SIZE, extent: EXTENT, data }
}

/** Point in ring, by ray casting. */
function contains(ring, x, z) {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const zi = ring[i + 1]
    const zj = ring[j + 1]
    if ((zi > z) === (zj > z))
      continue
    if (x < ring[j] + ((z - zj) / (zi - zj)) * (ring[i] - ring[j]))
      inside = !inside
  }
  return inside
}

function valueNoise(x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = (x - x0) * (x - x0) * (3 - 2 * (x - x0))
  const fy = (y - y0) * (y - y0) * (3 - 2 * (y - y0))
  const at = (a, b) => {
    const h = Math.sin(a * 127.1 + b * 311.7) * 43_758.5453
    return h - Math.floor(h)
  }
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx
  return top + (bottom - top) * fy
}

// ---------------------------------------------------------------------------

const input = process.argv[2]
if (!input) {
  console.error('usage: node scripts/buildCityData.mjs <overpass.json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(input, 'utf8'))
const buildings = []
const roads = []
const areas = []
const rails = []

for (const element of raw.elements) {
  if (element.type !== 'way' || !element.geometry)
    continue
  const tags = element.tags ?? {}

  if (tags.building) {
    const ring = ringOf(element.geometry)
    if (!ring || !insideExtent(ring))
      continue
    const area = Math.abs(signedArea(ring))
    const height = heightOf(tags)
    if (area < MIN_AREA || height < MIN_HEIGHT)
      continue
    const outline = simplify(ring)
    const box = orientedBox(outline)
    const [x, z] = centroidOf(outline)
    buildings.push({
      p: outline,
      h: round(height),
      r: round(roofHeightOf(tags)),
      t: buildingType(tags, height),
      x: round(x),
      z: round(z),
      w: round(box.width),
      d: round(box.depth),
      a: Math.round(box.angle * 1_000) / 1_000,
    })
    continue
  }

  if (tags.highway) {
    const path = element.geometry.map(project).flat().map(round)
    if (path.length < 4 || !insideExtent(path, 120))
      continue
    roads.push({ p: path, w: ROAD_WIDTH[tags.highway] ?? 6, a: ARTERIAL.has(tags.highway) ? 1 : 0 })
    continue
  }

  if (tags.railway === 'rail') {
    const path = element.geometry.map(project).flat().map(round)
    if (path.length >= 4 && insideExtent(path, 120))
      rails.push({ p: path })
    continue
  }

  const kind = areaKind(tags)
  if (kind) {
    const ring = ringOf(element.geometry)
    if (ring && insideExtent(ring, 200) && Math.abs(signedArea(ring)) > 60)
      areas.push({ p: simplify(ring, 1.2), k: kind })
  }
}

// Big pieces of land go down first, so a park inside an industrial estate still reads as a park.
areas.sort((a, b) => Math.abs(signedArea(b.p)) - Math.abs(signedArea(a.p)))

const city = {
  source: 'OpenStreetMap contributors (ODbL) — Bremen, 3 × 3 km around the Altstadt',
  origin: ORIGIN,
  extent: EXTENT,
  relief: buildRelief(areas),
  buildings,
  roads,
  rails,
  areas,
}

const out = 'public/city/lindenhafen.json'
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(city))

const vertices = buildings.reduce((n, b) => n + b.p.length / 2, 0)
console.log(`${buildings.length} buildings (${vertices} vertices), ${roads.length} roads, ${rails.length} rails, ${areas.length} areas`)
console.log(`relief ${city.relief.size}² cells, ${Math.max(...city.relief.data).toFixed(1)} m at its highest`)
console.log(`${out} — ${(readFileSync(out).length / 1024 / 1024).toFixed(2)} MB`)
