import type { BuildingRecord, CityBlueprint } from '../core/contracts'
import type { CityModel, CityModels } from './cityModels'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { uniform, vec4 } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../core/rng'

export interface WorldVisuals {
  buildingMeshes: THREE.InstancedMesh[]
  buildingRecords: Map<THREE.InstancedMesh, BuildingRecord[]>
  buildingColors: Map<THREE.InstancedMesh, THREE.Color[]>
  /** The two kit atlases. Night lighting is applied here rather than to a separate window mesh. */
  buildingMaterials: THREE.MeshStandardMaterial[]
  cars: THREE.InstancedMesh
  pedestrians: THREE.InstancedMesh
  /** Finished new housing. `count` grows as the construction pipeline delivers. */
  growth: THREE.InstancedMesh
  /** One crane per site, parked on the next growth parcels so building precedes buildings. */
  constructionSites: THREE.Group
  treeCrowns: StandardInstancedMesh
  treeTrunks: THREE.InstancedMesh
  sun: THREE.DirectionalLight
  /** Rides opposite the sun and carries the city through the night. */
  moon: THREE.DirectionalLight
  /** The bodies themselves: the lights are what the city sees, these are what the player sees. */
  sunBody: CelestialBody
  moonBody: CelestialBody
  /** Preetham scattering: the sky's own colour, from the horizon band up to the zenith. */
  sky: GameSky
  /** Everything that belongs to the firmament, kept centred on the camera so it never comes closer. */
  skyRig: THREE.Group
  hemisphere: THREE.HemisphereLight
  stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  /** The city's own light at night: lamp heads that glow and the pools they throw on the asphalt. */
  streetLights: StreetLights
}

export interface StreetLights {
  heads: StandardInstancedMesh
  pools: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
}

/**
 * The scattering sky with two knobs of our own bolted onto its node graph: how much of Preetham's
 * radiance we actually keep, and how far it gives way to the painted night colour underneath.
 */
export type GameSky = SkyMesh & {
  brightness: ScalarUniform
  nightFade: ScalarUniform
}

type ScalarUniform = ReturnType<typeof scalarUniform>

/** `uniform` infers cleanly from a plain number; naming the helper keeps the type readable above. */
function scalarUniform(value: number) {
  return uniform(value)
}

/**
 * A single sprite carrying both the body and the light around it.
 *
 * It was two sprites — a hard disc and an additive halo — until the halo turned out never to reach
 * the screen at all: this renderer's WebGPU path draws nothing for an additively blended sprite. One
 * normally blended sprite whose texture already fades from a solid core into a wide bloom gives the
 * same picture, in half the draw calls and with no blend mode that can silently swallow it.
 */
export interface CelestialBody {
  sprite: THREE.Sprite
}

const MAX_CONSTRUCTION_SITES = 16
/** Street lighting: how far apart the lamps stand, how tall they are, how wide their pool falls. */
const LAMP_SPACING = 110
const LAMP_HEIGHT = 11
const LAMP_POOL = 46
/** Beyond this distance from the centre the city is built from the kit's low-detail models. */
const DETAIL_RADIUS = 1_100
const AXIS_Y = /* @__PURE__ */ new THREE.Vector3(0, 1, 0)
const WHITE = /* @__PURE__ */ new THREE.Color('#ffffff')
/** Lays a plane flat on the ground. */
const FLAT = /* @__PURE__ */ new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
/**
 * The sky box sits inside the camera's far plane and centred on the camera, so this is a radius in
 * the same world units as the city rather than the astronomical figure the Preetham example uses.
 */
const SKY_RADIUS = 7_000
/** The land reaches well past the point where haze has swallowed it, so it never shows an edge. */
const GROUND_SPAN = 26_000
const CITY_HALF = 1_500
/**
 * Two belts of filler blocks. The inner one is still town; the outer one is a thinning smudge that
 * exists only to give the horizon something to be made of.
 */
