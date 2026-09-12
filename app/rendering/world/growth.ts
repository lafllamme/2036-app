import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { WHITE } from '../shared'
import { placeModel } from './modelPlacement'

/** New housing on the parcels the generator left free. Hidden until the pipeline delivers. */
export function createGrowth(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): THREE.InstancedMesh {
  const slots = blueprint.growthSlots
  /*
   * One model for the whole growth stock on purpose: delivered housing should read as new — the same
   * contemporary block repeating down a street, visibly unlike the city it was dropped into.
   */
  const model = models.offices[3] ?? models.offices[0] ?? models.houses[0]!
  const mesh = new THREE.InstancedMesh(model.geometry, models.commercialMaterial, Math.max(1, slots.length))
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  slots.forEach((slot, index) => {
    placeModel(matrix, slot, model, position, quaternion, scale)
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, WHITE)
  })
  mesh.count = 0
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  scene.add(mesh)
  return mesh
}
