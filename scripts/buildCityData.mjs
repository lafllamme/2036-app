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

/**
 * How tall a building is, and how much of that is roof.
 *
 * The two have to be worked out together, and getting that wrong is what made half the old town look
 * as though it had been pushed into the ground. OpenStreetMap's `height` is the whole building,
 * ridge included, so the walls are `height` minus the roof. But `building:levels` is the opposite
 * kind of number: it counts storeys, which stop at the eaves. Subtracting the roof from a height
 * derived from storeys takes the roof out twice — a two-storey house came to 7,3 m, lost 3,6 m of
 * roof, and was left with 3,7 m of wall: one row of windows under an enormous roof, which is exactly
 * what a building buried to its eaves looks like. Two thousand of them were like that.
 *
 * So: an explicit height already contains the roof, and everything else is a wall height that the
 * roof is added to.
 */
function massingOf(tags) {
  const roof = roofHeightOf(tags)
  const explicit = parseMetres(tags.height)
  if (explicit) {
    // A roof can be most of a shed but never nearly all of a building.
    return { height: explicit, roof: Math.min(roof, explicit * 0.55) }
  }

  const levels = parseMetres(tags['building:levels'])
  const wall = levels ? levels * STOREY + PLINTH : wallDefault(tags)
  return { height: wall + roof, roof }
}

/** How high the eaves are when the map says nothing at all, by what kind of building it is. */
function wallDefault(tags) {
  const kind = tags.building
  if (kind === 'house' || kind === 'detached' || kind === 'semidetached_house')
    return 6.5
  if (kind === 'garage' || kind === 'garages' || kind === 'shed' || kind === 'roof')
    return 2.6
  if (kind === 'apartments')
    return 13
  if (kind === 'industrial' || kind === 'warehouse')
    return 8.5
  return 9.5
}

/**
 * The roof's own height. A German pitched roof over a house ten metres deep is about three metres
 * from eaves to ridge, and a roof storey is a low one.
 */
