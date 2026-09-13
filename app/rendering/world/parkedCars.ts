import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { COMMON_VEHICLES } from '../cityModels'
import { AXIS_Y, WHITE } from '../shared'
import { addTiled } from './tiledInstances'

/**
 * The cars that are not going anywhere.
 *
 * The cheapest thing in the whole city per unit of life it adds. A parked car never moves, so it is
 * one matrix written once at build time and never touched again — no per-frame work at all, against
 * a driving car's rewrite and buffer upload thirty times a second. And an empty kerb is most of why
 * a street with traffic on it still reads as a model of a street: real streets are lined with parked
 * cars, and until now not one of Lindenhafen's was.
 *
 * Only ordinary cars park. A police car at the kerb with nobody in it reads as an incident, and an
 * ambulance reads as a worse one.
 */

/** How far apart parked cars stand, and how far from the centre line. */
const SPACING = 6.4
const KERB = 0.4
/** Only streets wide enough for a car to stand at the side of without blocking it. */
const MIN_WIDTH = 7.5
/** How much of the kerb is taken. A city is never fully parked and never empty either. */
const OCCUPANCY = 0.62
/**
 * As many as are worth the geometry.
 *
 * A kit car is two thousand triangles, which is eight times what it looks like it should be and the
 * thing that has to be budgeted around: three and a half thousand parked cars came to seven and a
 * half million triangles, more than the rest of the city put together. Tiling means only the ones
 * near the camera are drawn, and this is what the whole set costs in memory.
 */
const LIMIT = 1_900
const CAR_LENGTH = 4.4

export function addParkedCars(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): THREE.InstancedMesh[] {
  const pool = models.vehicles.filter(model => COMMON_VEHICLES.includes(model.id))
  if (pool.length === 0)
    return []

  const rng = createRandomStream(blueprint.definition.seed, 'parking')
  const spots: { x: number, z: number, y: number, angle: number }[][] = pool.map(() => [])
  let placed = 0

  for (const road of blueprint.roads) {
    if (placed >= LIMIT)
      break
    // Nothing parks on a bridge: there is a parapet where the kerb would be.
    if (road.bridge || road.width < MIN_WIDTH)
      continue

    const points = road.path
    let carried = rng.next() * SPACING
    for (let i = 0; i < points.length / 2 - 1 && placed < LIMIT; i += 1) {
      const ax = points[i * 2]!
      const az = points[i * 2 + 1]!
      const bx = points[(i + 1) * 2]!
      const bz = points[(i + 1) * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az)
      if (span < 1)
        continue
      const ux = (bx - ax) / span
      const uz = (bz - az) / span
      const facing = Math.atan2(ux, uz)

      for (let along = SPACING - carried; along < span; along += SPACING) {
        for (const side of [1, -1]) {
          if (rng.next() > OCCUPANCY)
            continue
          // Half the lane out from the centre, which is where a car stands at a German kerb.
          const offset = (road.width / 2 - 1.1 - KERB) * side
          const x = ax + ux * along - uz * offset
          const z = az + uz * along + ux * offset
          const chosen = Math.floor(rng.next() * pool.length)
          spots[chosen]!.push({
            x,
            z,
            y: blueprint.relief.height(x, z),
            // Facing whichever way the traffic on that side runs, give or take a badly parked one.
            angle: facing + (side > 0 ? 0 : Math.PI) + rng.between(-0.04, 0.04),
          })
          placed += 1
        }
      }
      carried = (carried + span) % SPACING
    }
  }

  return build(scene, pool, spots, models)
}

function build(
  scene: THREE.Scene,
  pool: CityModels['vehicles'],
  spots: { x: number, z: number, y: number, angle: number }[][],
  models: CityModels,
): THREE.InstancedMesh[] {
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const meshes: THREE.InstancedMesh[] = []

  pool.forEach((model, index) => {
    const crew = spots[index]!
    if (crew.length === 0)
      return
    const size = CAR_LENGTH / Math.max(0.001, Math.max(model.size.x, model.size.z))
    const geometry = model.geometry.clone()
    geometry.scale(size, size, size)

    /*
     * Tiled rather than one mesh for the city. A parked car is two thousand triangles and there are
     * hundreds of them; in one mesh the whole set is submitted from every camera position, because a
     * bounding sphere three kilometres wide is never off screen.
     */
    const tiled = addTiled(
      scene,
      geometry,
      models.vehicleMaterial,
      crew.map(spot => ({
        matrix: new THREE.Matrix4().compose(
          position.set(spot.x, spot.y + 0.05, spot.z),
          quaternion.setFromAxisAngle(AXIS_Y, spot.angle),
          scale,
        ),
        colour: WHITE,
      })),
      (mesh) => {
        /*
         * No shadow. A parked car is two thousand triangles and there are two thousand of them, so
         * casting doubles the heaviest set in the city for a shadow the length of a kerbstone that
         * falls on a road already in the shade of the building behind it.
         */
        mesh.castShadow = false
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      },
    )
    meshes.push(...tiled.meshes)
  })

  return meshes
}
