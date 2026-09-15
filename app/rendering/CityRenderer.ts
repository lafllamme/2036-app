import type { BuildingRecord, CityBlueprint, SimulationSnapshot, SkyState } from '../core/contracts'
import type { CityModels } from './cityModels'
import type { SkyVisuals } from './sky/index'
import type { PersonAt } from './world/agents'
import type { IncidentKind, Service } from './world/incidents'
import type { WorldVisuals } from './world/index'
import * as THREE from 'three/webgpu'
import { useCityAmbience } from '../audio/cityAmbience'
import { useCityScore } from '../audio/cityScore'
import { useCityMixer } from '../audio/mixer'
import { CameraRig } from './cameraRig'
import { BuildingPicker } from './picking'
import { Atmosphere } from './sky/atmosphere'
import { createSky } from './sky/index'
import { shadowExtent } from './sky/sun'
import { updateAgents } from './world/agents'
import { CityState } from './world/cityState'
import { updateIncidentScenes } from './world/incidentScene'
import { createWorld } from './world/index'
import { fitParkedDetail } from './world/parkedCars'
import { updateRailway } from './world/railway'
import { updateShips } from './world/ships'
import { updateSignals } from './world/trafficLights'
import { updateWater } from './world/water'

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
  /** What the city is being drawn at, as a multiple of CSS pixels. The renderer tunes it itself. */
  resolution: number
}

/**
 * A call the city has just raised, on its way to the ticker.
 *
 * The renderer tells the interface what happened and where; it never tells the simulation. That is
 * the same one-way rule the visual state follows, and the reason a police call can be read out on
 * the news bar without becoming an input to anything the council is scored on.
 */
/**
 * How far along a call is.
 *
 * `open` is raised with nobody there yet, `onScene` is a crew standing at it, `cleared` is over. The
 * interface needs all three: a call left on the news bar after the cordon has gone is a link to an
 * empty junction, which is worse than never having listed it.
 */
export type IncidentStatus = 'open' | 'onScene' | 'cleared'

export interface IncidentReport {
  id: number
  kind: IncidentKind
  service: Exclude<Service, 'none'>
  status: IncidentStatus
  /** The district it happened in, by name, or null out where the map has no districts. */
  district: string | null
  /** Where, so the interface can offer to take the player there instead of making them hunt. */
  x: number
  z: number
}

export interface CityRendererOptions {
  canvas: HTMLCanvasElement
  blueprint: CityBlueprint
  models: CityModels
  onBuildingSelected: (building: BuildingRecord | null) => void
  onReady: (stats: RendererStats) => void
  onStats: (stats: RendererStats) => void
  onError: (message: string) => void
  /**
   * Called whenever a call changes: raised, reached, over. Optional — the city runs the same without
   * it, and nothing in the city ever reads what the interface does with it.
   */
  onIncident?: (report: IncidentReport) => void
  /** Somebody in the street was clicked on, or the click landed on nothing. */
  onPersonSelected?: (person: PersonAt | null) => void
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
/** A traffic cone two kilometres away is a fifth of a pixel. Above this the pavements are bare. */
const FURNITURE_RANGE = 1_400
/**
 * A parked car is two thousand triangles and, from further than this, about four pixels.
 *
 * They are the single heaviest thing in the city, so they are the first thing to go when the camera
 * pulls back — and nothing is lost, because at that height a kerb reads as a line either way.
 */
const PARKING_RANGE = 900
/**
 * The resolution the city is drawn at, as a multiple of CSS pixels, and the frame rate it is aiming
 * for.
 *
 * A fixed pixel ratio is a guess about a machine nobody has measured. At 1.65 a Retina display is
 * being asked for two and three quarter times the fragments of a plain one, and the whole cost of a
 * frame here is fragments — a ground plane under a land-use overlay under a carriageway under a
 * pavement under its markings, plus a shadow map. So the renderer measures instead: below the floor
 * it gives up resolution until the frame rate comes back, and above the ceiling it takes it again.
 *
 * The steps are coarse and the reaction is slow on purpose. A scaler that hunts is more distracting
 * than the frames it saves, and resizing a swap chain is not free.
 */
const RESOLUTION_MIN = 0.85
const RESOLUTION_MAX = 1.65
const RESOLUTION_STEP = 0.12
const TARGET_FPS_FLOOR = 58
const TARGET_FPS_CEILING = 92
/** How many one-second windows have to agree before the resolution moves. */
const RESOLUTION_PATIENCE = 3
/**
 * Below this the reading is not about the machine.
 *
 * A browser clamps `requestAnimationFrame` to one hertz for a tab it considers hidden — which
 * includes a window behind another one — and the scaler read that as a machine in trouble and gave
 * away all its resolution to a tab nobody was looking at. Anything this slow is either throttled or
 * beyond saving by a twelve-per-cent step.
 */
const RESOLUTION_FLOOR_FPS = 20

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
  private readonly onIncident: CityRendererOptions['onIncident']
  /** Kept only so a call can be told which district it happened in. */
  private readonly districts: CityBlueprint['definition']['districts']
  /** What was last said about each open call, so only actual changes are announced. */
  private readonly announced = new Map<number, IncidentStatus>()
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
  /** Campaign time of day, so the streets fill and empty with it. */
  private hourOfDay = 9
  /** What the city is currently being drawn at, and how long it has wanted to change. */
  private resolution = 1
  private resolutionPressure = 0

