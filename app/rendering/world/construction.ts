import * as THREE from 'three/webgpu'

/** Cranes stand on the parcels the pipeline is working on, so building is visible before buildings. */
const MAX_CONSTRUCTION_SITES = 16

export function createConstructionSites(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#dc9b28', roughness: 0.56, metalness: 0.28 })
  const shell = new THREE.MeshStandardMaterial({ color: '#8d8577', roughness: 0.92 })

  for (let index = 0; index < MAX_CONSTRUCTION_SITES; index += 1) {
    const site = new THREE.Group()
    const height = 54 + (index % 4) * 9
    const mast = new THREE.Mesh(new THREE.BoxGeometry(2.6, height, 2.6), steel)
    mast.position.y = height / 2
    const boom = new THREE.Mesh(new THREE.BoxGeometry(58, 2, 2), steel)
    boom.position.set(19, height - 3, 0)
    const counter = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 6), steel)
    counter.position.set(-11, height - 5, 0)
    const shellBlock = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 26), shell)
    shellBlock.position.set(4, 6, 0)
    site.add(mast, boom, counter, shellBlock)
    site.traverse((object) => {
      if (object instanceof THREE.Mesh)
        object.castShadow = true
    })
    site.visible = false
    group.add(site)
  }
  scene.add(group)
  return group
}
