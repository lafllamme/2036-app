import type { CityBlueprint, SimulationSnapshot } from '../../core/contracts'
import type { WorldVisuals } from './index'
import * as THREE from 'three/webgpu'
import { paint } from '../picking'

/**
 * The city reacting to the simulation.
 *
 * Everything here reads the derived `cityVisuals` block of a snapshot, never a raw indicator and
 * never a policy identifier: the renderer is told that a share of the stock is derelict, not which
 * measure made it so. The state it keeps is the state needed to notice that something has changed
 * and skip the work when it has not.
 */

const DERELICT = /* @__PURE__ */ new THREE.Color('#6f6f68')
const DRY = /* @__PURE__ */ new THREE.Color('#8d8548')
const LUSH = /* @__PURE__ */ new THREE.Color('#ffffff')
/** A change smaller than this is not worth rewriting every instance colour in the city for. */
const BLIGHT_EPSILON = 0.02

export class CityState {
  /** How busy the roads are, and how lit the city is after dark. */
  trafficFactor = 1
  nightLife = 0.67
  /** How unsettled the city is, which is what decides how many blue lights are out. */
  unrest = 0
  /** How many growth parcels the simulation has filled, kept so the warm-up can hand them back. */
  delivered = 0

  /** Dwellings one rendered building stands for, so the skyline scales with the real stock. */
  private readonly unitsPerBuilding: number
  private appliedBlight = -1
  private readonly scratch = new THREE.Color()

  constructor(private readonly blueprint: CityBlueprint, private readonly visuals: WorldVisuals) {
    this.unitsPerBuilding = 62_000 / Math.max(1, blueprint.buildings.length + blueprint.growthSlots.length)
  }

  apply(snapshot: SimulationSnapshot): void {
    const city = snapshot.cityVisuals
    const slots = this.blueprint.growthSlots

    this.trafficFactor = THREE.MathUtils.clamp(
      0.62 + snapshot.metrics.employment / 230 - city.transitDensity * 0.22 + (snapshot.metrics.population / 120_000 - 1) * 0.6,
      0.5,
      1.25,
    )
    this.nightLife = city.nightLife
    this.unrest = THREE.MathUtils.clamp(city.unrest, 0, 1)

    // Delivered housing fills the free parcels the generator left, from the centre outward.
    this.delivered = THREE.MathUtils.clamp(Math.round(city.completedUnitsSinceStart / this.unitsPerBuilding), 0, slots.length)
    this.visuals.growth.count = this.delivered

    // Cranes stand on the next parcels in line, so building is visible before buildings are.
    const sites = Math.min(city.constructionSites, this.visuals.constructionSites.children.length)
    this.visuals.constructionSites.children.forEach((site, index) => {
      const slot = slots[(this.delivered + index) % Math.max(1, slots.length)]
      site.visible = index < sites && slot !== undefined
      if (slot)
        site.position.set(slot.x, this.blueprint.relief.height(slot.x, slot.z), slot.z)
    })

    this.applyBlight(city.blight)
    this.applyGreenery(city.greenery)
  }

  /** Vacancy above the blight threshold drains colour out of a matching share of the stock. */
  private applyBlight(blight: number): void {
    if (Math.abs(blight - this.appliedBlight) <= BLIGHT_EPSILON)
      return
    this.appliedBlight = blight
    for (const mesh of this.visuals.buildingMeshes) {
      const colours = this.visuals.buildingColors.get(mesh)
      if (!colours)
        continue
      const affected = Math.floor(colours.length * blight)
      colours.forEach((colour, index) => {
        paint(this.visuals, mesh, index, index < affected ? this.scratch.copy(colour).lerp(DERELICT, 0.55) : colour)
      })
    }
  }

  /** Green space is a stock the player can spend or build: fewer hectares, fewer and drier trees. */
  private applyGreenery(raw: number): void {
    const greenery = THREE.MathUtils.clamp(raw, 0.45, 1.3)
    /*
     * The stock is split across one mesh per species, so each is thinned against its own capacity.
     * Setting a count past what a mesh actually holds hands the GPU an instance range longer than its
     * buffers, and every draw in the frame is rejected.
     */
    const share = Math.min(1, greenery)
    for (const mesh of this.visuals.planting)
      mesh.count = Math.round(mesh.instanceMatrix.count * share)
    // One material behind every species, so the whole city's greenery dries out together.
    this.visuals.treeCrowns.material.color.copy(this.scratch.copy(DRY).lerp(LUSH, THREE.MathUtils.clamp(greenery, 0, 1)))
  }
}
