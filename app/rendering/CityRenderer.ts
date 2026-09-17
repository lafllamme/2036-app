import type { BuildingRecord, CityBlueprint, SimulationSnapshot, SkyState } from '../core/contracts'
import type { Weather } from '../core/weather'
import type { CityModels } from './cityModels'
import type { FrameStats } from './frameLog'
import type { ScreenPoint } from './screen'
import type { SkyVisuals } from './sky/index'
import type { WorldVisuals } from './world/index'
import type { PersonAt } from './world/traffic/agents'
import type { IncidentKind, Service } from './world/traffic/incidents'
import * as THREE from 'three/webgpu'
import { useCityAmbience } from '../audio/cityAmbience'
import { useCityScore } from '../audio/cityScore'
import { useCityMixer } from '../audio/mixer'
import { debugFlags } from '../core/debug'
import { CALM } from '../core/weather'
import { DISTRICT_BY_ID } from '../world/model/lindenhafen'
import { CameraRig } from './cameraRig'
import { WalkAbout } from './firstPerson'
import { FrameLog } from './frameLog'
import { BuildingPicker } from './picking'
import { project } from './screen'
import { Atmosphere } from './sky/atmosphere'
import { createSky } from './sky/index'
import { updatePrecipitation } from './sky/precipitation'
import { shadowExtent } from './sky/sun'
import { CityState } from './world/cityState'
import { createWorld } from './world/index'
import { updateProwlers } from './world/life/prowlers'
import { fitParkedDetail } from './world/streets/parkedCars'
import { updateSignals } from './world/streets/trafficLights'
import { updateWindFarms } from './world/structures/windFarm'
import { updateMeadow } from './world/terrain/meadow'
import { updateWater } from './world/terrain/water'
import { updateAgents } from './world/traffic/agents'
import { updateIncidentScenes } from './world/traffic/incidentScene'
import { updateRailway } from './world/transit/railway'
import { updateShips } from './world/transit/ships'
import { dressSurfaces } from './world/weatherSurfaces'

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
  /** Wo der Fußgänger steht, im langsamen Takt. Nur belegt, solange jemand zu Fuß unterwegs ist. */
  onWalk?: (state: { x: number, z: number, ground: number, eye: number, stuck: boolean, refused: number }) => void
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
/** How close the camera has to be to the town hall for a demonstration to be heard, and where it goes. */
const PROTEST_EARSHOT = 120
const PROTEST_SILENCE = 520

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
 * Wann eine Messung überhaupt etwas über die Maschine sagt.
 *
 * A browser clamps `requestAnimationFrame` to one hertz for a tab it considers hidden — which
 * includes a window behind another one — and the scaler read that as a machine in trouble and gave
 * away all its resolution to a tab nobody was looking at.
 *
 * Dagegen stand hier eine FPS-Untergrenze von zwanzig, und die traf den falschen Fall: sie schloss
 * die Regelung genau dann aus, wenn sie gebraucht wird. Gemessen lief der Renderer mit **5 FPS** und
 * hielt trotzdem volle 1,65× — eine überforderte Maschine bekam nie Entlastung, weil sie überfordert
 * war. Ob niemand hinsieht, weiß das Dokument selbst; die Bildrate weiß es nicht.
 */