const OUTSKIRT_RINGS = [
  { inner: 1_500, outer: 2_900, count: 900, bias: 0.8, minHeight: 8, maxHeight: 26 },
  { inner: 2_900, outer: 5_400, count: 700, bias: 1.5, minHeight: 6, maxHeight: 16 },
] as const
/** How much of the sun sprite is solid core before the bloom starts, and the same for the moon's face. */
const SUN_CORE = 0.26
const MOON_FACE = 0.34
/**
 * Preetham's model is written for a renderer exposed around 0.5 and the city is graded at 1.02, so
 * the raw scattering clipped to flat white from horizon to zenith — no sun could stand out against
 * it. Scaling its radiance leaves the grade of the city itself untouched.
 */
const SKY_BRIGHTNESS = 0.16

/** Instanced meshes whose material the renderer animates directly, typed so no cast is needed. */
type StandardInstancedMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>

function addGround(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): void {
  /*
   * The land runs far past the city. It used to be a 3 200 m square with the city filling 2 880 of
   * them, so the edge of the world sat 160 m behind the last house and every low camera angle showed
   * it: a plate under a dome. Now the ground outlives the fog, and the city dissolves into haze long
   * before anything ends.
   */
  const hinterland = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SPAN, GROUND_SPAN),
    new THREE.MeshStandardMaterial({ color: '#47553f', roughness: 1 }),
  )
  hinterland.rotation.x = -Math.PI / 2
  hinterland.position.y = -0.05
  scene.add(hinterland)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3_200, 3_200),
    new THREE.MeshStandardMaterial({ color: '#52634f', roughness: 0.96, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(250, GROUND_SPAN),
    new THREE.MeshStandardMaterial({ color: '#315e70', roughness: 0.25, metalness: 0.08 }),
  )
  river.rotation.x = -Math.PI / 2
  river.position.set(-1_050, 0.34, 0)
  scene.add(river)

  const promenadeMaterial = new THREE.MeshStandardMaterial({ color: '#b7afa0', roughness: 0.9 })
  for (const x of [-1_188, -912]) {
    const promenade = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 3_050), promenadeMaterial)
    promenade.position.set(x, 0.55, 0)
    promenade.receiveShadow = true
    scene.add(promenade)
  }

  addOutskirts(scene, blueprint, models)
}

/**
 * The city thins out instead of stopping. Two rings of plain blocks, unlit by any shadow and never
 * touched by the simulation, carry the built-up area from the last real street out into the haze —
 * decoration, which is why they are generated here from their own seeded stream and never appear in
 * the blueprint the simulation reads.
 */
function addOutskirts(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): void {
  const rng = createRandomStream(blueprint.definition.seed, 'outskirts')
  const placements: { x: number, z: number, width: number, depth: number, height: number, tint: number }[] = []

  for (const ring of OUTSKIRT_RINGS) {
    for (let index = 0; index < ring.count; index += 1) {
      const angle = rng.next() * Math.PI * 2
      const radius = ring.inner + rng.next() ** ring.bias * (ring.outer - ring.inner)
      // Snapped to the same block rhythm as the city, so the streets appear to carry on outward.
      const x = Math.round((Math.cos(angle) * radius) / 90) * 90 + rng.between(-14, 14)
      const z = Math.round((Math.sin(angle) * radius) / 90) * 90 + rng.between(-14, 14)
      if (Math.abs(x) < CITY_HALF && Math.abs(z) < CITY_HALF)
        continue
      if (x > -1_240 && x < -860)
        continue
      placements.push({
        x,
        z,
        width: rng.between(26, 62),
        depth: rng.between(26, 58),
        height: rng.between(ring.minHeight, ring.maxHeight),
        tint: rng.next(),
      })
    }
  }

  /*
   * The kit's own low-detail models carry the belts: a tenth of the triangles of the real thing, for
   * buildings that are a few pixels tall behind two kilometres of haze. They cast no shadow and are
   * never lit by the sun's shadow pass, which is most of what a distant building would otherwise
   * cost. Sixteen hundred of them come to sixteen draw calls.
   */
  const pool = models.distant.length > 0 ? models.distant : models.houses
  const buckets = new Map<string, typeof placements>()
  placements.forEach((placement) => {
    const model = pool[Math.floor(placement.tint * pool.length)] ?? pool[0]!
    const bucket = buckets.get(model.id) ?? []
    bucket.push(placement)
    buckets.set(model.id, bucket)
  })

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  for (const [id, bucket] of buckets) {
    const model = pool.find(entry => entry.id === id) ?? pool[0]!
    const mesh = new THREE.InstancedMesh(model.geometry, models.commercialMaterial, bucket.length)
    const footprint = Math.max(0.001, Math.max(model.size.x, model.size.z))
    bucket.forEach((placement, index) => {
      const base = Math.max(placement.width, placement.depth) / footprint
      const stretch = THREE.MathUtils.clamp(placement.height / Math.max(0.001, model.size.y * base), 0.7, 1.5)
      matrix.compose(
        position.set(placement.x, 0, placement.z),
        quaternion.setFromAxisAngle(AXIS_Y, Math.round(rng.next() * 4) * (Math.PI / 2)),
        scale.set(base, base * stretch, base),
      )
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, WHITE)
    })
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.computeBoundingSphere()
    scene.add(mesh)
  }
}

