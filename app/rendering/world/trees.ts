import type { CityBlueprint } from '../../core/contracts'
import type { CityModel, CityModels } from '../cityModels'
import type { StandardInstancedMesh } from '../shared'
import * as THREE from 'three/webgpu'
import { AXIS_Y, WHITE } from '../shared'

/** Greenery, split across the kit's two tree models so each can be thinned against its own stock. */
export interface CityTrees {
  treeCrowns: StandardInstancedMesh
  treeTrunks: StandardInstancedMesh
}

export function addTrees(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): CityTrees {
  /*
   * The kit's trees, on their own copy of the atlas material: greenery is tinted as the city spends
   * its green space, and the houses share that atlas — tinting it in place would have drained the
   * colour out of every building in Lindenhafen along with the parks.
   */
  const material = models.suburbanMaterial.clone() as THREE.MeshStandardMaterial
  material.vertexColors = true
  const large = models.trees[0] ?? models.trees[1]
  const small = models.trees[1] ?? models.trees[0]
  const half = Math.ceil(blueprint.trees.length / 2)

  function plant(model: CityModel | undefined, records: typeof blueprint.trees): StandardInstancedMesh {
    const geometry = model?.geometry ?? new THREE.IcosahedronGeometry(4.8, 1)
    const footprint = Math.max(0.001, Math.max(model?.size.x ?? 1, model?.size.z ?? 1))
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, records.length))
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    records.forEach((tree, index) => {
      const size = (9 / footprint) * tree.scale
      matrix.compose(
        position.set(tree.x, blueprint.relief.height(tree.x, tree.z), tree.z),
        quaternion.setFromAxisAngle(AXIS_Y, (index % 8) * (Math.PI / 4)),
        scale.set(size, size, size),
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
    treeCrowns: plant(large, blueprint.trees.slice(0, half)),
    treeTrunks: plant(small, blueprint.trees.slice(half)),
  }
}

/**
 * Lamps down the arterials. Every one is an instance of the same three shapes, so the whole of the
 * city's night lighting is three draw calls and no actual lights — a real point light per lamp would
 * mean two hundred and sixty of them in a forward renderer, and the look does not need it: a glowing
 * head and a warm pool on the road read as street lighting from every distance the camera allows.
 */
