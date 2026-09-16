import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three/webgpu'
import { complexions } from './world/structures/complexion'

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
const RARE_VEHICLES = ['taxi', 'police', 'ambulance', 'firetruck', 'garbage-truck']
/** The three that carry a blue light and can be sent somewhere in a hurry. */
export const EMERGENCY_VEHICLES = ['police', 'ambulance', 'firetruck']
const VEHICLE_IDS = [...COMMON_VEHICLES, ...RARE_VEHICLES]

/**
 * The people, split by what they are wearing.
 *
 * The kit ships twelve characters and they are not interchangeable, which was not obvious until a
 * player pointed at one. Reading each model's body UVs against the shared atlas says what colour its
 * outfit is: `character-female-a` is head to foot in blues — it is a police uniform — and `male-c`,
 * `male-d`, `female-d` and both `e`s are dark greys and dark-with-white. Putting those in the crowd
 * gives you a city where every sixth pedestrian looks like an officer on their way somewhere, which
 * is exactly what it looked like.
 *
 * So the six with plain clothes are the public, and the six in uniform belong to whoever is actually
 * on duty. Halving the crowd's models is also what pays for the walk cycle: the same number of draws
 * now buys several poses each rather than one pose for twelve people.
 */
const CIVILIAN_IDS = ['character-male-a', 'character-male-b', 'character-male-f', 'character-female-b', 'character-female-c', 'character-female-f']
/** Who wears what. Blue is police, dark-and-white is a medic, plain dark is a fire crew under a tint. */
export const CREW_IDS = {
  police: ['character-female-a', 'character-male-d'],
  ambulance: ['character-female-e', 'character-male-e'],
  fire: ['character-male-c', 'character-female-d'],
} as const
const SERVICE_IDS = Object.values(CREW_IDS).flat()

/**
 * Was wächst — und warum es jetzt deutlich mehr ist.
 *
 * Aus dem Nature Kit lagen elf von rund neunzig Modellen im Repo, und die elf waren neun Laubbäume
 * einer einzigen Jahreszeit und zwei Sträucher. Ein Wald daraus sieht aus wie ein Wald: **alle Bäume
 * gleich alt, gleich grün, gleich gesund.**
 *
 * Das Kit hält für jeden seiner Bäume eine `_dark`- und eine `_fall`-Fassung bereit — dieselbe
 * Silhouette in dunklerem Grün und in Herbstfärbung — dazu Nadelbäume, Grasbüschel, Feldblumen,
 * Zäune, Tore, Fruchtreihen, Feldsteine, Stümpfe und Totholz. Genau das, was einer leeren Wiese
 * fehlt, vom selben Künstler und im selben Stil, und alles zusammen **380 Kilobyte**.
 *
 * Jede Art ist eine eigene Instanz und damit ein eigener Draw, deshalb steht hier eine Auswahl und
 * nicht das ganze Kit: die Sorten, die aus der Luft einen Unterschied machen.
 */
const NATURE_IDS = [
  // Laubbäume, jetzt in drei Färbungen statt einer.
  'tree_default',
  'tree_default_dark',
  'tree_detailed',
  'tree_oak',
  'tree_oak_dark',
  'tree_oak_fall',
  'tree_tall',
  'tree_tall_fall',
  'tree_thin',
  'tree_small',
  'tree_fat',
  // Nadelholz für die Forsten.
  'tree_pineTallA',
  'tree_pineRoundA',
  'tree_pineDefaultA',
  // Unterholz und Hecke.
  'plant_bushLarge',
  'plant_bushSmall',
  // Und was auf einer Wiese sonst noch steht.
  'grass',
  'grass_large',
  'grass_leafs',
  'flower_yellowA',
  'flower_purpleA',
  'rock_smallA',
  'stump_round',
  'log_stack',
  'fence_simple',
  'fence_gate',
  'crops_wheatStageB',
  'crops_cornStageC',
]

