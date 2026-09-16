import type * as THREE from 'three/webgpu'
import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import type { Precipitation } from '../sky/precipitation'
import type { Protest } from './life/protest'
import type { Prowlers } from './life/prowlers'
import type { RoughSleeping } from './life/roughSleeping'
import type { ParkedCars } from './streets/parkedCars'
import type { RoadNetwork } from './streets/roadNetwork'
import type { StreetLights } from './streets/streetLights'
import type { TrafficSignals } from './streets/trafficLights'
import type { CityBuildings } from './structures/buildings'
import type { PowerPlant } from './structures/powerPlant'
import type { Shopfronts } from './structures/shopfronts'
import type { WindFarm } from './structures/windFarm'
import type { Meadow } from './terrain/meadow'
import type { CityTrees } from './terrain/trees'
import type { Water } from './terrain/water'
import type { Agents } from './traffic/agents'
import type { IncidentScenes } from './traffic/incidentScene'
import type { Railway } from './transit/railway'
import type { Ships } from './transit/ships'
import type { CitySurfaces } from './weatherSurfaces'
import { addPrecipitation } from '../sky/precipitation'
import { buildErrands } from './life/errands'
import { addProtest } from './life/protest'
import { addProwlers } from './life/prowlers'
import { addRoughSleeping } from './life/roughSleeping'
import { addParkedCars } from './streets/parkedCars'
import { buildRoadNetwork } from './streets/roadNetwork'
import { addRoads } from './streets/roads'
import { addStreetFurniture } from './streets/streetFurniture'
import { addStreetLights } from './streets/streetLights'
import { addTrafficLights } from './streets/trafficLights'
import { createBuildings } from './structures/buildings'
import { createConstructionSites } from './structures/construction'
import { createGrowth } from './structures/growth'
import { addPowerPlant } from './structures/powerPlant'
import { addShopfronts } from './structures/shopfronts'
import { addWindFarms } from './structures/windFarm'
import { addGround } from './terrain/ground'
import { addMeadow } from './terrain/meadow'
import { addTrees } from './terrain/trees'
import { addWater } from './terrain/water'
import { createAgents } from './traffic/agents'
import { createIncidentScenes } from './traffic/incidentScene'
import { addRailway } from './transit/railway'
import { addShips } from './transit/ships'
import { trackSurfaces } from './weatherSurfaces'

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
  /** Cars at the kerb. They never move, so they cost a matrix each and nothing per frame. */
  parkedCars: ParkedCars
  /** Signs, skips and cones down the kerbs: what makes street level look like a street. */
  streetFurniture: THREE.Group
  /** The cordon, the crowd and the marker at whatever is currently happening. */
  incidentScenes: IncidentScenes
  /** The junction signals, and the authority the traffic asks whether it may go. */
  signals: TrafficSignals
  network: RoadNetwork
  water: Water | null
  ships: Ships | null
  railway: Railway | null
  /** People the housing market has left outside. Placed once, counted every month. */
  roughSleeping: RoughSleeping
  /** Somebody at a house at two in the morning. Counted from the burglary pressure and the hour. */
  prowlers: Prowlers
  /** Halme und Blumen um die Kamera herum. Siehe `terrain/meadow.ts`. */
  meadow: Meadow
  /** Windparks im Umland: die einzige Silhouette, die aus zwei Kilometern noch liest. */
  windFarm: WindFarm | null
  /** Das Heizkraftwerk und seine Trasse: das eine Bauwerk, von dem es nur eines gibt. */
  powerPlant: PowerPlant | null
  /** Die Schilder über den Ladentüren. Ihre Farbe folgt dem Einzelhandelsbestand. */
  shopfronts: Shopfronts
  /**
   * People outside the town hall when the city has had enough. Three draws while they are there and
   * none at all when they are not, which is most of a well-run decade.
   */
  protest: Protest
  /** Rain and snow: two draws, no triangles, and only while it is actually coming down. */
  precipitation: Precipitation
  /** Every material the weather is allowed to wet or whiten. Costs uniforms, never draws. */
  surfaces: CitySurfaces
}

export function createWorld(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): WorldVisuals {
  const soft = addGround(scene, blueprint)

  // The street plan cut into junctions and the stretches between them. The roads, the traffic and
  // the signals all read it — the roads because a junction is a surface, not a pile of ribbons.
  const network = buildRoadNetwork(blueprint, blueprint.relief)
  const paved = addRoads(scene, blueprint, network)
  const signals = addTrafficLights(scene, network, blueprint.relief, models)

  const buildings = createBuildings(scene, blueprint)
  /*
   * Die Adressen, zu denen die Leute gehen können. Sie kommen aus den Ladenzeilen, gehören also der
   * Stadt und nicht der Flotte — die Flotte bekommt sie gereicht. Siehe `life/errands.ts`.
   */
  const errands = buildErrands(buildings.shopSeats, blueprint.definition.seed)
  const agents = createAgents(scene, blueprint, models, network, signals.plan)
  agents.pedestrians.errands = errands

  return {
    ...buildings,
    ...addTrees(scene, blueprint, models),
    agents,
    growth: createGrowth(scene, blueprint, models),
    constructionSites: createConstructionSites(scene),
    streetLights: addStreetLights(scene, blueprint, models),
    parkedCars: addParkedCars(scene, blueprint, models),
    streetFurniture: addStreetFurniture(scene, blueprint, models),
    incidentScenes: createIncidentScenes(scene, models),
    signals,
    network,
    water: addWater(scene, blueprint),
    ships: addShips(scene, blueprint),
    railway: addRailway(scene, blueprint),
    roughSleeping: addRoughSleeping(scene, blueprint, models),
    prowlers: addProwlers(scene, blueprint, models),
    meadow: addMeadow(scene, blueprint, models),
    windFarm: addWindFarms(scene, blueprint),
    powerPlant: addPowerPlant(scene, blueprint),
    shopfronts: addShopfronts(scene, buildings.shopSeats, blueprint.definition.seed),
    protest: addProtest(scene, blueprint, models),
    precipitation: addPrecipitation(scene),
    surfaces: trackSurfaces(paved, soft),
  }
}
