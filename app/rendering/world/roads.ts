import type { CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'

/** Asphalt, centre lines and the three bridges over the river. */

export function addRoads(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const roadMaterial = new THREE.MeshStandardMaterial({ color: '#252a2b', roughness: 0.92 })
  const roads = new THREE.InstancedMesh(geometry, roadMaterial, blueprint.roads.length)
  const matrix = new THREE.Matrix4()
  blueprint.roads.forEach((road, index) => {
    matrix.compose(
      new THREE.Vector3(road.x, 0.46, road.z),
      new THREE.Quaternion(),
      new THREE.Vector3(road.width, 0.34, road.depth),
    )
    roads.setMatrixAt(index, matrix)
  })
  roads.receiveShadow = true
  scene.add(roads)

  const markingMaterial = new THREE.MeshBasicMaterial({ color: '#c6bfa8', transparent: true, opacity: 0.46 })
  const markings = new THREE.InstancedMesh(geometry, markingMaterial, blueprint.roads.length)
  blueprint.roads.forEach((road, index) => {
    const width = road.axis === 'x' ? road.width : 0.42
    const depth = road.axis === 'z' ? road.depth : 0.42
    matrix.compose(
      new THREE.Vector3(road.x, 0.68, road.z),
      new THREE.Quaternion(),
      new THREE.Vector3(width, 0.02, depth),
    )
    markings.setMatrixAt(index, matrix)
  })
  scene.add(markings)

  const bridgeMaterial = new THREE.MeshStandardMaterial({ color: '#5a5f5d', roughness: 0.8 })
  for (const z of [-720, 0, 720]) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(320, 3.8, 34), bridgeMaterial)
    bridge.position.set(-1_050, 3.2, z)
    bridge.castShadow = true
    bridge.receiveShadow = true
    scene.add(bridge)
  }
}

/**
 * Choose a kit model for a building the simulation has already sized.
 *
 * The pick is driven by slenderness — height over footprint — so a parcel the simulation made tall
 * and narrow gets a tower and a wide low one gets a house, and the massing keeps meaning what it
 * meant before models existed. The seeded roll only breaks ties, so the same city always builds the
 * same skyline.
 */
