import type { CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { FLAT } from '../shared'

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
const PARK = /* @__PURE__ */ new THREE.Color('#47663f')

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

  const cells: { x: number, z: number, colour: THREE.Color }[] = []
  const scratch = new THREE.Color()
  for (let row = 0; row < columns; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -HALF_CITY + column * BLOCK_SIZE + BLOCK_SIZE / 2
      const z = -HALF_CITY + row * BLOCK_SIZE + BLOCK_SIZE / 2
      // Nothing is laid in the river.
      if (x > -1_190 && x < -910)
        continue

      const built = counts.get(row * columns + column) ?? 0
      // Nine plots is a full block; an empty one is a park, and the ground says so.
      const density = Math.min(1, built / 9)
      const colour = built === 0
        ? scratch.copy(PARK)
        : scratch.copy(YARD).lerp(PAVED, density)
      // A block is never quite the colour of the one next to it.
      const shade = 0.9 + rng.next() * 0.2
      cells.push({ x, z, colour: colour.clone().multiplyScalar(shade) })
    }
  }

  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(BLOCK_SIZE - 6, BLOCK_SIZE - 6),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }),
    cells.length,
  )
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3(1, 1, 1)
  cells.forEach((cell, index) => {
    matrix.compose(position.set(cell.x, SURFACE_Y, cell.z), FLAT, scale)
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, cell.colour)
  })
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  scene.add(mesh)
}