function roofHeightOf(tags) {
  const shape = tags['roof:shape']
  if (!shape || shape === 'flat')
    return 0
  const explicit = parseMetres(tags['roof:height'])
  if (explicit)
    return Math.min(explicit, 10)
  const levels = parseMetres(tags['roof:levels'])
  return Math.min(levels ? levels * 2.4 : 3.1, 10)
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
 * Fill the holes the map leaves — along the streets, the way a city fills.
 *
 * OpenStreetMap is thorough about the buildings people live in and vague about everything else:
 * yards, workshops, depots, the low stuff behind a tower. Zoomed in, whole blocks come out as lawn
 * with three office slabs on it, which is neither what is there nor what a city looks like.
 *
 * The first version sampled a twenty-four-metre grid and dropped a box wherever it found room. Two
 * things were wrong with that and both of them are visible from the ground. A grid produces a field
 * of identical sheds standing in grass with no street to belong to — nowhere on earth looks like
 * that, because buildings are built facing a road. And the height was the average of the neighbours
 * including the infill already placed*, so each new one averaged over the too-small ones before it
 * and the whole thing collapsed: 963 of 1 386 ended up a single storey tall, median height 4,7 m,
 * against 9,5 m for the real city around them. A shed with an enormous roof on it, which is exactly
 * what a building sunk to its eaves looks like.
 *
 * So this walks the streets instead. Every street gets plots down both sides at a plot's width, set
 * back from the kerb, square to the road, and a candidate is only built where nothing already is.
 * The storeys come from the real buildings nearby and never from the infill, and the roof is added on
 * top of the walls rather than carved out of them — the same rule `massingOf` follows.
 *
 * This is the point where Lindenhafen stops being Bremen: the ground plan is the real one, what fills
 * it in is ours.
 */
/** How wide a plot is, how deep the house on it is, and how far back from the kerb it stands. */
const PLOT_MIN = 15
const PLOT_MAX = 27
const PLOT_DEPTH_MIN = 10
const PLOT_DEPTH_MAX = 16
const FRONT_GARDEN = 4.5
/** Only streets something would front onto. A service road behind a depot gets nothing. */
const FRONTAGE_MIN_WIDTH = 6
/** How fine the map of what is already taken is, in metres, and how much clearance a building wants. */
const OCCUPANCY_CELL = 4
const BUILDING_CLEARANCE = 2.5
/** As many as the streets have room for; the cap is a guard, not a target. */
const FILL_LIMIT = 4_000
/**
 * The outbuildings in the courtyards: how far apart they are tried, how big they are, and how close
 * to a real building they have to be to exist at all. That last one is what keeps them out of the
 * open country — a field's middle is far from anything, and stays a field.
 */
const COURT_STEP = 19
const COURT_MIN = 6
const COURT_MAX = 13
const COURT_REACH = 42

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
  /*
   * A map of what the ground is already spoken for by, at four metres a cell: every footprint, every
   * carriageway, and every piece of land nobody builds on. Asking it is one array lookup, which is
   * what makes it affordable to test a candidate's whole outline rather than just its centre — the
   * old clearance was measured to a neighbour's *centre*, which says nothing at all about a works a
   * hundred metres across, and a street of infill was delivered inside one.
   */
  const span = Math.ceil((EXTENT * 2) / OCCUPANCY_CELL)
  const taken = new Uint8Array(span * span)
  const cellOf = value => Math.floor((value + EXTENT) / OCCUPANCY_CELL)
  const isTaken = (x, z) => {
    const cx = cellOf(x)
    const cz = cellOf(z)
    if (cx < 0 || cz < 0 || cx >= span || cz >= span)
      return true
    return taken[cz * span + cx] === 1
  }
  const claim = (x, z) => {
    const cx = cellOf(x)
    const cz = cellOf(z)
    if (cx >= 0 && cz >= 0 && cx < span && cz < span)
      taken[cz * span + cx] = 1
  }

  /** Mark every cell whose centre falls inside a ring, grown by `margin` all round. */
  const claimRing = (ring, margin) => {
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i])
      maxX = Math.max(maxX, ring[i])
      minZ = Math.min(minZ, ring[i + 1])
      maxZ = Math.max(maxZ, ring[i + 1])
    }
    for (let x = minX - margin; x <= maxX + margin; x += OCCUPANCY_CELL) {
      for (let z = minZ - margin; z <= maxZ + margin; z += OCCUPANCY_CELL) {
        // Grown by testing the ring at an offset rather than by offsetting the ring itself.
        if (contains(ring, x, z)
          || contains(ring, x + margin, z) || contains(ring, x - margin, z)
          || contains(ring, x, z + margin) || contains(ring, x, z - margin)) {
          claim(x, z)
        }
      }
    }
  }

  for (const building of buildings)
    claimRing(building.p, BUILDING_CLEARANCE)
  for (const area of areas) {
    if (['water', 'park', 'pitch', 'forest', 'grass', 'meadow'].includes(area.k))
      claimRing(area.p, 0)
  }
  for (const road of roads) {
    for (let i = 0; i < road.p.length - 2; i += 2) {
      const span_ = Math.hypot(road.p[i + 2] - road.p[i], road.p[i + 3] - road.p[i + 1])
      const steps = Math.max(1, Math.ceil(span_ / OCCUPANCY_CELL))
      const reach = road.w / 2 + 1.5
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        const x = road.p[i] + (road.p[i + 2] - road.p[i]) * t
        const z = road.p[i + 1] + (road.p[i + 3] - road.p[i + 1]) * t
        for (let dx = -reach; dx <= reach; dx += OCCUPANCY_CELL) {
          for (let dz = -reach; dz <= reach; dz += OCCUPANCY_CELL) claim(x + dx, z + dz)
        }
      }
    }
  }

  /*
   * How tall the real buildings around a point are, in storeys, on a coarse grid. Only the real ones:
   * reading the infill back is what made the old one shrink toward nothing, one building at a time.
   */
  const CONTEXT_CELL = 160
  const contextSpan = Math.ceil((EXTENT * 2) / CONTEXT_CELL)
  const storeySum = new Float64Array(contextSpan * contextSpan)
  const storeyCount = new Float64Array(contextSpan * contextSpan)
  const pitchedCount = new Float64Array(contextSpan * contextSpan)
  for (const building of buildings) {
    const cx = Math.floor((building.x + EXTENT) / CONTEXT_CELL)
    const cz = Math.floor((building.z + EXTENT) / CONTEXT_CELL)
    if (cx < 0 || cz < 0 || cx >= contextSpan || cz >= contextSpan)
      continue
    const at = cz * contextSpan + cx
    storeySum[at] += Math.max(1, Math.round((building.h - building.r) / STOREY))
    storeyCount[at] += 1
    if (building.r > 0.4)
      pitchedCount[at] += 1
  }
  const neighbourhood = (x, z) => {
    const cx = Math.floor((x + EXTENT) / CONTEXT_CELL)
    const cz = Math.floor((z + EXTENT) / CONTEXT_CELL)
    let sum = 0
    let count = 0
    let pitched = 0
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const ax = cx + dx
        const az = cz + dz
        if (ax < 0 || az < 0 || ax >= contextSpan || az >= contextSpan)
          continue
        const at = az * contextSpan + ax
        sum += storeySum[at]
        count += storeyCount[at]
        pitched += pitchedCount[at]
      }
    }
    // Two storeys where there is nothing to go on: that is what the edge of a city is made of.
    return count > 0
      ? { storeys: sum / count, pitched: pitched / count }
      : { storeys: 2, pitched: 0.6 }
  }

  const added = []
  let seed = 1
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return seed / 4_294_967_296
  }

  for (const road of roads) {
    if (added.length >= FILL_LIMIT)
      break
    if (road.w < FRONTAGE_MIN_WIDTH)
      continue

    const points = road.p
    let carried = random() * PLOT_MAX
    for (let i = 0; i < points.length / 2 - 1; i += 1) {
      const ax = points[i * 2]
      const az = points[i * 2 + 1]
      const bx = points[(i + 1) * 2]
      const bz = points[(i + 1) * 2 + 1]
      const run = Math.hypot(bx - ax, bz - az)
      if (run < 1)
        continue
      const ux = (bx - ax) / run
      const uz = (bz - az) / run
      const facing = Math.atan2(ux, uz)

      let along = PLOT_MIN - carried
      while (along < run) {
        const width = PLOT_MIN + random() * (PLOT_MAX - PLOT_MIN)
        const depth = PLOT_DEPTH_MIN + random() * (PLOT_DEPTH_MAX - PLOT_DEPTH_MIN)
        for (const side of [1, -1]) {
          // A gap in the row: an entry, a yard, somewhere nobody built.
          if (random() > 0.82)
            continue
          const offset = (road.w / 2 + FRONT_GARDEN + depth / 2) * side
          const px = ax + ux * (along + width / 2) - uz * offset
          const pz = az + uz * (along + width / 2) + ux * offset
          if (Math.abs(px) > EXTENT - 20 || Math.abs(pz) > EXTENT - 20)
            continue

          // Square to the street, which is what puts a row of them along it.
          const angle = facing + (random() - 0.5) * 0.05
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          const house = width - 2 - random() * 3
          const ring = []
          for (const [ox, oz] of [[-house / 2, -depth / 2], [house / 2, -depth / 2], [house / 2, depth / 2], [-house / 2, depth / 2]])
            ring.push(round(px + ox * cos - oz * sin), round(pz + ox * sin + oz * cos))

          // Every corner, every edge midpoint and the middle: nothing may already be there.
          let free = !isTaken(px, pz)
          for (let corner = 0; free && corner < 8; corner += 2) {
            const next = (corner + 2) % 8
            free = !isTaken(ring[corner], ring[corner + 1])
              && !isTaken((ring[corner] + ring[next]) / 2, (ring[corner + 1] + ring[next + 1]) / 2)
          }
          if (!free)
            continue

          const context = neighbourhood(px, pz)
          const storeys = Math.max(1, Math.round(context.storeys * (0.7 + random() * 0.6)))
          const wall = storeys * STOREY + PLINTH
          const roof = random() < context.pitched ? round(2.6 + random() * 1.2) : 0
          added.push({
            p: ring,
            h: round(wall + roof),
            r: roof,
            t: roof > 0.4 ? (storeys >= 4 ? 'altbau' : 'residential') : (storeys >= 5 ? 'commercial' : 'residential'),
            x: round(px),
            z: round(pz),
            w: round(house),
            d: round(depth),
            a: Math.round(angle * 1_000) / 1_000,
          })
          claimRing(ring, BUILDING_CLEARANCE)
        }
        along += width
      }
      carried = (carried + run) % PLOT_MAX
    }
  }

  /*
   * And what stands behind the street wall.
   *
   * A European block is not hollow: there are garages, workshops, extensions and bicycle sheds in the
   * courtyard, and OpenStreetMap almost never has them. They are what fills a block, and they are
   * small and low — which is the whole difference from the old infill, which put *houses* out there.
   *
   * The rule that keeps them out of open country is that they have to be near something real. A
   * meadow's middle is far from any building and stays a meadow; the back of a terrace is twenty
   * metres from one and gets a workshop.
   */
  const near = new Map()
  for (const building of buildings) {
    const key = `${Math.round(building.x / COURT_REACH)}:${Math.round(building.z / COURT_REACH)}`
    const list = near.get(key) ?? []
    list.push(building)
    near.set(key, list)
  }
  const hasNeighbour = (x, z) => {
    const cx = Math.round(x / COURT_REACH)
    const cz = Math.round(z / COURT_REACH)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const other of near.get(`${cx + dx}:${cz + dz}`) ?? []) {
          if (Math.hypot(other.x - x, other.z - z) < COURT_REACH)
            return true
        }
      }
    }
    return false
  }

  for (let x = -EXTENT + COURT_STEP; x < EXTENT - COURT_STEP && added.length < FILL_LIMIT; x += COURT_STEP) {
    for (let z = -EXTENT + COURT_STEP; z < EXTENT - COURT_STEP; z += COURT_STEP) {
      const px = x + (random() - 0.5) * 9
      const pz = z + (random() - 0.5) * 9
      if (isTaken(px, pz) || !hasNeighbour(px, pz))
        continue

      const width = COURT_MIN + random() * (COURT_MAX - COURT_MIN)
      const depth = COURT_MIN + random() * (COURT_MAX - COURT_MIN)
      const angle = random() * Math.PI
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const ring = []
      for (const [ox, oz] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]])
        ring.push(round(px + ox * cos - oz * sin), round(pz + ox * sin + oz * cos))

      let free = true
      for (let corner = 0; free && corner < 8; corner += 2)
        free = !isTaken(ring[corner], ring[corner + 1])
      if (!free)
        continue

      // One storey, occasionally two. A courtyard is not where the tall things are.
      const storeys = random() > 0.82 ? 2 : 1
      const roof = random() > 0.55 ? round(1.8 + random() * 1.2) : 0
      added.push({
        p: ring,
        h: round(storeys * STOREY + PLINTH + roof),
        r: roof,
        t: 'industrial',
        x: round(px),
        z: round(pz),
        w: round(width),
        d: round(depth),
        a: Math.round(angle * 1_000) / 1_000,
      })
      claimRing(ring, BUILDING_CLEARANCE)
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
    const massing = massingOf(tags)
    const height = massing.height
    if (area < MIN_AREA || height < MIN_HEIGHT)
      continue
    const outline = simplify(ring)
    const box = orientedBox(outline)
    const [x, z] = centroidOf(outline)
    buildings.push({
      p: outline,
      h: round(height),
      r: round(massing.roof),
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
