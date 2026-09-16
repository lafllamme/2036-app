import type { SkyState } from '../../core/contracts'
import type { StreetLights } from '../world/streets/streetLights'
import type { CelestialBody } from './celestialBody'
import type { SkyVisuals } from './index'
import * as THREE from 'three/webgpu'
import { fitShadow } from './sun'

/**
 * Everything that changes with the hour: the colour of the sky, where the sun and moon stand, how
 * hard they light the city, whether the stars are out and whether the street lamps are on.
 *
 * It owns the eased state rather than the renderer, because the store hands in a reading only four
 * times a second and the arc between two readings has to be interpolated somewhere.
 */

/** Palette constants, hoisted so the update allocates no colours at all. */
const NIGHT_SKY = 0x131E2E
const DAY_SKY = /* @__PURE__ */ new THREE.Color('#94aebc')
const EMBER = /* @__PURE__ */ new THREE.Color('#c9764f')
const SUN_WHITE = 0xFFF2D2
const SUN_DISC = 0xFFFDF6
/**
 * What the sun's own colour becomes as it sinks. It stays a very light warm white on purpose: the
 * sprite is blended over a sky that is brighter than any mid-tone, so a properly orange disc came
 * out darker than the sky behind it and read as a hole rather than as the sun.
 */
const SUN_LOW = /* @__PURE__ */ new THREE.Color('#ffe2be')
/**
 * The colour and the strength of the night.
 *
 * These had to be worked out rather than guessed at, because the numbers are not intuitive: a
 * hemisphere light contributes `irradiance × albedo ÷ π`, and 0x364863 at 1.55 came to about four
 * thousandths on ground with the albedo of grass. Four thousandths is black. A photograph of a city
 * at night is not black — the sky over it is lit by the city itself — so the ambient is now a much
 * lighter blue at more than twice the strength, which lands the unlit ground at about a seventh of
 * the way up the scale: clearly a surface, clearly night, and something for the lamps to stand out
 * against. Day is unchanged; there the sun does the work and the ambient only fills the shadows.
 */
const NIGHT_AMBIENT = 0x6E82A8
const DAY_AMBIENT = /* @__PURE__ */ new THREE.Color('#d8e4e7')
/** What the ground bounces back — which is what lights the underside of everything vertical. */
const NIGHT_GROUND = 0x4A5872
const DAY_GROUND = /* @__PURE__ */ new THREE.Color('#4a4439')
/** How strong the ambient is at night and how much the daylight adds on top of it. */
/**
 * The fog the scene is built with, and the colour a dirty one tends toward.
 *
 * Gemessen, nicht geschätzt: bei der alten Dichte blieben auf zweitausend Einheiten noch **13 %**
 * eines Objekts übrig, und weil die Kamera flach über die Stadt schaut, liegt fast alles Sichtbare
 * zwischen tausend und viertausend. Lindenhafen ertrank in Weiß — die obere Bildhälfte leer, die
 * untere ein Teppich ohne Tiefe.
 *
 * Jetzt: an einem klaren Tag bleiben auf zweitausend rund 90 % übrig, bei vollem Smog unter
 * geschlossener Decke noch knapp die Hälfte. Dunst soll Tiefe geben und die Ferne dämpfen, nicht die
 * Mitte löschen.
 */
const CLEAR_DENSITY = 0.00016
const SMOG = /* @__PURE__ */ new THREE.Color('#a89a78')
/** What the sky goes to when it shuts: the flat slate of a North Sea low. */
const OVERCAST_SKY = /* @__PURE__ */ new THREE.Color('#6a737c')
/** How much of the sun is left under full cloud, and how much of the warmth of a low one. */
const OVERCAST_SUN = 0.22
const OVERCAST_WARMTH = 0.25

const NIGHT_FILL = 2.9
const DAY_FILL = 1.5
/** Sun and moon ride well outside the ground plane, so they set at the horizon and not on the lawn. */
const CELESTIAL_RADIUS = 3_400
/** The lights themselves stay close enough in for a shadow camera to be worth having. */
const LIGHT_RADIUS = 1_250

export interface AtmosphereSubjects {
  scene: THREE.Scene
  sky: SkyVisuals
  buildingMaterials: THREE.MeshStandardMaterial[]
  streetLights: StreetLights
}

