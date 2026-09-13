import type { Relief } from '../../world/relief'
import type { CityModels } from '../cityModels'
import type { RoadNetwork } from './roadNetwork'
import type { SignalPlan } from './signalPlan'
import * as THREE from 'three/webgpu'
import { AXIS_Y, WHITE } from '../shared'
import { glowTexture } from '../sky/textures'
import { phaseOf, planSignals } from './signalPlan'

/**
 * The heads on the poles: the signal plan, drawn.
 *
 * Which junctions are signalled and what they are showing is decided in `signalPlan.ts`, which the
 * traffic obeys. This puts a pole at the kerb on every approach and a lamp in it, and paints the
 * lamp with what its own phase is showing — so what the player sees and what the cars are doing are
 * the same answer read twice, never two copies of it.
 */

/** How far back from the middle of the junction a head stands, and how high its lamp sits. */
const SETBACK = 11
const HEAD_HEIGHT = 3.6
const TRAFFIC_LIGHT_HEIGHT = 4
/** The lamp itself: a small glow, facing the traffic it is stopping. */
const LAMP_SIZE = 1.6

const RED = /* @__PURE__ */ new THREE.Color('#ff2f21')
const AMBER_LAMP = /* @__PURE__ */ new THREE.Color('#ffb020')
const GO = /* @__PURE__ */ new THREE.Color('#3cff72')

export interface TrafficSignals {
  plan: SignalPlan
  lamps: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null
  /** Which signal and which phase each lamp instance belongs to. */
  lampSignal: Int32Array
  lampGroup: Int8Array
}

export function addTrafficLights(scene: THREE.Scene, network: RoadNetwork, relief: Relief, models: CityModels): TrafficSignals {
  const plan = planSignals(network)
  const placements: { x: number, z: number, bearing: number, signal: number, group: number }[] = []

  plan.signals.forEach((signal, index) => {
    for (const approach of signal.approaches) {
      const setback = Math.min(SETBACK, network.edges[approach.edge]!.length * 0.4)
      const kerb = approach.width / 2 + 1.6
      placements.push({
        // Back up the approach, and out to the kerb on the hand the traffic arrives on.
        x: signal.x + Math.sin(approach.bearing) * setback - Math.cos(approach.bearing) * kerb,
        z: signal.z + Math.cos(approach.bearing) * setback + Math.sin(approach.bearing) * kerb,
        // The head looks back out along the approach, at the traffic coming toward the junction.
        bearing: approach.bearing,
        signal: index,
        group: approach.group,
      })
    }
  })

  const signals: TrafficSignals = {
    plan,
    lamps: null,
    lampSignal: Int32Array.from(placements.map(entry => entry.signal)),
    lampGroup: Int8Array.from(placements.map(entry => entry.group)),
  }
  if (placements.length === 0)
    return signals

  const model = models.trafficLight
  const poles = new THREE.InstancedMesh(
    model?.geometry ?? new THREE.BoxGeometry(0.3, TRAFFIC_LIGHT_HEIGHT, 0.3),
    models.roadsMaterial,
    placements.length,
  )
  const size = TRAFFIC_LIGHT_HEIGHT / Math.max(0.001, model?.size.y ?? TRAFFIC_LIGHT_HEIGHT)

  const lamps = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(LAMP_SIZE, LAMP_SIZE),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    placements.length,
  ) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  placements.forEach((entry, index) => {
    const ground = relief.height(entry.x, entry.z)
    quaternion.setFromAxisAngle(AXIS_Y, entry.bearing)
    matrix.compose(position.set(entry.x, ground, entry.z), quaternion, scale.setScalar(size))
    poles.setMatrixAt(index, matrix)
    poles.setColorAt(index, WHITE)

    // The lamp sits just in front of the head, facing back up the approach at the drivers.
    matrix.compose(
      position.set(entry.x + Math.sin(entry.bearing) * 0.5, ground + HEAD_HEIGHT, entry.z + Math.cos(entry.bearing) * 0.5),
      quaternion,
      scale.setScalar(1),
    )
    lamps.setMatrixAt(index, matrix)
    lamps.setColorAt(index, RED)
  })

  poles.castShadow = true
  poles.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  lamps.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  lamps.renderOrder = 1
  scene.add(poles, lamps)

  signals.lamps = lamps
  return signals
}

/** Paint every head with what its junction is showing. One instance colour upload for the city. */
export function updateSignals(signals: TrafficSignals, elapsed: number): void {
  const lamps = signals.lamps
  if (!lamps)
    return
  for (let index = 0; index < signals.lampSignal.length; index += 1) {
    const signal = signals.plan.signals[signals.lampSignal[index]!]
    if (!signal)
      continue
    const phase = phaseOf(signal, elapsed)
    const mine = signals.lampGroup[index]! * 2
    lamps.setColorAt(index, phase === mine ? GO : phase === mine + 1 ? AMBER_LAMP : RED)
  }
  if (lamps.instanceColor)
    lamps.instanceColor.needsUpdate = true
}
