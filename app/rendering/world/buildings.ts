import type { BuildingRecord, BuildingType, CityBlueprint } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { BAY_WIDTH, facadeTexture, STOREY_HEIGHT, windowLightTexture } from './facade'

/**
 * The city, extruded from its real footprints.
 *
 * Every building is its own outline rather than a box or a kit model: a five-sided corner house on a
 * bend is five-sided and stands on the bend. Twelve thousand of them come to about a quarter of a
 * million triangles — a fraction of what the same city cost as catalogue models — because a wall is
 * two triangles and the detail on it is a texture.
 *
 * They are merged into a handful of tiles rather than drawn one by one. Instancing cannot help here
 * (no two footprints are alike), so the answer is the other one: fewer, larger meshes. A tile is
 * also the unit of frustum culling, which is what the old whole-city meshes could never be.
 */

/**
 * How many tiles the city is cut into, and how far they reach.
 *
 * The grid has to cover the country as well as the city now that both are built out of the same kind
 * of building, so it is wider and finer: a tile is about a kilometre and it is the unit of frustum
 * culling, which is what keeps street level down to a handful of draws.
 */
const TILES = 6
const CITY_EXTENT = 3_400
/** How far a roof draws in from the wall below it, where it has to be a truncated pyramid. */
const ROOF_INSET = 2.4
/**
 * How far a gable's eaves reach past the wall.
 *
 * Most of the city is rectangular — eleven thousand of fourteen — and a rectangle with a pitched roof
 * is a house with a gable: a ridge down the long axis, two slopes, two triangular ends. It was a
 * truncated pyramid like everything else, which is a marquee, and it is the single reason the small
 * houses read as sheds. A gable costs six triangles against the pyramid's ten, so this is cheaper
 * than what it replaces. The overhang is what casts the line of shadow along the wall that tells you
 * a roof is a roof.
 */
const EAVES = 0.5
/**
 * How far a building's walls are buried below the ground at each corner.
 *
 * It used to be twelve metres below the height at the building's *centre*, which is a different
 * thing entirely: on a slope one corner of a long building stood metres under the surface and
 * another hung metres over it. A building is rigid — it stands on the highest ground under its
 * outline — and the skirt now follows the ground corner by corner, so it only ever has to cover the
 * couple of metres a wall can drop between two of them.
 */
const SKIRT = 8
/**
 * The base course: the band between the ground and the floor of the building standing on it.
 *
 * This is what was missing, and it accounts for two thirds of the city. A building stands on the
 * highest ground its outline covers, so on any slope part of its wall is below that floor — and that
 * part was drawn with the façade texture at a negative height, which repeats. A window row grew out
 * of the grass on the downhill side of nine thousand buildings, which is exactly what a house sunk
 * into the ground looks like. The band is now its own piece of geometry in the roof's draw group:
 * plain stone, no windows, sized to whatever the slope needs, and never less than this so every
 * building sits on something instead of growing out of the lawn.
 */
const PLINTH = 0.35
/** How much darker the base course is than the wall above it. */
const PLINTH_SHADE = 0.62
/** The low wall a flat roof stops at. */
const PARAPET = 0.9

const WALL_COLOURS: Record<BuildingType, string[]> = {
  altbau: ['#b09480', '#c2a687', '#9c8271', '#ab8871', '#bda593'],
  residential: ['#bdb29f', '#b2a894', '#c8bda6', '#a89f8d', '#c6bba4'],
  modern: ['#a7b1b4', '#b8bfbd', '#98a3a7', '#c3c6c3', '#adb5b4'],
  commercial: ['#9aa5a8', '#a9b0ae', '#8b979a', '#b2b6b1', '#9ea7a5'],
  industrial: ['#8d928f', '#9a978c', '#808684', '#a4a094', '#878d8b'],
  civic: ['#b9ae97', '#a8ada3', '#c3b99f', '#aea78f', '#bcb49d'],
}

const ROOF_COLOURS: Record<BuildingType, string[]> = {
  altbau: ['#6b4a41', '#7a5347', '#5f4239', '#73504a'],
  residential: ['#6f5a4c', '#7d6454', '#634f44', '#5c5148'],
  modern: ['#6a6f70', '#5e6364', '#757a79', '#666b6a'],
  commercial: ['#61686a', '#6d7375', '#575d5f', '#727877'],
  industrial: ['#6c7170', '#787b74', '#5f6463', '#82847c'],
  civic: ['#5d6a62', '#6b7469', '#546055', '#6f7a6e'],
}