export class Atmosphere {
  private target: SkyState = { hourOfDay: 12, elevation: 0.55, arc: 1, sweep: 0.5, phase: 'noon', temperature: 10 }
  private eased = { elevation: 0.55, arc: 1, sweep: 0.5 }
  /** How lively the city is after dark, which decides how many of its lamps and windows are lit. */
  private nightLife = 0.67
  /**
   * How much of the housing stock has somebody in it, 0 … 1.
   *
   * An empty flat has no light in it, and that is the only thing in this game that makes a vacancy
   * rate *visible*. It was the one derived signal the renderer never read at all: the simulation
   * computed it every month and the city looked identical whether a fiftieth or a seventh of it
   * stood empty.
   */
  private occupancy = 1
  /**
   * How much is in the air, 0 … 1.
   *
   * The cheapest signal the city has: the scene already has exponential fog, and thickening and
   * yellowing it costs nothing at all — no mesh, no draw, not one triangle. From the overview it is
   * the difference between a city you can see across and one you cannot.
   */
  private haze = 0
  /**
   * How shut the sky is, 0 … 1.
   *
   * The same machinery the day and the night ride, pointed at the weather. Cloud is not a thin grey
   * film over a blue sky: it cuts the sun down to a fifth, kills the shadows, pulls the whole
   * palette toward slate and brings the horizon in. All four of those already exist here for the
   * hour of the day, and none of them costs a draw call.
   */
  private overcast = 0

  private readonly skyColour = new THREE.Color()
  private readonly sunColour = new THREE.Color()
  private readonly bodyColour = new THREE.Color()
  private readonly hemisphereColour = new THREE.Color()
  private readonly groundColour = new THREE.Color()
  private readonly direction = new THREE.Vector3()
  /** Kept apart from `direction`, which `place` consumes by scaling it out to the sky dome. */
  private readonly sunDirection = new THREE.Vector3()

  constructor(private readonly subjects: AtmosphereSubjects) {}

  /**
   * The sky follows campaign time, not the render loop. The store sends a reading roughly four times
   * a second; the values are eased between those updates so the sun sweeps smoothly, and they stop
   * dead when the player pauses because the reading stops changing.
   */
  setTarget(state: SkyState): void {
    this.target = state
  }

  setNightLife(value: number): void {
    this.nightLife = value
  }

  /** What share of the stock is lived in. Dims the windows, and nothing else. */
  setOccupancy(value: number): void {
    this.occupancy = THREE.MathUtils.clamp(value, 0, 1)
  }

  /** How much is in the air. Thickens the fog the scene already has, and nothing else. */
  setHaze(value: number): void {
    this.haze = THREE.MathUtils.clamp(value, 0, 1)
  }

  /** How much cloud there is between the city and the sun. Costs four uniforms and no draws. */
  setOvercast(value: number): void {
    this.overcast = THREE.MathUtils.clamp(value, 0, 1)
  }

