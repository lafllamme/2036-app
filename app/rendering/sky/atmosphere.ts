import type { SkyState } from '../../core/contracts'
import type { StreetLights } from '../world/streetLights'
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
const NIGHT_SKY = 0x0D1522
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
const NIGHT_AMBIENT = 0x364863
const DAY_AMBIENT = /* @__PURE__ */ new THREE.Color('#d8e4e7')
/**
 * What the ground bounces back. At night it used to be the daytime olive, which under a hemisphere
 * light turned into no bounce at all and left the streets and the parks solid black between the
 * lamps — the city disappeared rather than going dark.
 */
const NIGHT_GROUND = 0x2A3446
const DAY_GROUND = /* @__PURE__ */ new THREE.Color('#4a4439')
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

    const painted = this.skyColour.setHex(NIGHT_SKY).lerp(DAY_SKY, daylight).lerp(EMBER, horizonWarmth * 0.62)
    scene.background = painted
    if (scene.fog instanceof THREE.FogExp2)
      scene.fog.color.copy(painted)

    /*
     * The scattered sky itself. Its direction vector is the same arc the sun body rides, so the warm
     * band and the disc always agree, and it fades out below the horizon rather than going Preetham
     * black — the night tone is a decision the palette makes, not one the physics makes for us.
     */
    this.aim(angle, elevation)
    this.sunDirection.copy(this.direction)
    sky.dome.sunPosition.value.copy(this.sunDirection)
    sky.dome.turbidity.value = 3.4 + horizonWarmth * 6.5
    sky.dome.rayleigh.value = 1.5 + horizonWarmth * 1.7
    sky.dome.nightFade.value = THREE.MathUtils.smoothstep(arc, -0.3, -0.02)

    /*
     * Neither light is ever switched off, only dimmed to zero. Toggling a light's visibility changes
     * the scene's lighting setup, and this renderer keys every material's shader on that setup — so
     * the sun going down at dusk rebuilt every pipeline in the city at once, which is where the drop
     * at the turn of the cycle came from.
     */
    fitShadow(sky.sun, focus, cameraDistance, this.sunDirection, LIGHT_RADIUS)
    sky.sun.light.intensity = 0.05 + daylight * 4.1
    sky.sun.light.color.copy(this.sunColour.setHex(SUN_WHITE).lerp(EMBER, horizonWarmth))

    // The moon rides opposite the sun and only lights the city once the sun has gone.
    sky.moon.light.position.set(
      focus.x + Math.cos(moonAngle) * LIGHT_RADIUS,
      Math.max(140, -elevation * 900 + 220),
      focus.z + Math.sin(moonAngle) * LIGHT_RADIUS * 0.45,
    )
    sky.moon.light.intensity = (1 - daylight) * 2.1

    /*
     * The bodies themselves ride the same angle as their lights, on a true hemisphere: at elevation
     * zero they sit exactly on the horizon rather than on the light's slightly raised arc, so the
     * disc touches down where the warm band is. They fade out over the last few degrees instead of
     * sinking on past it, because the ground plane ends before they do and nothing would hide them.
     */
    this.place(sky.sun.body, angle, elevation, THREE.MathUtils.smoothstep(arc, -0.09, 0.015))
    sky.sun.body.sprite.material.color.copy(this.bodyColour.setHex(SUN_DISC).lerp(SUN_LOW, horizonWarmth * 0.85))
    // The sun swells as it nears the horizon, the way haze makes it look.
    sky.sun.body.sprite.scale.setScalar(520 + horizonWarmth * 210)

    // A daylight moon is real but faint; at night it carries the sky on its own.
    this.place(sky.moon.body, moonAngle, -elevation, THREE.MathUtils.smoothstep(-arc, -0.05, 0.05) * (0.2 + (1 - daylight) * 0.8))

    /*
     * Night keeps its real length, so it has to stay readable: an ambient floor plus lit windows
     * carry the city through a December night instead of shortening it. See ADR-0005.
     */
    sky.hemisphere.intensity = 1.55 + daylight * 0.85
    sky.hemisphere.color.copy(this.hemisphereColour.setHex(NIGHT_AMBIENT).lerp(DAY_AMBIENT, daylight))
    sky.hemisphere.groundColor.copy(this.groundColour.setHex(NIGHT_GROUND).lerp(DAY_GROUND, daylight))

    const starlight = Math.max(0, 1 - daylight * 2.4)
    sky.stars.visible = starlight > 0.01
    sky.stars.material.opacity = starlight

    /*
     * The city's own glow at night, carried on the shared atlas material rather than a lit mesh.
     * It is deliberately faint: raised far enough to be read as lit windows it lights the whole
     * façade evenly instead, and a building glowing uniformly from within reads as a lantern.
     */
    const glow = (1 - daylight) * (0.04 + this.nightLife * 0.06)
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
    const lamps = (1 - daylight) * (0.55 + this.nightLife * 0.45)
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