export interface CityBuildings {
  buildingMeshes: THREE.Mesh[]
  buildingRecords: Map<THREE.Mesh, BuildingRecord[]>
  /** Where each building's vertices live in its tile, so one can be tinted without touching the rest. */
  buildingRanges: Map<THREE.Mesh, { start: number, count: number }[]>
  /** Which building each triangle belongs to, so a ray hit can be turned back into a building. */
  buildingOfTriangle: Map<THREE.Mesh, Uint16Array>
  buildingColors: Map<THREE.Mesh, THREE.Color[]>
  /** The two materials the whole city is drawn with: its walls and its roofs. */
  buildingMaterials: THREE.MeshStandardMaterial[]
}

interface Tile {
  records: BuildingRecord[]
  position: number[]
  normal: number[]
  uv: number[]
  colour: number[]
  /** Walls and roofs are separate draw groups so a roof never gets a window drawn on it. */
  wallIndex: number[]
  roofIndex: number[]
  ranges: { start: number, count: number }[]
  colours: THREE.Color[]
}

export function createBuildings(scene: THREE.Scene, blueprint: CityBlueprint): CityBuildings {
  const rng = createRandomStream(blueprint.definition.seed, 'facades')
  const relief = blueprint.relief
  const tiles: Tile[] = Array.from({ length: TILES * TILES }, () => ({
    records: [],
    position: [],
    normal: [],
    uv: [],
    colour: [],
    wallIndex: [],
    roofIndex: [],
    ranges: [],
    colours: [],
  }))

  for (const building of blueprint.buildings) {
    const tile = tiles[tileOf(building.x, building.z)]
    if (tile)
      extrude(tile, building, rng, relief)
  }

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: facadeTexture(),
    emissiveMap: windowLightTexture(),
    emissive: '#ffffff',
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
  })
  const roofMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 })

  const buildingMeshes: THREE.Mesh[] = []
  const buildingRecords = new Map<THREE.Mesh, BuildingRecord[]>()
  const buildingRanges = new Map<THREE.Mesh, { start: number, count: number }[]>()
  const buildingOfTriangle = new Map<THREE.Mesh, Uint16Array>()
  const buildingColors = new Map<THREE.Mesh, THREE.Color[]>()

  for (const tile of tiles) {
    if (tile.records.length === 0)
      continue

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(tile.position, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(tile.normal, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(tile.uv, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tile.colour, 3))
    geometry.setIndex([...tile.wallIndex, ...tile.roofIndex])
    geometry.addGroup(0, tile.wallIndex.length, 0)
    geometry.addGroup(tile.wallIndex.length, tile.roofIndex.length, 1)
    geometry.computeBoundingSphere()

    const mesh = new THREE.Mesh(geometry, [wallMaterial, roofMaterial])
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    buildingMeshes.push(mesh)
    buildingRecords.set(mesh, tile.records)
    buildingRanges.set(mesh, tile.ranges)
    buildingColors.set(mesh, tile.colours)
    buildingOfTriangle.set(mesh, triangleOwners(tile))
  }

  return { buildingMeshes, buildingRecords, buildingRanges, buildingOfTriangle, buildingColors, buildingMaterials: [wallMaterial, roofMaterial] }
}

function tileOf(x: number, z: number): number {
  const column = THREE.MathUtils.clamp(Math.floor(((x + CITY_EXTENT) / (CITY_EXTENT * 2)) * TILES), 0, TILES - 1)
  const row = THREE.MathUtils.clamp(Math.floor(((z + CITY_EXTENT) / (CITY_EXTENT * 2)) * TILES), 0, TILES - 1)
  return row * TILES + column
}

/**
 * One building: a ring of walls, and a roof on top of them.
 *
 * A pitched roof is drawn as a truncated pyramid — the outline again, drawn in by a couple of metres
 * and lifted. It is not what a roof is, but at every distance the camera can reach it is what one
 * looks like, and it costs two triangles an edge instead of a hip-and-valley solver.
 */