/**
 * Was davon ein Baum ist, was Bodendecke und was Flurstück-Zubehör.
 *
 * Die Rollen stehen hier und nicht im Renderer, weil sie am Modell hängen und nicht am Ort: ein
 * Grasbüschel ist überall ein Grasbüschel. `addTrees` pflanzt Bäume in Wälder und Parks, die Hecken
 * ziehen aus den Sträuchern, und die Bodendecke ist eine eigene Schicht mit eigener Sichtweite —
 * dreißigtausend Grasbüschel über zehn Kilometer wären sonst dreißigtausend Grasbüschel, die
 * niemand sieht.
 */
export const GROUND_COVER_IDS = new Set(['grass', 'grass_large', 'grass_leafs', 'flower_yellowA', 'flower_purpleA'])
export const FIELD_CLUTTER_IDS = new Set(['rock_smallA', 'stump_round', 'log_stack', 'fence_simple', 'fence_gate', 'crops_wheatStageB', 'crops_cornStageC'])

/**
 * Street furniture, from the road kit. The signals and the lamps are picked out of it by name; the
 * rest is what a pavement has on it — signs, a skip, the cones round whatever is being dug up.
 */
const TRAFFIC_LIGHT_ID = 'traffic-light'
const STREET_LAMP_ID = 'light-curved'
const FURNITURE_IDS = ['road-sign-street', 'road-sign-warning', 'road-sign-stop', 'construction-cone', 'construction-barrier', 'dumpster']
const ROAD_IDS = [TRAFFIC_LIGHT_ID, STREET_LAMP_ID, ...FURNITURE_IDS]

/**
 * The animation every character is frozen in, and how far apart down it they are frozen.
 *
 * The kit's people are skinned meshes, and a skinned mesh read straight out of the file is in its
 * bind pose: arms out, feet together, two metres across at the fingertips. Instancing cannot skin,
 * so the pose is baked once at load — each character at a different point in the walk cycle, so a
 * pavement full of them is a crowd mid-stride rather than a rank of scarecrows.
 */
const WALK_CLIP = 'walk'
/** A rider is not walking. The kit has a pose for sitting and it is what somebody on a bike does. */
const SIT_CLIP = 'sit'
/**
 * How many moments of the walk each character is baked at.
 *
 * Four is the fewest that reads as walking rather than as a limp: contact, passing, contact, passing
 * again on the other leg. It is also what halving the crowd's models paid for — six characters at
 * four phases is twenty-four meshes, against the twelve at one phase it replaces, and only the ones
 * near the camera are ever drawn.
 */
const WALK_PHASES = 4

/** Which character a phased model belongs to, and which phase it is. `character-male-a#2`. */
export function phaseOf(id: string): number {
  const at = id.indexOf('#')
  return at < 0 ? 0 : Number(id.slice(at + 1))
}

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
  /**
   * The same material once per skin tone, each with its own recoloured copy of the atlas.
   *
   * A character is drawn with one of them for the session. See `world/structures/complexion.ts` for why the
   * atlas is recoloured rather than the figure tinted.
   */
  peopleSkins: THREE.MeshStandardMaterial[]
  natureMaterial: THREE.MeshStandardMaterial
  /** Grasbüschel und Feldblumen: dicht, klein, und nur in der Nähe der Kamera gezeichnet. */
  groundCover: CityModel[]
  /** Feldsteine, Stümpfe, Totholz, Zäune, Fruchtreihen — was auf einem bewirtschafteten Schlag steht. */
  fieldClutter: CityModel[]
  roadsMaterial: THREE.MeshStandardMaterial
  trafficLight: CityModel | null
  streetLamp: CityModel | null
  furniture: CityModel[]
  houses: CityModel[]
  offices: CityModel[]
  towers: CityModel[]
  distant: CityModel[]
  trees: CityModel[]
  vehicles: CityModel[]
  /** The public, in plain clothes, posed mid-stride. */
  people: CityModel[]
  /** The same six, sitting, for anybody on a bike. */
  riders: CityModel[]
  /** The six in uniform. Only ever used by somebody on duty — see `CREW_IDS`. */
  crew: CityModel[]
}

