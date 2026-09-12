import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three/webgpu'

/**
 * Everything in the city that is a model rather than geometry we generate: the housing the pipeline
 * delivers, the traffic, the people on the pavement and the planting. All of it is Kenney's, all of
 * it CC0 (kenney.nl), and all of it instanced.
 *
 * Two things every kit needs and does not come with. A car is five meshes — a body and four wheels —
 * so a model has to be merged before it can be one instanced draw, and taking the first mesh, which
 * is what this did at first, produces a fleet of cars with no wheels. And the nature kit paints with
 * material colours instead of a texture, so those colours are baked into vertex colours; after that
 * one material can draw a whole kit whether it has an atlas or not.
 *
 * Nothing here touches the simulation.
 */

const MODELS_BASE = '/models'
/** The neutral vertex colour for anything whose colour already comes from a texture atlas. */
const WHITE = /* @__PURE__ */ new THREE.Color('#ffffff')

/** Suburban houses: the stock the construction pipeline delivers. */
const HOUSE_IDS = 'abcdefghijklmnopqrstu'.split('').map(letter => `building-type-${letter}`)
/** Commercial blocks, and the skyscrapers among them. */
const OFFICE_IDS = 'abcdefghijklmn'.split('').map(letter => `building-${letter}`)
const TOWER_IDS = 'abcde'.split('').map(letter => `building-skyscraper-${letter}`)
/** The kit's own low-detail versions, a tenth of the triangles, for the outskirts. */
const DISTANT_IDS = [...'abcdefghijklmn'.split('').map(letter => `low-detail-building-${letter}`), 'low-detail-building-wide-a', 'low-detail-building-wide-b']

/**
 * The fleet. Ordinary traffic first, then the ones that should be rare: a city of a hundred and
 * twenty thousand does not have one car in twelve being a fire engine.
 */
export const COMMON_VEHICLES = ['sedan', 'sedan-sports', 'suv', 'suv-luxury', 'hatchback-sports', 'van', 'truck', 'delivery']
export const RARE_VEHICLES = ['taxi', 'police', 'ambulance', 'garbage-truck']
const VEHICLE_IDS = [...COMMON_VEHICLES, ...RARE_VEHICLES]

/** Twelve people, each with their own build, skin and clothes baked into the kit's atlas. */
const PEOPLE_IDS = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap(letter => [`character-male-${letter}`, `character-female-${letter}`])

const NATURE_IDS = ['tree_default', 'tree_detailed', 'tree_oak', 'tree_tall', 'tree_thin', 'tree_small', 'tree_fat', 'tree_pineTallA', 'tree_pineRoundA', 'plant_bushLarge', 'plant_bushSmall']

export interface CityModel {
  id: string
  geometry: THREE.BufferGeometry
  /** The model's own bounding box, used to scale it onto a parcel without guessing its units. */
  size: THREE.Vector3
  /** Height divided by the larger footprint edge: how tower-like the model is. */
  slenderness: number
}

export interface CityModels {
  suburbanMaterial: THREE.MeshStandardMaterial
  commercialMaterial: THREE.MeshStandardMaterial
  vehicleMaterial: THREE.MeshStandardMaterial
  peopleMaterial: THREE.MeshStandardMaterial
  natureMaterial: THREE.MeshStandardMaterial
  houses: CityModel[]
  offices: CityModel[]
  towers: CityModel[]
  distant: CityModel[]
  trees: CityModel[]
  vehicles: CityModel[]
  people: CityModel[]
}

/**
 * A 1×1 transparent pixel. Every model in a kit points at the same `Textures/colormap.png`, and the
 * loader has no idea that fifty requests for it are one texture — it fetched, decoded and uploaded
 * the atlas once per model. The kits' images are redirected here and each real atlas is loaded once.
 */
const BLANK_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** What went wrong, in words. Three's loaders reject with a DOM event rather than an error. */
function describe(url: string, cause: unknown): string {
  const target = (cause as { target?: { status?: number } } | undefined)?.target
  if (typeof target?.status === 'number' && target.status > 0)
    return `${url} (HTTP ${target.status})`
  if (cause instanceof Error)
    return `${url} (${cause.message})`
  return `${url} (nicht erreichbar)`
}

/**
 * The atlas a kit shares across all of its models, loaded once and filtered like the pixel art it is.
 *
 * Fetched rather than handed to `TextureLoader`, which loads an `<img>`: an image element reports a
 * failure as a bare event with no status at all, so a missing file and a dev server answering with
 * its own HTML page were indistinguishable. A 200 carrying `text/html` is exactly the shape a public
 * file takes when the server does not know about it, so that is checked by name.
 */
