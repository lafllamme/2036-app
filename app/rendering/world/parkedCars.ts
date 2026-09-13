import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y } from '../shared'
import { CAR_PAINT, carProxyGeometry, carProxyMaterial } from './carProxy'
import { addTiled } from './tiledInstances'

/**
 * The cars that are not going anywhere.
 *
 * The cheapest thing in the whole city per unit of life it adds. A parked car never moves, so it is
 * one matrix written once at build time and never touched again — no per-frame work at all, against
 * a driving car's rewrite and buffer upload thirty times a second. And an empty kerb is most of why
 * a street with traffic on it still reads as a model of a street: real streets are lined with parked
 * cars, and until now not one of Lindenhafen's was.
 *
 * Only ordinary cars park. A police car at the kerb with nobody in it reads as an incident, and an
 * ambulance reads as a worse one.
 */

/**
 * How the set is cut up, and how close is close enough to deserve a real car.
 *
 * Two sets over the same tiles: the thirty-triangle proxy, and the kit's own models. Exactly one of
 * them is drawn per tile, chosen by distance, so nothing is ever drawn twice and the near street
 * gets real cars while the rest of the city keeps paying almost nothing.
 *
 * The tile is small because the swap is what it is for. At a kilometre a tile covers half the view
 * and there is no near and far to tell apart; at two hundred and fifty metres the two or three tiles
 * around the player get models and everything else stays a proxy.
 */
const PARKING_TILE = 250
const DETAIL_RANGE = 190

/** How long a car is, so a kit model can be scaled onto the kerb rather than guessed at. */
const CAR_LENGTH = 4.3

/** How far apart parked cars stand, and how far from the centre line. */
const SPACING = 6.4
const KERB = 0.4
/**
 * Which streets are parked on.
 *
 * Wide enough that a car at the kerb does not block it, and not so wide that it is the kind of road
 * that carries a cycle lane instead. The two share the same metre and a half of tarmac at the edge
 * of the carriageway, and a city where every bike lane is full of parked cars is a city nobody meant
 * to build — see `CYCLE_MIN_WIDTH` in `roads.ts`, which is the other half of this decision.
 */
const MIN_WIDTH = 7
const MAX_WIDTH = 13
/** How much of the kerb is taken. A city is never fully parked and never empty either. */
const OCCUPANCY = 0.78
/**
 * As many as are worth the geometry.
 *
 * A kit car is two thousand triangles, which is eight times what it looks like it should be and the
 * thing that has to be budgeted around: three and a half thousand parked cars came to seven and a
 * half million triangles, more than the rest of the city put together. Tiling means only the ones
 * near the camera are drawn, and this is what the whole set costs in memory.
 */
const LIMIT = 3_800

/**
 * The two ways a parked car is drawn, over the same tiles.
 *
 * `proxy` is the whole set; `detail` is the same cars again as kit models, one set of tiles per
 * model so a street is not lined with the same car. The renderer shows one or the other per tile.
 */
export interface ParkedCars {
  proxy: THREE.InstancedMesh[]
  detail: THREE.InstancedMesh[]
}

/** Which of the kit's ordinary cars stand at a kerb. No taxis, no police, nothing on a call. */
const PARKED_MODELS = ['sedan', 'suv', 'hatchback-sports', 'van']

