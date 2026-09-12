import type { BuildingRecord, CityBlueprint } from '../core/contracts'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { uniform, vec4 } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../core/rng'

export interface WorldVisuals {
  buildingMeshes: THREE.InstancedMesh[]
  buildingRecords: Map<THREE.InstancedMesh, BuildingRecord[]>
  buildingColors: Map<THREE.InstancedMesh, THREE.Color[]>
  windows: StandardInstancedMesh
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
/**
 * The sky box sits inside the camera's far plane and centred on the camera, so this is a radius in
 * the same world units as the city rather than the astronomical figure the Preetham example uses.
 */
const SKY_RADIUS = 7_000
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

const BUILDING_COLORS: Record<BuildingRecord['type'], string[]> = {
  altbau: ['#b8896f', '#d3b095', '#a66f62', '#c8a878'],
  modern: ['#8fa8aa', '#c1c7c3', '#718d91', '#dad6ca'],
  residential: ['#d0b98d', '#b7c29b', '#c38e78', '#d7d0bb'],
  commercial: ['#71868b', '#94a7a5', '#65767b', '#a6aaa0'],
  industrial: ['#6b7473', '#8a8172', '#596a6e', '#84796c'],
  civic: ['#c3b59e', '#8da7a2', '#b9c0b7', '#d0c3aa'],
}

function addGround(scene: THREE.Scene): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3_200, 3_200),
    new THREE.MeshStandardMaterial({ color: '#52634f', roughness: 0.96, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 3_200),
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

function createBuildings(scene: THREE.Scene, blueprint: CityBlueprint): Pick<WorldVisuals, 'buildingMeshes' | 'buildingRecords' | 'buildingColors' | 'windows'> {
  const rng = createRandomStream(blueprint.definition.seed, 'render-colors')
  const grouped = new Map<BuildingRecord['type'], BuildingRecord[]>()
  for (const building of blueprint.buildings) {
    const records = grouped.get(building.type) ?? []
    records.push(building)
    grouped.set(building.type, records)
  }

  const buildingMeshes: THREE.InstancedMesh[] = []
  const buildingRecords = new Map<THREE.InstancedMesh, BuildingRecord[]>()
  const buildingColors = new Map<THREE.InstancedMesh, THREE.Color[]>()
  const box = new THREE.BoxGeometry(1, 1, 1)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()

  for (const [type, records] of grouped) {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: type === 'modern' ? 0.56 : 0.83, metalness: type === 'modern' ? 0.08 : 0.01, vertexColors: true })
    const mesh = new THREE.InstancedMesh(box, material, records.length)
    const colors: THREE.Color[] = []
    records.forEach((building, index) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), building.rotation)
      matrix.compose(
        new THREE.Vector3(building.x, building.height / 2 + 0.8, building.z),
        quaternion,
        new THREE.Vector3(building.width, building.height, building.depth),
      )
      mesh.setMatrixAt(index, matrix)
      const palette = BUILDING_COLORS[type]
      const source = palette[Math.floor(rng.next() * palette.length)] ?? palette[0] ?? '#aaaaaa'
      const color = new THREE.Color(source).multiplyScalar(0.82 + building.condition * 0.18)
      colors.push(color)
      mesh.setColorAt(index, color)
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

  const detailed = blueprint.buildings.filter(building => Math.abs(building.x) < 620 && Math.abs(building.z) < 860 && building.height > 16)
  const windowCount = detailed.reduce((sum, building) => sum + Math.min(8, Math.max(3, Math.floor(building.height / 5))), 0)
  const windowMaterial = new THREE.MeshStandardMaterial({ color: '#809ca1', emissive: '#203a41', emissiveIntensity: 0.28, roughness: 0.35 })
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.18), windowMaterial, windowCount)
  let windowIndex = 0
  for (const building of detailed) {
    const floorCount = Math.min(8, Math.max(3, Math.floor(building.height / 5)))
    for (let floor = 0; floor < floorCount; floor += 1) {
      matrix.compose(
        new THREE.Vector3(building.x, 4.2 + floor * 4.2, building.z + building.depth / 2 + 0.12),
        new THREE.Quaternion(),
        new THREE.Vector3(building.width * 0.64, 1.65, 1),
      )
      windows.setMatrixAt(windowIndex, matrix)
      windowIndex += 1
    }
  }
  scene.add(windows)

  return { buildingMeshes, buildingRecords, buildingColors, windows }
}

function addRoofs(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const pitched = blueprint.buildings.filter(building => building.type === 'altbau' || building.type === 'residential')
  const roof = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.72, 0.34, 4),
    new THREE.MeshStandardMaterial({ color: '#713f36', roughness: 0.92 }),
    pitched.length,
  )
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)
  pitched.forEach((building, index) => {
    matrix.compose(
      new THREE.Vector3(building.x, building.height + 4.2, building.z),
      quaternion,
      new THREE.Vector3(building.width, 24, building.depth),
    )
    roof.setMatrixAt(index, matrix)
  })
  roof.castShadow = true
  scene.add(roof)
}

/** New housing on the parcels the generator left free. Hidden until the pipeline delivers. */
function createGrowth(scene: THREE.Scene, blueprint: CityBlueprint): THREE.InstancedMesh {
  const slots = blueprint.growthSlots
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.05, vertexColors: true })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, slots.length))
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const palette = ['#cdd3ce', '#b9c4bd', '#d8d2c3', '#a9b7b4']

  slots.forEach((slot, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotation)
    matrix.compose(
      new THREE.Vector3(slot.x, slot.height / 2 + 0.8, slot.z),
      quaternion,
      new THREE.Vector3(slot.width, slot.height, slot.depth),
    )
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, new THREE.Color(palette[index % palette.length]))
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

function addTrees(scene: THREE.Scene, blueprint: CityBlueprint): Pick<WorldVisuals, 'treeTrunks' | 'treeCrowns'> {
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.7, 0.95, 7, 6),
    new THREE.MeshStandardMaterial({ color: '#554433', roughness: 1 }),
    blueprint.trees.length,
  )
  const crown = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(4.8, 1),
    new THREE.MeshStandardMaterial({ color: '#315943', roughness: 0.96 }),
    blueprint.trees.length,
  )
  const matrix = new THREE.Matrix4()
  blueprint.trees.forEach((tree, index) => {
    matrix.compose(new THREE.Vector3(tree.x, 3.5 * tree.scale, tree.z), new THREE.Quaternion(), new THREE.Vector3(tree.scale, tree.scale, tree.scale))
    trunk.setMatrixAt(index, matrix)
    matrix.compose(new THREE.Vector3(tree.x, 9 * tree.scale, tree.z), new THREE.Quaternion(), new THREE.Vector3(tree.scale, tree.scale, tree.scale))
    crown.setMatrixAt(index, matrix)
  })
  trunk.castShadow = true
  crown.castShadow = true
  scene.add(trunk, crown)
  return { treeTrunks: trunk, treeCrowns: crown }
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

export function createWorld(scene: THREE.Scene, blueprint: CityBlueprint): WorldVisuals {
  addGround(scene)
  addRoads(scene, blueprint)
  const buildingVisuals = createBuildings(scene, blueprint)
  addRoofs(scene, blueprint)
  const trees = addTrees(scene, blueprint)
  addLandmarks(scene)
  const growth = createGrowth(scene, blueprint)
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

  return { ...buildingVisuals, ...agents, ...trees, growth, constructionSites, sun, moon, sunBody, moonBody, sky, skyRig, hemisphere, stars }
}
