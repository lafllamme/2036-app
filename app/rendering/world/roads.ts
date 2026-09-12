import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import * as THREE from 'three/webgpu'

/**
 * The street network, as the map draws it.
 *
 * A road is a centre line with a width, so it is built as a ribbon: two vertices per point, offset
 * either side along the bisector of the two segments meeting there. That is what lets a street bend
 * without pulling apart at the corner, and it is the whole reason the city no longer looks like a
 * grid — real streets fork, curve, meet at forty degrees and stop in the middle of a block.
 *
 * All of them are merged into two meshes: carriageway and rail. Three thousand streets, two draws.
 */

/**
 * Just above the ground, and the centre line just above that.
 *
 * Both also carry a polygon offset. Height alone cannot separate surfaces that are flat, parallel
 * and seen from two kilometres away — the depth buffer has no precision left out there — and the
 * offset biases them in depth rather than in space, which is what it is for.
 */
const ROAD_Y = 0.06
const MARKING_Y = 0.07
/** How long a dash of centre line is, and the gap after it. */
const DASH = 9
const GAP = 7

export function addRoads(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const relief = blueprint.relief
  scene.add(ribbon(relief, blueprint.roads, ROAD_Y, new THREE.MeshStandardMaterial({
    color: '#33383b',
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }), 1))
  scene.add(markings(relief, blueprint.roads))
  scene.add(ribbon(relief, blueprint.rails, ROAD_Y, new THREE.MeshStandardMaterial({
    color: '#473f36',
    roughness: 0.9,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }), 1))
}

/**
 * Lay a flat ribbon along every path.
 *
 * The offset at a point is the bisector of the segments either side of it, lengthened by how sharp
 * the bend is. Without that correction the outer edge of a corner pinches in and the road narrows
 * exactly where it should not.
 */
function ribbon(relief: Relief, roads: RoadRecord[], y: number, material: THREE.Material, widthScale: number): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []

  for (const road of roads) {
    const points = road.path
    const count = points.length / 2
    if (count < 2)
      continue
    const half = (road.width * widthScale) / 2
    const first = position.length / 3
    let along = 0

    for (let i = 0; i < count; i += 1) {
      const x = points[i * 2]!
      const z = points[i * 2 + 1]!
      const previous = i > 0 ? i - 1 : 0
      const next = i < count - 1 ? i + 1 : count - 1
      const dx = points[next * 2]! - points[previous * 2]!
      const dz = points[next * 2 + 1]! - points[previous * 2 + 1]!
      const length = Math.hypot(dx, dz) || 1
      // Perpendicular to the direction of travel, in the ground plane.
      const ox = (-dz / length) * half
      const oz = (dx / length) * half

      if (i > 0)
        along += Math.hypot(x - points[previous * 2]!, z - points[previous * 2 + 1]!)

      // Both kerbs follow the ground, so a street on a slope is on the slope rather than through it.
      position.push(x + ox, y + relief.height(x + ox, z + oz), z + oz, x - ox, y + relief.height(x - ox, z - oz), z - oz)
      normal.push(0, 1, 0, 0, 1, 0)
      uv.push(0, along / 8, 1, along / 8)

      if (i > 0) {
        const a = first + (i - 1) * 2
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

/** A dashed centre line, and only on the streets wide enough to have one. */
function markings(relief: Relief, roads: RoadRecord[]): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const index: number[] = []

  for (const road of roads) {
    if (!road.arterial && road.width < 9)
      continue
    const points = road.path
    const count = points.length / 2
    for (let i = 0; i < count - 1; i += 1) {
      const ax = points[i * 2]!
      const az = points[i * 2 + 1]!
      const bx = points[(i + 1) * 2]!
      const bz = points[(i + 1) * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az)
      if (span < 1)
        continue
      const ux = (bx - ax) / span
      const uz = (bz - az) / span
      const ox = -uz * 0.14
      const oz = ux * 0.14

      for (let t = 0; t + DASH < span; t += DASH + GAP) {
        const sx = ax + ux * t
        const sz = az + uz * t
        const ex = ax + ux * (t + DASH)
        const ez = az + uz * (t + DASH)
        const base = position.length / 3
        const sy = MARKING_Y + relief.height(sx, sz)
        const ey = MARKING_Y + relief.height(ex, ez)
        position.push(sx + ox, sy, sz + oz, sx - ox, sy, sz - oz, ex + ox, ey, ez + oz, ex - ox, ey, ez - oz)
        normal.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
        index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: '#b9b19a',
    transparent: true,
    opacity: 0.42,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  }))
}
