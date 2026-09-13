import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y } from '../shared'
import { CAR_PAINT, carProxyGeometry, carProxyMaterial } from './carProxy'
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
const LIMIT = 2_600

export function addParkedCars(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): THREE.InstancedMesh[] {
  const rng = createRandomStream(blueprint.definition.seed, 'parking')
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const paint = CAR_PAINT.map(colour => new THREE.Color(colour))
  const placements: { matrix: THREE.Matrix4, colour: THREE.Color }[] = []

  for (const road of blueprint.roads) {
    if (placements.length >= LIMIT)
      break
    // Nothing parks on a bridge: there is a parapet where the kerb would be.
    if (road.bridge || road.width < MIN_WIDTH)
      continue

    const points = road.path
    let carried = rng.next() * SPACING
    for (let i = 0; i < points.length / 2 - 1 && placements.length < LIMIT; i += 1) {
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
          placements.push({
            matrix: new THREE.Matrix4().compose(
              position.set(x, blueprint.relief.height(x, z), z),
              // Facing whichever way the traffic on that side runs, give or take a badly parked one.
              quaternion.setFromAxisAngle(AXIS_Y, facing + (side > 0 ? 0 : Math.PI) + rng.between(-0.04, 0.04)),
              scale,
            ),
            colour: paint[Math.floor(rng.next() * paint.length)]!,
          })
        }
      }
      carried = (carried + span) % SPACING
    }
  }

  /*
   * One geometry and one material for every parked car in the city, tiled so the camera can drop
   * most of it. Thirty triangles apiece against the kit model's two thousand — see `carProxy.ts` for
   * why a parked car is the one place in the city where that trade is obviously right.
   */
  void models
  return addTiled(scene, carProxyGeometry(), carProxyMaterial(), placements, (mesh) => {
    /*
     * No shadow. A parked car is a shadow the length of a kerbstone, falling on a road already in the
     * shade of the building behind it, and casting doubled the whole set.
     */
    mesh.castShadow = false
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  }).meshes
}