  update(delta: number, focus: THREE.Vector3, cameraDistance: number): void {
    const { scene, sky, buildingMaterials, streetLights } = this.subjects

    // Ease toward the store's reading. A large jump means the campaign was reset or skipped ahead.
    const ease = Math.min(1, delta * 3.2)
    const jumped = Math.abs(this.target.sweep - this.eased.sweep) > 0.4
    this.eased.elevation = jumped ? this.target.elevation : this.eased.elevation + (this.target.elevation - this.eased.elevation) * ease
    this.eased.arc = jumped ? this.target.arc : this.eased.arc + (this.target.arc - this.eased.arc) * ease
    this.eased.sweep = jumped ? this.target.sweep : this.eased.sweep + (this.target.sweep - this.eased.sweep) * ease

    /*
     * Two different heights, on purpose. `elevation` is where the sun really is — fourteen degrees
     * up at noon in January — and everything positional reads it. `arc` is how far through the light
     * the day has come, one at every noon of the year, and everything about brightness reads that:
     * a December afternoon is low, not dim, and the city has to stay legible in winter.
     */
    const { elevation, arc } = this.eased
    const daylight = THREE.MathUtils.smoothstep(arc, -0.12, 0.28)
    // Warmth peaks while the sun sits on the horizon and fades as it climbs.
    const horizonWarmth = THREE.MathUtils.smoothstep(0.34 - Math.abs(arc), 0, 0.34) * THREE.MathUtils.smoothstep(arc, -0.3, 0.05)
    // The sun sweeps east to west; below the horizon it keeps going so dawn arrives from the east.
    const angle = Math.PI * (1 - this.eased.sweep)
    const moonAngle = angle + Math.PI

    /*
     * Cloud eats the colour before it eats the light. A sunset behind a closed sky is grey, not
     * orange — which is why the warmth is cut here rather than only the brightness below.
     */
    const covered = this.overcast
    const painted = this.skyColour.setHex(NIGHT_SKY)
      .lerp(DAY_SKY, daylight)
      .lerp(EMBER, horizonWarmth * 0.62 * (1 - covered * (1 - OVERCAST_WARMTH)))
      .lerp(OVERCAST_SKY, covered * daylight * 0.72)
    scene.background = painted
    if (scene.fog instanceof THREE.FogExp2) {
      /*
       * A dirty sky is thicker and browner, and both together are what reads as smog rather than as
       * weather. The base density is the clear-day one the scene was built with.
       */
      scene.fog.color.copy(painted).lerp(SMOG, this.haze * 0.4)
      /*
       * A closed sky brings the horizon in as surely as smog does, and by the same one number — but
       * the two used to stack to more than three times the clear density on an ordinary January
       * morning, and the city drowned in white. An overcast day closes the distance; it does not
       * erase the middle ground.
       */
      scene.fog.density = CLEAR_DENSITY * (1 + this.haze * 1.25 + covered * covered * 0.55)
    }

    /*
     * The scattered sky itself. Its direction vector is the same arc the sun body rides, so the warm
     * band and the disc always agree, and it fades out below the horizon rather than going Preetham
     * black — the night tone is a decision the palette makes, not one the physics makes for us.
     */
    this.aim(angle, elevation)
    this.sunDirection.copy(this.direction)
    sky.dome.sunPosition.value.copy(this.sunDirection)
    // Turbid and unscattered: a cloudy sky is a bright even grey rather than a blue gradient.
    sky.dome.turbidity.value = 3.4 + horizonWarmth * 6.5 + covered * 9
    sky.dome.rayleigh.value = (1.5 + horizonWarmth * 1.7) * (1 - covered * 0.75)
    sky.dome.nightFade.value = THREE.MathUtils.smoothstep(arc, -0.3, -0.02)

    /*
     * Neither light is ever switched off, only dimmed to zero. Toggling a light's visibility changes
     * the scene's lighting setup, and this renderer keys every material's shader on that setup — so
     * the sun going down at dusk rebuilt every pipeline in the city at once, which is where the drop
     * at the turn of the cycle came from.
     */
    fitShadow(sky.sun, focus, cameraDistance, this.sunDirection, LIGHT_RADIUS)
    /*
     * And the sun itself. Under a closed sky there is no disc and no shadow — the light comes from
     * the whole dome instead, which is why the fill below is raised by as much as this takes away.
     */
    sky.sun.light.intensity = (0.05 + daylight * 4.1) * (1 - covered * (1 - OVERCAST_SUN))
    sky.sun.light.color.copy(this.sunColour.setHex(SUN_WHITE).lerp(EMBER, horizonWarmth * (1 - covered * 0.8)))

    /*
     * The moon rides opposite the sun and only lights the city once the sun has gone. Its target
     * follows the camera along with its position: a directional light points from one to the other,
     * and leaving the target at the origin meant the moonlight swung round as the player panned.
     */
    sky.moon.light.position.set(
      focus.x + Math.cos(moonAngle) * LIGHT_RADIUS,
      Math.max(140, -elevation * 900 + 220),
      focus.z + Math.sin(moonAngle) * LIGHT_RADIUS * 0.45,
    )
    sky.moon.light.target.position.set(focus.x, 0, focus.z)
    sky.moon.light.target.updateMatrixWorld()
    sky.moon.light.intensity = (1 - daylight) * 2.4 * (1 - covered * 0.85)

    /*
     * The bodies themselves ride the same angle as their lights, on a true hemisphere: at elevation
     * zero they sit exactly on the horizon rather than on the light's slightly raised arc, so the
     * disc touches down where the warm band is. They fade out over the last few degrees instead of
     * sinking on past it, because the ground plane ends before they do and nothing would hide them.
     */
    // Neither body is visible through cloud, which is the plainest signal the sky has shut.
    this.place(sky.sun.body, angle, elevation, THREE.MathUtils.smoothstep(arc, -0.09, 0.015) * (1 - covered))
    sky.sun.body.sprite.material.color.copy(this.bodyColour.setHex(SUN_DISC).lerp(SUN_LOW, horizonWarmth * 0.85))
    // The sun swells as it nears the horizon, the way haze makes it look.
    sky.sun.body.sprite.scale.setScalar(520 + horizonWarmth * 210)

    // A daylight moon is real but faint; at night it carries the sky on its own.
    this.place(sky.moon.body, moonAngle, -elevation, THREE.MathUtils.smoothstep(-arc, -0.05, 0.05) * (0.2 + (1 - daylight) * 0.8) * (1 - covered))

    /*
     * Night keeps its real length, so it has to stay readable: an ambient floor plus lit windows
     * carry the city through a December night instead of shortening it. See ADR-0005.
     */
    /*
     * The fill picks up what the cloud took off the sun: an overcast noon is dimmer and much flatter
     * than a clear one, but it is not dark, and a city lit only by a quarter of a sun would be.
     */
    sky.hemisphere.intensity = NIGHT_FILL + daylight * DAY_FILL * (1 + covered * 0.3)
    /*
     * And the colour of it goes grey. Filling in what the cloud took off the sun with *daylight*
     * leaves a city that is brighter and whiter under a storm than under a blue sky, which is the
     * one thing an overcast sky never is.
     */
    sky.hemisphere.color.copy(this.hemisphereColour.setHex(NIGHT_AMBIENT).lerp(DAY_AMBIENT, daylight)).lerp(OVERCAST_SKY, covered * daylight * 0.5)
    sky.hemisphere.groundColor.copy(this.groundColour.setHex(NIGHT_GROUND).lerp(DAY_GROUND, daylight))

    const starlight = Math.max(0, 1 - daylight * 2.4) * (1 - covered)
    sky.stars.visible = starlight > 0.01
    sky.stars.material.opacity = starlight

    /*
     * Lit windows. This can finally be strong: the emissive is masked to the glass by the façade's
     * own light map, so raising it lights the windows rather than the whole wall. It used to be a
     * flat emissive on the entire building, which is why it had to stay so faint to avoid turning
     * every house into a lantern — and why the night had nothing in it.
     */
    /*
     * And how much of it is lived in. Night life decides how *brightly* the city burns; occupancy
     * decides how much of it is there to burn at all, which is a different question and the one a
     * housing policy answers.
     */
    const glow = (1 - daylight) * (0.55 + this.nightLife * 0.75) * this.occupancy
    for (const material of buildingMaterials)
      material.emissiveIntensity = glow

    /*
     * Street lighting comes on as the light goes, and how brightly depends on how the city is doing:
     * a place that has lost its night life leaves half its lamps dark.
     *
     * Both meshes are hidden outright rather than faded to nothing. Two hundred and sixty
     * transparent quads with an opacity of zero are still two hundred and sixty quads blended over
     * the road, every frame of every daylight hour, for no pixels at all.
     */
    // And the lamps come on early on a black afternoon, which is the other half of how a city
    // tells you the sky has shut.
    const lamps = Math.min(1, (1 - daylight) + covered * 0.35) * (0.55 + this.nightLife * 0.45)
    const lit = lamps > 0.012
    streetLights.heads.visible = lit
    streetLights.pools.visible = lit
    if (lit) {
      streetLights.heads.material.emissiveIntensity = lamps * 3.4
      streetLights.pools.material.opacity = lamps * 0.72
    }
  }

  /** The unit direction of a body on its arc, written into the shared scratch vector. */
  private aim(angle: number, elevation: number): void {
    const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation))
    this.direction.set(Math.cos(angle) * horizontal, elevation, Math.sin(angle) * horizontal * 0.45).normalize()
  }

  /**
   * Put one celestial body on the sky dome. `elevation` is its own, so the moon gets the sun's arc
   * negated. The opacity is absolute: a body's own material is never read back and scaled, or the
   * fade would compound itself frame after frame until the sky was empty.
   */
  private place(body: CelestialBody, angle: number, elevation: number, opacity: number): void {
    const visible = opacity > 0.004
    body.sprite.visible = visible
    if (!visible)
      return
    this.aim(angle, elevation)
    body.sprite.position.copy(this.direction.multiplyScalar(CELESTIAL_RADIUS))
    body.sprite.material.opacity = opacity
  }
}
