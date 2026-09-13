import { terrainHeight } from './terrain'

/**
 * The ground. Not a height function that the ground mesh happens to sample — the surface itself.
 *
 * This is the second attempt and the distinction is the whole point of it. The first version was a
 * function: the relief field the converter worked out from where the water is, blended into the
 * hills of `terrain.ts` past the edge of the extract. The ground mesh sampled it on a grid of its
 * own, everything standing on the ground read it directly, and the two were therefore never the
 * same surface — the mesh draws straight lines between its vertices and the function does not. A
 * building put at the height the function gave it stood in ground that was somewhere else: measured
 * across the city, a fifth of it, the worst by ten metres, and another hundred and sixty swallowed
 * up to three metres by the coarse country mesh in the corners of the extract.
 *
 * So the tessellation lives here now, and `height()` answers with what is actually drawn: find the
 * cell, find the triangle, interpolate its three corners. `ground.ts` builds its mesh out of the
 * same grid. They cannot disagree, because there is only one of them, and no mesh resolution
 * anywhere can make something sink again.
 *
 * One grid covers everything, from the middle of the city to the horizon. Inside the extract its
 * spacing is the relief field's own — one vertex per sample, on the sample's own coordinate, which
 * is what makes the city dead accurate. Past that the spacing grows by six per cent a step, so the
 * land reaches eleven kilometres in fifty-eight more. There is no second mesh and so no seam: the
 * ring where the two used to overlap had a five-metre step in it running right round the city.
 */

export interface ReliefField {
  size: number
  extent: number
  data: number[]
}

/** Over this distance past the city's own extent the city relief hands over to the open country. */
const BLEND = 500
/**
 * How many of the field's own cells the fine grid carries on past the edge of the extract.
 *
 * The field stops at 1 500 m and the buildings go right up to it, so the fine spacing has to as
 * well — a building on the rim standing on a cell that has already started to stretch is a building
 * standing on an average of the land either side of it.
 */
const MARGIN = 3
/** The land reaches well past the point where haze has swallowed it, so it never shows an edge. */
export const GROUND_SPAN = 22_000
/** How much wider each step is than the one before it, once the fine grid has run out. */
const GROWTH = 1.06

export class Relief {
  readonly size: number
  readonly extent: number
  /** The distance between two samples of the field. */
  readonly cell: number
  /**
   * Every ground vertex's coordinate, ascending. The grid is square and the same on both axes, so
   * one list describes it — and finding the cell a point is in is one search rather than two.
   */
  readonly axis: Float64Array

  private readonly data: Float32Array
  /** The height at every vertex of the grid, row-major over `axis`. */
  private readonly grid: Float32Array

  constructor(field: ReliefField, readonly seed: number) {
    this.size = field.size
    this.extent = field.extent
    this.cell = (field.extent * 2) / field.size
    this.data = Float32Array.from(field.data)
    this.axis = this.buildAxis()

    const across = this.axis.length
    this.grid = new Float32Array(across * across)
    for (let row = 0; row < across; row += 1) {
      for (let column = 0; column < across; column += 1)
        this.grid[row * across + column] = this.field(this.axis[column]!, this.axis[row]!)
    }
  }

  /** Where the sample at a column or row of the relief field sits in the world. */
  coordinate(index: number): number {
    return -this.extent + (index + 0.5) * this.cell
  }

  /** The highest the ground gets anywhere under a ring of points. What a building has to stand on. */
  highestUnder(ring: number[]): number {
    let highest = -Infinity
    for (let i = 0; i < ring.length; i += 2)
      highest = Math.max(highest, this.height(ring[i]!, ring[i + 1]!))
    return highest === -Infinity ? 0 : highest
  }

  /**
   * How high the ground is at a point — as drawn, to the last centimetre.
   *
   * The quad is split into two triangles along the diagonal from its far-x corner to its far-z one,
   * which is the split `ground.ts` writes into the index buffer. Which side of that diagonal the
   * point falls on decides which three corners it stands on.
   */
  height(x: number, z: number): number {
    const across = this.axis.length
    const column = this.cellOf(x)
    const row = this.cellOf(z)
    const x0 = this.axis[column]!
    const z0 = this.axis[row]!
    const fx = (x - x0) / (this.axis[column + 1]! - x0)
    const fz = (z - z0) / (this.axis[row + 1]! - z0)

    const a = this.grid[row * across + column]!
    const b = this.grid[row * across + column + 1]!
    const c = this.grid[(row + 1) * across + column]!
    const d = this.grid[(row + 1) * across + column + 1]!
    return fx + fz <= 1
      ? a + (b - a) * fx + (c - a) * fz
      : d + (c - d) * (1 - fx) + (b - d) * (1 - fz)
  }

  /**
   * The grid's coordinates: the field's own spacing across the extract and a margin around it, then
   * steps that grow until the land reaches the horizon. Symmetrical, because the field is.
   */
  private buildAxis(): Float64Array {
    const inner: number[] = []
    for (let index = -MARGIN; index <= this.size - 1 + MARGIN; index += 1)
      inner.push(this.coordinate(index))

    const outer: number[] = []
    let step = this.cell
    let reach = inner[inner.length - 1]!
    while (reach < GROUND_SPAN / 2) {
      step *= GROWTH
      reach += step
      outer.push(reach)
    }

    return Float64Array.from([...outer.map(value => -value).reverse(), ...inner, ...outer])
  }

  /** The cell a coordinate falls in, by binary search, clamped so the edge cell catches everything. */
  private cellOf(value: number): number {
    let low = 0
    let high = this.axis.length - 2
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (this.axis[middle]! <= value)
        low = middle
      else high = middle - 1
    }
    return low
  }

  /**
   * What the land would be at a point if it were not drawn as triangles: the converter's relief on
   * the floodplain, handing over to the open country's hills past the edge of the extract.
   *
   * Only the grid reads this, and only once per vertex, at construction. Everything else reads
   * `height`, which is this sampled at the corners of a triangle and interpolated across it.
   */
  private field(x: number, z: number): number {
    const city = this.sample(x, z)
    const country = terrainHeight(x, z, this.seed)
    // Past the extract the grid has nothing to say, so it fades out as the hills come up.
    const reach = Math.max(Math.abs(x), Math.abs(z))
    const handover = Math.min(1, Math.max(0, (reach - this.extent) / BLEND))
    return city * (1 - handover) + country
  }

  /** Bilinear, because a stepped heightfield would put every building on its own little plateau. */
  private sample(x: number, z: number): number {
    const gx = (x + this.extent) / this.cell - 0.5
    const gz = (z + this.extent) / this.cell - 0.5
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
