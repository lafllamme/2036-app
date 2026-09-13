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
 * Fill the holes the map leaves.
 *
 * OpenStreetMap is thorough about the buildings people live in and vague about everything else —
 * yards, workshops, depots, the low stuff behind a tower. Zoomed in, whole blocks come out as lawn
 * with three office slabs standing on it, which is neither what is there nor what a city looks like.
 *
 * Anywhere inside the extract with no building, no water and no parkland gets a plausible one, sized
 * and angled like its neighbours and never on a street. This is the point where Lindenhafen stops
 * being Bremen: the ground plan is the real one, the infill is ours.
 */
const FILL_STEP = 24
const FILL_CLEARANCE = 22

/**
 * How large one roof can be before the outline under it is a block rather than a building.
 *
 * Six thousand square metres is a square seventy-seven metres on a side. Fourteen footprints in the
 * extract are bigger than that and not one of them is over twenty-five metres tall, which is what
 * gives them away: they are the outlines OpenStreetMap carries around whole estates and works, not
 * roofs. Extruded, the largest is a slab three hundred and ten by three hundred and fifty metres —
 * the flat pale surface that cut every building behind it off at the second floor. Dropping them
 * leaves a hole, and `fillGaps` fills it with buildings the size of buildings.
 */
const MAX_FOOTPRINT = 6_000

/**
 * Throw away the outlines that are not buildings but blocks.
 *
 * Two kinds go: anything with a roof too large to be one roof, and anything that contains the
 * centres of two or more other footprints — a container, whatever its size.
 */
function dropEnclosingOutlines(buildings) {
  const cell = 100
  const key = (x, z) => `${Math.round(x / cell)}:${Math.round(z / cell)}`
  const grid = new Map()
  for (const building of buildings) {
    const at = key(building.x, building.z)
    const list = grid.get(at) ?? []
    list.push(building)
    grid.set(at, list)
  }

  const dropped = new Set()
  for (const building of buildings) {
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < building.p.length; i += 2) {
      minX = Math.min(minX, building.p[i])
      maxX = Math.max(maxX, building.p[i])
      minZ = Math.min(minZ, building.p[i + 1])
      maxZ = Math.max(maxZ, building.p[i + 1])
    }
    if (Math.abs(signedArea(building.p)) > MAX_FOOTPRINT) {
      dropped.add(building)
      continue
    }
    // Nothing small enough to be one building can hold two others, so most are settled here.
    if (maxX - minX < 40 && maxZ - minZ < 40)
      continue

    let inside = 0
    for (let cx = Math.round(minX / cell); cx <= Math.round(maxX / cell) && inside < 2; cx += 1) {
      for (let cz = Math.round(minZ / cell); cz <= Math.round(maxZ / cell) && inside < 2; cz += 1) {
        for (const other of grid.get(`${cx}:${cz}`) ?? []) {
          if (other !== building && contains(building.p, other.x, other.z))
            inside += 1
        }
      }
    }
    if (inside >= 2)
      dropped.add(building)
  }

  for (let i = buildings.length - 1; i >= 0; i -= 1) {
    if (dropped.has(buildings[i]))
      buildings.splice(i, 1)
  }
  return dropped.size
}

