import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three/webgpu'

/**
 * The city's building stock, loaded from Kenney's City Kits (CC0, kenney.nl).
 *
 * Every model in a kit is a single mesh with a single material pointing at one 512² palette atlas,
 * which is the reason the kits are worth using here rather than generating massing ourselves: the
 * whole city ends up in two materials and two textures, and the windows, ledges and roofs are real
 * geometry instead of stripes painted on one face of a box.
 *
 * Nothing here touches the simulation. A model is picked for a building by the footprint and height
 * the simulation already decided on; the blueprint never learns that models exist.
 */

const MODELS_BASE = '/models/city'

/** Suburban houses: the bulk of the city, one to four storeys. */
const HOUSE_IDS = 'abcdefghijklmnopqrstu'.split('').map(letter => `building-type-${letter}`)
/** Commercial blocks: offices, shops, the taller street walls of the centre. */
const OFFICE_IDS = 'abcdefghijklmn'.split('').map(letter => `building-${letter}`)
/** Skyscrapers, reserved for the centre where the simulation asks for real height. */
const TOWER_IDS = 'abcde'.split('').map(letter => `building-skyscraper-${letter}`)
/**
 * The kit's own low-detail versions, a tenth of the triangles. They carry the outskirts, where a
 * building is a few pixels tall and its windows could not be seen even if it had any.
 */
const DISTANT_IDS = [...'abcdefghijklmn'.split('').map(letter => `low-detail-building-${letter}`), 'low-detail-building-wide-a', 'low-detail-building-wide-b']
const TREE_IDS = ['tree-large', 'tree-small']

export interface CityModel {
  id: string
  geometry: THREE.BufferGeometry
  /** The model's own bounding box, used to scale it onto a parcel without guessing its units. */
  size: THREE.Vector3
  /** Height divided by the larger footprint edge: how tower-like the model is. */
  slenderness: number
}

export interface CityModels {
  /** One material per kit atlas — the entire city draws from these two. */
  suburbanMaterial: THREE.Material
  commercialMaterial: THREE.Material
  houses: CityModel[]
  offices: CityModel[]
  towers: CityModel[]
  distant: CityModel[]
  trees: CityModel[]
}

interface LoadedKit {
  models: CityModel[]
  material: THREE.Material
}

/**
 * Pull the single mesh out of a kit model and normalise it: centred on its footprint and sitting on
 * y = 0, so placing one is a matter of position and scale with no per-model offsets to remember.
 */
function extract(id: string, scene: THREE.Object3D): { model: CityModel, material: THREE.Material } | null {
  let found: THREE.Mesh | null = null
  scene.traverse((object) => {
    if (!found && object instanceof THREE.Mesh)
      found = object
  })
  if (!found)
    return null

  const mesh = found as THREE.Mesh
  const geometry = mesh.geometry.clone()
  mesh.updateWorldMatrix(true, false)
  geometry.applyMatrix4(mesh.matrixWorld)
  geometry.computeBoundingBox()

  const box = geometry.boundingBox ?? new THREE.Box3()
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  geometry.translate(-centre.x, -box.min.y, -centre.z)
  geometry.computeBoundingSphere()

  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return {
    model: { id, geometry, size, slenderness: size.y / Math.max(0.001, Math.max(size.x, size.z)) },
    material: material ?? new THREE.MeshStandardMaterial(),
  }
}

async function loadKit(loader: GLTFLoader, kit: string, ids: string[]): Promise<LoadedKit> {
  const loaded = await Promise.all(ids.map(async (id) => {
    const gltf = await loader.loadAsync(`${MODELS_BASE}/${kit}/${id}.glb`)
    return extract(id, gltf.scene)
  }))

  const models: CityModel[] = []
  let material: THREE.Material | null = null
  for (const entry of loaded) {
    if (!entry)
      continue
    models.push(entry.model)
    material ??= entry.material
  }

  const shared = material ?? new THREE.MeshStandardMaterial({ color: '#b6b2a6' })
  /*
   * The kit ships its models double sided, which doubles the fragment work across a city of closed
   * volumes for nothing, and per-instance colour is needed so a derelict block can be drained of it.
   */
  shared.side = THREE.FrontSide
  if (shared instanceof THREE.MeshStandardMaterial) {
    shared.vertexColors = true
    shared.roughness = 0.86
    shared.metalness = 0
  }
  return { models, material: shared }
}

/**
 * Load every kit in parallel. Called once, during the loading screen, before the renderer is built —
 * a model that arrives late would mean a building popping into a city the player is already looking
 * at, and the whole point of the loading screen is that it is the place where waiting is free.
 */
export async function loadCityModels(): Promise<CityModels> {
  const loader = new GLTFLoader()
  const [suburban, commercial, distant, trees] = await Promise.all([
    loadKit(loader, 'suburban', HOUSE_IDS),
    loadKit(loader, 'commercial', [...OFFICE_IDS, ...TOWER_IDS]),
    loadKit(loader, 'commercial', DISTANT_IDS),
    loadKit(loader, 'suburban', TREE_IDS),
  ])

  const offices = commercial.models.filter(model => OFFICE_IDS.includes(model.id))
  const towers = commercial.models.filter(model => TOWER_IDS.includes(model.id))

  return {
    suburbanMaterial: suburban.material,
    commercialMaterial: commercial.material,
    houses: suburban.models,
    offices,
    towers,
    distant: distant.models,
    trees: trees.models,
  }
}