/**
 * A 1×1 transparent pixel, served as a file. Every model in a kit points at the same
 * `Textures/colormap.png`, and the loader has no idea that fifty requests for it are one texture —
 * it fetched, decoded and uploaded the atlas once per model. The kits' images are redirected here
 * and each real atlas is loaded once, by hand, below.
 *
 * A file rather than a data URI because the loader would not read the data URI and logged a failure
 * for every textured model in every kit — eighty-eight console errors on a clean load, all of them
 * harmless and all of them noise over anything that was not.
 */
const BLANK_PIXEL = `${MODELS_BASE}/blank.png`

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
 * Ein Rad ist aus jeder Kamera dieses Spiels ein paar Pixel groß — und kostet 332 Dreiecke.
 *
 * Nachgemessen an jedem Fahrzeug des Kits: eine Limousine hat 2.032 Dreiecke, davon **704 für die
 * Karosserie und 1.328 für vier Räder**. Die Räder sind zwei Drittel jedes Autos, und es gibt
 * dreizehn Modelle, von denen bis zu sechshundert gleichzeitig fahren. In einer Szene mit 14,4
 * Millionen Dreiecken ist der Verkehr damit der größte Einzelposten — schwerer als die halbe Stadt,
 * und pro Stück fünfmal schwerer als der aufwendigste Baum.
 *
 * Das Kit benennt sie selbst: `wheel-front-left` und so weiter. Sie werden beim Laden durch einen
 * Zylinder mit zehn Seiten ersetzt, auf die Maße des Originals gezogen und in dessen Farbe. Aus der
 * Nähe sieht man den Unterschied an der Silhouette der Lauffläche; aus zehn Metern nicht mehr, und
 * näher kommt die Kamera nie an ein fahrendes Auto heran.
 *
 * Eine Limousine kostet danach **880 statt 2.032 Dreiecke.**
 */
const WHEEL_SIDES = 10

