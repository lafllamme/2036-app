import * as THREE from 'three/webgpu'

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

/**
 * Sun and moon are sprites, not spheres: at three degrees across a sphere is a disc anyway, and a
 * sprite never turns its lit side away from the player. They sit outside the ground plane so they
 * rise and set at the true horizon, write no depth, and are lit by nothing.
 */
export function createCelestialBody(parent: THREE.Object3D, map: THREE.Texture, color: string, scale: number): CelestialBody {
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
