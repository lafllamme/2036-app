import { terrainHeight } from './terrain'

/**
 * How high the ground is, anywhere.
 *
 * Two things make it up and they meet in the middle. Inside the city it is the relief the converter
 * worked out from where the water is — flat on the floodplain, climbing a few metres away from it,
 * which is what a river city actually does and the only kind of relief that cannot end up cutting
 * through the Weser. Outside it, the hills of `terrain.ts` take over.
 *
 * Everything that stands on the ground reads this: the ground mesh itself, every building, every
 * street, every lamp and every tree. They have to agree to the centimetre or things float.
 */

export interface ReliefField {
  size: number
  extent: number
  data: number[]
}

/** Over this distance past the city's own extent the city relief hands over to the open country. */
const BLEND = 500

export class Relief {
  private readonly size: number
  private readonly extent: number
  private readonly data: Float32Array

  constructor(field: ReliefField, private readonly seed: number) {
    this.size = field.size
    this.extent = field.extent
    this.data = Float32Array.from(field.data)
  }

  /** Height in metres at a point in the world. */
  height(x: number, z: number): number {
    const city = this.sample(x, z)
    const country = terrainHeight(x, z, this.seed)
    // Past the extract the grid has nothing to say, so it fades out as the hills come up.
    const reach = Math.max(Math.abs(x), Math.abs(z))
    const handover = Math.min(1, Math.max(0, (reach - this.extent) / BLEND))
    return city * (1 - handover) + country
  }

  /** Bilinear, because a stepped heightfield would put every building on its own little plateau. */
  private sample(x: number, z: number): number {
    const cell = (this.extent * 2) / this.size
    const gx = (x + this.extent) / cell - 0.5
    const gz = (z + this.extent) / cell - 0.5
    const x0 = Math.floor(gx)
    const z0 = Math.floor(gz)
    const fx = gx - x0
    const fz = gz - z0

    const top = this.at(x0, z0) + (this.at(x0 + 1, z0) - this.at(x0, z0)) * fx
    const bottom = this.at(x0, z0 + 1) + (this.at(x0 + 1, z0 + 1) - this.at(x0, z0 + 1)) * fx
    return top + (bottom - top) * fz
  }

  /** Outside the grid the edge value carries on, so nothing falls off a cliff at the boundary. */
  private at(column: number, row: number): number {
    const c = Math.min(this.size - 1, Math.max(0, column))
    const r = Math.min(this.size - 1, Math.max(0, row))
    return this.data[r * this.size + c] ?? 0
  }
}