function addRoads(scene: THREE.Scene, blueprint: CityBlueprint): void {
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
function pickModel(building: BuildingRecord, models: CityModels, roll: number): { model: CityModel, commercial: boolean } {
  const footprint = Math.max(building.width, building.depth)
  const wanted = building.height / footprint
  const commercial = building.type === 'commercial' || building.type === 'modern' || building.type === 'civic' || building.type === 'industrial'
  /*
   * The city's own outer belt is built from the kit's low-detail models. A building out there is
   * never close to the camera — the controls cannot orbit past the centre far enough for it to fill
   * more than a few dozen pixels — and it drops a seventh of the scene's triangles for a difference
   * nobody can see from a strategic view.
   */
  const distant = Math.hypot(building.x, building.z) > DETAIL_RADIUS && models.distant.length > 0
  const pool = distant
    ? models.distant
    : commercial
      ? (wanted > 1.15 ? models.towers : models.offices)
      : models.houses
  if (pool.length === 0)
    return { model: models.houses[0] ?? models.offices[0]!, commercial }

  // The three closest matches, then a seeded choice between them: right proportions, varied streets.
  const ranked = [...pool].sort((a, b) => Math.abs(a.slenderness - wanted) - Math.abs(b.slenderness - wanted))
  const shortlist = ranked.slice(0, Math.min(3, ranked.length))
  return { model: shortlist[Math.floor(roll * shortlist.length)] ?? shortlist[0]!, commercial: commercial || distant }
}

/**
 * Place one model on a parcel: scaled uniformly onto its footprint, then nudged vertically toward
 * the height the simulation asked for. The nudge is clamped, because a model stretched past a third
 * of its own proportions stops reading as a building and starts reading as a mistake.
 */
function placeModel(matrix: THREE.Matrix4, building: BuildingRecord, model: CityModel, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3): void {
  const footprint = Math.max(building.width, building.depth)
  const base = footprint / Math.max(0.001, Math.max(model.size.x, model.size.z))
  const stretch = THREE.MathUtils.clamp(building.height / Math.max(0.001, model.size.y * base), 0.78, 1.4)
  matrix.compose(
    position.set(building.x, 0.8, building.z),
    quaternion.setFromAxisAngle(AXIS_Y, building.rotation),
    scale.set(base, base * stretch, base),
  )
}

function createBuildings(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): Pick<WorldVisuals, 'buildingMeshes' | 'buildingRecords' | 'buildingColors' | 'buildingMaterials'> {
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
function createGrowth(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): THREE.InstancedMesh {
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

function createConstructionSites(scene: THREE.Scene): THREE.Group {
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

function addTrees(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): Pick<WorldVisuals, 'treeTrunks' | 'treeCrowns'> {
  /*
   * The kit's trees, on their own copy of the atlas material: greenery is tinted as the city spends
   * its green space, and the houses share that atlas — tinting it in place would have drained the
   * colour out of every building in Lindenhafen along with the parks.
   */
  const material = models.suburbanMaterial.clone() as THREE.MeshStandardMaterial
  material.vertexColors = true
  const large = models.trees[0] ?? models.trees[1]
  const small = models.trees[1] ?? models.trees[0]
  const half = Math.ceil(blueprint.trees.length / 2)

  function plant(model: CityModel | undefined, records: typeof blueprint.trees): StandardInstancedMesh {
    const geometry = model?.geometry ?? new THREE.IcosahedronGeometry(4.8, 1)
    const footprint = Math.max(0.001, Math.max(model?.size.x ?? 1, model?.size.z ?? 1))
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, records.length))
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    records.forEach((tree, index) => {
      const size = (9 / footprint) * tree.scale
      matrix.compose(
        position.set(tree.x, 0, tree.z),
        quaternion.setFromAxisAngle(AXIS_Y, (index % 8) * (Math.PI / 4)),
        scale.set(size, size, size),
      )
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, WHITE)
    })
    mesh.castShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    scene.add(mesh)
    return mesh
  }

  return {
    treeCrowns: plant(large, blueprint.trees.slice(0, half)),
    treeTrunks: plant(small, blueprint.trees.slice(half)),
  }
}

/**
 * Lamps down the arterials. Every one is an instance of the same three shapes, so the whole of the
 * city's night lighting is three draw calls and no actual lights — a real point light per lamp would
 * mean two hundred and sixty of them in a forward renderer, and the look does not need it: a glowing
 * head and a warm pool on the road read as street lighting from every distance the camera allows.
 */
function addStreetLights(scene: THREE.Scene, blueprint: CityBlueprint): StreetLights {
  const positions: { x: number, z: number, alongZ: boolean }[] = []
  for (const road of blueprint.roads) {
    if (!road.arterial)
      continue
    const alongZ = road.axis === 'z'
    const side = alongZ ? road.x : road.z
    for (let along = -1_400; along <= 1_400; along += LAMP_SPACING) {
      const offset = ((along / LAMP_SPACING) % 2 === 0 ? 1 : -1) * 17
      positions.push(alongZ ? { x: side + offset, z: along, alongZ } : { x: along, z: side + offset, alongZ })
    }
  }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const box = new THREE.BoxGeometry(1, 1, 1)

  const masts = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#3a3f42', roughness: 0.7, metalness: 0.3 }), positions.length)
  const heads = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#2c2f31', emissive: '#ffcb7a', emissiveIntensity: 0, roughness: 0.4 }), positions.length) as StandardInstancedMesh
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffc478', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }),
    positions.length,
  ) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

  positions.forEach((lamp, index) => {
    const turn = lamp.alongZ ? 0 : Math.PI / 2
    matrix.compose(position.set(lamp.x, LAMP_HEIGHT / 2, lamp.z), quaternion.setFromAxisAngle(AXIS_Y, turn), scale.set(0.9, LAMP_HEIGHT, 0.9))
    masts.setMatrixAt(index, matrix)
    matrix.compose(position.set(lamp.x, LAMP_HEIGHT, lamp.z), quaternion.setFromAxisAngle(AXIS_Y, turn), scale.set(4.2, 0.9, 1.4))
    heads.setMatrixAt(index, matrix)
    // Flat on the road, a touch above it so the asphalt does not fight it for the same depth.
    matrix.compose(position.set(lamp.x, 0.92, lamp.z), FLAT, scale.set(LAMP_POOL, LAMP_POOL, 1))
    pools.setMatrixAt(index, matrix)
  })

  masts.castShadow = true
  masts.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  heads.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  pools.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  pools.renderOrder = 1
  scene.add(masts, heads, pools)
  return { heads, pools }
}

