import type { CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'
import { groundVariation, terrainHeight } from '../../world/terrain'

/** The land, the river in it and the two promenades along its banks. */

/** The land reaches well past the point where haze has swallowed it, so it never shows an edge. */
const GROUND_SPAN = 22_000
/** Enough to carry hills two kilometres wide without faceting; 28k triangles for the whole country. */
const GROUND_SEGMENTS = 120
/** Where the river runs. The outskirts read the same figure, so nothing is ever built in the water. */
export const RIVER_X = -1_050

export function addGround(scene: THREE.Scene, blueprint: CityBlueprint): void {
  /*
   * One mesh for the whole land, not a small square laid on a big one. The two used to sit five
   * centimetres apart, which the depth buffer can resolve at close range and cannot at two
   * kilometres — hence a ground that flickered the moment the player zoomed out.
   *
   * It carries its own relief past the city: a flat plate under a sky has no horizon, only an edge.
   */
  const seed = blueprint.definition.seed
  const geometry = new THREE.PlaneGeometry(GROUND_SPAN, GROUND_SPAN, GROUND_SEGMENTS, GROUND_SEGMENTS)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const colours = new Float32Array(position.count * 3)
  const meadow = new THREE.Color('#4e6149')
  const upland = new THREE.Color('#6f6c4d')
  const pasture = new THREE.Color('#5f7048')
  const tint = new THREE.Color()

  for (let index = 0; index < position.count; index += 1) {
    // The plane is built in its own XY and laid flat afterwards, so its y is the world's z.
    const x = position.getX(index)
    const z = position.getY(index)
    const height = terrainHeight(x, z, seed)
    position.setZ(index, height)
    /*
     * Two things colour the land: how high it is, and the same noise the hills are made of. Without
     * the second it was one flat tone from the city limit to the horizon — a carpet, not a country.
     */
    tint.copy(meadow).lerp(pasture, groundVariation(x, z, seed))
    tint.lerp(upland, Math.min(1, height / 190))
    colours[index * 3] = tint.r
    colours[index * 3 + 1] = tint.g
    colours[index * 3 + 2] = tint.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geometry.computeVertexNormals()

  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(250, GROUND_SPAN),
    new THREE.MeshStandardMaterial({ color: '#315e70', roughness: 0.25, metalness: 0.08 }),
  )
  river.rotation.x = -Math.PI / 2
  river.position.set(RIVER_X, 0.34, 0)
  scene.add(river)

  const promenadeMaterial = new THREE.MeshStandardMaterial({ color: '#b7afa0', roughness: 0.9 })
  for (const x of [-1_188, -912]) {
    const promenade = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 3_050), promenadeMaterial)
    promenade.position.set(x, 0.55, 0)
    promenade.receiveShadow = true
    scene.add(promenade)
  }
}

/**
 * The city thins out instead of stopping.
 *
 * Two different kinds of thinning, because a single even smear around a circle reads as exactly what
 * it is. First a suburban belt that keeps the street rhythm and follows an irregular edge — the city
 * limit wanders in and out rather than tracing a square. Then villages: a few dozen small clusters
 * scattered across the hills with empty land between them, which is what actually sits around a city
 * of this size.
 *
 * None of it is ever touched by the simulation. It is generated here, from its own seeded stream,
 * and never appears in the blueprint.
 */