async function loadAtlas(kit: string): Promise<THREE.Texture> {
  const url = `${MODELS_BASE}/${kit}/Textures/colormap.png`
  const response = await fetch(url).catch((cause: unknown) => {
    throw new Error(`${url} (${cause instanceof Error ? cause.message : 'nicht erreichbar'})`)
  })
  if (!response.ok)
    throw new Error(`${url} (HTTP ${response.status})`)

  const type = response.headers.get('content-type') ?? ''
  if (!type.startsWith('image/'))
    throw new Error(`${url} liefert ${type || 'unbekannten Inhalt'} statt eines Bildes — der Dev-Server kennt die Datei nicht, ein Neustart baut sein Verzeichnis neu auf`)

  const texture = new THREE.Texture(await createImageBitmap(await response.blob()))
  texture.colorSpace = THREE.SRGBColorSpace
  // glTF UVs have their origin at the top left, and the palette is read by exact texel.
  texture.flipY = false
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

/**
 * Flatten a loaded model into one geometry.
 *
 * Every mesh in it is baked into world space and merged, so a car keeps its wheels and a tree its
 * trunk. Each mesh's material colour is written into vertex colours on the way, which is what lets
 * a kit with no texture and a kit with an atlas be drawn by the same kind of material — and what
 * lets a single instance be weathered or highlighted later by multiplying that colour.
 *
 * The result is centred on its footprint and sits on y = 0, so placing one is position and scale
 * with no per-model offsets to remember.
 */
function extract(id: string, scene: THREE.Object3D): { model: CityModel } | null {
  const parts: THREE.BufferGeometry[] = []
  scene.updateWorldMatrix(true, true)
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh))
      return
    const geometry = object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)

    const material = Array.isArray(object.material) ? object.material[0] : object.material
    const tint = material instanceof THREE.MeshStandardMaterial && !material.map
      ? material.color
      : WHITE
    const count = geometry.attributes.position?.count ?? 0
    const colours = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      colours[index * 3] = tint.r
      colours[index * 3 + 1] = tint.g
      colours[index * 3 + 2] = tint.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    if (!geometry.attributes.uv)
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    if (!geometry.attributes.normal)
      geometry.computeVertexNormals()
    // Merging needs every part to carry the same attributes and nothing else.
    for (const name of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name))
        geometry.deleteAttribute(name)
    }
    parts.push(geometry)
  })

  const merged = parts.length === 1 ? parts[0]! : (parts.length > 1 ? mergeGeometries(parts, false) : null)
  if (!merged)
    return null

  merged.computeBoundingBox()
  const box = merged.boundingBox ?? new THREE.Box3()
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  merged.translate(-centre.x, -box.min.y, -centre.z)
  merged.computeBoundingSphere()

  return { model: { id, geometry: merged, size, slenderness: size.y / Math.max(0.001, Math.max(size.x, size.z)) } }
}

interface Kit {
  models: CityModel[]
  material: THREE.MeshStandardMaterial
}

async function loadKit(loader: GLTFLoader, folder: string, ids: string[], atlas: THREE.Texture | null, failures: string[]): Promise<Kit> {
  /*
   * One model that fails to arrive is a gap in the catalogue, not a reason to leave the player on a
   * loading screen forever. Whatever would have used it falls back to another model in the same
   * pool, and the failures are collected so the reason still reaches the surface.
   */
  const loaded = await Promise.all(ids.map(async (id) => {
    const url = `${MODELS_BASE}/${folder}/${id}.glb`
    try {
      return extract(id, (await loader.loadAsync(url)).scene)
    }
    catch (cause) {
      failures.push(describe(url, cause))
      return null
    }
  }))

  /*
   * One material for the whole kit, built here rather than taken from a model: the kits ship double
   * sided, which doubles the fragment work across a city of closed volumes for nothing, and they
   * carry no per-instance colour, which is what lets a derelict block be drained of its.
   */
  const material = new THREE.MeshStandardMaterial({
    map: atlas ?? undefined,
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
 * Load every kit in parallel, during the loading screen and before the renderer is built. A model
 * that arrives late is a building popping into a city the player is already looking at.
 */
export async function loadCityModels(): Promise<CityModels> {
  // Every model is fetched once even though several kits are read in parallel from the same folder.
  THREE.Cache.enabled = true

  const manager = new THREE.LoadingManager()
  manager.setURLModifier(url => url.endsWith('colormap.png') ? BLANK_PIXEL : url)
  const loader = new GLTFLoader(manager)

  const [suburbanAtlas, commercialAtlas, vehicleAtlas, peopleAtlas] = await Promise.all([
    loadAtlas('city/suburban'),
    loadAtlas('city/commercial'),
    loadAtlas('vehicles'),
    loadAtlas('people'),
  ])

  const failures: string[] = []
  const [suburban, commercial, distant, vehicles, people, nature] = await Promise.all([
    loadKit(loader, 'city/suburban', HOUSE_IDS, suburbanAtlas, failures),
    loadKit(loader, 'city/commercial', [...OFFICE_IDS, ...TOWER_IDS], commercialAtlas, failures),
    loadKit(loader, 'city/commercial', DISTANT_IDS, commercialAtlas, failures),
    loadKit(loader, 'vehicles', VEHICLE_IDS, vehicleAtlas, failures),
    loadKit(loader, 'people', PEOPLE_IDS, peopleAtlas, failures),
    loadKit(loader, 'nature', NATURE_IDS, null, failures),
  ])

  // A kit with nothing in it cannot build anything, and that is worth stopping for — by name.
  if (suburban.models.length === 0 || commercial.models.length === 0)
    throw new Error(`Kein Gebäudemodell erreichbar. Zuerst fehlgeschlagen: ${failures.slice(0, 3).join(', ')}`)

  return {
    suburbanMaterial: suburban.material,
    commercialMaterial: commercial.material,
    vehicleMaterial: vehicles.material,
    peopleMaterial: people.material,
    natureMaterial: nature.material,
    houses: suburban.models,
    offices: commercial.models.filter(model => OFFICE_IDS.includes(model.id)),
    towers: commercial.models.filter(model => TOWER_IDS.includes(model.id)),
    distant: distant.models,
    trees: nature.models,
    vehicles: vehicles.models,
    people: people.models,
  }
}