function addLandmarks(scene: THREE.Scene): void {
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

function createAgents(scene: THREE.Scene): Pick<WorldVisuals, 'cars' | 'pedestrians'> {
  const cars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(8.4, 3.2, 4),
    new THREE.MeshStandardMaterial({ color: '#c54a3d', roughness: 0.5, metalness: 0.18, vertexColors: true }),
    180,
  )
  const carPalette = ['#c94b3e', '#d9d2c2', '#274f63', '#323638', '#d6a636', '#66715d']
  for (let index = 0; index < 180; index += 1) cars.setColorAt(index, new THREE.Color(carPalette[index % carPalette.length]))
  cars.castShadow = true
  scene.add(cars)

  const pedestrians = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.62, 1.8, 3, 5),
    new THREE.MeshStandardMaterial({ color: '#d6c9b5', roughness: 0.88, vertexColors: true }),
    320,
  )
  const peoplePalette = ['#d85848', '#315d70', '#d6b258', '#39473d', '#efe5d1', '#895f74']
  for (let index = 0; index < 320; index += 1) pedestrians.setColorAt(index, new THREE.Color(peoplePalette[index % peoplePalette.length]))
  pedestrians.castShadow = true
  scene.add(pedestrians)
  return { cars, pedestrians }
}

/**
 * A dome of points far outside the city. Only the upper hemisphere is populated, so the horizon
 * stays clean and no star ever appears below the rooftops.
 */
