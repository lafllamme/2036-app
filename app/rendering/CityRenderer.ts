import type { BuildingRecord, CityBlueprint, SimulationSnapshot, SkyState } from '../core/contracts'
import type { CityModels } from './cityModels'
import type { SkyVisuals } from './sky/index'
import type { WorldVisuals } from './world/index'
import * as THREE from 'three/webgpu'
import { CameraRig } from './cameraRig'
import { BuildingPicker } from './picking'
import { Atmosphere } from './sky/atmosphere'
import { createSky } from './sky/index'
import { updateAgents } from './world/agents'
import { CityState } from './world/cityState'
import { createWorld } from './world/index'

/**
 * The one place that owns a frame.
 *
 * It builds the scene out of the world and sky modules, hands the simulation's snapshots to the
 * city and the campaign's clock to the atmosphere, and decides what is worth doing this frame and
 * what is worth doing thirty times a second. Everything it draws is built somewhere else.
 */

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
  models: CityModels
  onBuildingSelected: (building: BuildingRecord | null) => void
  onReady: (stats: RendererStats) => void
  onStats: (stats: RendererStats) => void
  onError: (message: string) => void
}

/**
 * How often the things that are not the frame itself are brought up to date.
 *
 * The sky is handed a new reading four times a second, and traffic moves a couple of metres between
 * frames; running either at 120 Hz spends CPU and a buffer upload on differences nobody can see.
 * The camera, the controls and the draw stay on the frame, because those are what the player holds.
 */
const SLOW_UPDATE_HZ = 30
/**
 * A 2048² shadow pass for a sun that moves a fraction of a degree between frames is pure waste.
 * Twelve times a second is indistinguishable and frees a shadow pass on four frames out of five.
 */
const SHADOW_HZ = 12
/** Below this camera distance the suburbs are behind the skyline and two kilometres of haze. */
const OUTSKIRTS_RANGE = 900

