import type { AreaKind, CityBlueprint } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import * as THREE from 'three/webgpu'
import { groundVariation } from '../../world/terrain'
import { groundNormalTexture, groundTexture } from './groundTexture'

/**
 * The land, and every piece of ground the map calls something.
 *
 * The city's own plate is built on the relief's own lattice: one vertex per sample, at the sample's
 * own coordinate. That is not a detail. Everything that stands on the ground asks the relief how
 * high it is, and the ground can only draw straight lines between its vertices — so unless the
 * vertices *are* the samples, the two disagree, and a building placed at the height the relief gives
 * it stands several metres under the ground the player can see. Measured across the whole city, the
 * mesh and the field now differ by at most fifteen centimetres, all of it the twist inside a quad.
 *
 * On top of it lie the land-use polygons the map actually has — parks, grass, works, rail yards —
 * subdivided until no triangle spans more than about thirty metres, because a flat sheet over a
 * three-hundred-metre park sinks into the hill in the middle of it and the park disappears.
 */

/** The land reaches well past the point where haze has swallowed it, so it never shows an edge. */
const GROUND_SPAN = 22_000
/**
 * How far past the relief field the city plate carries on at the same spacing.
 *
 * The field stops at the edge of the extract and the buildings do not — they go right up to it. Out
 * there the plate keeps the field's own eighteen-metre step rather than handing over to the country
 * ring, whose cells are a hundred and thirty metres wide by then.
 */
const CITY_MARGIN = 12
/** The country around it, warped so its cells are finest where they meet the city. */
const COUNTRY_SEGMENTS = 120
/** How much of the country plate's middle is left out, so the city's own plate can fill it. */
const COUNTRY_HOLE = 1_600
/**
 * Land use sits just above the ground and below the roads.
 *
 * The step between overlapping polygons has to stay tiny. At a sixth of a centimetre each it was
 * four hundred and seventy of them, which lifted the last park three quarters of a metre into the
 * air — above the roads, which then vanished under the grass.
 */
const AREA_Y = 0.02
const AREA_STEP = 0.00008
/** No triangle of land use spans more than this, so the surface follows the ground under it. */
const AREA_SPAN = 30
/** Four splits turn one triangle into two hundred and fifty-six. Nothing needs more. */
const AREA_DEPTH_LIMIT = 4

const AREA_COLOURS: Record<AreaKind, string> = {
  water: '#2d556b',
  park: '#55713f',
  pitch: '#5f8044',
  forest: '#3e5d36',
  grass: '#5c6e40',
  industrial: '#5c5b52',
  commercial: '#605d55',
  construction: '#6d6453',
}

export function addGround(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const relief = blueprint.relief
  const material = new THREE.MeshStandardMaterial({
    map: groundTexture(),
    normalMap: groundNormalTexture(),
    normalScale: new THREE.Vector2(0.85, 0.85),
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
  })
  material.map!.repeat.set(GROUND_SPAN / 46, GROUND_SPAN / 46)
  material.normalMap!.repeat.set(GROUND_SPAN / 9, GROUND_SPAN / 9)

  /*
   * Two meshes, because one cannot be both. The city needs a vertex per relief sample; the country
   * needs to reach the horizon, where that spacing would be a thousand cells across.
   *
   * They overlap rather than meet: the ring's hole is well inside the city plate's edge, and a
   * shared edge between grids of different densities is a crack while an overlap is not. Both read
   * the same relief, so in the overlap they agree to the centimetre.
   */
  scene.add(cityPlate(relief, material))
  scene.add(countryRing(relief, material))

  addAreas(scene, blueprint)
}

/**
 * The city's ground: one vertex per relief sample, plus a margin of the same spacing around it.
 */
function cityPlate(relief: Relief, material: THREE.Material): THREE.Mesh {
  const first = -CITY_MARGIN
  const last = relief.size - 1 + CITY_MARGIN
  const across = last - first + 1
  const span = relief.cell * across
  const position: number[] = []
  const uv: number[] = []
  const colour: number[] = []
  const index: number[] = []

  for (let row = first; row <= last; row += 1) {
    for (let column = first; column <= last; column += 1) {
      const x = relief.coordinate(column)
      const z = relief.coordinate(row)
      position.push(x, relief.height(x, z), z)
      uv.push((x + span / 2) / span, (z + span / 2) / span)
      pushShade(colour, x, z, relief.seed)
    }
  }

  for (let row = 0; row < across - 1; row += 1) {
    for (let column = 0; column < across - 1; column += 1) {
      const a = row * across + column
      index.push(a, a + across, a + 1, a + 1, a + across, a + across + 1)
    }
  }

  return finish(position, uv, colour, index, material)
}

/**
 * The open country: a plane with a hole in it, its cells pulled toward the middle so what is left of
 * it is finest where it meets the city and coarsest at the horizon, where nothing is legible anyway.
 */
