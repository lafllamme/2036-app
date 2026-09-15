import * as THREE from 'three/webgpu'

/**
 * A car for when nobody is looking closely: about thirty triangles instead of two thousand.
 *
 * The kit's cars are 2 032 triangles apiece — a body and four turned wheels — which is fine for the
 * dozen you are watching drive past and ruinous for the two thousand standing at the kerb. Parked
 * cars are the largest single thing in the city by geometry and the one nobody inspects: they are
 * seen in rows, at an angle, from across a street.
 *
 * So they get this. A tapered body, a cabin set back on it, and four wheels flattened to boxes. At
 * the distance a kerb is read from it is indistinguishable from the real model, and it is sixty
 * times cheaper — three and a half million triangles against sixty thousand for the same two
 * thousand cars.
 *
 * Its own material, because it carries no texture: the paint is a per-instance colour, which also
 * gives a street of them the variety the atlas cannot.
 */

/** The proportions of an ordinary car, in metres. */
const LENGTH = 4.3
const WIDTH = 1.78
const SILL = 0.42
const ROOF = 1.46
const CABIN_FROM = -0.85
const CABIN_TO = 1.25
const CABIN_INSET = 0.1
/** How much narrower the body is at the bumpers than at the doors. */
const TAPER = 0.16
/** A wheel, squared off. Round ones are most of what a car model spends its triangles on. */
const WHEEL_RADIUS = 0.32
const WHEEL_WIDTH = 0.2
const AXLE_FRONT = 1.34
const AXLE_BACK = -1.3

/** The paint a street is full of, which is mostly not colourful. */
export const CAR_PAINT = [
  '#d9dade',
  '#b7bcc2',
  '#8d9298',
  '#4d5359',
  '#2b2f33',
  '#20364f',
  '#6d1f22',
  '#3c4a3a',
  '#8a7f6d',
  '#c9c3b6',
] as const

/**
 * Build the proxy once. Every parked car in the city shares this geometry, so it is worth a few
 * hundred lines of vertices being written out by hand rather than a model being loaded for it.
 */
export function carProxyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  // The body, tapered toward both bumpers so it is not a brick.
  parts.push(wedge(
    -LENGTH / 2,
    LENGTH / 2,
    SILL,
    ROOF * 0.62,
    WIDTH / 2 - TAPER,
    WIDTH / 2,
  ))
  // The cabin: narrower, set back, and stopping short of the boot.
  parts.push(box(
    CABIN_FROM,
    CABIN_TO,
    ROOF * 0.62,
    ROOF,
    -(WIDTH / 2 - CABIN_INSET),
    WIDTH / 2 - CABIN_INSET,
  ))
  // Four wheels, square. At this distance nobody has ever noticed.
  for (const along of [AXLE_FRONT, AXLE_BACK]) {
    for (const side of [1, -1]) {
      parts.push(box(
        along - WHEEL_RADIUS,
        along + WHEEL_RADIUS,
        0,
        WHEEL_RADIUS * 1.6,
        side * (WIDTH / 2) - (side > 0 ? WHEEL_WIDTH : 0),
        side * (WIDTH / 2) + (side > 0 ? 0 : WHEEL_WIDTH),
      ))
    }
  }

  const merged = mergeAll(parts)
  merged.computeVertexNormals()
  merged.computeBoundingSphere()
  return merged
}

/** The material the proxies share: no texture, paint from the instance colour. */
export function carProxyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.18 })
}

/** An axis-aligned box, as six quads. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  return wedge(x0, x1, y0, y1, (z1 - z0) / 2, (z1 - z0) / 2, (z0 + z1) / 2)
}

/**
 * A box whose ends are narrower than its middle — the shape of a car seen from above.
 *
 * `endHalf` is the half-width at the two ends and `midHalf` at the middle, so a body tapers and a
 * cabin does not.
 */
function wedge(x0: number, x1: number, y0: number, y1: number, endHalf: number, midHalf: number, centre = 0): THREE.BufferGeometry {
  const mid = (x0 + x1) / 2
  const sections: [number, number][] = [[x0, endHalf], [mid, midHalf], [x1, endHalf]]
  const position: number[] = []
  const index: number[] = []

  // Four corners per section: bottom-left, bottom-right, top-right, top-left.
  for (const [x, half] of sections) {
    position.push(
      x,
      y0,
      centre - half,
      x,
      y0,
      centre + half,
      x,
      y1,
      centre + half,
      x,
      y1,
      centre - half,
    )
  }

  // The skin between consecutive sections.
  for (let section = 0; section < sections.length - 1; section += 1) {
    const a = section * 4
    const b = a + 4
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4
      index.push(a + corner, b + corner, a + next, a + next, b + corner, b + next)
    }
  }

  // And the two ends.
  const first = 0
  const last = (sections.length - 1) * 4
  index.push(first, first + 1, first + 2, first, first + 2, first + 3)
  index.push(last + 2, last + 1, last, last + 3, last + 2, last)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setIndex(index)
  return geometry
}

/** Merge the parts into one buffer, indices offset as they go. */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const position: number[] = []
  const index: number[] = []
  for (const part of parts) {
    const offset = position.length / 3
    const points = part.getAttribute('position')
    for (let i = 0; i < points.count; i += 1)
      position.push(points.getX(i), points.getY(i), points.getZ(i))
    const source = part.getIndex()
    if (source) {
      for (let i = 0; i < source.count; i += 1)
        index.push(offset + source.getX(i))
    }
    part.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setIndex(index)
  return geometry
}