function createStars(parent: THREE.Object3D, seed: number): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const rng = createRandomStream(seed, 'stars')
  const count = 900
  const positions = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    const azimuth = rng.next() * Math.PI * 2
    // Biased toward the zenith so the band near the horizon stays sparse.
    const height = 0.12 + rng.next() ** 0.7 * 0.88
    const radius = Math.sqrt(Math.max(0, 1 - height * height)) * 4_200
    positions[index * 3] = Math.cos(azimuth) * radius
    positions[index * 3 + 1] = height * 3_000 + 200
    positions[index * 3 + 2] = Math.sin(azimuth) * radius
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: '#dfe7f2', size: 7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
  const stars = new THREE.Points(geometry, material)
  stars.frustumCulled = false
  parent.add(stars)
  return stars
}

/**
 * The sun: a solid core out to a sixth of the sprite, then light thinning into the sky around it.
 * Painting the bloom into the texture is what makes the sun read as a source rather than a sticker.
 */
function sunTexture(): THREE.CanvasTexture {
  return paint((context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(SUN_CORE, 'rgba(255, 255, 255, 1)')
    for (let step = 1; step <= 20; step += 1) {
      const k = step / 20
      gradient.addColorStop(SUN_CORE + (1 - SUN_CORE) * k, `rgba(255, 255, 255, ${0.94 * (1 - k) ** 2.6})`)
    }
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  })
}

/**
 * The moon's face, drawn once: a pale disc with a handful of soft maria and a faint halo beyond its
 * rim. Seeded, so the same city always gets the same moon, and stylised rather than photographic —
 * it is read at three degrees wide.
 */