function countryRing(relief: Relief, material: THREE.Material): THREE.Mesh {
  const half = GROUND_SPAN / 2
  const step = GROUND_SPAN / COUNTRY_SEGMENTS
  const position: number[] = []
  const uv: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const map = new Map<number, number>()
  const warp = (value: number): number => (Math.abs(value) / half) ** 1.7 * half * Math.sign(value)

  const vertexAt = (column: number, row: number): number => {
    const key = row * (COUNTRY_SEGMENTS + 1) + column
    const existing = map.get(key)
    if (existing !== undefined)
      return existing
    const x = warp(-half + column * step)
    const z = warp(-half + row * step)
    const at = position.length / 3
    position.push(x, relief.height(x, z), z)
    uv.push((x + half) / GROUND_SPAN, (z + half) / GROUND_SPAN)
    pushShade(colour, x, z, relief.seed)
    map.set(key, at)
    return at
  }

  for (let row = 0; row < COUNTRY_SEGMENTS; row += 1) {
    for (let column = 0; column < COUNTRY_SEGMENTS; column += 1) {
      const x0 = warp(-half + column * step)
      const x1 = warp(-half + (column + 1) * step)
      const z0 = warp(-half + row * step)
      const z1 = warp(-half + (row + 1) * step)
      if (Math.max(Math.abs(x0), Math.abs(x1)) < COUNTRY_HOLE && Math.max(Math.abs(z0), Math.abs(z1)) < COUNTRY_HOLE)
        continue
      const a = vertexAt(column, row)
      const b = vertexAt(column + 1, row)
      const c = vertexAt(column, row + 1)
      const d = vertexAt(column + 1, row + 1)
      index.push(a, c, b, b, c, d)
    }
  }

  return finish(position, uv, colour, index, material)
}

/**
 * How light or dark the ground is here.
 *
 * A single tone over twenty kilometres reads as a carpet however good the texture on it is, because
 * the texture repeats three hundred times and the eye finds the repeat. This varies the colour on a
 * scale of a kilometre and a half, drawn from the same noise as the hills — so a rise and the drier
 * grass on it agree — and the repeat stops being findable.
 */
function pushShade(colour: number[], x: number, z: number, seed: number): void {
  const variation = groundVariation(x, z, seed)
  const dry = 0.78 + variation * 0.44
  /*
   * Written straight into the buffer, so these are linear and not the sRGB a hex string would be.
   * The base is the olive the whole country used to be painted in, #59674a, converted once by hand.
   */
  colour.push(0.100 * dry, 0.136 * dry * (1.07 - variation * 0.16), 0.068 * dry)
}

function finish(position: number[], uv: number[], colour: number[], index: number[], material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

/**
 * Every land-use polygon, laid on the ground and merged into one mesh.
 *
 * They are drawn in the order the converter sorted them — largest first — so a park inside a works
 * still reads as a park. Four hundred and seventy polygons, one draw call.
 */
function addAreas(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const relief = blueprint.relief
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const tint = new THREE.Color()
  const contour: THREE.Vector2[] = []

  blueprint.areas.forEach((area, order) => {
    // Water has its own surface, its own material and its own movement; see `water.ts`.
    if (area.kind === 'water')
      return
    const ring = area.polygon
    if (ring.length < 6)
      return

    contour.length = 0
    for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []) as [number, number, number][]
    if (triangles.length === 0)
      return

    tint.set(AREA_COLOURS[area.kind])
    /*
     * A hair of height per polygon in draw order. They overlap constantly in real data — a pitch
     * inside a park inside a grass field — and coplanar overlapping polygons is the one thing a
     * depth buffer cannot resolve at any precision.
     */
    const lift = AREA_Y + order * AREA_STEP

    for (const triangle of triangles) {
      // Flipped for the same reason the roofs are: a ring wound counter-clockwise on a map faces
      // away from a camera looking down on it once its y and z change places.
      const a = contour[triangle[2]]!
      const b = contour[triangle[1]]!
      const c = contour[triangle[0]]!
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
      const depth = Math.min(AREA_DEPTH_LIMIT, Math.max(0, Math.ceil(Math.log2(longest / AREA_SPAN))))
      split(a, b, c, depth, (px, pz) => {
        const at = position.length / 3
        position.push(px, lift + relief.height(px, pz), pz)
        normal.push(0, 1, 0)
        uv.push(px / 22, pz / 22)
        colour.push(tint.r, tint.g, tint.b)
        index.push(at)
      })
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()

  const texture = groundTexture()
  texture.repeat.set(1, 1)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }))
  mesh.receiveShadow = true
  scene.add(mesh)
}

/**
 * Cut a triangle into four, `depth` times over, and hand every corner to `emit`.
 *
 * Every edge is split at its midpoint, so two triangles that shared an edge before the split share
 * both halves of it afterwards — there is no crack between them as long as they were cut the same
 * number of times, which is why the depth is worked out from the triangle and not from the piece.
 */
function split(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth: number, emit: (x: number, z: number) => void): void {
  if (depth <= 0) {
    emit(a.x, a.y)
    emit(b.x, b.y)
    emit(c.x, c.y)
    return
  }
  const ab = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5)
  const bc = new THREE.Vector2().addVectors(b, c).multiplyScalar(0.5)
  const ca = new THREE.Vector2().addVectors(c, a).multiplyScalar(0.5)
  split(a, ab, ca, depth - 1, emit)
  split(ab, b, bc, depth - 1, emit)
  split(ca, bc, c, depth - 1, emit)
  split(ab, bc, ca, depth - 1, emit)
}