function fillGaps(buildings, roads, areas) {
  const cell = 40
  const key = (x, z) => `${Math.floor(x / cell)}:${Math.floor(z / cell)}`
  const occupied = new Map()
  for (const building of buildings) {
    const at = key(building.x, building.z)
    const list = occupied.get(at) ?? []
    list.push(building)
    occupied.set(at, list)
  }

  const onRoad = new Set()
  for (const road of roads) {
    for (let i = 0; i < road.p.length - 2; i += 2) {
      const span = Math.hypot(road.p[i + 2] - road.p[i], road.p[i + 3] - road.p[i + 1])
      const steps = Math.max(1, Math.ceil(span / 8))
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        onRoad.add(key(road.p[i] + (road.p[i + 2] - road.p[i]) * t, road.p[i + 1] + (road.p[i + 3] - road.p[i + 1]) * t))
      }
    }
  }

  const keepClear = areas.filter(area => ['water', 'park', 'pitch', 'forest'].includes(area.k)).map(area => area.p)
  const added = []
  let seed = 1

  const nearby = (x, z) => {
    const found = []
    const cx = Math.floor(x / cell)
    const cz = Math.floor(z / cell)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1)
        found.push(...(occupied.get(`${cx + dx}:${cz + dz}`) ?? []))
    }
    return found
  }

  /*
   * Every footprint big enough to reach past its own cell, indexed by all the cells it covers.
   *
   * Clearance was measured to the neighbours' centres, which is the right test between two houses
   * and useless against a works a hundred metres across: its centre is far away, so a whole street
   * of infill was delivered inside it. This is what makes "is this point already built on" a
   * question about the outline rather than about the centroid.
   */
  const covering = new Map()
  for (const building of buildings) {
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < building.p.length; i += 2) {
      minX = Math.min(minX, building.p[i])
      maxX = Math.max(maxX, building.p[i])
      minZ = Math.min(minZ, building.p[i + 1])
      maxZ = Math.max(maxZ, building.p[i + 1])
    }
    for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx += 1) {
      for (let cz = Math.floor(minZ / cell); cz <= Math.floor(maxZ / cell); cz += 1) {
        const at = `${cx}:${cz}`
        const list = covering.get(at) ?? []
        list.push(building)
        covering.set(at, list)
      }
    }
  }

  for (let x = -EXTENT + FILL_STEP; x < EXTENT; x += FILL_STEP) {
    for (let z = -EXTENT + FILL_STEP; z < EXTENT; z += FILL_STEP) {
      const random = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
        return seed / 4_294_967_296
      }
      const px = x + (random() - 0.5) * 14
      const pz = z + (random() - 0.5) * 14

      const neighbours = nearby(px, pz)
      if (neighbours.some(other => Math.hypot(other.x - px, other.z - pz) < FILL_CLEARANCE))
        continue
      if (onRoad.has(key(px, pz)))
        continue
      if ((covering.get(key(px, pz)) ?? []).some(other => contains(other.p, px, pz)))
        continue
      // Nothing is built in the water, in a park or on a pitch.
      if (keepClear.some(ring => contains(ring, px, pz)))
        continue

      /*
       * Take the neighbourhood's word for what belongs here. Where there is nothing to go on — the
       * far edge of the extract — it is a low workshop, which is what the edge of a city is made of.
       */
      const context = nearby(px, pz).concat(added.slice(-40).filter(other => Math.hypot(other.x - px, other.z - pz) < 180))
      const height = context.length > 0
        ? context.reduce((sum, other) => sum + other.h, 0) / context.length * (0.6 + random() * 0.5)
        : 6 + random() * 5
      const angle = context.length > 0 ? context[0].a : (random() - 0.5) * Math.PI
      const width = 13 + random() * 13
      const depth = 11 + random() * 12

      const rotated = []
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (const [ox, oz] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]])
        rotated.push(round(px + ox * cos - oz * sin), round(pz + ox * sin + oz * cos))

      const entry = {
        p: rotated,
        h: round(Math.max(4, Math.min(height, 26))),
        r: random() > 0.45 ? round(2.4 + random() * 2.2) : 0,
        t: height > 16 ? 'commercial' : 'residential',
        x: round(px),
        z: round(pz),
        w: round(width),
        d: round(depth),
        a: Math.round(angle * 1_000) / 1_000,
      }
      added.push(entry)
      const at = key(px, pz)
      const list = occupied.get(at) ?? []
      list.push(entry)
      occupied.set(at, list)
    }
  }
  return added
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
const RELIEF_SIZE = 160
const RELIEF_RISE = 44
const RELIEF_REACH = 980
/**
 * How many passes of a 3 × 3 binomial blur the finished field gets.
 *
 * Relief is not just scenery: every building, street, lamp and tree reads its height, and the ground
 * mesh can only draw it as straight lines between vertices eighteen metres apart. A slope that turns
 * inside one cell is therefore a slope the ground does not actually have, and a building standing on
 * the value at its centre ends up several metres into the hillside at one corner — which is exactly
 * what happened: a fifth of the city was sunk or floating, the worst of it by ten metres.
 *
 * Smoothing is the cure at the source. Four passes take the steepest gradient in the field from
 * about one in three to one in eleven, which a flat-based building can stand on.
 */