export function addParkedCars(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): ParkedCars {
  const rng = createRandomStream(blueprint.definition.seed, 'parking')
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const paint = CAR_PAINT.map(colour => new THREE.Color(colour))
  const placements: { matrix: THREE.Matrix4, colour: THREE.Color }[] = []

  for (const road of blueprint.roads) {
    if (placements.length >= LIMIT)
      break
    // Nothing parks on a bridge: there is a parapet where the kerb would be.
    if (road.bridge || road.width < MIN_WIDTH || road.width > MAX_WIDTH)
      continue

    const points = road.path
    let carried = rng.next() * SPACING
    for (let i = 0; i < points.length / 2 - 1 && placements.length < LIMIT; i += 1) {
      const ax = points[i * 2]!
      const az = points[i * 2 + 1]!
      const bx = points[(i + 1) * 2]!
      const bz = points[(i + 1) * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az)
      if (span < 1)
        continue
      const ux = (bx - ax) / span
      const uz = (bz - az) / span
      const facing = Math.atan2(ux, uz)

      for (let along = SPACING - carried; along < span; along += SPACING) {
        for (const side of [1, -1]) {
          if (rng.next() > OCCUPANCY)
            continue
          // Half the lane out from the centre, which is where a car stands at a German kerb.
          const offset = (road.width / 2 - 1.1 - KERB) * side
          const x = ax + ux * along - uz * offset
          const z = az + uz * along + ux * offset
          placements.push({
            matrix: new THREE.Matrix4().compose(
              position.set(x, blueprint.relief.height(x, z), z),
              // Facing whichever way the traffic on that side runs, give or take a badly parked one.
              quaternion.setFromAxisAngle(AXIS_Y, facing + (side > 0 ? 0 : Math.PI) + rng.between(-0.04, 0.04)),
              scale,
            ),
            colour: paint[Math.floor(rng.next() * paint.length)]!,
          })
        }
      }
      carried = (carried + span) % SPACING
    }
  }

  /*
   * One geometry and one material for every parked car in the city, tiled so the camera can drop
   * most of it. Thirty triangles apiece against the kit model's two thousand — see `carProxy.ts` for
   * why a parked car is the one place in the city where that trade is obviously right.
   */
  const settle = (mesh: THREE.InstancedMesh): void => {
    /*
     * No shadow. A parked car is a shadow the length of a kerbstone, falling on a road already in the
     * shade of the building behind it, and casting doubled the whole set.
     */
    mesh.castShadow = false
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  }

  const proxy = addTiled(scene, carProxyGeometry(), carProxyMaterial(), placements, settle, PARKING_TILE).meshes

  /*
   * And the same cars again, as models, for the street the player is standing in.
   *
   * The proxy was written for a camera that never comes close, and the moment one does it reads as
   * two stacked boxes — which is exactly what it is. Kit cars everywhere is not the answer either: a
   * kit car is two thousand triangles against thirty, and two and a half thousand of them is more
   * geometry than the rest of the city put together.
   */
  const detail: THREE.InstancedMesh[] = []
  const kit = PARKED_MODELS.map(id => models.vehicles.find(model => model.id === id)).filter(model => model !== undefined)
  if (kit.length > 0) {
    kit.forEach((model, index) => {
      // Deal the cars out between the models by position in the list, so a street is mixed.
      const mine = placements.filter((_, at) => at % kit.length === index)
      if (mine.length === 0)
        return
      const fitted = CAR_LENGTH / Math.max(0.001, model.size.z)
      const sized = mine.map(placement => ({
        matrix: placement.matrix.clone().scale(new THREE.Vector3(fitted, fitted, fitted)),
        colour: undefined,
      }))
      detail.push(...addTiled(scene, model.geometry, models.vehicleMaterial, sized, (mesh) => {
        settle(mesh)
        mesh.visible = false
      }, PARKING_TILE).meshes)
    })
  }

  return { proxy, detail }
}

/**
 * Show models where the player can see them and proxies everywhere else.
 *
 * Called from the render loop's slow tick rather than every frame: a tile does not cross the
 * boundary thirty times a second, and this walks every tile in the set.
 */
export function fitParkedDetail(cars: ParkedCars, camera: THREE.Vector3, visible: boolean): void {
  for (const mesh of cars.proxy)
    mesh.visible = visible && !near(mesh, camera)
  for (const mesh of cars.detail)
    mesh.visible = visible && near(mesh, camera)
}

function near(mesh: THREE.InstancedMesh, camera: THREE.Vector3): boolean {
  const sphere = mesh.boundingSphere
  if (!sphere)
    return false
  return camera.distanceTo(sphere.center) - sphere.radius < DETAIL_RANGE
}
