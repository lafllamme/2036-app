import type * as THREE from 'three/webgpu'
import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import type { Agents } from './agents'
import type { CityBuildings } from './buildings'
import type { StreetLights } from './streetLights'
import type { CityTrees } from './trees'
import { createAgents } from './agents'
import { createBuildings } from './buildings'
import { addCitySurfaces } from './citySurfaces'
import { createConstructionSites } from './construction'
import { addGround } from './ground'
import { createGrowth } from './growth'
import { addLandmarks } from './landmarks'
import { addOutskirts } from './outskirts'
import { addRoads } from './roads'
import { addStreetLights } from './streetLights'
import { addTrees } from './trees'

/**
 * Lindenhafen as geometry. Each part is built by its own module and this is the only place that
 * knows they all belong to one city.
 *
 * Nothing here is ever read by the simulation. It reads the blueprint and the kit, and hands back
 * the handful of objects the renderer needs to keep up with what the simulation decides later.
 */
export interface WorldVisuals extends CityBuildings, CityTrees, Agents {
  /** Finished new housing. `count` grows as the construction pipeline delivers. */
  growth: THREE.InstancedMesh
  /** One crane per site, parked on the next growth parcels so building precedes buildings. */
  constructionSites: THREE.Group
  streetLights: StreetLights
  /**
   * Suburbs and villages, in one group so they can be switched off wholesale. From inside the city
   * they are behind two kilometres of haze and the far side of the skyline, and never worth a draw.
   */
  outskirts: THREE.Group
}

export function createWorld(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): WorldVisuals {
  addGround(scene, blueprint)
  addCitySurfaces(scene, blueprint)
  addRoads(scene, blueprint)
  addLandmarks(scene)

  const outskirts = addOutskirts(blueprint, models)
  scene.add(outskirts)

  return {
    ...createBuildings(scene, blueprint, models),
    ...addTrees(scene, blueprint, models),
    ...createAgents(scene),
    growth: createGrowth(scene, blueprint, models),
    constructionSites: createConstructionSites(scene),
    streetLights: addStreetLights(scene, blueprint),
    outskirts,
  }
}
