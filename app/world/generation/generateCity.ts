import type { BuildingRecord, BuildingType, CityBlueprint, RoadRecord, TreeRecord } from '../../core/contracts'
import { createRandomStream } from '../../core/rng'
import { cityDepth } from '../cityShape'
import { districtAt, LINDENHAFEN } from '../model/lindenhafen'

const HALF_CITY = 1_440
const BLOCK_SIZE = 180
const ROAD_WIDTH = 24

function buildingTypeFor(districtId: ReturnType<typeof districtAt>, roll: number): BuildingType {
  if (districtId === 'hafen-industrie')
    return roll > 0.72 ? 'commercial' : 'industrial'
  if (districtId === 'gewerbe-ost')
    return roll > 0.7 ? 'industrial' : 'commercial'
  if (districtId === 'universitaet-klinikum')
    return roll > 0.42 ? 'civic' : 'modern'
  if (districtId === 'vorstadt-west')
    return 'residential'
  if (districtId === 'innenstadt' || districtId === 'gruenderzeit-nord')
    return roll > 0.82 ? 'commercial' : 'altbau'
  return roll > 0.75 ? 'modern' : 'residential'
}

function baseHeight(type: BuildingType): [number, number] {
  switch (type) {
    case 'industrial': return [10, 22]
    case 'commercial': return [18, 62]
    case 'modern': return [22, 54]
    case 'civic': return [16, 36]
    case 'residential': return [10, 28]
    case 'altbau': return [18, 34]
  }
}

function isRiver(x: number): boolean {
  return x > -1_175 && x < -925
}

function isPark(x: number, z: number): boolean {
  return (x > 760 && x < 1_240 && z > -980 && z < -620) || (x > -420 && x < 20 && z > -120 && z < 180)
}

export function generateCity(seed = LINDENHAFEN.seed): CityBlueprint {
  const buildingRng = createRandomStream(seed, 'buildings')
  const treeRng = createRandomStream(seed, 'vegetation')
  const roads: RoadRecord[] = []
  const buildings: BuildingRecord[] = []
  const growthSlots: BuildingRecord[] = []
  const trees: TreeRecord[] = []

  let roadIndex = 0
  for (let coordinate = -HALF_CITY; coordinate <= HALF_CITY; coordinate += BLOCK_SIZE) {
    roads.push({ id: `road-z-${roadIndex}`, x: coordinate, z: 0, width: ROAD_WIDTH + (roadIndex % 4 === 0 ? 12 : 0), depth: 3_000, axis: 'z', arterial: roadIndex % 4 === 0 })
    roads.push({ id: `road-x-${roadIndex}`, x: 0, z: coordinate, width: 3_000, depth: ROAD_WIDTH + (roadIndex % 4 === 0 ? 12 : 0), axis: 'x', arterial: roadIndex % 4 === 0 })
    roadIndex += 1
  }

  /*
   * Parcel grids, coarse to fine. A block near the centre is cut into nine plots and built out
   * almost fully; one at the edge is cut into four and half of them stay empty. The city used to
   * use the same nine-plot grid at the same density everywhere, which is what made it read as a
   * uniform mat with a hard square edge rather than as a place with a middle.
   */
  const PARCEL_GRIDS = [
    { offsets: [-63, -21, 21, 63], spread: 0.78 },
    { offsets: [-52, 0, 52], spread: 1 },
    { offsets: [-45, 45], spread: 1.3 },
  ] as const
  let buildingIndex = 0

  for (let blockX = -HALF_CITY + BLOCK_SIZE / 2; blockX < HALF_CITY; blockX += BLOCK_SIZE) {
    for (let blockZ = -HALF_CITY + BLOCK_SIZE / 2; blockZ < HALF_CITY; blockZ += BLOCK_SIZE) {
      if (isRiver(blockX) || isPark(blockX, blockZ))
        continue
      /*
       * The city's own edge wanders, and the suburbs the renderer scatters read the same line. A
       * block past it is countryside: nothing is laid out there, and the corners of the old square
       * go with it.
       */
      const depth = cityDepth(blockX, blockZ, seed)
      if (depth > 1)
        continue

      const districtId = districtAt(blockX, blockZ)
      const districtDensity = districtId === 'vorstadt-west' ? 0.72 : districtId === 'hafen-industrie' ? 0.76 : 0.97
      // Dense in the middle, loose at the rim, with the last blocks half empty.
      const density = districtDensity * (1 - 0.26 * depth ** 1.8)
      const grid = PARCEL_GRIDS[depth < 0.48 ? 0 : depth < 0.88 ? 1 : 2] ?? PARCEL_GRIDS[1]
      const { offsets: parcels, spread } = grid

      for (const offsetX of parcels) {
        for (const offsetZ of parcels) {
          const occupied = buildingRng.next() <= density
          const x = blockX + offsetX + buildingRng.between(-6, 6)
          const z = blockZ + offsetZ + buildingRng.between(-6, 6)
          const type = buildingTypeFor(districtId, buildingRng.next())
          const [minHeight, maxHeight] = baseHeight(type)
          const centerBoost = Math.max(0, 1 - depth * 1.15)
          const height = buildingRng.between(minHeight, maxHeight) * (1 + centerBoost * (type === 'commercial' || type === 'modern' ? 0.8 : 0.25))
          const record: BuildingRecord = {
            id: occupied ? `b-${buildingIndex.toString(36)}` : `g-${growthSlots.length.toString(36)}`,
            districtId,
            type,
            x,
            z,
            width: buildingRng.between(34, 48) * spread,
            depth: buildingRng.between(32, 42) * spread,
            height,
            // A free angle, not one of two: a street of buildings all square to the same axis is a
            // grid you can feel even when the grid itself is hidden behind them.
            rotation: buildingRng.between(-0.06, 0.06) + (buildingRng.next() > 0.5 ? 0 : Math.PI),
            condition: buildingRng.between(0.62, 0.98),
            occupancy: buildingRng.between(0.76, 0.99),
          }
          if (occupied) {
            buildings.push(record)
            buildingIndex += 1
          }
          else if (districtId !== 'hafen-industrie' && districtId !== 'gewerbe-ost') {
            // Free residential parcels become the city's growth capacity.
            growthSlots.push({ ...record, type: districtId === 'vorstadt-west' ? 'residential' : 'modern' })
          }
        }
      }
    }
  }

  for (let index = 0; index < 720; index += 1) {
    let x = treeRng.between(-1_440, 1_440)
    const z = treeRng.between(-1_440, 1_440)
    if (isRiver(x))
      x += 310
    if (!isPark(x, z) && index < 300) {
      const roadSnap = Math.round(x / BLOCK_SIZE) * BLOCK_SIZE
      x = roadSnap + (treeRng.next() > 0.5 ? 28 : -28)
    }
    trees.push({ id: `tree-${index.toString(36)}`, x, z, scale: treeRng.between(0.7, 1.45) })
  }

  // Grow outward from the centre so the skyline fills in the way a real city densifies.
  growthSlots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))

  return {
    definition: { ...LINDENHAFEN, seed },
    buildings,
    growthSlots,
    roads,
    trees,
  }
}
