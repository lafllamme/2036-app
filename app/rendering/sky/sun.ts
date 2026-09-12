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

export function createSun(scene: THREE.Scene, rig: THREE.Object3D): Sun {
  const light = new THREE.DirectionalLight('#fff2d2', 4.2)
  light.position.set(-700, 1_100, -420)
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  light.shadow.camera.left = -720
  light.shadow.camera.right = 720
  light.shadow.camera.top = 720
  light.shadow.camera.bottom = -720
  light.shadow.camera.near = 80
  light.shadow.camera.far = 2_400
  light.shadow.bias = -0.00035
  // The renderer drives shadow refreshes itself, on a slower cadence than the frame.
  light.shadow.autoUpdate = false
  light.shadow.needsUpdate = true
  scene.add(light)

  return { light, body: createCelestialBody(rig, sunTexture(), '#fffdf6', 520) }
}
