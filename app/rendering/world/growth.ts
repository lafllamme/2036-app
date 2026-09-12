import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { AXIS_Y, WHITE } from '../shared'

/**
 * New housing on the land the map says is unbuilt. Hidden until the pipeline delivers.
 *
 * One model for the whole growth stock on purpose: delivered housing should read as new — the same
 * contemporary block repeating down a street, visibly unlike the city it was dropped into. It is
 * also the one part of the skyline that is not a real footprint, and looking a little prefabricated
 * is the right answer for a building the player has just voted into existence.
 */
export function createGrowth(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): THREE.InstancedMesh {
  const slots = blueprint.growthSlots
  const model = models.offices[3] ?? models.offices[0] ?? models.houses[0]!
  const mesh = new THREE.InstancedMesh(model.geometry, models.commercialMaterial, Math.max(1, slots.length))
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const footprint = Math.max(0.001, Math.max(model.size.x, model.size.z))

  slots.forEach((slot, index) => {
    const base = slot.width / footprint
    const stretch = THREE.MathUtils.clamp(slot.height / Math.max(0.001, model.size.y * base), 0.8, 1.5)
    matrix.compose(
      position.set(slot.x, 0, slot.z),
      quaternion.setFromAxisAngle(AXIS_Y, slot.rotation),
      scale.set(base, base * stretch, base),
    )
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
