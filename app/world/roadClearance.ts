import type { RoadRecord } from '../core/contracts'

/**
 * How close a thing may stand to a street.
 *
 * Everything the generator places at the side of a road — trees, bushes, signs, parked cars — used
 * to be placed against *its own* road and nothing else. That works down a straight street and fails
 * at every junction in the city: a tree three metres off the kerb of one road stands in the middle
 * of the carriageway of the one crossing it. Measured on the real ground plan, better than a quarter
 * of the avenue trees were standing in a road — which is exactly the greenery the player sees lying
 * about on the tarmac.
 *
 * So: one index over every carriageway in the city, asked once per candidate. A grid rather than a
 * tree because the query is always "is anything near this point" over a fixed, known cell size, and
 * a grid answers that by looking at nine cells and nothing else.
 */

/** Grid pitch. Comfortably wider than the widest road, so a segment lands in few cells. */
const CELL = 40

interface Segment {
  ax: number
  az: number
  bx: number
  bz: number
  half: number
}

export interface RoadClearance {
  /** True when the point is on, or within `margin` metres of, any carriageway. */
  blocked: (x: number, z: number, margin?: number) => boolean
}

export function roadClearance(roads: RoadRecord[]): RoadClearance {
  const cells = new Map<number, Segment[]>()

  for (const road of roads) {
    /*
     * A bridge deck is not ground: nothing is planted on it, and a tree beside the road that runs
     * under it is not standing in the bridge. Leaving bridges out of the index is what keeps the
     * riverbank plantable.
     */
    if (road.bridge)
      continue
    const half = road.width / 2
    const points = road.path
    for (let i = 0; i < points.length / 2 - 1; i += 1) {
      const segment: Segment = {
        ax: points[i * 2]!,
        az: points[i * 2 + 1]!,
        bx: points[(i + 1) * 2]!,
        bz: points[(i + 1) * 2 + 1]!,
        half,
      }
      const minColumn = Math.floor(Math.min(segment.ax, segment.bx) / CELL)
      const maxColumn = Math.floor(Math.max(segment.ax, segment.bx) / CELL)
      const minRow = Math.floor(Math.min(segment.az, segment.bz) / CELL)
      const maxRow = Math.floor(Math.max(segment.az, segment.bz) / CELL)
      for (let column = minColumn; column <= maxColumn; column += 1) {
        for (let row = minRow; row <= maxRow; row += 1) {
          const key = column * 100_000 + row
          const bucket = cells.get(key)
          if (bucket)
            bucket.push(segment)
          else cells.set(key, [segment])
        }
      }
    }
  }

  return {
    blocked(x, z, margin = 0) {
      const column = Math.floor(x / CELL)
      const row = Math.floor(z / CELL)
      for (let a = column - 1; a <= column + 1; a += 1) {
        for (let b = row - 1; b <= row + 1; b += 1) {
          const bucket = cells.get(a * 100_000 + b)
          if (!bucket)
            continue
          for (const segment of bucket) {
            if (distanceToSegment(x, z, segment) < segment.half + margin)
              return true
          }
        }
      }
      return false
    },
  }
}

/** Distance from a point to a line segment, clamped at both ends. */
function distanceToSegment(x: number, z: number, segment: Segment): number {
  const dx = segment.bx - segment.ax
  const dz = segment.bz - segment.az
  const length = dx * dx + dz * dz
  const along = length > 0
    ? Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / length))
    : 0
  return Math.hypot(x - (segment.ax + along * dx), z - (segment.az + along * dz))
}