const RELIEF_SMOOTHING = 4

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
      /*
       * Three octaves, so the land away from the river is hills rather than a ramp: a broad rise
       * with ridges and hollows on it. The distance term still multiplies everything, which is what
       * keeps the floodplain flat and stops a hill ever forming in the middle of the water.
       */
      const broad = valueNoise(column / 26, row / 26)
      const ridges = valueNoise(column / 14 + 31, row / 14 - 17)
      /*
       * The third octave used to turn over every four and a half cells — eighty metres — at six
       * metres of amplitude. That is a one-in-seven slope between two neighbouring houses, and it is
       * where most of the sinking came from. It is now half as strong over twice the distance, and
       * the blur below takes what is left of the sharpness out.
       */
      const grain = valueNoise(column / 9 - 7, row / 9 + 23)
      const shape = broad * 0.58 + ridges * 0.32 + grain * 0.1
      data.push(eased * RELIEF_RISE * (0.28 + shape * 1.15))
    }
  }

  return { size: RELIEF_SIZE, extent: EXTENT, data: blur(data, RELIEF_SMOOTHING).map(value => Math.round(value * 10) / 10) }
}

/**
 * A 3 × 3 binomial blur, run over the field a few times.
 *
 * The edge is clamped rather than wrapped, so the rim of the extract keeps its height instead of
 * being pulled toward whatever is on the far side of the city.
 */
function blur(field, passes) {
  let current = field
  const weights = [1, 2, 1]
  for (let pass = 0; pass < passes; pass += 1) {
    const next = Array.from({ length: current.length })
    for (let row = 0; row < RELIEF_SIZE; row += 1) {
      for (let column = 0; column < RELIEF_SIZE; column += 1) {
        let sum = 0
        let total = 0
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const r = Math.min(RELIEF_SIZE - 1, Math.max(0, row + dr))
            const c = Math.min(RELIEF_SIZE - 1, Math.max(0, column + dc))
            const weight = weights[dr + 1] * weights[dc + 1]
            sum += current[r * RELIEF_SIZE + c] * weight
            total += weight
          }
        }
        next[row * RELIEF_SIZE + column] = sum / total
      }
    }
    current = next
  }
  return current
}

/**
 * The deep channel, traced down the middle of the water.
 *
 * The same distance transform run the other way round — how far a water cell is from dry land —
 * peaks along the middle of the river. Walking the long axis of the water and taking the deepest
 * cell in each slab gives a line a ship can follow without ever touching a bank.
 */
