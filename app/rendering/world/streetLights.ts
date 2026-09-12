import type { CityBlueprint } from '../../core/contracts'
import type { StandardInstancedMesh } from '../shared'
import * as THREE from 'three/webgpu'
import { AXIS_Y, FLAT } from '../shared'
import { glowTexture } from '../sky/textures'

/** The city's own light at night: lamp heads that glow and the pools they throw on the asphalt. */
export interface StreetLights {
  heads: StandardInstancedMesh
  pools: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
}

/** Street lighting: how far apart the lamps stand, how tall they are, how wide their pool falls. */
const LAMP_SPACING = 42
/** Only the streets a city would actually light down their whole length. */
const LAMP_MIN_WIDTH = 9
const LAMP_LIMIT = 900
const LAMP_HEIGHT = 11
const LAMP_POOL = 46

/**
 * Lamps down the arterials. Every one is an instance of the same three shapes, so the whole of the
 * city's night lighting is three draw calls and no actual lights — a real point light per lamp would
 * mean two hundred and sixty of them in a forward renderer, and the look does not need it: a glowing
 * head and a warm pool on the road read as street lighting from every distance the camera allows.
 */
export function addStreetLights(scene: THREE.Scene, blueprint: CityBlueprint): StreetLights {
  /*
   * Lamps walk the real street network now rather than a grid of arterials: every so many metres
   * along a street wide enough to be lit, offset to alternating kerbs. A city's night shape is its
   * street plan picked out in orange, so it has to follow the streets it actually has.
   */
  const positions: { x: number, z: number, angle: number }[] = []
  for (const road of blueprint.roads) {
    if (!road.arterial && road.width < LAMP_MIN_WIDTH)
      continue
    const points = road.path
    let carried = 0
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
      const angle = Math.atan2(ux, uz)
      for (let t = LAMP_SPACING - carried; t < span; t += LAMP_SPACING) {
        const offset = (road.width / 2 + 1.6) * side
        positions.push({ x: ax + ux * t - uz * offset, z: az + uz * t + ux * offset, angle })
        side = -side
      }
      carried = (carried + span) % LAMP_SPACING
    }
    if (positions.length > LAMP_LIMIT)
      break
  }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const box = new THREE.BoxGeometry(1, 1, 1)

  const masts = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#3a3f42', roughness: 0.7, metalness: 0.3 }), positions.length)
  const heads = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#2c2f31', emissive: '#ffcb7a', emissiveIntensity: 0, roughness: 0.4 }), positions.length) as StandardInstancedMesh
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffc478', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }),
    positions.length,
  ) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

  positions.forEach((lamp, index) => {
    const ground = blueprint.relief.height(lamp.x, lamp.z)
    matrix.compose(position.set(lamp.x, ground + LAMP_HEIGHT / 2, lamp.z), quaternion.setFromAxisAngle(AXIS_Y, lamp.angle), scale.set(0.7, LAMP_HEIGHT, 0.7))
    masts.setMatrixAt(index, matrix)
    matrix.compose(position.set(lamp.x, ground + LAMP_HEIGHT, lamp.z), quaternion.setFromAxisAngle(AXIS_Y, lamp.angle), scale.set(3.4, 0.7, 1.1))
    heads.setMatrixAt(index, matrix)
    // Flat on the road, a touch above it so the asphalt does not fight it for the same depth.
    matrix.compose(position.set(lamp.x, ground + 0.34, lamp.z), FLAT, scale.set(LAMP_POOL, LAMP_POOL, 1))
    pools.setMatrixAt(index, matrix)
  })

  masts.castShadow = true
  masts.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  heads.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  pools.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  pools.renderOrder = 1
  scene.add(masts, heads, pools)
  return { heads, pools }
}
