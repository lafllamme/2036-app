import type * as THREE from 'three/webgpu'
import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import type { Agents } from './agents'
import type { CityBuildings } from './buildings'
import type { RoadNetwork } from './roadNetwork'
import type { Ships } from './ships'
import type { StreetLights } from './streetLights'
import type { TrafficSignals } from './trafficLights'
import type { CityTrees } from './trees'
import type { Water } from './water'
import { createAgents } from './agents'
import { createBuildings } from './buildings'
import { createConstructionSites } from './construction'
import { addGround } from './ground'
import { createGrowth } from './growth'
import { buildRoadNetwork } from './roadNetwork'
import { addRoads } from './roads'
import { addShips } from './ships'
import { addStreetFurniture } from './streetFurniture'
import { addStreetLights } from './streetLights'
import { addTrafficLights } from './trafficLights'
import { addTrees } from './trees'
import { addWater } from './water'

/**
 * Lindenhafen as geometry. Each part is built by its own module and this is the only place that
 * knows they all belong to one city.
 *
 * Nothing here is ever read by the simulation. It reads the blueprint and the kit, and hands back
 * the handful of objects the renderer needs to keep up with what the simulation decides later.
 */
export interface WorldVisuals extends CityBuildings, CityTrees {
  agents: Agents
  /** Finished new housing. `count` grows as the construction pipeline delivers. */
  growth: THREE.InstancedMesh
  /** One crane per site, parked on the next growth parcels so building precedes buildings. */
  constructionSites: THREE.Group
  streetLights: StreetLights
  /** Signs, skips and cones down the kerbs: what makes street level look like a street. */
  streetFurniture: THREE.Group
  /** The junction signals, and the authority the traffic asks whether it may go. */
  signals: TrafficSignals
  network: RoadNetwork
  water: Water | null
  ships: Ships | null
}

export function createWorld(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): WorldVisuals {
  addGround(scene, blueprint)
  addRoads(scene, blueprint)

  // The street plan cut into junctions and the stretches between them. Traffic and signals share it.
  const network = buildRoadNetwork(blueprint, blueprint.relief)
  const signals = addTrafficLights(scene, network, blueprint.relief, models)

  return {
    ...createBuildings(scene, blueprint),
    ...addTrees(scene, blueprint, models),
    agents: createAgents(scene, blueprint, models, network, signals.plan),
    growth: createGrowth(scene, blueprint, models),
    constructionSites: createConstructionSites(scene),
    streetLights: addStreetLights(scene, blueprint, models),
    streetFurniture: addStreetFurniture(scene, blueprint, models),
    signals,
    network,
    water: addWater(scene, blueprint),
    ships: addShips(scene, blueprint),
  }
}
