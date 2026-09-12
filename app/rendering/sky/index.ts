import type { Moon } from './moon'
import type { GameSky } from './skyDome'
import type { Sun } from './sun'
import * as THREE from 'three/webgpu'
import { createMoon } from './moon'
import { createSkyDome } from './skyDome'
import { createStars } from './stars'
import { createSun } from './sun'

/** Everything above the rooftops, and the two lights the city below is lit by. */
export interface SkyVisuals {
  /**
   * The firmament rides with the camera. Panning across a city three kilometres wide would otherwise
   * walk the player straight through a sky box that has to stay inside the camera's far plane, and
   * the sun would slide across the horizon as the player scrolled — a sky is by definition the one
   * thing that does not move when you do.
   */
  rig: THREE.Group
  dome: GameSky
  stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  sun: Sun
  moon: Moon
  hemisphere: THREE.HemisphereLight
}

export function createSky(scene: THREE.Scene, seed: number): SkyVisuals {
  const hemisphere = new THREE.HemisphereLight('#d8e4e7', '#4a4439', 2.25)
  scene.add(hemisphere)

  const rig = new THREE.Group()
  rig.frustumCulled = false
  scene.add(rig)

  const dome = createSkyDome()
  rig.add(dome)

  return {
    rig,
    dome,
    stars: createStars(rig, seed),
    sun: createSun(scene, rig),
    moon: createMoon(scene, rig, seed),
    hemisphere,
  }
}