  constructor(options: CityRendererOptions) {
    this.canvas = options.canvas
    this.onStats = options.onStats
    this.onIncident = options.onIncident
    this.districts = options.blueprint.definition.districts
    this.buildingCount = options.blueprint.buildings.length

    const forceWebGL = new URLSearchParams(window.location.search).has('webgl')
    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, forceWebGL })
    this.resolution = Math.min(window.devicePixelRatio, RESOLUTION_MAX)
    this.renderer.setPixelRatio(this.resolution)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.info.autoReset = false

    this.scene.background = new THREE.Color('#94aebc')
    this.scene.fog = new THREE.FogExp2('#91a8b1', 0.00021)

    this.rig = new CameraRig(this.canvas, options.blueprint.relief)
    this.world = createWorld(this.scene, options.blueprint, options.models)
    this.sky = createSky(this.scene, options.blueprint.definition.seed)
    this.atmosphere = new Atmosphere({
      scene: this.scene,
      sky: this.sky,
      buildingMaterials: this.world.buildingMaterials,
      streetLights: this.world.streetLights,
    })
    this.city = new CityState(options.blueprint, this.world)
    this.picker = new BuildingPicker(this.canvas, this.rig.camera, this.world, this.world.agents, {
      onSelected: options.onBuildingSelected,
      onFocus: building => this.rig.focusOn(building),
      onPerson: person => options.onPersonSelected?.(person),
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
    const { growth, constructionSites } = this.world
    const hidden = constructionSites.children.filter(site => !site.visible)

    growth.count = growth.instanceMatrix.count
    for (const mesh of [...this.world.agents.cars.meshes, ...this.world.agents.pedestrians.meshes])
      mesh.count = mesh.instanceMatrix.count
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
      for (const mesh of [...this.world.agents.cars.meshes, ...this.world.agents.pedestrians.meshes])
        mesh.count = 0
      for (const site of hidden) site.visible = false
      this.sky.sun.light.shadow.needsUpdate = true
    }
  }

  /** The sky follows campaign time, not the render loop: it stops dead when the player pauses. */
  setSky(state: SkyState): void {
    this.atmosphere.setTarget(state)
    // The traffic reads the same clock: rush hour is the hour, not a number of its own.
    this.hourOfDay = state.hourOfDay
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

  /** Fly back out to the opening view of the whole city. */
  /** Fly to a place rather than to a building: the camera's way of answering "show me where". */
  focusOnPlace(x: number, z: number): void {
    this.rig.focusOnPlace(x, z)
  }

  showOverview(): void {
    this.rig.frameCity()
  }

  /**
   * Keep out of the shadow pass everything the shadow pass cannot see.
   *
   * The shadow camera is fitted to how close the player is — a box a few hundred metres across at
   * street level. A tile of the city a kilometre outside it casts into nothing, and drawing it there
   * was costing a second pass over most of the skyline: sixty-six of the hundred and fifty-eight
   * draws on a shadow frame. A tile is a kilometre wide, so this is one test per tile, thirty times
   * a second.
   */
  private fitShadowCasters(cameraDistance: number): void {
    const reach = shadowExtent(cameraDistance)
    const focus = this.rig.controls.target
    for (const mesh of this.world.buildingMeshes) {
      const sphere = mesh.geometry.boundingSphere
      if (!sphere)
        continue
      const gap = Math.hypot(sphere.center.x - focus.x, sphere.center.z - focus.z) - sphere.radius
      // A generous margin: the sun is low in winter and a long shadow reaches well past its caster.
      mesh.castShadow = gap < reach * 1.6 + 220
    }
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

    /*
     * The trains run on the frame clock, not the slow one.
     *
     * Everything else in that block either reads a state or is placed from `elapsed`, so running it
     * five times a second is invisible. A train *integrates* — it is where it was plus speed times
     * time — and given a frame's delta five times a second it crawls across the map at a twentieth
     * of its own speed.
     */
    updateRailway(this.world.railway, delta, this.rig.camera.position)

    this.slowClock += delta
    if (this.slowClock >= 1 / SLOW_UPDATE_HZ) {
      const distance = this.rig.distance
      this.fitShadowCasters(distance)
      updateAgents(
        this.world.agents,
        this.slowClock,
        this.animationElapsed,
        this.rig.camera.position,
        this.rig.controls.target,
        distance,
        this.city.trafficFactor,
        this.hourOfDay,
        this.city.pressure,
      )
      this.reportIncidents()
      updateIncidentScenes(
        this.world.incidentScenes,
        this.world.agents.incidents,
        this.world.agents.relief,
        this.animationElapsed,
        distance,
      )
      updateSignals(this.world.signals, this.animationElapsed)
      /*
       * The city's sound follows the same two numbers the traffic does. It is driven from here
       * rather than from a watcher because those numbers are the renderer's own — how much is
       * moving and how many blue lights are out — and nothing else knows them.
       */
      /*
       * And the score follows the same reading.
       *
       * How much is moving near the camera and whether anything is happening — the two things that
       * make a street feel busy — thicken the arpeggio and open its filter. The music is part of the
       * game rather than something playing next to it, and it is the only thing outside the score
       * that the score listens to.
       */
      useCityScore().setIntensity(Math.min(1, this.world.agents.trafficNearby / 22
      + this.world.agents.peopleNearby / 40
      + (this.world.agents.incidents.length > 0 ? 0.2 : 0)))
      /*
       * Where the listener is standing, which is what decides who gets to be heard.
       *
       * The three instruments do not know about each other and must not: one place holds the fact
       * that there are three, and it is the mixer. See `app/audio/mixer.ts`.
       */
      useCityMixer().listen({
        cameraDistance: distance,
        nearestSiren: this.world.agents.nearestSiren,
      })
      useCityAmbience().update({
        trafficNearby: this.world.agents.trafficNearby,
        peopleNearby: this.world.agents.peopleNearby,
        nearestSiren: this.world.agents.nearestSiren,
        nearestTrain: this.world.railway?.nearestTrain ?? Number.POSITIVE_INFINITY,
        cameraDistance: distance,
      })
      this.atmosphere.update(this.slowClock, this.rig.controls.target, distance)
      this.world.streetFurniture.visible = distance < FURNITURE_RANGE
      // Proxies out to the parking range, the kit's own cars for the street the player is in.
      fitParkedDetail(this.world.parkedCars, this.rig.camera.position, distance < PARKING_RANGE)
      updateShips(this.world.ships, this.animationElapsed)
      updateWater(this.world.water, this.animationElapsed)
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
      this.fitResolution()
      this.onStats(this.getStats())
    }
  }

  /**
   * Announce anything that has changed.
   *
   * Three things are worth saying about a call and they are all changes of state: it was raised, a
   * crew reached it, it is over. Everything in between is the same call still happening, and saying
   * so thirty times a second would be thirty messages an interface has to ignore.
   *
   * The last thing said about each call is kept, so this is a comparison rather than a log — which
   * is also what lets a call that ends be reported as ended rather than simply stopping.
   */
  private reportIncidents(): void {
    if (!this.onIncident)
      return
    const open = this.world.agents.incidents

    for (const incident of open) {
      const status: IncidentStatus = incident.arrived === null ? 'open' : 'onScene'
      if (this.announced.get(incident.id) === status)
        continue
      this.announced.set(incident.id, status)
      this.onIncident({
        id: incident.id,
        kind: incident.kind,
        service: incident.service,
        status,
        district: this.districtAt(incident.x, incident.z),
        x: incident.x,
        z: incident.z,
      })
    }

    // Whatever is no longer on the list is over, whether it was reached or written off.
    if (this.announced.size > open.length) {
      const live = new Set(open.map(incident => incident.id))
      for (const id of [...this.announced.keys()]) {
        if (live.has(id))
          continue
        this.announced.delete(id)
        this.onIncident({ id, kind: 'burglary', service: 'police', status: 'cleared', district: null, x: 0, z: 0 })
      }
    }
  }

  /** Which district a point is in, by the bounds the city definition gives each one. */
  private districtAt(x: number, z: number): string | null {
    for (const district of this.districts) {
      const { bounds } = district
      if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ)
        return district.name
    }
    return null
  }

  /**
   * Trade resolution for frames, and take it back when there are frames to spare.
   *
   * Only ever one step per second, and only after the same verdict three windows running: a scaler
   * that reacts to a single slow frame spends its life hunting, and every change reallocates the
   * swap chain. The frame cap is left out of it — behind a menu the renderer is deliberately slow
   * and that says nothing about what the machine can do.
   */
  private fitResolution(): void {
    if (this.frameCap !== null || this.fps < RESOLUTION_FLOOR_FPS)
      return

    const wants = this.fps < TARGET_FPS_FLOOR ? -1 : this.fps > TARGET_FPS_CEILING ? 1 : 0
    if (wants === 0 || Math.sign(this.resolutionPressure) !== wants)
      this.resolutionPressure = wants
    else this.resolutionPressure += wants

    if (Math.abs(this.resolutionPressure) < RESOLUTION_PATIENCE)
      return
    this.resolutionPressure = 0

    const ceiling = Math.min(window.devicePixelRatio, RESOLUTION_MAX)
    const next = THREE.MathUtils.clamp(this.resolution + wants * RESOLUTION_STEP, RESOLUTION_MIN, ceiling)
    if (Math.abs(next - this.resolution) < 0.01)
      return
    this.resolution = next
    this.renderer.setPixelRatio(next)
    this.resize()
  }

  private getStats(): RendererStats {
    const info = this.renderer.info.render
    return {
      backend: this.renderer.backend?.constructor.name.replace('Backend', '') ?? 'WebGPU/WebGL2',
      fps: this.fps,
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      resolution: this.resolution,
      buildings: this.buildingCount,
    }
  }
}