function simplifyWheel(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  if (!/^wheel/i.test(mesh.name))
    return null
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  if (!box)
    return null
  const size = new THREE.Vector3()
  box.getSize(size)
  const centre = new THREE.Vector3()
  box.getCenter(centre)
  /*
   * Die Achse ist die dünnste Richtung des Rades — ohne Annahme darüber, wie das Modell gedreht im
   * Kit liegt, denn die Fahrzeuge zeigen nicht alle in dieselbe Richtung.
   */
  const axis = size.x < size.y && size.x < size.z ? 'x' : size.y < size.z ? 'y' : 'z'
  const radius = axis === 'x' ? Math.max(size.y, size.z) / 2 : axis === 'y' ? Math.max(size.x, size.z) / 2 : Math.max(size.x, size.y) / 2
  const width = size[axis]
  const wheel = new THREE.CylinderGeometry(radius, radius, width, WHEEL_SIDES)
  if (axis === 'x')
    wheel.rotateZ(Math.PI / 2)
  else if (axis === 'z')
    wheel.rotateX(Math.PI / 2)
  wheel.translate(centre.x, centre.y, centre.z)
  /*
   * **Und die UVs des Originals mitnehmen, sonst wird das Rad zum Farbfächer.**
   *
   * Die Fahrzeuge malen über einen Atlas, in dem jeder Farbton ein einzelnes Texel ist. Ein frischer
   * `CylinderGeometry` bringt seine eigene Abwicklung mit — die zieht sich über den halben Atlas, und
   * genau so sah es aus: gestreifte Regenbogenreifen. Was ein Rad braucht, ist **ein** Texel, und zwar
   * das des Reifens.
   *
   * Genommen wird es von der Ecke des Originals, die am weitesten von der Radmitte weg liegt: das ist
   * die Lauffläche und nie die Nabe. Alle Ecken des Zylinders bekommen dieselbe Koordinate, also
   * dieselbe Farbe, und ein Reifen ist einfarbig.
   */
  const source = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
  const points = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  let u = 0
  let v = 0
  if (source && points) {
    let furthest = -1
    for (let vertex = 0; vertex < points.count; vertex += 1) {
      const dx = points.getX(vertex) - centre.x
      const dy = points.getY(vertex) - centre.y
      const dz = points.getZ(vertex) - centre.z
      // Abstand quer zur Achse: die Lauffläche, nicht die Flanke.
      const across = axis === 'x' ? dy * dy + dz * dz : axis === 'y' ? dx * dx + dz * dz : dx * dx + dy * dy
      if (across > furthest) {
        furthest = across
        u = source.getX(vertex)
        v = source.getY(vertex)
      }
    }
  }
  const count = wheel.getAttribute('position').count
  const uv = new Float32Array(count * 2)
  for (let vertex = 0; vertex < count; vertex += 1) {
    uv[vertex * 2] = u
    uv[vertex * 2 + 1] = v
  }
  wheel.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return wheel
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
    // Räder sind zwei Drittel jedes Fahrzeugs und ein paar Pixel groß. Siehe `simplifyWheel`.
    const geometry = object instanceof THREE.SkinnedMesh
      ? bakePose(object)
      : (simplifyWheel(object) ?? object.geometry.clone())
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

/**
 * Freeze a skinned mesh where its skeleton currently stands.
 *
 * Every vertex is pushed through the bones that move it, exactly as the vertex shader would, and the
 * result is written back as plain geometry. It is a pose and not an animation — these are figures
 * seen from across a street — but it is a pose of a person walking rather than the bind pose, which
 * is what the file actually contains and which is a T.
 */
function bakePose(mesh: THREE.SkinnedMesh): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone()
  const position = geometry.attributes.position
  if (!position || !geometry.attributes.skinIndex || !geometry.attributes.skinWeight)
    return geometry

  const vertex = new THREE.Vector3()
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position as THREE.BufferAttribute, index)
    mesh.applyBoneTransform(index, vertex)
    position.setXYZ(index, vertex.x, vertex.y, vertex.z)
  }
  position.needsUpdate = true
  geometry.deleteAttribute('skinIndex')
  geometry.deleteAttribute('skinWeight')
  geometry.computeVertexNormals()
  return geometry
}

interface Kit {
  models: CityModel[]
  material: THREE.MeshStandardMaterial
}