function readingIsAboutTheMachine(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

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
  /** Zu Fuß durch die Stadt. Siehe `firstPerson.ts`. */
  private readonly walk: WalkAbout
  private readonly timer = new THREE.Timer()
  private readonly resizeObserver: ResizeObserver
  private readonly onStats: CityRendererOptions['onStats']
  private readonly onIncident: CityRendererOptions['onIncident']
  private readonly onWalk: CityRendererOptions['onWalk']
  /** Kept only so a call can be told which district it happened in. */
  private readonly blueprint: CityBlueprint
  private readonly districtOf: CityBlueprint['districtAt']
  /** What was last said about each open call, so only actual changes are announced. */
  private readonly announced = new Map<number, IncidentStatus>()
  private readonly buildingCount: number

  /** Nur im Messstand belegt. Ohne `?bench` kostet das Protokoll keinen Zweig im Renderpfad. */
  private readonly bench: FrameLog | null
  /** Während einer Messfahrt mit fester Auflösung: der Skalierer hält still. */
  private pinned = false
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
  /** What the sky is doing. Comes from the campaign clock, like the light does. */
  private weather: Weather = CALM
  /** How much light there is, 0 … 1, which is what decides how bright the rain reads. */
  private daylight = 1
  /** What the city is currently being drawn at, and how long it has wanted to change. */
  private resolution = 1
  private resolutionPressure = 0

  constructor(options: CityRendererOptions) {
    this.canvas = options.canvas
    this.onStats = options.onStats
    this.onIncident = options.onIncident
    this.onWalk = options.onWalk
    this.blueprint = options.blueprint
    this.districtOf = options.blueprint.districtAt
    this.buildingCount = options.blueprint.buildings.length

    const { webgl: forceWebGL, bench } = debugFlags()
    this.bench = bench ? new FrameLog() : null
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
    this.walk = new WalkAbout(this.canvas, this.rig.camera, options.blueprint.relief, this.world)
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
        this.installBench()
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
    /*
     * Alles, was die Szene versteckt hält, einmal zeigen — gesucht statt aufgezählt.
     *
     * Vorher stand hier eine Liste von Hand: Neubau, Kräne, Verkehr, Regen, Schnee. Sie war immer
     * genau so vollständig, wie jemand daran gedacht hat, sie zu ergänzen — und gemessen fehlten
     * zuletzt die Straßenmöblierung, die Nahansicht der geparkten Autos und die Bodendecke. Beim
     * Heranzoomen kostete das **einen Frame von 87 ms**, davon 86,5 in `renderer.render()`: der
     * Median liegt bei 1,4, das ist also nichts als eine Pipeline-Übersetzung, und sie fiel mitten
     * in eine Kamerafahrt.
     *
     * Also wird nicht mehr aufgezählt, sondern gesucht. Was unsichtbar ist oder null Instanzen hat,
     * wird für diese eine Runde sichtbar gemacht. Das deckt auch alles ab, was später dazukommt,
     * ohne dass jemand daran denken muss.
     */
    const hidden: THREE.Object3D[] = []
    const empty: THREE.InstancedMesh[] = []
    this.scene.traverse((object) => {
      if (!object.visible)
        hidden.push(object)
      const mesh = object as THREE.InstancedMesh
      if (mesh.isInstancedMesh && mesh.count === 0)
        empty.push(mesh)
    })

    for (const object of hidden) object.visible = true
    for (const mesh of empty) mesh.count = mesh.instanceMatrix.count

    /*
     * Und der Schattendurchgang muss einmal die **ganze** Stadt sehen.
     *
     * Ein Mesh hat zwei Übersetzungen: eine fürs Bild und eine für die Schattenkarte. Die zweite
     * entsteht erst, wenn das Mesh wirklich im Schattendurchgang landet — und der deckt nur ab, was
     * die Schattenkamera gerade umfasst. Deren Ausschnitt hängt an der Kameraentfernung
     * (`shadowExtent`), also wandert beim Zoomen eine Kachel nach der anderen zum ersten Mal hinein
     * und wird dort übersetzt. Gemessen beim schnellen Hinein- und Hinauszoomen: ein Frame von 20,9
     * ms beim ersten Durchgang, danach noch vereinzelt 15,7 — Spitzen, die mit jeder Wiederholung
     * seltener werden. So sieht Übersetzung aus, und so sieht nichts anderes aus.
     *
     * Für diese eine Runde wird der Ausschnitt deshalb auf sein Maximum gestellt und jede Kachel
     * zum Werfer erklärt.
     */
    const shadow = this.sky.sun.light.shadow.camera
    const frame = { left: shadow.left, right: shadow.right, top: shadow.top, bottom: shadow.bottom }
    const casters = this.world.buildingMeshes.map(mesh => mesh.castShadow)
    const reach = shadowExtent(Number.POSITIVE_INFINITY)
    shadow.left = -reach
    shadow.right = reach
    shadow.top = reach
    shadow.bottom = -reach
    shadow.updateProjectionMatrix()
    for (const mesh of this.world.buildingMeshes) mesh.castShadow = true

    try {
      /*
       * `compileAsync` gibt zwischen den Objekten ab, blockiert also nicht; das erzwungene Bild
       * danach deckt den Schattendurchgang ab, den die Übersetzung allein nicht erreicht.
       */
      await this.renderer.compileAsync(this.scene, this.rig.camera)
      this.sky.sun.light.shadow.needsUpdate = true
      this.renderer.render(this.scene, this.rig.camera)
    }
    catch {
      // Eine misslungene Aufwärmrunde kostet ein Ruckeln, nie die Kampagne: die Bilder kommen so oder so.
    }
    finally {
      for (const object of hidden) object.visible = false
      for (const mesh of empty) mesh.count = 0
      Object.assign(shadow, frame)
      shadow.updateProjectionMatrix()
      this.world.buildingMeshes.forEach((mesh, index) => {
        mesh.castShadow = casters[index] ?? true
      })
      /*
       * Der Neubau kommt aus der Simulation zurück und nicht aus einer Momentaufnahme von vorhin:
       * ein echter Schnappschuss kann landen, während der Übersetzer arbeitet — und tut es auch.
       */
      this.world.growth.count = this.city.delivered
      // Die Bodendecke sät beim nächsten langsamen Takt neu; ohne das bliebe sie leer stehen.
      this.world.meadow.seeded = false
      this.sky.sun.light.shadow.needsUpdate = true
    }
  }

  /**
   * Der Messstand, und warum er eine Fahrt fliegt statt still zu stehen.
   *
   * Stillstehend misst man den einen Blick, in dem gerade alles übersetzt ist — und genau die
   * teuersten Frames entstehen beim **Wechsel**: wenn Straßenmöblierung in Sicht kommt, die
   * Bodendecke sät, eine Kachel Vegetation eintritt. Die Fahrt nimmt darum jedes Mal denselben Weg,
   * einmal hoch über die Stadt und einmal dicht darüber, damit zwei Messungen vergleichbar sind.
   *
   * Erreichbar als `window.bench` und nur mit `?bench`. Siehe `core/debug.ts`.
   */
  private installBench(): void {
    const log = this.bench
    if (!log)
      return
    Object.assign(window, {
      bench: {
        reset: () => log.reset(),
        stats: () => log.stats(),
        flight: (seconds = 14, scale?: number, pointer = false) => this.flight(seconds, scale, pointer),
        zoom: (seconds = 12, scale?: number) => this.flight(seconds, scale, false, true),
        layers: () => Object.fromEntries(Object.entries(this.benchLayers()).map(([name, parts]) => [name, this.weigh(parts)])),
        cost: (layer: string, seconds = 12, scale?: number) => this.cost(layer, seconds, scale),
        /*
         * Eine Schicht allein zeigen. Die Umkehrung von `cost`, und für die Fehlersuche die
         * wichtigere Hälfte: „kostet nichts" und „ist gar nicht da" sehen im Bild gleich aus.
         */
        solo: (layer: string) => {
          const wanted = this.benchLayers()[layer] ?? []
          const keep = new Set<THREE.Object3D>()
          for (const part of wanted) part.traverse(object => keep.add(object))
          this.scene.traverse((object) => {
            if (object !== this.scene && !keep.has(object))
              object.visible = false
          })
          return wanted.length
        },
      },
    })
  }

  /**
   * Die Schichten, die einzeln etwas kosten könnten — benannt, damit man sie einzeln wiegen kann.
   *
   * Nur `visible` wird umgeschaltet und nie ein Material: eine Materialänderung löst eine
   * Shader-Neuübersetzung aus, und dann misst man die Übersetzung statt der Sache. Das hat hier
   * schon einmal 108 auf 45 FPS gemacht und wie ein Ergebnis ausgesehen.
   */
  private benchLayers(): Record<string, THREE.Object3D[]> {
    const world = this.world
    return {
      planting: world.planting,
      meadow: world.meadow.meshes,
      buildings: world.buildingMeshes,
      agents: [...world.agents.cars.meshes, ...world.agents.pedestrians.meshes],
      parked: [...world.parkedCars.proxy, ...world.parkedCars.detail],
      furniture: [world.streetFurniture],
      shopfronts: world.shopfronts.meshes,
      lights: [world.streetLights.heads, world.streetLights.pools],
      horizon: [
        ...(world.windFarm ? [world.windFarm.towers, world.windFarm.rotors] : []),
        ...(world.powerPlant ? [world.powerPlant.works, world.powerPlant.pylons] : []),
      ],
    }
  }

  /** Wie viel eine Schicht überhaupt auf die Waage bringt: Objekte, Instanzen, Dreiecke. */
  private weigh(parts: THREE.Object3D[]): { meshes: number, instances: number, triangles: number } {
    let meshes = 0
    let instances = 0
    let triangles = 0
    for (const part of parts) {
      part.traverse((object) => {
        const mesh = object as THREE.Mesh & { isMesh?: boolean, isInstancedMesh?: boolean, count?: number }
        if (!mesh.isMesh)
          return
        const index = mesh.geometry?.getIndex()
        const perInstance = (index ? index.count : (mesh.geometry?.getAttribute('position')?.count ?? 0)) / 3
        const copies = mesh.isInstancedMesh ? (mesh.count ?? 0) : 1
        meshes += 1
        instances += copies
        triangles += perInstance * copies
      })
    }
    return { meshes, instances, triangles: Math.round(triangles) }
  }

  /**
   * Was eine Schicht kostet: dieselbe Fahrt zweimal, einmal mit ihr und einmal ohne.
   *
   * Zweimal fliegen statt einmal rechnen, weil sich die Kosten einer Schicht nicht addieren lassen —
   * was sie verdeckt, zahlt sie mit, und was sie nicht verdeckt, zahlt der Rest.
   */
  private async cost(layer: string, seconds: number, scale?: number): Promise<{ with: FrameStats, without: FrameStats }> {
    const parts = this.benchLayers()[layer] ?? []
    const before = parts.map(part => part.visible)
    const withLayer = await this.flight(seconds, scale)
    for (const part of parts) part.visible = false
    const withoutLayer = await this.flight(seconds, scale)
    parts.forEach((part, index) => {
      part.visible = before[index] ?? true
    })
    return { with: withLayer, without: withoutLayer }
  }

  /**
   * `scale` heftet die Renderauflösung für die Dauer der Fahrt fest.
   *
   * Ohne das misst man auf dieser Maschine nichts: bei 120 Hz und 1,65-fachem Faktor liegt das Bild
   * **auf der Bildwiederholrate**, und gemessen ändert selbst das Ausblenden der **ganzen Stadt**
   * die Bildzahl nicht — 1.081 Frames mit Gebäuden, 1.080 ohne. Solange der Schirm die Grenze ist,
   * ist jede Optimierung unsichtbar. Erst über den Faktor hinaufgedreht, bis das Bild unter die
   * Wiederholrate fällt, wird wieder vergleichbar, was etwas kostet.
   */
  private flight(seconds: number, scale?: number, pointer = false, shuttle = false): Promise<FrameStats> {
    const log = this.bench
    if (!log)
      return Promise.resolve({ frames: 0, median: 0, p95: 0, p99: 0, longest: 0, long: 0, render: 0, update: 0 })

    const restore = this.resolution
    if (scale !== undefined) {
      // Den Skalierer stillhalten, sonst regelt er die feste Auflösung sofort wieder weg.
      this.pinned = true
      this.resolution = scale
      this.renderer.setPixelRatio(scale)
      this.resize()
    }
    const started = performance.now()
    log.reset()
    return new Promise<FrameStats>((resolve) => {
      const step = (): void => {
        const run = (performance.now() - started) / (seconds * 1_000)
        if (run >= 1) {
          const stats = log.stats()
          if (scale !== undefined) {
            this.pinned = false
            this.resolution = restore
            this.renderer.setPixelRatio(restore)
            this.resize()
          }
          resolve(stats)
          return
        }
        // Ein voller Umlauf, und dazwischen einmal ganz herunter und wieder hinauf.
        /*
         * Optional die Maus mitbewegen, und das ist keine Spielerei.
         *
         * Die Fahrt allein bewegt die **Kamera** und nie den **Zeiger** — und genau dazwischen lag
         * der teuerste Fehler, den dieses Projekt hatte: ein Strahl gegen 1,37 Millionen Dreiecke je
         * Mausereignis, gemeldet als 24 FPS beim Ziehen, von jeder Messung hier strukturell
         * übersprungen. Was man nicht bewegt, misst man nicht.
         */
        if (pointer) {
          const box = this.canvas.getBoundingClientRect()
          this.canvas.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: box.left + box.width * (0.5 + Math.cos(run * 37) * 0.3),
            clientY: box.top + box.height * (0.5 + Math.sin(run * 23) * 0.3),
          }))
        }
        const bearing = run * Math.PI * 2
        /*
         * `shuttle` fährt schnell hinein und wieder heraus, statt einmal sanft hinunterzutauchen.
         *
         * Das ist eine eigene Belastung und nicht dieselbe in schnell: was mit der **Entfernung**
         * umschaltet — Straßenmöblierung, die Nahansicht der geparkten Autos, welche Kachel Schatten
         * wirft — flippt dabei dutzendfach hin und her, und genau dort wurde geruckelt gemeldet.
         */
        const dive = shuttle ? (1 - Math.cos(run * Math.PI * 12)) / 2 : Math.sin(run * Math.PI)
        this.rig.placeFor(
          Math.cos(bearing) * 760,
          Math.sin(bearing) * 760,
          bearing,
          1_500 - dive * 1_380,
          980 - dive * 930,
        )
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }

  /** The sky follows campaign time, not the render loop: it stops dead when the player pauses. */
  setSky(state: SkyState): void {
    this.atmosphere.setTarget(state)
    // The traffic reads the same clock: rush hour is the hour, not a number of its own.
    this.hourOfDay = state.hourOfDay
    this.daylight = THREE.MathUtils.smoothstep(state.arc, -0.12, 0.28)
  }

  /**
   * What is falling out of the sky. Comes from the campaign clock like everything else here, so it
   * stops when the player pauses and it is the same November in a reloaded save.
   */
  setWeather(weather: Weather): void {
    this.weather = weather
    // A shut sky is as big a change as nightfall, and it rides the machinery nightfall already uses.
    this.atmosphere.setOvercast(weather.cloud)
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
    /*
     * And how much of the stock has somebody in it. An empty flat has no light in it — the one thing
     * that makes a vacancy rate visible, and the one derived signal nothing read at all.
     */
    this.atmosphere.setOccupancy(this.city.occupancy)
    // And what is in the air. Free: it is the fog the scene already has.
    this.atmosphere.setHaze(this.city.haze)
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

  /**
   * Den Begehen-Modus ein- oder ausschalten.
   *
   * Hinein geht es dorthin, wo die Karte gerade **hinsieht**, nicht dorthin, wo die Kamera steht —
   * sonst stünde man achthundert Meter schräg über der Stadt in der Luft.
   */
  /**
   * Wo ein Ort der Stadt gerade auf dem Schirm liegt.
   *
   * Die Brücke, die zwischen Karte und Oberfläche gefehlt hat: ohne sie kann nichts **dort**
   * beschriftet werden, wo es steht — kein Einsatz, kein Bezirk, keine Lage. Die Rechnung selbst
   * steht in `rendering/screen.ts` und ist dort ohne Canvas geprüft; hier kommen nur die Kamera und
   * die Größe der Zeichenfläche dazu.
   *
   * Die Größe wird in CSS-Pixeln genommen und nicht in Gerätepixeln: eine Marke ist ein Element im
   * Dokument, und das Dokument rechnet in CSS-Pixeln. Auf einem Retina-Schirm wäre alles andere
   * doppelt so weit rechts.
   */
  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    return project(this.rig.camera, x, y, z, this.canvas.clientWidth, this.canvas.clientHeight, out)
  }

  /** Wo der Fußgänger steht — für die Anzeige in der Kamerahilfe. Siehe `firstPerson.ts`. */
  get walkState(): { x: number, z: number, ground: number, eye: number, stuck: boolean, refused: number } {
    const state = this.walk.state
    return { x: state.x, z: state.z, ground: state.ground, eye: state.eye, stuck: state.stuck, refused: state.refused }
  }

  setWalking(walking: boolean): void {
    if (walking === this.walk.state.active)
      return
    // Zu Fuß zeigt der Zeiger auf nichts — er dreht den Kopf. Siehe `Picker.setPaused`.
    this.picker.setPaused(walking)
    if (walking) {
      this.walk.enter(this.rig.controls.target)
      this.rig.handOver(true, null)
      return
    }
    const back = this.walk.leave()
    this.rig.handOver(false, back)
  }

  dispose(): void {
    this.walk.dispose()
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
    updateRailway(this.world.railway, delta, this.rig.camera.position, this.city.transitDensity)

    /*
     * And the weather, for the same reason: a curtain of rain is somewhere plus speed times time.
     * It draws nothing at all on a dry day, which in this climate is most of them.
     */
    updatePrecipitation(this.world.precipitation, delta, this.rig.camera, this.weather, this.daylight)

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
        this.city.idleness,
        /*
         * How pleasant it is to be outside. Snow keeps people in harder than rain, and a gale on top
         * of either is what empties a pavement altogether.
         */
        1 - Math.min(0.68, this.weather.rain * 0.5 + this.weather.snow * 0.62 + this.weather.wind * 0.12),
        // Und was der Rat für den Verkehr beschlossen hat. Siehe `cycling` in `CityVisualState`.
        { cycling: this.city.cycling, cars: this.city.carTraffic, transit: this.city.transitDensity },
      )
      this.reportIncidents()
      updateIncidentScenes(
        this.world.incidentScenes,
        this.world.agents.incidents,
        this.world.agents.relief,
        this.animationElapsed,
        distance,
        // Flame and smoke are billboards, so they need to know which way the camera is looking.
        this.rig.camera.quaternion,
      )
      updateSignals(this.world.signals, this.animationElapsed)
      /*
       * Somebody at a house at two in the morning. Driven from here rather than from the monthly
       * apply, because half of what it answers to is the clock rather than the city.
       */
      updateProwlers(this.world.prowlers, this.city.pressure.burglary, this.hourOfDay)
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
        // The crowd the fleet does not know about: a demonstration is places, not travellers.
        peopleNearby: this.world.agents.peopleNearby + this.protestWithinEarshot(),
        nearestSiren: this.world.agents.nearestSiren,
        nearestTrain: this.world.railway?.nearestTrain ?? Number.POSITIVE_INFINITY,
        cameraDistance: distance,
        // The weather is heard from anywhere, which is why it goes in whole rather than by distance.
        rain: this.weather.rain,
        snow: this.weather.snow,
        wind: this.weather.wind,
      })
      this.atmosphere.update(this.slowClock, this.rig.controls.target, distance)
      // Die Bodendecke wandert mit dem Blickpunkt; sie sät erst nach 60 m neu. Siehe `terrain/meadow.ts`.
      updateMeadow(this.world.meadow, this.blueprint, this.rig.controls.target, distance)
      /*
       * Der Standort des Fußgängers, fünfmal die Sekunde statt einmal.
       *
       * Die Anzeige hing an `onStats`, und das läuft im Sekundentakt. Beim Nachmessen sah das aus
       * wie Anhalten: zehn Meter, null, zehn Meter, null — in Wahrheit war es dieselbe Zahl zweimal
       * abgelesen. Eine Anzeige, die stockt, während die Sache läuft, schickt genau dorthin, wo
       * nichts zu finden ist.
       */
      if (this.walk.state.active)
        this.onWalk?.(this.walkState)
      // Die Rotoren drehen nach dem Wind, den das Wetter meldet. Siehe `structures/windFarm.ts`.
      updateWindFarms(this.world.windFarm, this.animationElapsed, this.weather.wind)
      this.world.streetFurniture.visible = distance < FURNITURE_RANGE
      // Proxies out to the parking range, the kit's own cars for the street the player is in.
      fitParkedDetail(this.world.parkedCars, this.rig.camera.position, distance < PARKING_RANGE)
      updateShips(this.world.ships, this.animationElapsed)
      updateWater(this.world.water, this.animationElapsed)
      /*
       * Wet tarmac and snow on the parks. Neither is a mesh: both are the colour and the roughness of
       * materials the city was already drawn with, and the call returns immediately when the sky has
       * not moved, which is most ticks of most months.
       */
      dressSurfaces(this.world.surfaces, this.world.precipitation.wetness, this.world.precipitation.cover)
      this.slowClock = 0
    }

    this.walk.update(delta)
    this.rig.update(now)
    // Der Strahl unter dem Zeiger, einmal je Bild statt einmal je Mausereignis. Siehe `picking.ts`.
    if (!this.walk.state.active)
      this.picker.update()
    this.sky.rig.position.copy(this.rig.camera.position)
    this.renderer.info.reset()
    const beforeRender = this.bench ? performance.now() : 0
    this.renderer.render(this.scene, this.rig.camera)
    if (this.bench)
      this.bench.add(performance.now() - now, performance.now() - beforeRender)

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
  /**
   * How much of the demonstration is close enough to be heard.
   *
   * It has to be added by hand, because the crowd bed follows what the *fleet* has near the camera
   * and the people outside the town hall are not in any fleet — they are places. Without this a
   * player could stand in a square with two hundred people in it and hear an empty street.
   */
  private protestWithinEarshot(): number {
    const at = this.world.protest.at
    if (!at || this.city.protesters === 0)
      return 0
    const away = Math.hypot(this.rig.controls.target.x - at.x, this.rig.controls.target.z - at.z)
    return this.city.protesters * (1 - THREE.MathUtils.smoothstep(away, PROTEST_EARSHOT, PROTEST_SILENCE))
  }

  /**
   * In welchem Viertel ein Einsatz stattfindet, für die Meldung im Stadtfunk.
   *
   * Lief einmal über acht Rechtecke und ging seit den echten Ortsteilgrenzen nicht mehr: ein Viertel
   * ist ein Polygon. Gefragt wird stattdessen das Raster, das der Grundriss ohnehin mitbringt — und
   * das ist nebenbei richtiger, weil ein Kasten um ein L-förmiges Viertel den Nachbarn mitnimmt.
   */
  private districtAt(x: number, z: number): string | null {
    return DISTRICT_BY_ID.get(this.districtOf(x, z))?.name ?? null
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
    if (this.pinned || this.frameCap !== null || !readingIsAboutTheMachine())
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
