import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { uniform, vec4 } from 'three/tsl'

/**
 * The sky's own colour: Preetham scattering with the model's clouds, as a node material.
 *
 * Two knobs of ours are bolted onto its node graph. Preetham is written for a renderer exposed
 * around 0.5 and the city is graded at 1.02, so the raw scattering clipped to flat white from
 * horizon to zenith and no sun could stand out against it; `brightness` scales its radiance without
 * touching the grade of the city itself. `nightFade` lets the palette's own night colour take over
 * below the horizon rather than the model's near-black.
 */

/** The sky box sits inside the camera's far plane and centred on the camera, in city units. */
const SKY_RADIUS = 7_000
const SKY_BRIGHTNESS = 0.16

export type GameSky = SkyMesh & {
  brightness: ScalarUniform
  nightFade: ScalarUniform
}

type ScalarUniform = ReturnType<typeof scalarUniform>

/** `uniform` infers cleanly from a plain number; naming the helper keeps the type readable above. */
function scalarUniform(value: number) {
  return uniform(value)
}

export function createSkyDome(): GameSky {
  const sky = new SkyMesh() as GameSky
  sky.scale.setScalar(SKY_RADIUS)

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
  return sky
}