function extrude(tile: Tile, building: BuildingRecord, rng: { next: () => number }, relief: Relief): void {
  const ring = building.footprint
  const corners = ring.length / 2
  if (corners < 3)
    return

  const start = tile.position.length / 3
  /*
   * Where the ground is under each corner, and the highest of them.
   *
   * A building has one floor level, and that level is the top of the ground it covers — put it any
   * lower and the uphill end of the building is inside the hill, which is precisely what a fifth of
   * the city was doing. The walls then reach down to their own corner's ground and a little past it,
   * so the downhill end is buried rather than standing on stilts.
   */
  const corner: number[] = Array.from({ length: corners })
  let ground = -Infinity
  for (let i = 0; i < corners; i += 1) {
    corner[i] = relief.height(ring[i * 2]!, ring[i * 2 + 1]!)
    ground = Math.max(ground, corner[i]!)
  }

  const wallTop = ground + Math.max(2 + PLINTH, building.height - building.roofHeight)
  /*
   * The floor sits a little above the ground it stands on, the way a real one does. Everything the
   * façade texture is mapped from starts here, so `v` is zero at the floor and never below it.
   */
  const floor = ground + PLINTH
  const wall = pick(WALL_COLOURS[building.type], rng).clone().multiplyScalar(0.84 + building.condition * 0.16)
  const plinth = wall.clone().multiplyScalar(PLINTH_SHADE)
  const roof = pick(ROOF_COLOURS[building.type], rng)
  tile.records.push(building)
  tile.colours.push(wall)

  // ---- walls ----
  const storeys = Math.max(1, Math.round((wallTop - floor) / STOREY_HEIGHT))
  for (let i = 0; i < corners; i += 1) {
    const j = (i + 1) % corners
    const ax = ring[i * 2]!
    const az = ring[i * 2 + 1]!
    const bx = ring[j * 2]!
    const bz = ring[j * 2 + 1]!
    const span = Math.hypot(bx - ax, bz - az)
    if (span < 0.05)
      continue

    // Counter-clockwise in x/z means the outward normal is the edge turned to the right.
    const nx = -(bz - az) / span
    const nz = (bx - ax) / span
    /*
     * Whole window bays along the wall and whole storeys up it. The texture is one storey by one bay,
     * so anything else cuts a window in half at the corner or at the roof — and it did both: `v` used
     * to run from the bottom of the buried skirt, which put the ground-floor row underground and
     * every row above it a third of a storey out.
     */
    const bays = Math.max(1, Math.round(span / BAY_WIDTH))
    const u0 = 0
    const u1 = bays
    const vTop = storeys

    /*
     * The base course first: from below this edge's own ground up to the floor. It carries no UVs
     * worth the name and goes in the roof's draw group, which has no façade texture on it at all —
     * so whatever the slope does here, no window can appear below the ground floor.
     */
    const base = tile.position.length / 3
    push(tile, ax, corner[i]! - SKIRT, az, nx, nz, 0, 0, plinth)
    push(tile, bx, corner[j]! - SKIRT, bz, nx, nz, 0, 0, plinth)
    push(tile, bx, floor, bz, nx, nz, 0, 0, plinth)
    push(tile, ax, floor, az, nx, nz, 0, 0, plinth)
    // Wound so the outward face is the one that is kept: a ring that is counter-clockwise on the
    // map is clockwise to a camera looking down at it, and the whole city was inside out.
    tile.roofIndex.push(base, base + 2, base + 1, base, base + 3, base + 2)

    // And the wall above it, one storey of façade per storey of building, starting at the floor.
    const vertex = tile.position.length / 3
    push(tile, ax, floor, az, nx, nz, u0, 0, wall)
    push(tile, bx, floor, bz, nx, nz, u1, 0, wall)
    push(tile, bx, wallTop, bz, nx, nz, u1, vTop, wall)
    push(tile, ax, wallTop, az, nx, nz, u0, vTop, wall)
    tile.wallIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
  }

  // ---- roof ----
  const capHeight = ground + building.height
  /*
   * A rectangle gets a real gable. Anything else — an L, a corner block, a five-sided house on a
   * bend — keeps the truncated pyramid, which is what a hipped roof looks like from any distance the
   * camera can reach and costs nothing to work out.
   */
  if (corners === 4 && building.roofHeight > 0.4) {
    gable(tile, ring, wallTop, capHeight, roof)
    tile.ranges.push({ start, count: tile.position.length / 3 - start })
    return
  }

  const cap = building.roofHeight > 0.4 ? inset(ring, ROOF_INSET) : ring
  if (building.roofHeight > 0.4) {
    for (let i = 0; i < corners; i += 1) {
      const j = (i + 1) % corners
      const vertex = tile.position.length / 3
      const ax = ring[i * 2]!
      const az = ring[i * 2 + 1]!
      const bx = ring[j * 2]!
      const bz = ring[j * 2 + 1]!
      const cx = cap[j * 2]!
      const cz = cap[j * 2 + 1]!
      const dx = cap[i * 2]!
      const dz = cap[i * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az) || 1
      const nx = -(bz - az) / span
      const nz = (bx - ax) / span
      push(tile, ax, wallTop, az, nx, nz, 0, 0, roof)
      push(tile, bx, wallTop, bz, nx, nz, 0, 0, roof)
      push(tile, cx, capHeight, cz, nx, nz, 0, 0, roof)
      push(tile, dx, capHeight, dz, nx, nz, 0, 0, roof)
      tile.roofIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
    }
  }

  /*
   * A parapet: the low wall a flat roof stops at. Without it a big block is a slab with a lid, which
   * is exactly how the towers read — the roof edge is most of what tells you a building has a top.
   */
  if (building.roofHeight <= 0.4 && building.height > 9) {
    for (let i = 0; i < corners; i += 1) {
      const j = (i + 1) % corners
      const vertex = tile.position.length / 3
      const ax = ring[i * 2]!
      const az = ring[i * 2 + 1]!
      const bx = ring[j * 2]!
      const bz = ring[j * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az) || 1
      const nx = -(bz - az) / span
      const nz = (bx - ax) / span
      push(tile, ax, wallTop, az, nx, nz, 0, 0, roof)
      push(tile, bx, wallTop, bz, nx, nz, 0, 0, roof)
      push(tile, bx, wallTop + PARAPET, bz, nx, nz, 0, 0, roof)
      push(tile, ax, wallTop + PARAPET, az, nx, nz, 0, 0, roof)
      tile.roofIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
    }
  }

  const capBase = tile.position.length / 3
  for (let i = 0; i < corners; i += 1)
    push(tile, cap[i * 2]!, capHeight, cap[i * 2 + 1]!, 0, 0, 0, 0, roof, true)
  for (const triangle of triangulate(cap))
    tile.roofIndex.push(capBase + triangle[2], capBase + triangle[1], capBase + triangle[0])

  tile.ranges.push({ start, count: tile.position.length / 3 - start })
}

