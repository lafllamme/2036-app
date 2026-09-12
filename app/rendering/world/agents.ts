import * as THREE from 'three/webgpu'
import { AXIS_Y } from '../shared'

/**
 * Traffic and pedestrians: the only things in the city that move on their own.
 *
 * Both are instanced and both are distance-gated, because they are also the only things whose
 * matrices have to be rewritten and re-uploaded while they are on screen. What the player can no
 * longer make out is not animated at all.
 */

const CAR_COUNT = 180
const WALKER_COUNT = 320
/** The city's span, which is also the distance a car travels before it wraps around. */
const CITY_SPAN = 2_880
/** Above these camera distances a car is a few pixels and a pedestrian is less than one. */
const CAR_RANGE = 2_600
const WALKER_RANGE = 1_100

export interface Agents {
  cars: THREE.InstancedMesh
  pedestrians: THREE.InstancedMesh
}

export function createAgents(scene: THREE.Scene): Agents {
  const cars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(8.4, 3.2, 4),
    new THREE.MeshStandardMaterial({ color: '#c54a3d', roughness: 0.5, metalness: 0.18, vertexColors: true }),
    CAR_COUNT,
  )
  const carPalette = ['#c94b3e', '#d9d2c2', '#274f63', '#323638', '#d6a636', '#66715d']
  for (let index = 0; index < CAR_COUNT; index += 1) cars.setColorAt(index, new THREE.Color(carPalette[index % carPalette.length]))
  cars.castShadow = true
  scene.add(cars)

  const pedestrians = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.62, 1.8, 3, 5),
    new THREE.MeshStandardMaterial({ color: '#d6c9b5', roughness: 0.88, vertexColors: true }),
    WALKER_COUNT,
  )
  const peoplePalette = ['#d85848', '#315d70', '#d6b258', '#39473d', '#efe5d1', '#895f74']
  for (let index = 0; index < WALKER_COUNT; index += 1) pedestrians.setColorAt(index, new THREE.Color(peoplePalette[index % peoplePalette.length]))
  pedestrians.castShadow = true
  scene.add(pedestrians)
  return { cars, pedestrians }
}

/** Scratch instances reused across calls, so the loop allocates nothing at all. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

/**
 * Move everything that moves.
 *
 * `elapsed` is render time rather than campaign time on purpose: traffic keeps flowing while the
 * player has the campaign paused, because a city that freezes mid-junction reads as a bug rather
 * than as a pause.
 */
export function updateAgents(agents: Agents, elapsed: number, cameraDistance: number, trafficFactor: number): void {
  const visibleCars = cameraDistance > CAR_RANGE ? 0 : Math.floor(CAR_COUNT * trafficFactor)
  agents.cars.count = visibleCars
  for (let index = 0; index < visibleCars; index += 1) {
    const horizontal = index % 2 === 0
    const lane = ((index * 7) % 16) - 8
    const cross = lane * 180 + (index % 4 < 2 ? 8 : -8)
    const direction = index % 3 === 0 ? -1 : 1
    const progress = ((elapsed * (13 + (index % 7)) * direction + index * 93) % CITY_SPAN + CITY_SPAN) % CITY_SPAN - CITY_SPAN / 2
    const x = horizontal ? progress : cross
    const z = horizontal ? cross : progress
    quaternion.setFromAxisAngle(AXIS_Y, horizontal ? 0 : Math.PI / 2)
    matrix.compose(position.set(x, 2.15, z), quaternion, scale)
    agents.cars.setMatrixAt(index, matrix)
  }
  if (visibleCars > 0)
    agents.cars.instanceMatrix.needsUpdate = true

  const walkers = cameraDistance > WALKER_RANGE ? 0 : WALKER_COUNT
  agents.pedestrians.count = walkers
  if (walkers === 0)
    return

  quaternion.identity()
  for (let index = 0; index < walkers; index += 1) {
    const horizontal = index % 2 === 0
    const block = ((index * 11) % 16) - 8
    const cross = block * 180 + (index % 4 < 2 ? 20 : -20)
    const progress = ((elapsed * (1.2 + (index % 5) * 0.18) + index * 51) % CITY_SPAN) - CITY_SPAN / 2
    const x = horizontal ? progress : cross
    const z = horizontal ? cross : progress
    matrix.compose(position.set(x, 2.25, z), quaternion, scale)
    agents.pedestrians.setMatrixAt(index, matrix)
  }
  agents.pedestrians.instanceMatrix.needsUpdate = true
}
