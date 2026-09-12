import type { CityBlueprint } from '../../core/contracts'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { CITY_FLAT_RADIUS, terrainHeight } from '../../world/terrain'
import { AXIS_Y, WHITE } from '../shared'
import { RIVER_X } from './ground'

/** How the built-up area gives way: a suburban belt with the city's street rhythm, then villages. */
const SUBURB_COUNT = 850
const SUBURB_DEPTH = 950
const VILLAGE_COUNT = 30
const VILLAGE_REACH = 4_600

/**
 * The city thins out instead of stopping.
 *
 * Two different kinds of thinning, because a single even smear around a circle reads as exactly what
 * it is. First a suburban belt that keeps the street rhythm and follows an irregular edge — the city
 * limit wanders in and out rather than tracing a square. Then villages: a few dozen small clusters
 * scattered across the hills with empty land between them, which is what actually sits around a city
 * of this size.
 *
 * None of it is ever touched by the simulation. It is generated here, from its own seeded stream,
 * and never appears in the blueprint.
 */
export function addOutskirts(blueprint: CityBlueprint, models: CityModels): THREE.Group {
  const group = new THREE.Group()
  group.name = 'outskirts'
  const seed = blueprint.definition.seed
  const rng = createRandomStream(seed, 'outskirts')
  const placements: { x: number, z: number, footprint: number, height: number, pick: number }[] = []

  // The city limit as a wandering line rather than a radius: three harmonics with seeded phases.
  const phases = [rng.next() * Math.PI * 2, rng.next() * Math.PI * 2, rng.next() * Math.PI * 2]
  const cityEdge = (angle: number): number => (CITY_FLAT_RADIUS - 260) * (
    1
    + 0.17 * Math.sin(angle * 3 + (phases[0] ?? 0))
    + 0.10 * Math.sin(angle * 5 + (phases[1] ?? 0))
    + 0.06 * Math.sin(angle * 8 + (phases[2] ?? 0))
  )

  function add(x: number, z: number, minHeight: number, maxHeight: number): void {
    // Nothing is built in the river or on its far bank's promenade.
    if (x > RIVER_X - 190 && x < RIVER_X + 190)
      return
    placements.push({
      x,
      z,
      footprint: rng.between(24, 58),
      height: rng.between(minHeight, maxHeight),
      pick: rng.next(),
    })
  }

  for (let index = 0; index < SUBURB_COUNT; index += 1) {
    const angle = rng.next() * Math.PI * 2
    const radius = cityEdge(angle) + rng.next() ** 0.75 * SUBURB_DEPTH
    // Snapped to the city's own block rhythm, so its streets appear to carry on outward.
    add(
      Math.round((Math.cos(angle) * radius) / 90) * 90 + rng.between(-12, 12),
      Math.round((Math.sin(angle) * radius) / 90) * 90 + rng.between(-12, 12),
      8,
      26,
    )
  }

  for (let village = 0; village < VILLAGE_COUNT; village += 1) {
    const angle = rng.next() * Math.PI * 2
    const radius = CITY_FLAT_RADIUS + SUBURB_DEPTH + rng.next() ** 0.7 * VILLAGE_REACH
    const centreX = Math.cos(angle) * radius
    const centreZ = Math.sin(angle) * radius
    const spread = rng.between(120, 300)
    const houses = Math.round(rng.between(10, 34))
    for (let house = 0; house < houses; house += 1) {
      const local = rng.next() * Math.PI * 2
      const away = Math.sqrt(rng.next()) * spread
      add(centreX + Math.cos(local) * away, centreZ + Math.sin(local) * away, 6, 15)
    }
  }

  /*
   * The kit's own low-detail models carry all of it: a tenth of the triangles of the real thing, for
   * buildings that are a few pixels tall behind two kilometres of haze. They cast no shadow, which
   * is most of what a distant building would otherwise cost, and the whole belt is sixteen draws.
   */
  const pool = models.distant.length > 0 ? models.distant : models.houses
  const buckets = new Map<string, typeof placements>()
  for (const placement of placements) {
    const model = pool[Math.floor(placement.pick * pool.length)] ?? pool[0]!
    const bucket = buckets.get(model.id) ?? []
    bucket.push(placement)
    buckets.set(model.id, bucket)
  }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  for (const [id, bucket] of buckets) {
    const model = pool.find(entry => entry.id === id) ?? pool[0]!
    const mesh = new THREE.InstancedMesh(model.geometry, models.commercialMaterial, bucket.length)
    const footprint = Math.max(0.001, Math.max(model.size.x, model.size.z))
    bucket.forEach((placement, index) => {
      const base = placement.footprint / footprint
      const stretch = THREE.MathUtils.clamp(placement.height / Math.max(0.001, model.size.y * base), 0.7, 1.5)
      matrix.compose(
        // Standing on the land rather than floating over it: the hills are real geometry out here.
        position.set(placement.x, terrainHeight(placement.x, placement.z, seed), placement.z),
        quaternion.setFromAxisAngle(AXIS_Y, Math.round(placement.pick * 4) * (Math.PI / 2)),
        scale.set(base, base * stretch, base),
      )
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, WHITE)
    })
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.computeBoundingSphere()
    group.add(mesh)
  }

  return group
}
