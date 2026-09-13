import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import * as THREE from 'three/webgpu'
import { ribbonSections } from './ribbon'

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
const PAVEMENT_Y = 0.04
const ROAD_Y = 0.06
const MARKING_Y = 0.07
/** How wide the footway either side of the carriageway is. */
const PAVEMENT = 2.3
/** How long a dash of centre line is, and the gap after it. */
const DASH = 9
const GAP = 7

export function addRoads(scene: THREE.Scene, blueprint: CityBlueprint): void {
  const relief = blueprint.relief
  /*
   * The pavement goes down first: the same ribbon, a couple of metres wider each side, in the
   * concrete grey that a footway is. It is one extra draw for the whole city and it is most of what
   * makes a street read as a street rather than as a dark line drawn across a field — at ground level
   * the carriageway used to run straight into the grass, which no street anywhere does.
   */
  scene.add(ribbon(relief, blueprint.roads, PAVEMENT_Y, new THREE.MeshStandardMaterial({
    color: '#6e6c66',
    roughness: 0.93,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), 1, PAVEMENT))
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
 * Lay a flat ribbon along every path, hugging the ground the whole way.
 */
function ribbon(relief: Relief, roads: RoadRecord[], y: number, material: THREE.Material, widthScale: number, widen = 0): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []

  for (const road of roads) {
    const sections = ribbonSections(road.path, (road.width * widthScale) / 2 + widen)
    const first = position.length / 3
    sections.forEach((section, at) => {
      const left = section.x + section.ox
      const leftZ = section.z + section.oz
      const right = section.x - section.ox
      const rightZ = section.z - section.oz
      // Both kerbs follow the ground, so a street on a slope is on the slope rather than through it.
      position.push(left, y + relief.height(left, leftZ), leftZ, right, y + relief.height(right, rightZ), rightZ)
      normal.push(0, 1, 0, 0, 1, 0)
      uv.push(0, section.along / 8, 1, section.along / 8)
      if (at > 0) {
        const a = first + (at - 1) * 2
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    })
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
