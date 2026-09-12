import type { CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y, FLAT } from '../shared'

/**
 * What the ground between the buildings is made of.
 *
 * The city used to stand on one flat green, which read as a lawn with houses dropped on it. This
 * lays a surface under every block and colours it by how built-up that block actually is — courtyard
 * and forecourt where the buildings crowd together, grass where they thin out, parkland where the
 * generator left the block empty. The counts come from the blueprint itself, so the surface can
 * never disagree with what is standing on it.
 *
 * One instanced mesh, one draw call, a few hundred quads.
 */

/** The block grid the generator lays the city out on. */
const BLOCK_SIZE = 180
const HALF_CITY = 1_440
/** Just above the ground and well below the road surface, so nothing fights for the same depth. */
const SURFACE_Y = 0.18

const PAVED = /* @__PURE__ */ new THREE.Color('#6b6357')
const YARD = /* @__PURE__ */ new THREE.Color('#5c6450')
const PARK = /* @__PURE__ */ new THREE.Color('#4c6b41')
/** How many overlapping lawns break up an empty block, so a park is not one flat tile. */
const PARK_PATCHES = 5

export function addCitySurfaces(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const rng = createRandomStream(blueprint.definition.seed, 'surfaces')
  const columns = Math.round((HALF_CITY * 2) / BLOCK_SIZE)
  const counts = new Map<number, number>()

  const cellOf = (x: number, z: number): number => {
    const column = Math.floor((x + HALF_CITY) / BLOCK_SIZE)
    const row = Math.floor((z + HALF_CITY) / BLOCK_SIZE)
    return row * columns + column
  }

  for (const building of blueprint.buildings) {
    const cell = cellOf(building.x, building.z)
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
  }

  const patches: { x: number, z: number, width: number, depth: number, turn: number, colour: THREE.Color }[] = []
  const scratch = new THREE.Color()

  for (let row = 0; row < columns; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -HALF_CITY + column * BLOCK_SIZE + BLOCK_SIZE / 2
      const z = -HALF_CITY + row * BLOCK_SIZE + BLOCK_SIZE / 2
      // Nothing is laid in the river.
      if (x > -1_190 && x < -910)
        continue

      const built = counts.get(row * columns + column) ?? 0
      // A block is never quite the colour of the one next to it.
      const shade = 0.9 + rng.next() * 0.2

      if (built > 0) {
        // Nine plots is a full block: the more of them are taken, the more of the block is paved.
        const density = Math.min(1, built / 9)
        patches.push({
          x,
          z,
          width: BLOCK_SIZE - 6,
          depth: BLOCK_SIZE - 6,
          turn: 0,
          colour: scratch.copy(YARD).lerp(PAVED, density).multiplyScalar(shade).clone(),
        })
        continue
      }

      /*
       * An empty block is parkland, and one flat square of it is exactly what it looked like: a
       * hard-edged green tile a hundred and eighty metres across. Five overlapping patches at their
       * own angles and their own greens make a lawn with a shape instead of a tile.
       */
      patches.push({ x, z, width: BLOCK_SIZE - 6, depth: BLOCK_SIZE - 6, turn: 0, colour: scratch.copy(PARK).multiplyScalar(shade * 0.94).clone() })
      for (let patch = 0; patch < PARK_PATCHES; patch += 1) {
        patches.push({
          x: x + rng.between(-38, 38),
          z: z + rng.between(-38, 38),
          width: rng.between(52, 104),
          depth: rng.between(46, 96),
          turn: rng.next() * Math.PI,
          colour: scratch.copy(PARK).multiplyScalar(0.82 + rng.next() * 0.34).clone(),
        })
      }
    }
  }

  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }),
    patches.length,
  )
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const turn = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  patches.forEach((patch, index) => {
    // A patch is laid flat first and then turned on the ground, not the other way round.
    quaternion.copy(FLAT).multiply(turn.setFromAxisAngle(AXIS_Y, patch.turn))
    matrix.compose(
      position.set(patch.x, SURFACE_Y + (patch.turn === 0 ? 0 : 0.06), patch.z),
      quaternion,
      scale.set(patch.width, patch.depth, 1),
    )
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, patch.colour)
  })
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  scene.add(mesh)
}
