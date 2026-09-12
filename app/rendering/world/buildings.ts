import type { BuildingRecord, BuildingType, CityBlueprint } from '../../core/contracts'
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

/** How many tiles across the city is cut into. Four is thirty-two draws for the entire skyline. */
const TILES = 4
const CITY_EXTENT = 1_500
/** How far a roof draws in from the wall below it. A pitched roof is a truncated pyramid. */
const ROOF_INSET = 2.4
/** How far a building's walls are buried, so no footprint corner ends up hanging over a slope. */
const SKIRT = 4

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
      extrude(tile, building, rng, relief.height(building.x, building.z))
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
function extrude(tile: Tile, building: BuildingRecord, rng: { next: () => number }, ground: number): void {
  const ring = building.footprint
  const corners = ring.length / 2
  if (corners < 3)
    return

  const start = tile.position.length / 3
  /*
   * The walls start below the ground rather than on it. The terrain mesh is coarser than a footprint
   * is wide, so a building placed exactly at its centre's height leaves a gap on the uphill corner;
   * a skirt buried in the hillside costs two triangles an edge and there is never a gap.
   */
  const base = ground - SKIRT
  const wallTop = ground + Math.max(2, building.height - building.roofHeight)
  const wall = pick(WALL_COLOURS[building.type], rng).clone().multiplyScalar(0.84 + building.condition * 0.16)
  const roof = pick(ROOF_COLOURS[building.type], rng)
  tile.records.push(building)
  tile.colours.push(wall)

  // ---- walls ----
  let along = 0
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
    const u0 = along / BAY_WIDTH
    const u1 = (along + span) / BAY_WIDTH
    const v = (wallTop - base) / STOREY_HEIGHT
    along += span

    const vertex = tile.position.length / 3
    push(tile, ax, base, az, nx, nz, u0, 0, wall)
    push(tile, bx, base, bz, nx, nz, u1, 0, wall)
    push(tile, bx, wallTop, bz, nx, nz, u1, v, wall)
    push(tile, ax, wallTop, az, nx, nz, u0, v, wall)
    // Wound so the outward face is the one that is kept: a ring that is counter-clockwise on the
    // map is clockwise to a camera looking down at it, and the whole city was inside out.
    tile.wallIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
  }

  // ---- roof ----
  const cap = building.roofHeight > 0.4 ? inset(ring, ROOF_INSET) : ring
  const capHeight = ground + building.height
  if (building.roofHeight > 0.4) {
    for (let i = 0; i < corners; i += 1) {
      const j = (i + 1) % corners
      const base = tile.position.length / 3
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
      tile.roofIndex.push(base, base + 2, base + 1, base, base + 3, base + 2)
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