function moonTexture(seed: number): THREE.CanvasTexture {
  return paint((context, size) => {
    const rng = createRandomStream(seed, 'moon')
    const centre = size / 2
    const face = size * MOON_FACE

    // The glow first, so the face paints over it.
    const glow = context.createRadialGradient(centre, centre, face * 0.9, centre, centre, centre)
    glow.addColorStop(0, 'rgba(198, 214, 240, 0.42)')
    glow.addColorStop(0.45, 'rgba(178, 196, 226, 0.12)')
    glow.addColorStop(1, 'rgba(170, 190, 222, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, size, size)

    const disc = context.createRadialGradient(centre, centre, 0, centre, centre, face)
    disc.addColorStop(0, 'rgba(250, 250, 246, 1)')
    disc.addColorStop(0.84, 'rgba(228, 230, 234, 1)')
    disc.addColorStop(0.97, 'rgba(206, 212, 222, 1)')
    disc.addColorStop(1, 'rgba(206, 212, 222, 0)')
    context.fillStyle = disc
    context.beginPath()
    context.arc(centre, centre, face, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.beginPath()
    context.arc(centre, centre, face * 0.98, 0, Math.PI * 2)
    context.clip()
    for (let index = 0; index < 9; index += 1) {
      const angle = rng.next() * Math.PI * 2
      const distance = rng.next() ** 0.6 * face * 0.72
      const radius = face * (0.08 + rng.next() * 0.2)
      const x = centre + Math.cos(angle) * distance
      const y = centre + Math.sin(angle) * distance
      const mare = context.createRadialGradient(x, y, 0, x, y, radius)
      mare.addColorStop(0, 'rgba(158, 167, 181, 0.55)')
      mare.addColorStop(1, 'rgba(158, 167, 181, 0)')
      context.fillStyle = mare
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  })
}

/** A soft round glow with no edge, used for the pool a street lamp throws on the road. */
function glowTexture(): THREE.CanvasTexture {
  return paint((context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (let step = 0; step <= 16; step += 1) {
      const t = step / 16
      gradient.addColorStop(t, `rgba(255, 255, 255, ${(1 - t) ** 2.4})`)
    }
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  })
}

/** One square canvas, painted by the caller and handed back as a texture. */
function paint(draw: (context: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context)
    draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Sun and moon are sprites, not spheres: at three degrees across a sphere is a disc anyway, and a
 * sprite never turns its lit side away from the player. They sit outside the ground plane so they
 * rise and set at the true horizon, write no depth, and are lit by nothing.
 */
function createCelestialBody(parent: THREE.Object3D, map: THREE.Texture, color: string, scale: number): CelestialBody {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }))
  sprite.scale.setScalar(scale)
  sprite.frustumCulled = false
  parent.add(sprite)
  return { sprite }
}

export function createWorld(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): WorldVisuals {
  addGround(scene, blueprint, models)
  addRoads(scene, blueprint)
  const buildingVisuals = createBuildings(scene, blueprint, models)
  const trees = addTrees(scene, blueprint, models)
  addLandmarks(scene)
  const growth = createGrowth(scene, blueprint, models)
  const constructionSites = createConstructionSites(scene)
  const agents = createAgents(scene)

  const hemisphere = new THREE.HemisphereLight('#d8e4e7', '#4a4439', 2.25)
  scene.add(hemisphere)

  /*
   * The firmament rides with the camera. Panning across a city three kilometres wide would otherwise
   * walk the player straight through a sky box that has to stay inside the camera's far plane, and
   * the sun would slide across the horizon as the player scrolled — a sky is by definition the one
   * thing that does not move when you do.
   */
  const skyRig = new THREE.Group()
  skyRig.frustumCulled = false
  scene.add(skyRig)

  const sky = new SkyMesh() as GameSky
  sky.scale.setScalar(SKY_RADIUS)
  /*
   * Preetham is written for a renderer exposed around 0.5 and the city is graded at 1.02, so the
   * raw scattering clipped to flat white. Scaling its radiance inside the node graph keeps the grade
   * of the city itself untouched, and the alpha lets the painted night colour take over below the
   * horizon instead of the model's own near-black.
   */
  sky.brightness = scalarUniform(SKY_BRIGHTNESS)
  sky.nightFade = scalarUniform(1)
  // The node the mesh built is a vec4; the shipped types widen it until the swizzle is gone.
  const scattering = sky.material.colorNode as ReturnType<typeof vec4> | null
  if (scattering)
    sky.material.colorNode = vec4(scattering.rgb.mul(sky.brightness), sky.nightFade)
  sky.material.transparent = true
  // The sun is a sprite we art-direct; the model's own disc only added a second, blinding one.
  sky.showSunDisc.value = 0
  sky.turbidity.value = 2.6
  sky.rayleigh.value = 1.8
  /*
   * Mie scattering is the haze that piles up around the sun. At the model's default it swallowed a
   * third of the sky in white whenever the player looked toward it, and no disc could be seen in
   * front of that — the sun has to be brighter than its own glow to read as an object.
   */
  sky.mieCoefficient.value = 0.0022
  sky.mieDirectionalG.value = 0.82
  sky.cloudCoverage.value = 0.42
  sky.cloudDensity.value = 0.34
  sky.cloudScale.value = 0.00018
  sky.cloudSpeed.value = 0.000012
  sky.renderOrder = -1
  skyRig.add(sky)

  const stars = createStars(skyRig, blueprint.definition.seed)
  const streetLights = addStreetLights(scene, blueprint)
  const sun = new THREE.DirectionalLight('#fff2d2', 4.2)
  sun.position.set(-700, 1_100, -420)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -720
  sun.shadow.camera.right = 720
  sun.shadow.camera.top = 720
  sun.shadow.camera.bottom = -720
  sun.shadow.camera.near = 80
  sun.shadow.camera.far = 2_400
  sun.shadow.bias = -0.00035
  // The renderer drives shadow refreshes itself, on a slower cadence than the frame.
  sun.shadow.autoUpdate = false
  sun.shadow.needsUpdate = true
  scene.add(sun)

  const moon = new THREE.DirectionalLight('#b9c6d4', 0)
  moon.position.set(700, 900, 420)
  scene.add(moon)

  const sunBody = createCelestialBody(skyRig, sunTexture(), '#fffdf6', 520)
  const moonBody = createCelestialBody(skyRig, moonTexture(blueprint.definition.seed), '#eef3fa', 430)

  return { ...buildingVisuals, ...agents, ...trees, growth, constructionSites, sun, moon, sunBody, moonBody, sky, skyRig, hemisphere, stars, streetLights }
}
