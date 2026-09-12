import type { CelestialBody } from './celestialBody'
import * as THREE from 'three/webgpu'
import { createCelestialBody } from './celestialBody'
import { moonTexture } from './textures'

/** The moon: a light that carries the city through the night, and the face the player sees. */
export interface Moon {
  light: THREE.DirectionalLight
  body: CelestialBody
}

export function createMoon(scene: THREE.Scene, rig: THREE.Object3D, seed: number): Moon {
  const light = new THREE.DirectionalLight('#b9c6d4', 0)
  light.position.set(700, 900, 420)
  scene.add(light)

  return { light, body: createCelestialBody(rig, moonTexture(seed), '#eef3fa', 430) }
}