/** Vertex with a horizontal normal, or an upward one for a roof cap. */
function push(tile: Tile, x: number, y: number, z: number, nx: number, nz: number, u: number, v: number, colour: THREE.Color, up = false): void {
  tile.position.push(x, y, z)
  tile.normal.push(up ? 0 : nx, up ? 1 : 0, up ? 0 : nz)
  tile.uv.push(u, v)
  tile.colour.push(colour.r, colour.g, colour.b)
}

/** Vertex with a normal of its own, which a sloping roof plane needs and the walls never do. */
function pushSloped(tile: Tile, x: number, y: number, z: number, normal: number[], colour: THREE.Color): void {
  tile.position.push(x, y, z)
  tile.normal.push(normal[0]!, normal[1]!, normal[2]!)
  tile.uv.push(0, 0)
  tile.colour.push(colour.r, colour.g, colour.b)
}

/**
 * A gabled roof on a rectangle: a ridge down its long axis, a slope either side of it and a
 * triangular wall closing each end.
 *
 * The ridge runs between the middles of the two short edges, which is what makes it the long axis
 * without having to measure an angle. The eaves reach past the long walls — across the ridge only,
 * so the gable ends stay flush with the wall below them and there is nothing to close up.
 */
function gable(tile: Tile, ring: number[], wallTop: number, ridgeHeight: number, colour: THREE.Color): void {
  const at = (index: number): [number, number] => [ring[(index % 4) * 2]!, ring[(index % 4) * 2 + 1]!]
  const [x0, z0] = at(0)
  const [x1, z1] = at(1)
  const [x2, z2] = at(2)
  const [x3, z3] = at(3)

  // Whichever pair of opposite edges is longer carries the eaves; the ridge runs between the others.
  const alongFirst = Math.hypot(x1 - x0, z1 - z0) >= Math.hypot(x2 - x1, z2 - z1)
  const eaveA = alongFirst ? [[x0, z0], [x1, z1]] : [[x1, z1], [x2, z2]]
  const eaveB = alongFirst ? [[x2, z2], [x3, z3]] : [[x3, z3], [x0, z0]]

  const midAx = (eaveA[0]![0]! + eaveA[1]![0]!) / 2
  const midAz = (eaveA[0]![1]! + eaveA[1]![1]!) / 2
  const midBx = (eaveB[0]![0]! + eaveB[1]![0]!) / 2
  const midBz = (eaveB[0]![1]! + eaveB[1]![1]!) / 2
  // Across the ridge: from one eave toward the other, which is the direction the eaves reach out in.
  const acrossLength = Math.hypot(midAx - midBx, midAz - midBz) || 1
  const acrossX = ((midAx - midBx) / acrossLength) * EAVES
  const acrossZ = ((midAz - midBz) / acrossLength) * EAVES

  const a0 = [eaveA[0]![0]! + acrossX, eaveA[0]![1]! + acrossZ]
  const a1 = [eaveA[1]![0]! + acrossX, eaveA[1]![1]! + acrossZ]
  const b0 = [eaveB[0]![0]! - acrossX, eaveB[0]![1]! - acrossZ]
  const b1 = [eaveB[1]![0]! - acrossX, eaveB[1]![1]! - acrossZ]
  // The ridge sits over the middle of the two short edges.
  const ridge0 = [(a1[0]! + b0[0]!) / 2, (a1[1]! + b0[1]!) / 2]
  const ridge1 = [(b1[0]! + a0[0]!) / 2, (b1[1]! + a0[1]!) / 2]

  const slope = (eave0: number[], eave1: number[], top0: number[], top1: number[]): void => {
    const normal = faceNormal(
      [eave0[0]!, wallTop, eave0[1]!],
      [eave1[0]!, wallTop, eave1[1]!],
      [top1[0]!, ridgeHeight, top1[1]!],
    )
    const vertex = tile.position.length / 3
    pushSloped(tile, eave0[0]!, wallTop, eave0[1]!, normal, colour)
    pushSloped(tile, eave1[0]!, wallTop, eave1[1]!, normal, colour)
    pushSloped(tile, top0[0]!, ridgeHeight, top0[1]!, normal, colour)
    pushSloped(tile, top1[0]!, ridgeHeight, top1[1]!, normal, colour)
    tile.roofIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
  }

  slope(a0, a1, ridge0, ridge1)
  slope(b0, b1, ridge1, ridge0)

  // The two gable walls, closing the ends under the ridge.
  const end = (left: number[], right: number[], apex: number[]): void => {
    const normal = faceNormal([left[0]!, wallTop, left[1]!], [right[0]!, wallTop, right[1]!], [apex[0]!, ridgeHeight, apex[1]!])
    const vertex = tile.position.length / 3
    pushSloped(tile, left[0]!, wallTop, left[1]!, normal, colour)
    pushSloped(tile, right[0]!, wallTop, right[1]!, normal, colour)
    pushSloped(tile, apex[0]!, ridgeHeight, apex[1]!, normal, colour)
    tile.roofIndex.push(vertex, vertex + 2, vertex + 1)
  }

  end(a1, b0, ridge0)
  end(b1, a0, ridge1)
}

