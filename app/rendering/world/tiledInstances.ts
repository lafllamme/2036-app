import type * as THREE from 'three/webgpu'
import { InstancedMesh, Matrix4 } from 'three/webgpu'

/**
 * Instancing, cut into tiles so the camera can throw most of it away.
 *
 * An instanced mesh is one draw call and one bounding sphere. Put every parked car in the city into
 * one and that sphere is three kilometres across, so it is always on screen and every instance in it
 * is submitted every frame — a player standing on one street corner pays for the cars on every other
 * corner. Instancing saves draw calls; it does not save anything else, and that is easy to forget
 * until a car turns out to be two thousand triangles and there are three thousand of them.
 *
 * Cutting the set into a grid gives each tile its own sphere, and the frustum test drops the ones
 * behind the camera for the cost of one sphere check each. A few dozen draws instead of one, against
 * a tenth of the geometry at street level.
 */

/**
 * How wide a tile is.
 *
 * The trade is direct and it is easy to get backwards. Small tiles cull well and cost draw calls;
 * large ones cost geometry. And the set being tiled is usually already cut several ways — one mesh
 * per vehicle model, say — so the tiles multiply that rather than dividing it. Tiling the trees at
 * half a kilometre took the overview from ninety draw calls to twelve hundred, because eleven
 * species across forty tiles is four hundred and forty meshes.
 *
 * So: only tile what is genuinely heavy per instance, and not too finely. A kilometre.
 */
const TILE = 1_000

export interface Placement {
  matrix: Matrix4
  /** The per-instance colour, where the set uses one. */
  colour?: THREE.Color
}

export interface TiledSet {
  meshes: InstancedMesh[]
  /** How many instances the whole set holds, for whatever has to report or thin it. */
  count: number
}

/**
 * Build one instanced mesh per occupied tile.
 *
 * `placements` is consumed in order; each keeps its own matrix, so nothing here needs to know what
 * is being placed or how it was worked out.
 */
export function addTiled(
  scene: THREE.Scene,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
  configure?: (mesh: InstancedMesh) => void,
): TiledSet {
  const tiles = new Map<string, Placement[]>()
  const at = new Matrix4()

  for (const placement of placements) {
    at.copy(placement.matrix)
    const x = at.elements[12] ?? 0
    const z = at.elements[14] ?? 0
    const key = `${Math.floor(x / TILE)}:${Math.floor(z / TILE)}`
    const bucket = tiles.get(key)
    if (bucket)
      bucket.push(placement)
    else tiles.set(key, [placement])
  }

  const meshes: InstancedMesh[] = []
  for (const bucket of tiles.values()) {
    const mesh = new InstancedMesh(geometry, material, bucket.length)
    bucket.forEach((placement, index) => {
      mesh.setMatrixAt(index, placement.matrix)
      if (placement.colour)
        mesh.setColorAt(index, placement.colour)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    configure?.(mesh)
    scene.add(mesh)
    meshes.push(mesh)
  }

  return { meshes, count: placements.length }
}