async function loadKit(loader: GLTFLoader, folder: string, ids: string[], atlas: THREE.Texture | null, failures: string[], poseClip?: string, phases = 1): Promise<Kit> {
  /*
   * One model that fails to arrive is a gap in the catalogue, not a reason to leave the player on a
   * loading screen forever. Whatever would have used it falls back to another model in the same
   * pool, and the failures are collected so the reason still reaches the surface.
   */
  /*
   * One entry per model, or several — one per phase of the clip — where a walk is wanted.
   *
   * Instancing cannot skin, so a figure is frozen. Frozen at one moment it slides down the street
   * with its legs apart, which is what the crowd was doing. Frozen at four moments of its own walk
   * cycle, and moved between those four as it goes, it walks: the mesh a figure is drawn from is
   * chosen by where it is in its stride.
   *
   * The file is fetched once however many phases are taken — the browser's cache sees to that — and
   * parsed once per phase, because a skeleton posed twice keeps only the second pose.
   */
  const wanted = ids.flatMap(id => Array.from({ length: phases }, (_, phase) => ({ id, phase })))
  const loaded = await Promise.all(wanted.map(async ({ id, phase }) => {
    const url = `${MODELS_BASE}/${folder}/${id}.glb`
    try {
      const gltf = await loader.loadAsync(url)
      if (poseClip)
        pose(gltf.scene, gltf.animations, poseClip, phases > 1 ? phase / phases : ids.indexOf(id) / Math.max(1, ids.length))
      return extract(phases > 1 ? `${id}#${phase}` : id, gltf.scene)
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
 * Put a model's skeleton at one moment of one of its own animations.
 *
 * `through` is where in the clip, nought to one, so twelve characters loaded together end up twelve
 * different steps into the same walk.
 */
function pose(scene: THREE.Object3D, clips: THREE.AnimationClip[], name: string, through: number): void {
  const clip = THREE.AnimationClip.findByName(clips, name) ?? clips[0]
  if (!clip)
    return
  const mixer = new THREE.AnimationMixer(scene)
  mixer.clipAction(clip).play()
  mixer.setTime(clip.duration * through)
  // `applyBoneTransform` reads the bones' world matrices, and nothing else is going to update them.
  scene.updateMatrixWorld(true)
}

/**
 * Das Laub des Naturkits ist türkis, und das ist kein Beleuchtungsfehler.
 *
 * Nachgemessen in den Dateien selbst: `leafsGreen` steht auf `[0.16, 0.79, 0.67]`, `leafsDark` auf
 * `[0.17, 0.65, 0.67]`, `grass` auf `[0.17, 0.85, 0.72]` — das sind lineare Werte, in sRGB also ein
 * helles Mintgrün um `#6EE8D8`. Das Kit ist stilisiert und meint es so; in einer Stadt, die sonst aus
 * norddeutschem Klinker, Ocker und Putz besteht, sehen zwanzigtausend türkise Bäume aus wie ein
 * Fehler. Sie waren das Erste, was an der Landschaft auffiel.
 *
 * Umgefärbt wird beim Laden und nicht im Shader: `extract` backt die Materialfarbe ohnehin in die
 * Vertexfarbe, hier wird sie nur unterwegs umgerechnet. **Kein Draw, kein Dreieck, kein zweites
 * Material** — und die Stämme bleiben unberührt, weil sie in einem ganz anderen Farbton liegen.
 *
 * Der Farbton wandert vom Cyan ins Laubgrün, die Sättigung fällt auf etwas, das gewachsen aussieht,
 * und die Helligkeit kommt herunter: ein Blätterdach ist dunkler als die Wiese darunter, und im Kit
 * war es heller.
 */

/** Der Farbtonbereich, in dem das Kit sein Laub führt — Cyan bis Blaugrün, in Grad. */
const FOLIAGE_HUE_RANGE: [number, number] = [140, 200]
/** Wohin es soll: Laubgrün bis Olivgrün. */
const LEAF_HUE_RANGE: [number, number] = [78, 112]

function naturalise(models: CityModel[]): void {
  const shade = new THREE.Color()
  const hsl = { h: 0, s: 0, l: 0 }
  for (const [index, model] of models.entries()) {
    const colours = model.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (!colours)
      continue
    /*
     * Ein Versatz je Art, damit ein Bestand gemischt aussieht. Neun Arten über die Spanne verteilt
     * heißt: eine Eiche steht neben einer helleren Birke neben einer dunklen Kiefer, und keine zwei
     * Modelle tragen denselben Grünton.
     */
    const offset = models.length > 1 ? index / (models.length - 1) : 0.5
    for (let vertex = 0; vertex < colours.count; vertex += 1) {
      shade.setRGB(colours.getX(vertex), colours.getY(vertex), colours.getZ(vertex))
      shade.getHSL(hsl)
      const degrees = hsl.h * 360
      if (degrees < FOLIAGE_HUE_RANGE[0] || degrees > FOLIAGE_HUE_RANGE[1])
        continue
      const hue = LEAF_HUE_RANGE[0] + offset * (LEAF_HUE_RANGE[1] - LEAF_HUE_RANGE[0])
      shade.setHSL(hue / 360, Math.min(0.42, hsl.s * 0.55), hsl.l * 0.52)
      colours.setXYZ(vertex, shade.r, shade.g, shade.b)
    }
    colours.needsUpdate = true
  }
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

  const [suburbanAtlas, commercialAtlas, vehicleAtlas, peopleAtlas, roadsAtlas] = await Promise.all([
    loadAtlas('city/suburban'),
    loadAtlas('city/commercial'),
    loadAtlas('vehicles'),
    loadAtlas('people'),
    loadAtlas('roads'),
  ])

  const failures: string[] = []
  const [suburban, commercial, distant, vehicles, people, riders, crew, nature, roads] = await Promise.all([
    loadKit(loader, 'city/suburban', HOUSE_IDS, suburbanAtlas, failures),
    loadKit(loader, 'city/commercial', [...OFFICE_IDS, ...TOWER_IDS], commercialAtlas, failures),
    loadKit(loader, 'city/commercial', DISTANT_IDS, commercialAtlas, failures),
    loadKit(loader, 'vehicles', VEHICLE_IDS, vehicleAtlas, failures),
    loadKit(loader, 'people', CIVILIAN_IDS, peopleAtlas, failures, WALK_CLIP, WALK_PHASES),
    // The same six again, sitting: a cyclist frozen mid-stride is somebody running on a bicycle.
    loadKit(loader, 'people', CIVILIAN_IDS, peopleAtlas, failures, SIT_CLIP),
    loadKit(loader, 'people', SERVICE_IDS, peopleAtlas, failures, WALK_CLIP),
    loadKit(loader, 'nature', NATURE_IDS, null, failures),
    loadKit(loader, 'roads', ROAD_IDS, roadsAtlas, failures),
  ])

  // Das Laub aus dem Türkis holen, in dem das Kit es liefert. Siehe `naturalise`.
  naturalise(nature.models)

  // A kit with nothing in it cannot build anything, and that is worth stopping for — by name.
  if (suburban.models.length === 0 || commercial.models.length === 0)
    throw new Error(`Kein Gebäudemodell erreichbar. Zuerst fehlgeschlagen: ${failures.slice(0, 3).join(', ')}`)

  return {
    suburbanMaterial: suburban.material,
    commercialMaterial: commercial.material,
    vehicleMaterial: vehicles.material,
    peopleMaterial: people.material,
    peopleSkins: peopleAtlas ? complexions(people.material, peopleAtlas) : [people.material],
    natureMaterial: nature.material,
    roadsMaterial: roads.material,
    trafficLight: roads.models.find(model => model.id === TRAFFIC_LIGHT_ID) ?? null,
    streetLamp: roads.models.find(model => model.id === STREET_LAMP_ID) ?? null,
    furniture: roads.models.filter(model => FURNITURE_IDS.includes(model.id)),
    houses: suburban.models,
    offices: commercial.models.filter(model => OFFICE_IDS.includes(model.id)),
    towers: commercial.models.filter(model => TOWER_IDS.includes(model.id)),
    distant: distant.models,
    /*
     * Nur die Bäume und Sträucher gehen an die Pflanzung. Bodendecke und Flurstück-Zubehör stehen
     * im selben Kit und in derselben Liste, gehören aber in eigene Schichten mit eigener Sichtweite —
     * sonst zieht `addTrees` Grasbüschel in einen Wald und Feldsteine in einen Park.
     */
    trees: nature.models.filter(model => !GROUND_COVER_IDS.has(model.id) && !FIELD_CLUTTER_IDS.has(model.id)),
    groundCover: nature.models.filter(model => GROUND_COVER_IDS.has(model.id)),
    fieldClutter: nature.models.filter(model => FIELD_CLUTTER_IDS.has(model.id)),
    vehicles: vehicles.models,
    people: people.models,
    riders: riders.models,
    crew: crew.models,
  }
}
