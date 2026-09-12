import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import type { StandardInstancedMesh } from '../shared'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y, WHITE } from '../shared'

/**
 * Planting, from the nature kit rather than the city kit.
 *
 * The city kit's trees are forty-two triangles and read as blobs from anywhere closer than the
 * strategic camera. These are a hundred and thirty and have a trunk, and because the kit paints with
 * material colours rather than a texture, those colours are already baked into vertex colours by the
 * loader — so a whole mixed wood still draws from one material.
 *
 * Two meshes, split by model, because the simulation thins the stock as the city spends its green
 * space and each mesh has to be thinned against its own capacity.
 */
export interface CityTrees {
  treeCrowns: StandardInstancedMesh
  treeTrunks: StandardInstancedMesh
}

/** Roughly how tall a grown tree is, in metres. The kit's own models are about two units. */
const TREE_HEIGHT = 11

export function addTrees(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): CityTrees {
  const rng = createRandomStream(blueprint.definition.seed, 'planting')
  /*
   * Its own copy of the material: greenery is tinted as the city spends its green space, and the
   * material is shared with nothing else, so the tint cannot leak into anything but the planting.
   */
  const material = models.natureMaterial.clone()
  material.vertexColors = true

  const pool = models.trees
  const half = Math.ceil(blueprint.trees.length / 2)

  function plant(records: typeof blueprint.trees, from: number): StandardInstancedMesh {
    const model = pool[from % Math.max(1, pool.length)]
    const geometry = model?.geometry ?? new THREE.IcosahedronGeometry(4.8, 1)
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, records.length)) as StandardInstancedMesh
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const base = TREE_HEIGHT / Math.max(0.001, model?.size.y ?? 1)

    records.forEach((tree, index) => {
      const size = base * tree.scale
      matrix.compose(
        position.set(tree.x, blueprint.relief.height(tree.x, tree.z), tree.z),
        quaternion.setFromAxisAngle(AXIS_Y, rng.next() * Math.PI * 2),
        scale.set(size, size * rng.between(0.85, 1.2), size),
      )
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, WHITE)
    })
    mesh.castShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    scene.add(mesh)
    return mesh
  }

  return {
    treeCrowns: plant(blueprint.trees.slice(0, half), 0),
    treeTrunks: plant(blueprint.trees.slice(half), 1),
  }
}
