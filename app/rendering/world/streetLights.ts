import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import type { StandardInstancedMesh } from '../shared'
import * as THREE from 'three/webgpu'
import { AXIS_Y, FLAT, WHITE } from '../shared'
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
const LAMP_LIMIT = 1_700
const LAMP_HEIGHT = 11
const LAMP_POOL = 46

/**
 * Lamps down the arterials. Every one is an instance of the same three shapes, so the whole of the
 * city's night lighting is three draw calls and no actual lights — a real point light per lamp would
 * mean two hundred and sixty of them in a forward renderer, and the look does not need it: a glowing
 * head and a warm pool on the road read as street lighting from every distance the camera allows.
 */
export function addStreetLights(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): StreetLights {
  /*
   * Lamps walk the real street network now rather than a grid of arterials: every so many metres
   * along a street wide enough to be lit, offset to alternating kerbs. A city's night shape is its
   * street plan picked out in orange, so it has to follow the streets it actually has.
   */
  const positions: { x: number, z: number, angle: number }[] = []
  for (const road of blueprint.roads) {
    // Nothing is planted on a bridge: its deck is not the ground, and a lamp read off the land
    // below it stands in the river the bridge is crossing.
    if (road.bridge || (!road.arterial && road.width < LAMP_MIN_WIDTH))
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

  /*
   * The mast is the road kit's own lamp — a column with an arm curving out over the carriageway.
   * It used to be a stretched cube, which from the pavement is a post and from a car is a mistake.
   */
  const lamp = models.streetLamp
  const mastGeometry = lamp?.geometry ?? box
  const mastScale = lamp ? LAMP_HEIGHT / Math.max(0.001, lamp.size.y) : 1
  /** How far the arm reaches out over the road, so the light hangs where the lamp points. */
  const reach = lamp ? lamp.size.z * mastScale * 0.34 : 0

  const masts = new THREE.InstancedMesh(mastGeometry, models.roadsMaterial, positions.length)
  const heads = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#2c2f31', emissive: '#ffcb7a', emissiveIntensity: 0, roughness: 0.4 }), positions.length) as StandardInstancedMesh
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffc478', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }),
    positions.length,
  ) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

  positions.forEach((spot, index) => {
    const ground = blueprint.relief.height(spot.x, spot.z)
    quaternion.setFromAxisAngle(AXIS_Y, spot.angle)
    if (lamp)
      matrix.compose(position.set(spot.x, ground, spot.z), quaternion, scale.setScalar(mastScale))
    else
      matrix.compose(position.set(spot.x, ground + LAMP_HEIGHT / 2, spot.z), quaternion, scale.set(0.7, LAMP_HEIGHT, 0.7))
    masts.setMatrixAt(index, matrix)
    masts.setColorAt(index, WHITE)

    /*
     * The glowing head sits at the end of the arm and the pool it throws sits under that, so both
     * follow the lamp round as it turns with the street rather than staying over the post.
     */
    const armX = spot.x + Math.sin(spot.angle) * reach
    const armZ = spot.z + Math.cos(spot.angle) * reach
    matrix.compose(position.set(armX, ground + LAMP_HEIGHT * 0.93, armZ), quaternion, scale.set(1.5, 0.45, 1))
    heads.setMatrixAt(index, matrix)
    // Flat on the road, a touch above it so the asphalt does not fight it for the same depth.
    matrix.compose(position.set(armX, ground + 0.34, armZ), FLAT, scale.set(LAMP_POOL, LAMP_POOL, 1))
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
