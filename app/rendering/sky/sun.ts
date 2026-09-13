import type { CelestialBody } from './celestialBody'
import * as THREE from 'three/webgpu'
import { createCelestialBody } from './celestialBody'
import { sunTexture } from './textures'

/**
 * The sun: the light the city is lit and shadowed by, and the disc the player sees.
 *
 * They are separate objects on the same arc. The light needs a position close enough for a shadow
 * camera to be useful; the body needs one far outside the ground so it sets at the true horizon.
 */
export interface Sun {
  light: THREE.DirectionalLight
  body: CelestialBody
}

/** The shadow map's resolution. Everything below is expressed in how many metres one texel covers. */
const SHADOW_RESOLUTION = 2_048
/**
 * How much ground the shadow map covers, as a fraction of how far the camera stands from what it is
 * looking at, and the range that is clamped into.
 *
 * It used to be a fixed 1 440 m box whatever the camera did. At that size one texel covers seventy
 * centimetres, so the edge of every shadow landed on a different texel from one refresh to the next
 * and crawled — the dancing you see with your nose against a building. Fitted to the view, a close
 * camera gets texels of a few centimetres and the crawl goes with them.
 */
const SHADOW_FIT = 0.62
const SHADOW_MIN_EXTENT = 90
const SHADOW_MAX_EXTENT = 1_100

export function createSun(scene: THREE.Scene, rig: THREE.Object3D): Sun {
  const light = new THREE.DirectionalLight('#fff2d2', 4.2)
  light.position.set(-700, 1_100, -420)
  light.castShadow = true
  light.shadow.mapSize.set(SHADOW_RESOLUTION, SHADOW_RESOLUTION)
  light.shadow.camera.near = 20
  light.shadow.camera.far = 3_400
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.6
  // The renderer drives shadow refreshes itself, on a slower cadence than the frame.
  light.shadow.autoUpdate = false
  light.shadow.needsUpdate = true
  scene.add(light)
  // A directional light shines from its position toward its target, and a target has to be in the
  // scene to have a world matrix at all. This one follows the camera; see `fitShadow`.
  scene.add(light.target)

  return { light, body: createCelestialBody(rig, sunTexture(), '#fffdf6', 520) }
}

/**
 * Point the shadow map at what the player is looking at, at a size that suits how close they are.
 *
 * The second half of this is the part that stops the shimmer: the centre is snapped to whole shadow
 * texels. Without it the whole map slides by a fraction of a texel every time the camera moves, and
 * every shadow edge in the city boils along with it — the classic swimming shadow, and far more
 * visible than the coarse edges it comes with.
 */
/**
 * How much ground the shadow map covers from a given camera distance.
 *
 * Anything outside that box contributes nothing to the shadow pass, so nothing outside it needs to be
 * drawn into it — which is the whole of the shadow optimisation, and why this is worth exporting.
 */
export function shadowExtent(cameraDistance: number): number {
  return THREE.MathUtils.clamp(cameraDistance * SHADOW_FIT, SHADOW_MIN_EXTENT, SHADOW_MAX_EXTENT)
}

export function fitShadow(sun: Sun, focus: THREE.Vector3, cameraDistance: number, sunDirection: THREE.Vector3, lightRadius: number): void {
  const extent = shadowExtent(cameraDistance)
  const camera = sun.light.shadow.camera
  if (camera.right !== extent) {
    camera.left = -extent
    camera.right = extent
    camera.top = extent
    camera.bottom = -extent
    camera.updateProjectionMatrix()
    sun.light.shadow.needsUpdate = true
  }

  const texel = (extent * 2) / SHADOW_RESOLUTION
  const x = Math.round(focus.x / texel) * texel
  const z = Math.round(focus.z / texel) * texel
  sun.light.target.position.set(x, 0, z)
  sun.light.target.updateMatrixWorld()
  sun.light.position.set(
    x + sunDirection.x * lightRadius,
    Math.max(40, sunDirection.y * lightRadius),
    z + sunDirection.z * lightRadius,
  )
}