export class CityRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly scene = new THREE.Scene()
  private readonly renderer: THREE.WebGPURenderer
  private readonly rig: CameraRig
  private readonly world: WorldVisuals
  private readonly sky: SkyVisuals
  private readonly atmosphere: Atmosphere
  private readonly city: CityState
  private readonly picker: BuildingPicker
  private readonly timer = new THREE.Timer()
  private readonly resizeObserver: ResizeObserver
  private readonly onStats: CityRendererOptions['onStats']
  private readonly buildingCount: number

  private frameCounter = 0
  private fps = 0
  private fpsWindowStart = performance.now()
  private animationElapsed = 0
  private slowClock = 0
  private shadowClock = 0
  /** When set, frames are skipped to hold this rate — used while the city is only a backdrop. */
  private frameCap: number | null = null
  private lastFrame = 0

  constructor(options: CityRendererOptions) {
    this.canvas = options.canvas
    this.onStats = options.onStats
    this.buildingCount = options.blueprint.buildings.length

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
    this.scene.fog = new THREE.FogExp2('#91a8b1', 0.00026)

    this.rig = new CameraRig(this.canvas)
    this.world = createWorld(this.scene, options.blueprint, options.models)
    this.sky = createSky(this.scene, options.blueprint.definition.seed)
    this.atmosphere = new Atmosphere({
      scene: this.scene,
      sky: this.sky,
      buildingMaterials: this.world.buildingMaterials,
      streetLights: this.world.streetLights,
    })
    this.city = new CityState(options.blueprint, this.world)
    this.picker = new BuildingPicker(this.canvas, this.rig.camera, this.world, {
      onSelected: options.onBuildingSelected,
      onFocus: building => this.rig.focusOn(building),
    })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)

    void this.renderer.init()
      .then(async () => {
        this.resize()
        await this.warmUp()
        this.renderer.setAnimationLoop(this.render)
        options.onReady(this.getStats())
      })
      .catch((error: unknown) => {
        options.onError(error instanceof Error ? error.message : 'Der 3D-Renderer konnte nicht gestartet werden.')
      })
  }

  /**
   * Build every render pipeline the city will ever need, before the first frame is shown.
   *
   * New housing and the cranes start hidden, so their shaders were compiled at the moment they first
   * appeared — which is the moment the player enters the city. That cost three frames of 95, 97 and
   * 57 ms, a visible lurch on the first second of the campaign. Compiling them here moves the whole
   * cost into the loading screen, where nothing is moving yet. `compileAsync` yields between objects
   * rather than blocking, and the forced frame afterwards covers the shadow pass, which is a second
   * set of pipelines that compilation alone does not reach.
   */
  private async warmUp(): Promise<void> {
    const { growth, constructionSites, pedestrians, outskirts } = this.world
    const hidden = constructionSites.children.filter(site => !site.visible)

    growth.count = growth.instanceMatrix.count
    pedestrians.count = pedestrians.instanceMatrix.count
    outskirts.visible = true
    for (const site of hidden) site.visible = true

    try {
      await this.renderer.compileAsync(this.scene, this.rig.camera)
      this.sky.sun.light.shadow.needsUpdate = true
      this.renderer.render(this.scene, this.rig.camera)
    }
    catch {
      // A failed warm-up costs a stutter, never the campaign: the real frames follow either way.
    }
    finally {
      /*
       * The counts come back from the simulation's own figures, not from a snapshot of them taken
       * before the await — a real snapshot can and does land while the compiler is working.
       */
      growth.count = this.city.delivered
      pedestrians.count = 0
      for (const site of hidden) site.visible = false
      this.sky.sun.light.shadow.needsUpdate = true
    }
  }

  /** The sky follows campaign time, not the render loop: it stops dead when the player pauses. */
  setSky(state: SkyState): void {
    this.atmosphere.setTarget(state)
  }

  /**
   * Hold the frame rate down while the city is only the backdrop to a menu. Nothing is being played
   * there and the camera does not move, so half the frames are half the GPU for no visible loss.
   */
  setFrameCap(fps: number | null): void {
    this.frameCap = fps
  }

  applySnapshot(snapshot: SimulationSnapshot): void {
    this.city.apply(snapshot)
    this.atmosphere.setNightLife(this.city.nightLife)
  }

  focusBuilding(buildingId: string): void {
    const building = this.picker.find(buildingId)
    if (building)
      this.rig.focusOn(building)
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.picker.dispose()
    this.rig.dispose()
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

  private resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0)
      return
    this.rig.resize(width, height)
    this.renderer.setSize(width, height, false)
  }

  private readonly render = (): void => {
    const now = performance.now()
    if (this.frameCap !== null && now - this.lastFrame < 1_000 / this.frameCap)
      return
    this.lastFrame = now

    this.timer.update()
    const delta = Math.min(0.05, this.timer.getDelta())
    this.animationElapsed += delta

    this.shadowClock += delta
    if (this.shadowClock >= 1 / SHADOW_HZ) {
      this.shadowClock = 0
      this.sky.sun.light.shadow.needsUpdate = true
    }

    this.slowClock += delta
    if (this.slowClock >= 1 / SLOW_UPDATE_HZ) {
      const distance = this.rig.distance
      updateAgents(this.world, this.animationElapsed, distance, this.city.trafficFactor)
      this.atmosphere.update(this.slowClock, this.rig.controls.target, distance)
      this.world.outskirts.visible = distance > OUTSKIRTS_RANGE
      this.slowClock = 0
    }

    this.rig.update(now)
    this.sky.rig.position.copy(this.rig.camera.position)
    this.renderer.info.reset()
    this.renderer.render(this.scene, this.rig.camera)

    this.frameCounter += 1
    if (now - this.fpsWindowStart >= 1_000) {
      this.fps = Math.round((this.frameCounter * 1_000) / (now - this.fpsWindowStart))
      this.frameCounter = 0
      this.fpsWindowStart = now
      this.onStats(this.getStats())
    }
  }

  private getStats(): RendererStats {
    const info = this.renderer.info.render
    return {
      backend: this.renderer.backend?.constructor.name.replace('Backend', '') ?? 'WebGPU/WebGL2',
      fps: this.fps,
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      buildings: this.buildingCount,
    }
  }
}
