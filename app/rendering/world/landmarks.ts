import * as THREE from 'three/webgpu'

/** The two buildings Lindenhafen is recognised by: the city hall and the station hall. */

export function addLandmarks(scene: THREE.Scene): void {
  const stone = new THREE.MeshStandardMaterial({ color: '#b8aa91', roughness: 0.84 })
  const copper = new THREE.MeshStandardMaterial({ color: '#3e7063', roughness: 0.62, metalness: 0.18 })
  const glass = new THREE.MeshStandardMaterial({ color: '#7ba1aa', roughness: 0.24, metalness: 0.12, transparent: true, opacity: 0.84 })

  const cityHall = new THREE.Group()
  const base = new THREE.Mesh(new THREE.BoxGeometry(90, 34, 58), stone)
  base.position.y = 17
  const tower = new THREE.Mesh(new THREE.BoxGeometry(22, 68, 22), stone)
  tower.position.set(0, 34, 0)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(16, 28, 4), copper)
  spire.position.set(0, 82, 0)
  spire.rotation.y = Math.PI / 4
  cityHall.add(base, tower, spire)
  cityHall.position.set(-160, 0, -30)
  cityHall.traverse((object) => {
    if (object instanceof THREE.Mesh)
      object.castShadow = true
  })
  scene.add(cityHall)

  const station = new THREE.Group()
  const stationBase = new THREE.Mesh(new THREE.BoxGeometry(210, 24, 72), stone)
  stationBase.position.y = 12
  const stationRoof = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 210, 18, 1, false, 0, Math.PI), glass)
  stationRoof.rotation.z = Math.PI / 2
  stationRoof.position.y = 24
  station.add(stationBase, stationRoof)
  station.position.set(0, 0, 820)
  scene.add(station)

  const hospital = new THREE.Mesh(new THREE.BoxGeometry(160, 42, 94), new THREE.MeshStandardMaterial({ color: '#d5d7d0', roughness: 0.66 }))
  hospital.position.set(880, 21, -40)
  hospital.castShadow = true
  scene.add(hospital)
}
