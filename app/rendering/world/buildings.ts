import type { BuildingRecord, CityBlueprint } from '../../core/contracts'
import type { CityModel, CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { pickModel, placeModel } from './modelPlacement'

/** The city's own building stock: one instanced mesh per kit model, two materials for all of it. */
export interface CityBuildings {
  buildingMeshes: THREE.InstancedMesh[]
  buildingRecords: Map<THREE.InstancedMesh, BuildingRecord[]>
  buildingColors: Map<THREE.InstancedMesh, THREE.Color[]>
  /** The two kit atlases. Night lighting is applied here rather than to a separate window mesh. */
  buildingMaterials: THREE.MeshStandardMaterial[]
}

export function createBuildings(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): CityBuildings {
  const rng = createRandomStream(blueprint.definition.seed, 'render-models')
  const grouped = new Map<string, { model: CityModel, commercial: boolean, records: BuildingRecord[] }>()

  for (const building of blueprint.buildings) {
    const { model, commercial } = pickModel(building, models, rng.next())
    const group = grouped.get(model.id) ?? { model, commercial, records: [] }
    group.records.push(building)
    grouped.set(model.id, group)
  }

  const buildingMeshes: THREE.InstancedMesh[] = []
  const buildingRecords = new Map<THREE.InstancedMesh, BuildingRecord[]>()
  const buildingColors = new Map<THREE.InstancedMesh, THREE.Color[]>()
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  for (const { model, commercial, records } of grouped.values()) {
    const material = commercial ? models.commercialMaterial : models.suburbanMaterial
    const mesh = new THREE.InstancedMesh(model.geometry, material, records.length)
    const colors: THREE.Color[] = []
    records.forEach((building, index) => {
      placeModel(matrix, building, model, position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
      /*
       * The atlas carries the colour; this only weathers it, so a neglected block loses its shine.
       * Tinting per building was tried and dropped: the kit's own palette is strong enough that a
       * hue shift on top of it turned whole streets a single wrong colour instead of varying them.
       */
      const colour = new THREE.Color().setScalar(0.86 + building.condition * 0.14)
      colors.push(colour)
      mesh.setColorAt(index, colour)
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.computeBoundingSphere()
    buildingMeshes.push(mesh)
    buildingRecords.set(mesh, records)
    buildingColors.set(mesh, colors)
    scene.add(mesh)
  }

  const buildingMaterials = [models.suburbanMaterial, models.commercialMaterial]
    .filter((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial)

  return { buildingMeshes, buildingRecords, buildingColors, buildingMaterials }
}

/** New housing on the parcels the generator left free. Hidden until the pipeline delivers. */
