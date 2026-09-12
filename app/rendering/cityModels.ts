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
 * A 1×1 transparent pixel. Every model in a kit points at the same `Textures/colormap.png`, and the
 * loader has no idea that fifty-eight requests for it are one texture — it fetched, decoded and
 * uploaded the atlas once per model. The kits' images are redirected here and the two real atlases
 * are loaded once, by hand, below.
 */
const BLANK_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/**
 * What went wrong, in words. Three's loaders reject with a DOM event rather than an error, so the
 * default message for a missing file was the string `[object Event]` — true, and useless.
 */
function describe(url: string, cause: unknown): string {
  const target = (cause as { target?: { status?: number } } | undefined)?.target
  if (typeof target?.status === 'number' && target.status > 0)
    return `${url} (HTTP ${target.status})`
  if (cause instanceof Error)
    return `${url} (${cause.message})`
  return `${url} (nicht erreichbar)`
}

/** The atlas a kit shares across all of its models, loaded once and filtered like the pixel art it is. */
async function loadAtlas(kit: string): Promise<THREE.Texture> {
  const url = `${MODELS_BASE}/${kit}/Textures/colormap.png`
  const texture = await new THREE.TextureLoader().loadAsync(url).catch((cause: unknown) => {
    throw new Error(describe(url, cause))
  })
  texture.colorSpace = THREE.SRGBColorSpace
  // glTF UVs have their origin at the top left, and the palette is read by exact texel.
  texture.flipY = false
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 4
  return texture
}

/**
 * Pull the single mesh out of a kit model and normalise it: centred on its footprint and sitting on
 * y = 0, so placing one is a matter of position and scale with no per-model offsets to remember.
 */
function extract(id: string, scene: THREE.Object3D): { model: CityModel } | null {
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

  return { model: { id, geometry, size, slenderness: size.y / Math.max(0.001, Math.max(size.x, size.z)) } }
}

async function loadKit(loader: GLTFLoader, kit: string, ids: string[], atlas: THREE.Texture, failures: string[]): Promise<LoadedKit> {
  /*
   * One model that fails to arrive is a gap in the catalogue, not a reason to leave the player on a
   * loading screen forever. The buildings that would have used it fall back to another model in the
   * same pool, and the failures are collected so the reason still reaches the surface.
   */
  const loaded = await Promise.all(ids.map(async (id) => {
    const url = `${MODELS_BASE}/${kit}/${id}.glb`
    try {
      const gltf = await loader.loadAsync(url)
      return extract(id, gltf.scene)
    }
    catch (cause) {
      failures.push(describe(url, cause))
      return null
    }
  }))

  /*
   * One material for the whole kit, built here rather than taken from a model: the kit's own
   * material is double sided, which doubles the fragment work across a city of closed volumes for
   * nothing, and it carries no per-instance colour, which is what lets a derelict block lose its.
   */
  const material = new THREE.MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    side: THREE.FrontSide,
    emissive: '#ffd9a8',
    emissiveIntensity: 0,
  })

  return { models: loaded.filter((entry): entry is { model: CityModel } => entry !== null).map(entry => entry.model), material }
}

/**
 * Load every kit in parallel. Called once, during the loading screen, before the renderer is built —
 * a model that arrives late would mean a building popping into a city the player is already looking
 * at, and the whole point of the loading screen is that it is the place where waiting is free.
 */
export async function loadCityModels(): Promise<CityModels> {
  // Every model is fetched once even though several kits are read in parallel from the same folder.
  THREE.Cache.enabled = true

  const manager = new THREE.LoadingManager()
  manager.setURLModifier(url => url.endsWith('colormap.png') ? BLANK_PIXEL : url)
  const loader = new GLTFLoader(manager)

  const [suburbanAtlas, commercialAtlas] = await Promise.all([loadAtlas('suburban'), loadAtlas('commercial')])
  const failures: string[] = []
  const [suburban, commercial, distant, trees] = await Promise.all([
    loadKit(loader, 'suburban', HOUSE_IDS, suburbanAtlas, failures),
    loadKit(loader, 'commercial', [...OFFICE_IDS, ...TOWER_IDS], commercialAtlas, failures),
    loadKit(loader, 'commercial', DISTANT_IDS, commercialAtlas, failures),
    loadKit(loader, 'suburban', TREE_IDS, suburbanAtlas, failures),
  ])

  // A kit with nothing in it cannot build anything, and that is worth stopping for — by name.
  if (suburban.models.length === 0 || commercial.models.length === 0)
    throw new Error(`Kein Gebäudemodell erreichbar. Zuerst fehlgeschlagen: ${failures.slice(0, 3).join(', ')}`)

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
