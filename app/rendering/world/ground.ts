import type { AreaKind, CityBlueprint } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import * as THREE from 'three/webgpu'
import { groundTexture } from './groundTexture'

/**
 * The land, the water on it and every piece of ground the map calls something.
 *
 * One mesh carries the country: a plane with relief that starts once it is past the built-up area,
 * textured rather than flat-coloured, because a single tone over twenty kilometres is a carpet. On
 * top of it lie the land-use polygons the map actually has — parks, grass, works, rail yards, water
 * — each triangulated and laid flat. That is where the city's colour comes from now; it used to be
 * a guess made from how many buildings happened to fall in a 180-metre square.
 */

/** The land reaches well past the point where haze has swallowed it, so it never shows an edge. */
const GROUND_SPAN = 22_000
/** The city's own plate: three and a half kilometres at a vertex every twenty metres. */
const CITY_PLATE = 3_600
const CITY_SEGMENTS = 180
/** The country around it, warped so its cells are finest where they meet the city. */
const COUNTRY_SEGMENTS = 120
/**
 * Land use sits just above the ground and below the roads.
 *
 * The step between overlapping polygons has to stay tiny. At a sixth of a centimetre each it was
 * four hundred and seventy of them, which lifted the last park three quarters of a metre into the
 * air — above the roads, which then vanished under the grass.
 */
const AREA_Y = 0.02
const AREA_STEP = 0.00008

const AREA_COLOURS: Record<AreaKind, string> = {
  water: '#2d556b',
  park: '#4f6b3f',
  pitch: '#5b7a45',
  forest: '#3c5a38',
  grass: '#57683f',
  industrial: '#5a5a53',
  commercial: '#5d5b55',
  construction: '#6b6353',
}

export function addGround(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const relief = blueprint.relief
  const material = new THREE.MeshStandardMaterial({ map: groundTexture(), color: '#59674a', roughness: 0.97, metalness: 0 })
  const texture = material.map!
  texture.repeat.set(GROUND_SPAN / 60, GROUND_SPAN / 60)

  /*
   * Two meshes, because one cannot be both. The city needs a vertex every twenty metres — the relief
   * runs to forty-odd metres over a few hundred, and a coarser grid leaves buildings hanging over a
   * slope the ground does not have there. The country needs to reach the horizon, where a vertex
   * every twenty metres would be four thousand cells across.
   *
   * The ring's hole is a cell smaller than the inner plane, so the two overlap rather than meet;
   * a shared edge between grids of different densities is a crack, an overlap is not. Both read the
   * same relief, so in the overlap they agree to the centimetre.
   */
  scene.add(plate(relief, material, CITY_PLATE, CITY_SEGMENTS, 0.02, null))
  scene.add(plate(relief, material, GROUND_SPAN, COUNTRY_SEGMENTS, 0, CITY_PLATE / 2 - GROUND_SPAN / COUNTRY_SEGMENTS))

  addAreas(scene, blueprint)
}

/**
 * A square of ground.
 *
 * `hole` skips every quad that lies entirely inside that half-extent, which is what turns the
 * country plate into a ring. `warp` pulls the country's vertices toward the middle so what is left
 * of it is finest where it meets the city.
 */
function plate(relief: Relief, material: THREE.Material, span: number, segments: number, lift: number, hole: number | null): THREE.Mesh {
  const step = span / segments
  const half = span / 2
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const map = new Map<number, number>()

  const vertexAt = (column: number, row: number): number => {
    const key = row * (segments + 1) + column
    const existing = map.get(key)
    if (existing !== undefined)
      return existing
    const x = warp(-half + column * step, half, hole !== null)
    const z = warp(-half + row * step, half, hole !== null)
    const at = position.length / 3
    position.push(x, relief.height(x, z) + lift, z)
    uv.push((x + half) / span, (z + half) / span)
    map.set(key, at)
    return at
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const x0 = warp(-half + column * step, half, hole !== null)
      const x1 = warp(-half + (column + 1) * step, half, hole !== null)
      const z0 = warp(-half + row * step, half, hole !== null)
      const z1 = warp(-half + (row + 1) * step, half, hole !== null)
      if (hole !== null && Math.max(Math.abs(x0), Math.abs(x1)) < hole && Math.max(Math.abs(z0), Math.abs(z1)) < hole)
        continue
      const a = vertexAt(column, row)
      const b = vertexAt(column + 1, row)
      const c = vertexAt(column, row + 1)
      const d = vertexAt(column + 1, row + 1)
      index.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

/** Cells pulled toward the middle, so the country plate is finest where the city ends. */
function warp(value: number, half: number, enabled: boolean): number {
  if (!enabled)
    return value
  const t = Math.abs(value) / half
  return t ** 1.7 * half * Math.sign(value)
}

/**
 * Every land-use polygon, triangulated and merged into one mesh.
 *
 * They are drawn in the order the converter sorted them — largest first — so a park inside a works
 * still reads as a park. Four hundred and seventy polygons, one draw call.
 */
function addAreas(scene: THREE.Scene, blueprint: CityBlueprint): void {
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
    const corners = ring.length / 2
    if (corners < 3)
      return

    contour.length = 0
    for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []) as [number, number, number][]
    if (triangles.length === 0)
      return

    tint.set(AREA_COLOURS[area.kind])
    const base = position.length / 3
    /*
     * A hair of height per polygon in draw order. They overlap constantly in real data — a pitch
     * inside a park inside a grass field — and coplanar overlapping polygons is the one thing a
     * depth buffer cannot resolve at any precision.
     */
    const y = AREA_Y + order * AREA_STEP
    for (let i = 0; i < ring.length; i += 2) {
      position.push(ring[i]!, y + blueprint.relief.height(ring[i]!, ring[i + 1]!), ring[i + 1]!)
      normal.push(0, 1, 0)
      uv.push(ring[i]! / 22, ring[i + 1]! / 22)
      colour.push(tint.r, tint.g, tint.b)
    }
    // Flipped for the same reason the roofs are: a ring wound counter-clockwise on a map faces away
    // from a camera looking down on it once its y and z change places.
    for (const triangle of triangles)
      index.push(base + triangle[2], base + triangle[1], base + triangle[0])
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
  }))
  mesh.receiveShadow = true
  scene.add(mesh)
}