/** The outward normal of a triangle, wound the way the roof indices are. */
function faceNormal(a: number[], b: number[], c: number[]): number[] {
  const ux = b[0]! - a[0]!
  const uy = b[1]! - a[1]!
  const uz = b[2]! - a[2]!
  const vx = c[0]! - a[0]!
  const vy = c[1]! - a[1]!
  const vz = c[2]! - a[2]!
  const nx = uz * vy - uy * vz
  const ny = ux * vz - uz * vx
  const nz = uy * vx - ux * vy
  const length = Math.hypot(nx, ny, nz) || 1
  return [nx / length, ny / length, nz / length]
}

/** Move every corner in toward the ring's centre, which is enough of a roof at this scale. */
function inset(ring: number[], amount: number): number[] {
  const corners = ring.length / 2
  let cx = 0
  let cz = 0
  for (let i = 0; i < ring.length; i += 2) {
    cx += ring[i]!
    cz += ring[i + 1]!
  }
  cx /= corners
  cz /= corners

  const out: number[] = []
  for (let i = 0; i < corners; i += 1) {
    const x = ring[i * 2]!
    const z = ring[i * 2 + 1]!
    const distance = Math.hypot(x - cx, z - cz) || 1
    const pull = Math.min(amount, distance * 0.42) / distance
    out.push(x + (cx - x) * pull, z + (cz - z) * pull)
  }
  return out
}

function triangulate(ring: number[]): [number, number, number][] {
  const contour: THREE.Vector2[] = []
  for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
  return THREE.ShapeUtils.triangulateShape(contour, []) as [number, number, number][]
}

/** A lookup from triangle index to the building it belongs to, built once for the picker. */
function triangleOwners(tile: Tile): Uint16Array {
  const total = (tile.wallIndex.length + tile.roofIndex.length) / 3
  const owners = new Uint16Array(total)
  const index = [...tile.wallIndex, ...tile.roofIndex]
  for (let triangle = 0; triangle < total; triangle += 1) {
    const vertex = index[triangle * 3]!
    // The ranges are in order, so the owning building is the last one that starts at or before it.
    let low = 0
    let high = tile.ranges.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (tile.ranges[middle]!.start <= vertex)
        low = middle
      else high = middle - 1
    }
    owners[triangle] = low
  }
  return owners
}

function pick(palette: string[] | undefined, rng: { next: () => number }): THREE.Color {
  const list = palette ?? ['#c8c4b8']
  return new THREE.Color(list[Math.floor(rng.next() * list.length)] ?? list[0]!)
}