function buildWaterway(areas) {
  const cell = (EXTENT * 2) / RELIEF_SIZE
  const rings = areas.filter(area => area.k === 'water').map(area => area.p)
  if (rings.length === 0)
    return []

  const depth = new Float64Array(RELIEF_SIZE * RELIEF_SIZE).fill(Infinity)
  const wet = new Uint8Array(RELIEF_SIZE * RELIEF_SIZE)
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      const x = -EXTENT + (column + 0.5) * cell
      const z = -EXTENT + (row + 0.5) * cell
      const inside = rings.some(ring => contains(ring, x, z))
      wet[row * RELIEF_SIZE + column] = inside ? 1 : 0
      if (!inside)
        depth[row * RELIEF_SIZE + column] = 0
    }
  }
  sweep(depth, cell)

  // The water's long axis, from the spread of its cells.
  let sumX = 0
  let sumZ = 0
  let count = 0
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      if (!wet[row * RELIEF_SIZE + column])
        continue
      sumX += column
      sumZ += row
      count += 1
    }
  }
  if (count < 20)
    return []
  const meanX = sumX / count
  const meanZ = sumZ / count
  let xx = 0
  let zz = 0
  let xz = 0
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      if (!wet[row * RELIEF_SIZE + column])
        continue
      xx += (column - meanX) ** 2
      zz += (row - meanZ) ** 2
      xz += (column - meanX) * (row - meanZ)
    }
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz)
  const ux = Math.cos(angle)
  const uz = Math.sin(angle)

  // Deepest cell in each slab along that axis.
  const slabs = new Map()
  for (let row = 0; row < RELIEF_SIZE; row += 1) {
    for (let column = 0; column < RELIEF_SIZE; column += 1) {
      if (!wet[row * RELIEF_SIZE + column])
        continue
      const along = Math.round(((column - meanX) * ux + (row - meanZ) * uz) / 2)
      const here = depth[row * RELIEF_SIZE + column]
      const best = slabs.get(along)
      if (!best || here > best.depth)
        slabs.set(along, { column, row, depth: here })
    }
  }

  const path = []
  for (const key of [...slabs.keys()].sort((a, b) => a - b)) {
    const { column, row, depth: deep } = slabs.get(key)
    // A barge needs room either side; anything narrower is a creek, not a waterway.
    if (deep < 22)
      continue
    path.push(round(-EXTENT + (column + 0.5) * cell), round(-EXTENT + (row + 0.5) * cell))
  }
  return path.length >= 8 ? [{ p: smoothPath(path) }] : []
}

/** Two chamfer sweeps, forward and backward. Close enough to a Euclidean distance for this. */
function sweep(field, cell) {
  const step = (row, column, dr, dc, cost) => {
    const from = (row + dr) * RELIEF_SIZE + (column + dc)
    const to = row * RELIEF_SIZE + column
    if (field[from] + cost < field[to])
      field[to] = field[from] + cost
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
}

/** Three passes of a moving average, so a ship does not steer in steps of a grid cell. */
function smoothPath(path) {
  let current = path
  for (let pass = 0; pass < 3; pass += 1) {
    const next = current.slice()
    for (let i = 2; i < current.length - 2; i += 2) {
      next[i] = round((current[i - 2] + current[i] * 2 + current[i + 2]) / 4)
      next[i + 1] = round((current[i - 1] + current[i + 1] * 2 + current[i + 3]) / 4)
    }
    current = next
  }
  return current
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

const swallowed = dropEnclosingOutlines(buildings)

const filled = fillGaps(buildings, roads, areas)
buildings.push(...filled)

const city = {
  source: 'OpenStreetMap contributors (ODbL) — Bremen, 3 × 3 km around the Altstadt',
  origin: ORIGIN,
  extent: EXTENT,
  relief: buildRelief(areas),
  waterways: buildWaterway(areas),
  buildings,
  roads,
  rails,
  areas,
}

const out = 'public/city/lindenhafen.json'
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(city))

const vertices = buildings.reduce((n, b) => n + b.p.length / 2, 0)
console.log(`${buildings.length} buildings (${filled.length} filled in, ${swallowed} enclosing outlines dropped, ${vertices} vertices), ${roads.length} roads, ${rails.length} rails, ${areas.length} areas`)
console.log(`waterway ${city.waterways[0]?.p.length ? city.waterways[0].p.length / 2 : 0} points`)
console.log(`relief ${city.relief.size}² cells, ${Math.max(...city.relief.data).toFixed(1)} m at its highest`)
console.log(`${out} — ${(readFileSync(out).length / 1024 / 1024).toFixed(2)} MB`)
