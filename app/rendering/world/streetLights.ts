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
const LAMP_SPACING = 110
const LAMP_HEIGHT = 11
const LAMP_POOL = 46

/**
 * Lamps down the arterials. Every one is an instance of the same three shapes, so the whole of the
 * city's night lighting is three draw calls and no actual lights — a real point light per lamp would
 * mean two hundred and sixty of them in a forward renderer, and the look does not need it: a glowing
 * head and a warm pool on the road read as street lighting from every distance the camera allows.
 */
export function addStreetLights(scene: THREE.Scene, blueprint: CityBlueprint): StreetLights {
  const positions: { x: number, z: number, alongZ: boolean }[] = []
  for (const road of blueprint.roads) {
    if (!road.arterial)
      continue
    const alongZ = road.axis === 'z'
    const side = alongZ ? road.x : road.z
    for (let along = -1_400; along <= 1_400; along += LAMP_SPACING) {
      const offset = ((along / LAMP_SPACING) % 2 === 0 ? 1 : -1) * 17
      positions.push(alongZ ? { x: side + offset, z: along, alongZ } : { x: along, z: side + offset, alongZ })
    }
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
    const turn = lamp.alongZ ? 0 : Math.PI / 2
    matrix.compose(position.set(lamp.x, LAMP_HEIGHT / 2, lamp.z), quaternion.setFromAxisAngle(AXIS_Y, turn), scale.set(0.9, LAMP_HEIGHT, 0.9))
    masts.setMatrixAt(index, matrix)
    matrix.compose(position.set(lamp.x, LAMP_HEIGHT, lamp.z), quaternion.setFromAxisAngle(AXIS_Y, turn), scale.set(4.2, 0.9, 1.4))
    heads.setMatrixAt(index, matrix)
    // Flat on the road, a touch above it so the asphalt does not fight it for the same depth.
    matrix.compose(position.set(lamp.x, 0.92, lamp.z), FLAT, scale.set(LAMP_POOL, LAMP_POOL, 1))
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
