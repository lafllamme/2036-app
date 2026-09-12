import type { BuildingRecord } from '../../core/contracts'
import type { CityModel, CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { AXIS_Y } from '../shared'

/**
 * How a building the simulation sized becomes a model standing on a parcel. Shared by the city
 * itself and by the housing the construction pipeline delivers, so both scale models the same way.
 */

/** Beyond this distance from the centre the city is built from the kit's low-detail models. */
const DETAIL_RADIUS = 1_100

/**
 * Choose a kit model for a building the simulation has already sized.
 *
 * The pick is driven by slenderness — height over footprint — so a parcel the simulation made tall
 * and narrow gets a tower and a wide low one gets a house, and the massing keeps meaning what it
 * meant before models existed. The seeded roll only breaks ties, so the same city always builds the
 * same skyline.
 */
export function pickModel(building: BuildingRecord, models: CityModels, roll: number): { model: CityModel, commercial: boolean } {
  const footprint = Math.max(building.width, building.depth)
  const wanted = building.height / footprint
  const commercial = building.type === 'commercial' || building.type === 'modern' || building.type === 'civic' || building.type === 'industrial'
  /*
   * The city's own outer belt is built from the kit's low-detail models. A building out there is
   * never close to the camera — the controls cannot orbit past the centre far enough for it to fill
   * more than a few dozen pixels — and it drops a seventh of the scene's triangles for a difference
   * nobody can see from a strategic view.
   */
  const distant = Math.hypot(building.x, building.z) > DETAIL_RADIUS && models.distant.length > 0
  const pool = distant
    ? models.distant
    : commercial
      ? (wanted > 1.15 ? models.towers : models.offices)
      : models.houses
  if (pool.length === 0)
    return { model: models.houses[0] ?? models.offices[0]!, commercial }

  // The three closest matches, then a seeded choice between them: right proportions, varied streets.
  const ranked = [...pool].sort((a, b) => Math.abs(a.slenderness - wanted) - Math.abs(b.slenderness - wanted))
  const shortlist = ranked.slice(0, Math.min(3, ranked.length))
  return { model: shortlist[Math.floor(roll * shortlist.length)] ?? shortlist[0]!, commercial: commercial || distant }
}

/**
 * Place one model on a parcel: scaled uniformly onto its footprint, then nudged vertically toward
 * the height the simulation asked for. The nudge is clamped, because a model stretched past a third
 * of its own proportions stops reading as a building and starts reading as a mistake.
 */

/**
 * Place one model on a parcel: scaled uniformly onto its footprint, then nudged vertically toward
 * the height the simulation asked for. The nudge is clamped, because a model stretched past a third
 * of its own proportions stops reading as a building and starts reading as a mistake.
 */
export function placeModel(matrix: THREE.Matrix4, building: BuildingRecord, model: CityModel, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3): void {
  const footprint = Math.max(building.width, building.depth)
  const base = footprint / Math.max(0.001, Math.max(model.size.x, model.size.z))
  const stretch = THREE.MathUtils.clamp(building.height / Math.max(0.001, model.size.y * base), 0.78, 1.4)
  matrix.compose(
    position.set(building.x, 0.8, building.z),
    quaternion.setFromAxisAngle(AXIS_Y, building.rotation),
    scale.set(base, base * stretch, base),
  )
}
