import type { AreaKind, CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'
import { terrainHeight } from '../../world/terrain'
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
/** Enough to carry hills two kilometres wide without faceting; 28k triangles for the whole country. */
const GROUND_SEGMENTS = 120
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
  const seed = blueprint.definition.seed
  const geometry = new THREE.PlaneGeometry(GROUND_SPAN, GROUND_SPAN, GROUND_SEGMENTS, GROUND_SEGMENTS)
  const position = geometry.attributes.position as THREE.BufferAttribute
  for (let index = 0; index < position.count; index += 1) {
    // The plane is built in its own XY and laid flat afterwards, so its y is the world's z.
    position.setZ(index, terrainHeight(position.getX(index), position.getY(index), seed))
  }
  geometry.computeVertexNormals()

  const texture = groundTexture()
  texture.repeat.set(GROUND_SPAN / 60, GROUND_SPAN / 60)
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture,
    color: '#59674a',
    roughness: 0.97,
    metalness: 0,
  }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  addAreas(scene, blueprint)
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
      position.push(ring[i]!, y, ring[i + 1]!)
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
