import type { BuildingRecord, CityBlueprint, SimulationSnapshot, SkyState } from '../core/contracts'
import type { WorldVisuals } from './createWorld'
import { MapControls } from 'three/addons/controls/MapControls.js'
import * as THREE from 'three/webgpu'
import { createWorld } from './createWorld'

export interface RendererStats {
  backend: string
  fps: number
  drawCalls: number
  triangles: number
  buildings: number
}

export interface CityRendererOptions {
  canvas: HTMLCanvasElement
  blueprint: CityBlueprint
  onBuildingSelected: (building: BuildingRecord | null) => void
  onReady: (stats: RendererStats) => void
  onStats: (stats: RendererStats) => void
  onError: (message: string) => void
}

/** Palette constants, hoisted so the render loop allocates no colours at all. */
const NIGHT_SKY = 0x0D1522
const DAY_SKY = new THREE.Color('#94aebc')
const EMBER = new THREE.Color('#c9764f')
const SUN_WHITE = 0xFFF2D2
const NIGHT_AMBIENT = 0x2C3D55
const DAY_AMBIENT = new THREE.Color('#d8e4e7')

export class CityRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 2, 8_000)
  private readonly renderer: THREE.WebGPURenderer
  private readonly controls: MapControls
  private readonly visuals: WorldVisuals
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly timer = new THREE.Timer()
  private readonly onBuildingSelected: CityRendererOptions['onBuildingSelected']
  private readonly onStats: CityRendererOptions['onStats']
  private readonly buildingCount: number
  private readonly resizeObserver: ResizeObserver
  private hovered: { mesh: THREE.InstancedMesh, index: number } | null = null
  private selected: BuildingRecord | null = null
  private focusTween: { started: number, fromTarget: THREE.Vector3, toTarget: THREE.Vector3, fromCamera: THREE.Vector3, toCamera: THREE.Vector3 } | null = null
  private frameCounter = 0
  private fps = 0
  private fpsWindowStart = performance.now()
  private animationElapsed = 0
  private trafficFactor = 1
  private readonly blueprint: CityBlueprint
  /** Dwellings one rendered building stands for, so the skyline scales with the real stock. */
  private readonly unitsPerBuilding: number
  private nightLife = 0.67
  private appliedBlight = -1
  /** Where the sky should be, handed in by the store; `sky` eases toward it between updates. */
  private skyTarget: SkyState = { hourOfDay: 12, elevation: 1, sweep: 0.5, phase: 'noon', temperature: 10 }
  private sky = { elevation: 1, sweep: 0.5 }
  /*
   * Scratch instances reused every frame. Allocating inside the loop produced roughly 41 000
   * throwaway objects per second at 60 fps, all of which the collector had to sweep.
   */
  private readonly scratchMatrix = new THREE.Matrix4()
  private readonly scratchQuaternion = new THREE.Quaternion()
  private readonly scratchPosition = new THREE.Vector3()
  private readonly scratchScale = new THREE.Vector3(1, 1, 1)
  private readonly axisY = new THREE.Vector3(0, 1, 0)
  private readonly skyColour = new THREE.Color()
  private readonly sunColour = new THREE.Color()
  private readonly hemisphereColour = new THREE.Color()
  /** Shadows are re-rendered on a slower cadence than the frame; the sun barely moves between them. */
  private shadowClock = 0

  constructor(options: CityRendererOptions) {
    this.canvas = options.canvas
    this.onBuildingSelected = options.onBuildingSelected
    this.onStats = options.onStats
    this.buildingCount = options.blueprint.buildings.length
    this.blueprint = options.blueprint
    this.unitsPerBuilding = 62_000 / Math.max(1, options.blueprint.buildings.length + options.blueprint.growthSlots.length)
    const forceWebGL = new URLSearchParams(window.location.search).has('webgl')
    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, forceWebGL })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.info.autoReset = false

    this.scene.background = new THREE.Color('#94aebc')
    this.scene.fog = new THREE.FogExp2('#91a8b1', 0.00022)
    this.camera.position.set(1_650, 1_350, 1_720)

    this.controls = new MapControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.screenSpacePanning = false
    this.controls.minDistance = 34
    this.controls.maxDistance = 3_800
    this.controls.maxPolarAngle = Math.PI * 0.475
    this.controls.minPolarAngle = Math.PI * 0.09
    this.controls.target.set(0, 0, 0)
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    this.controls.touches.ONE = THREE.TOUCH.PAN
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE

    this.visuals = createWorld(this.scene, options.blueprint)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.addEventListener('click', this.handleClick)

    void this.renderer.init()
      .then(() => {
        this.resize()
        this.renderer.setAnimationLoop(this.render)
        options.onReady(this.getStats(options.blueprint.buildings.length))
      })
      .catch((error: unknown) => {
        options.onError(error instanceof Error ? error.message : 'Der 3D-Renderer konnte nicht gestartet werden.')
      })
  }

  /**
   * The sky follows campaign time, not the render loop. The store sends a reading roughly four times
   * a second; the values below are eased between those updates so the sun sweeps smoothly, and they
   * stop dead when the player pauses because the reading stops changing.
   */
  setSky(state: SkyState): void {
    this.skyTarget = state
  }

  /**
   * The city reacts to the simulation here. Everything below reads the derived `cityVisuals` block
   * of the snapshot, so the renderer never interprets raw indicators or policy identifiers itself.
   */
  applySnapshot(snapshot: SimulationSnapshot): void {
    const visuals = snapshot.cityVisuals
    const slots = this.blueprint.growthSlots

    this.trafficFactor = THREE.MathUtils.clamp(
      0.62 + snapshot.metrics.employment / 230 - visuals.transitDensity * 0.22 + (snapshot.metrics.population / 120_000 - 1) * 0.6,
      0.5,
      1.25,
    )
    this.nightLife = visuals.nightLife

    // Delivered housing fills the free parcels the generator left, from the centre outward.
    const delivered = THREE.MathUtils.clamp(Math.round(visuals.completedUnitsSinceStart / this.unitsPerBuilding), 0, slots.length)
    this.visuals.growth.count = delivered

    // Cranes stand on the next parcels in line, so building is visible before buildings are.
    const sites = Math.min(visuals.constructionSites, this.visuals.constructionSites.children.length)
    this.visuals.constructionSites.children.forEach((site, index) => {
      const slot = slots[(delivered + index) % Math.max(1, slots.length)]
      site.visible = index < sites && slot !== undefined
      if (slot)
        site.position.set(slot.x, 0, slot.z)
    })

    // Vacancy above the blight threshold drains colour out of a matching share of the stock.
    if (Math.abs(visuals.blight - this.appliedBlight) > 0.02) {
      this.appliedBlight = visuals.blight
      const derelict = new THREE.Color('#6f6f68')
      for (const mesh of this.visuals.buildingMeshes) {
        const colors = this.visuals.buildingColors.get(mesh)
        if (!colors)
          continue
        const affected = Math.floor(colors.length * visuals.blight)
        colors.forEach((color, index) => {
          mesh.setColorAt(index, index < affected ? color.clone().lerp(derelict, 0.55) : color)
        })
        if (mesh.instanceColor)
          mesh.instanceColor.needsUpdate = true
      }
    }

    // Green space is a stock the player can spend or build: fewer hectares, fewer and drier trees.
    const greenery = THREE.MathUtils.clamp(visuals.greenery, 0.45, 1.3)
    const treeCount = Math.min(this.blueprint.trees.length, Math.round(this.blueprint.trees.length * Math.min(1, greenery)))
    this.visuals.treeCrowns.count = treeCount
    this.visuals.treeTrunks.count = treeCount
    this.visuals.treeCrowns.material.color.copy(new THREE.Color('#6b6233').lerp(new THREE.Color('#315943'), THREE.MathUtils.clamp(greenery, 0, 1)))
  }

  focusBuilding(buildingId: string): void {
    const building = this.findBuilding(buildingId)
    if (!building)
      return
    const target = new THREE.Vector3(building.x, building.height * 0.35, building.z)
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    const distance = Math.max(95, building.height * 3.5)
    this.focusTween = {
      started: performance.now(),
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      fromCamera: this.camera.position.clone(),
      toCamera: target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, distance * 0.32, 0)),
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.removeEventListener('click', this.handleClick)
    this.controls.dispose()
    this.timer.dispose()
    this.renderer.dispose()
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh))
        return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    })
  }

  private findBuilding(buildingId: string): BuildingRecord | undefined {
    for (const records of this.visuals.buildingRecords.values()) {
      const result = records.find(building => building.id === buildingId)
      if (result)
        return result
    }
    return undefined
  }

  private resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0)
      return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const intersections = this.raycaster.intersectObjects(this.visuals.buildingMeshes, false)
    const hit = intersections[0]
    const next = hit?.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined ? { mesh: hit.object, index: hit.instanceId } : null
    if (this.hovered && next && this.hovered.mesh === next.mesh && this.hovered.index === next.index)
      return
    this.restoreHover()
    this.hovered = next
    if (next) {
      next.mesh.setColorAt(next.index, new THREE.Color('#f0c65a'))
      if (next.mesh.instanceColor)
        next.mesh.instanceColor.needsUpdate = true
      this.canvas.style.cursor = 'pointer'
    }
    else {
      this.canvas.style.cursor = 'grab'
    }
  }

  private readonly handlePointerLeave = (): void => {
    this.restoreHover()
    this.canvas.style.cursor = 'grab'
  }

  private readonly handleClick = (): void => {
    if (!this.hovered) {
      this.selected = null
      this.onBuildingSelected(null)
      return
    }
    const records = this.visuals.buildingRecords.get(this.hovered.mesh)
    const building = records?.[this.hovered.index] ?? null
    this.selected = building
    this.onBuildingSelected(building)
    if (building)
      this.focusBuilding(building.id)
  }

  private restoreHover(): void {
    if (!this.hovered)
      return
    const colors = this.visuals.buildingColors.get(this.hovered.mesh)
    const color = colors?.[this.hovered.index]
    if (color) {
      this.hovered.mesh.setColorAt(this.hovered.index, color)
      if (this.hovered.mesh.instanceColor)
        this.hovered.mesh.instanceColor.needsUpdate = true
    }
    this.hovered = null
  }

  private updateAgents(elapsed: number): void {
    const matrix = this.scratchMatrix
    const quaternion = this.scratchQuaternion
    const position = this.scratchPosition
    const citySpan = 2_880
    const visibleCars = Math.floor(180 * this.trafficFactor)
    this.visuals.cars.count = visibleCars
    for (let index = 0; index < visibleCars; index += 1) {
      const horizontal = index % 2 === 0
      const lane = ((index * 7) % 16) - 8
      const cross = lane * 180 + (index % 4 < 2 ? 8 : -8)
      const direction = index % 3 === 0 ? -1 : 1
      const progress = ((elapsed * (13 + (index % 7)) * direction + index * 93) % citySpan + citySpan) % citySpan - citySpan / 2
      const x = horizontal ? progress : cross
      const z = horizontal ? cross : progress
      quaternion.setFromAxisAngle(this.axisY, horizontal ? 0 : Math.PI / 2)
      matrix.compose(position.set(x, 2.15, z), quaternion, this.scratchScale)
      this.visuals.cars.setMatrixAt(index, matrix)
    }
    this.visuals.cars.instanceMatrix.needsUpdate = true

    /*
     * Pedestrians are barely a pixel from a strategic camera height, so above it they are switched
     * off entirely rather than animated into invisibility — 320 matrix writes and a buffer upload
     * saved on every frame the player spends looking at the whole city.
     */
    const distance = this.camera.position.distanceTo(this.controls.target)
    const walkers = distance > 1_100 ? 0 : 320
    this.visuals.pedestrians.count = walkers
    if (walkers === 0)
      return

    quaternion.identity()
    for (let index = 0; index < walkers; index += 1) {
      const horizontal = index % 2 === 0
      const block = ((index * 11) % 16) - 8
      const cross = block * 180 + (index % 4 < 2 ? 20 : -20)
      const progress = ((elapsed * (1.2 + (index % 5) * 0.18) + index * 51) % citySpan) - citySpan / 2
      const x = horizontal ? progress : cross
      const z = horizontal ? cross : progress
      matrix.compose(position.set(x, 2.25, z), quaternion, this.scratchScale)
      this.visuals.pedestrians.setMatrixAt(index, matrix)
    }
    this.visuals.pedestrians.instanceMatrix.needsUpdate = true
  }

  private updateFocus(now: number): void {
    if (!this.focusTween)
      return
    const raw = Math.min(1, (now - this.focusTween.started) / 1_150)
    const eased = 1 - (1 - raw) ** 3
    this.controls.target.lerpVectors(this.focusTween.fromTarget, this.focusTween.toTarget, eased)
    this.camera.position.lerpVectors(this.focusTween.fromCamera, this.focusTween.toCamera, eased)
    if (raw >= 1)
      this.focusTween = null
  }

  private updateAtmosphere(delta: number): void {
    // Ease toward the store's reading. A large jump means the campaign was reset or skipped ahead.
    const ease = Math.min(1, delta * 3.2)
    const jumped = Math.abs(this.skyTarget.sweep - this.sky.sweep) > 0.4
    this.sky.elevation = jumped ? this.skyTarget.elevation : this.sky.elevation + (this.skyTarget.elevation - this.sky.elevation) * ease
    this.sky.sweep = jumped ? this.skyTarget.sweep : this.sky.sweep + (this.skyTarget.sweep - this.sky.sweep) * ease

    const elevation = this.sky.elevation
    const daylight = THREE.MathUtils.smoothstep(elevation, -0.12, 0.28)
    // Warmth peaks while the sun sits on the horizon and fades as it climbs.
    const horizonWarmth = THREE.MathUtils.smoothstep(0.34 - Math.abs(elevation), 0, 0.34) * THREE.MathUtils.smoothstep(elevation, -0.3, 0.05)

    const sky = this.skyColour.setHex(NIGHT_SKY).lerp(DAY_SKY, daylight).lerp(EMBER, horizonWarmth * 0.62)
    this.scene.background = sky
    if (this.scene.fog instanceof THREE.FogExp2)
      this.scene.fog.color.copy(sky)

    // The sun sweeps east to west; below the horizon it keeps going so dawn arrives from the east.
    const angle = Math.PI * (1 - this.sky.sweep)
    const radius = 1_250
    this.visuals.sun.position.set(Math.cos(angle) * radius, Math.max(-400, elevation * 1_050 + 120), Math.sin(angle) * radius * 0.45)
    this.visuals.sun.intensity = 0.05 + daylight * 4.1
    this.visuals.sun.color.copy(this.sunColour.setHex(SUN_WHITE).lerp(EMBER, horizonWarmth))
    this.visuals.sun.visible = elevation > -0.16

    // The moon rides opposite the sun and only lights the city once the sun has gone.
    const moonAngle = angle + Math.PI
    this.visuals.moon.position.set(Math.cos(moonAngle) * radius, Math.max(-400, -elevation * 900 + 140), Math.sin(moonAngle) * radius * 0.45)
    this.visuals.moon.intensity = (1 - daylight) * 0.85
    this.visuals.moon.visible = elevation < 0.08

    /*
     * Night keeps its real length, so it has to stay readable: an ambient floor plus lit windows
     * carry the city through a December night instead of shortening it. See ADR-0005.
     */
    this.visuals.hemisphere.intensity = 0.42 + daylight * 1.95
    this.visuals.hemisphere.color.copy(this.hemisphereColour.setHex(NIGHT_AMBIENT).lerp(DAY_AMBIENT, daylight))

    this.visuals.stars.visible = daylight < 0.5
    const starMaterial = this.visuals.stars.material
    starMaterial.opacity = Math.max(0, 1 - daylight * 2.4)

    // Lit windows follow both the hour and how well the city is doing.
    this.visuals.windows.material.emissiveIntensity = (0.2 + (1 - daylight) * 3.1) * (0.45 + this.nightLife * 0.95)
  }

  private readonly render = (): void => {
    this.timer.update()
    const delta = Math.min(0.05, this.timer.getDelta())
    this.animationElapsed += delta
    const now = performance.now()
    /*
     * A 2048² shadow pass every frame for a sun that moves a fraction of a degree between them is
     * pure waste. Re-rendering it twelve times a second is indistinguishable and frees a full
     * shadow pass on four frames out of five.
     */
    this.shadowClock += delta
    if (this.shadowClock >= 1 / 12) {
      this.shadowClock = 0
      this.visuals.sun.shadow.needsUpdate = true
    }

    this.updateAgents(this.animationElapsed)
    this.updateFocus(now)
    this.updateAtmosphere(delta)
    this.controls.update()
    this.renderer.info.reset()
    this.renderer.render(this.scene, this.camera)

    this.frameCounter += 1
    if (now - this.fpsWindowStart >= 1_000) {
      this.fps = Math.round((this.frameCounter * 1_000) / (now - this.fpsWindowStart))
      this.frameCounter = 0
      this.fpsWindowStart = now
      this.onStats(this.getStats(this.buildingCount))
    }
  }

  private getStats(buildings: number): RendererStats {
    const info = this.renderer.info.render
    return {
      backend: this.renderer.backend?.constructor.name.replace('Backend', '') ?? 'WebGPU/WebGL2',
      fps: this.fps,
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      buildings,
    }
  }
}
