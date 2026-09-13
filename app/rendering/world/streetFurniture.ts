import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y, WHITE } from '../shared'

/**
 * What a pavement has on it.
 *
 * From a thousand metres up a city is its skyline; from twenty it is street signs, a skip outside a
 * house being gutted and the cones round a hole in the road. Without them the ground between the
 * buildings is empty tarmac, which is what made the city read as simple however good the buildings
 * got. All of it is the road kit, all of it instanced: six models, six draws, a couple of thousand
 * pieces.
 */

/** Roughly how far apart pieces are placed down a street, and how far off the kerb they stand. */
const SPACING = 58
const KERB = 1.9
/** Each model's height in metres and how often it comes up, relative to the others. */
const FURNITURE: Record<string, { height: number, share: number }> = {
  'road-sign-street': { height: 2.8, share: 3 },
  'road-sign-warning': { height: 2.6, share: 1.4 },
  'road-sign-stop': { height: 2.6, share: 1.2 },
  'construction-cone': { height: 0.7, share: 1.6 },
  'construction-barrier': { height: 1.1, share: 1.2 },
  'dumpster': { height: 1.6, share: 0.9 },
}
/** As many pieces as are worth the memory. Beyond this the streets are already furnished. */
const LIMIT = 2_200

export function addStreetFurniture(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): THREE.Group {
  const group = new THREE.Group()
  const pool = models.furniture
  if (pool.length === 0)
    return group

  const rng = createRandomStream(blueprint.definition.seed, 'furniture')
  const weights = pool.map(model => FURNITURE[model.id]?.share ?? 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const placements: { x: number, z: number, angle: number }[][] = pool.map(() => [])

  for (const road of blueprint.roads) {
    // A bridge has a parapet, not a pavement with bins on it — and its deck is not the ground.
    if (road.bridge)
      continue
    const points = road.path
    let carried = rng.next() * SPACING
    let side = 1
    for (let i = 0; i < points.length / 2 - 1; i += 1) {
      const ax = points[i * 2]!
      const az = points[i * 2 + 1]!
      const bx = points[(i + 1) * 2]!
      const bz = points[(i + 1) * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az)
      if (span < 0.5)
        continue
      const ux = (bx - ax) / span
      const uz = (bz - az) / span

      for (let t = SPACING - carried; t < span; t += SPACING) {
        const offset = (road.width / 2 + KERB) * side
        side = -side
        let roll = rng.next() * total
        let chosen = 0
        while (chosen < weights.length - 1 && roll > weights[chosen]!) {
          roll -= weights[chosen]!
          chosen += 1
        }
        placements[chosen]!.push({
          x: ax + ux * t - uz * offset,
          z: az + uz * t + ux * offset,
          // Signs face the street; everything else is dropped at whatever angle it landed.
          angle: Math.atan2(ux, uz) + (rng.next() - 0.5) * 0.5,
        })
      }
      carried = (carried + span) % SPACING
    }
    if (placements.reduce((sum, list) => sum + list.length, 0) > LIMIT)
      break
  }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  pool.forEach((model, index) => {
    const spots = placements[index]!
    if (spots.length === 0)
      return
    const size = (FURNITURE[model.id]?.height ?? 2) / Math.max(0.001, model.size.y)
    const mesh = new THREE.InstancedMesh(model.geometry, models.roadsMaterial, spots.length)
    spots.forEach((spot, instance) => {
      matrix.compose(
        position.set(spot.x, blueprint.relief.height(spot.x, spot.z), spot.z),
        quaternion.setFromAxisAngle(AXIS_Y, spot.angle),
        scale.setScalar(size),
      )
      mesh.setMatrixAt(instance, matrix)
      mesh.setColorAt(instance, WHITE)
    })
    // A bollard's shadow is not worth a second pass over every bollard in the city.
    mesh.castShadow = false
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    group.add(mesh)
  })

  scene.add(group)
  return group
}
