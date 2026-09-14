import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import type { RoadNetwork } from './roadNetwork'
import * as THREE from 'three/webgpu'
import { CYCLE_MIN_WIDTH, CYCLE_WIDTH, PAVEMENT_WIDTH } from './lanes'
import { deckOf, ribbonSections } from './ribbon'

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
const PAVEMENT = PAVEMENT_WIDTH
/**
 * The cycle lane: a strip at the outside of the carriageway, in the brick red it is painted here.
 *
 * On the road rather than beside it, because that is what a Radfahrstreifen is and because it costs
 * nothing — no widening, no new kerb, and the traffic model already keeps cars off the last metre
 * and a half by parking in it. Only on streets that would actually have one: a residential street
 * in Germany has a cycle lane painted on it about as often as it has a tram.
 */
const CYCLE_Y = 0.065
/** How long a dash of centre line is, and the gap after it. */
const DASH = 9
const GAP = 7
/** A bridge's parapet: how high the wall along its edge is, and how thick. */
const PARAPET = 1.1
const PARAPET_THICKNESS = 0.45
/** How far apart a bridge's piers stand, and how thick one is. */
const PIER_SPACING = 26
const PIER_SIZE = 2.2

export function addRoads(scene: THREE.Scene, blueprint: CityBlueprint, network: RoadNetwork): void {
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
  scene.add(junctions(network, PAVEMENT_Y, PAVEMENT, new THREE.MeshStandardMaterial({
    color: '#6e6c66',
    roughness: 0.93,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })))
  scene.add(junctions(network, ROAD_Y, 1.2, new THREE.MeshStandardMaterial({
    color: '#33383b',
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })))
  scene.add(edgeStrips(relief, blueprint.roads, CYCLE_Y, new THREE.MeshStandardMaterial({
    color: '#7c4137',
    roughness: 0.94,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }), CYCLE_WIDTH, CYCLE_MIN_WIDTH))
  scene.add(markings(relief, blueprint.roads))
  scene.add(bridgeStructure(relief, [...blueprint.roads, ...blueprint.rails]))
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
    const deck = deckOf(road.path, road.bridge, (x, z) => relief.height(x, z))
    const first = position.length / 3
    sections.forEach((section, at) => {
      const left = section.x + section.ox
      const leftZ = section.z + section.oz
      const right = section.x - section.ox
      const rightZ = section.z - section.oz
      /*
       * On the ground both kerbs follow the land, so a street on a slope is on the slope rather than
       * through it. On a bridge they follow the deck instead — one height across the whole span,
       * because a carriageway does not tilt sideways to match the river bank under it.
       */
      const leftY = deck.bridge ? deck.at(section.along) : relief.height(left, leftZ)
      const rightY = deck.bridge ? deck.at(section.along) : relief.height(right, rightZ)
      position.push(left, y + leftY, leftZ, right, y + rightY, rightZ)
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

/**
 * A strip down each outer edge of the carriageway.
 *
 * The ribbon above lays one surface across the whole width; this lays a band a fixed distance in
 * from each kerb, which is what a painted lane is. One mesh for both sides of every street in the
 * city, because it is the same geometry problem twice and there is no reason to pay twice for it.
 */
function edgeStrips(relief: Relief, roads: RoadRecord[], y: number, material: THREE.Material, width: number, minWidth: number): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []

  for (const road of roads) {
    // Not on a bridge — the deck has a parapet where the lane would be painted.
    if (road.bridge || road.width < minWidth)
      continue
    // A unit normal at every section, so the two offsets can be taken from the same walk.
    const sections = ribbonSections(road.path, 1)
    const deck = deckOf(road.path, road.bridge, (x, z) => relief.height(x, z))
    const half = road.width / 2

    for (const side of [1, -1]) {
      const first = position.length / 3
      sections.forEach((section, at) => {
        const outerX = section.x + section.ox * half * side
        const outerZ = section.z + section.oz * half * side
        const innerX = section.x + section.ox * (half - width) * side
        const innerZ = section.z + section.oz * (half - width) * side
        const height = deck.bridge ? deck.at(section.along) : relief.height(outerX, outerZ)
        position.push(outerX, y + height, outerZ, innerX, y + height, innerZ)
        normal.push(0, 1, 0, 0, 1, 0)
        uv.push(0, section.along / 8, 1, section.along / 8)
        if (at > 0) {
          const a = first + (at - 1) * 2
          index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
      })
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
    const deck = deckOf(road.path, road.bridge, (x, z) => relief.height(x, z))
    let travelled = 0
    const points = road.path
    const count = points.length / 2
    for (let i = 0; i < count - 1; i += 1) {
      const ax = points[i * 2]!
      const az = points[i * 2 + 1]!
      const bx = points[(i + 1) * 2]!
      const bz = points[(i + 1) * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az)
      if (span < 1) {
        travelled += span
        continue
      }
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
        const sy = MARKING_Y + (deck.bridge ? deck.at(travelled + t) : relief.height(sx, sz))
        const ey = MARKING_Y + (deck.bridge ? deck.at(travelled + t + DASH) : relief.height(ex, ez))
        position.push(sx + ox, sy, sz + oz, sx - ox, sy, sz - oz, ex + ox, ey, ez + oz, ex - ox, ey, ez - oz)
        normal.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
        index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
      travelled += span
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

/**
 * What holds a bridge up and keeps what is on it from falling off: a parapet down each edge and a
 * row of piers reaching from the deck to whatever is below.
 *
 * Both are merged into one mesh for the whole city — eighty-two bridges, one draw. They are the
 * difference between a road that crosses a river and a road that is painted on it.
 */
function bridgeStructure(relief: Relief, roads: RoadRecord[]): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const index: number[] = []

  const box = (cx: number, cz: number, top: number, bottom: number, width: number, depth: number, angle: number): void => {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const outline: [number, number][] = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    const corners = outline.map(([ox, oz]): [number, number] => [cx + ox * cos - oz * sin, cz + ox * sin + oz * cos])
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4
      const [ax, az] = corners[i]!
      const [bx, bz] = corners[j]!
      const span = Math.hypot(bx - ax, bz - az) || 1
      const nx = -(bz - az) / span
      const nz = (bx - ax) / span
      const base = position.length / 3
      position.push(ax, bottom, az, bx, bottom, bz, bx, top, bz, ax, top, az)
      normal.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz)
      index.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
    // A lid, so a pier seen from above is not an open tube.
    const base = position.length / 3
    for (const [x, z] of corners) position.push(x, top, z)
    for (let i = 0; i < 4; i += 1) normal.push(0, 1, 0)
    index.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }

  for (const road of roads) {
    if (!road.bridge)
      continue
    const deck = deckOf(road.path, true, (x, z) => relief.height(x, z))
    const sections = ribbonSections(road.path, road.width / 2 + PAVEMENT)

    // The parapets: a low wall run down each edge of the deck, as two thin boxes per section.
    for (let i = 1; i < sections.length; i += 1) {
      const previous = sections[i - 1]!
      const current = sections[i]!
      const top = deck.at(current.along) + PARAPET
      const bottom = deck.at(current.along) - 0.4
      for (const side of [1, -1]) {
        const x = (previous.x + current.x) / 2 + ((previous.ox + current.ox) / 2) * side
        const z = (previous.z + current.z) / 2 + ((previous.oz + current.oz) / 2) * side
        const run = Math.hypot(current.x - previous.x, current.z - previous.z) || 1
        box(x, z, top, bottom, PARAPET_THICKNESS, run + 0.2, Math.atan2(current.x - previous.x, current.z - previous.z))
      }
    }

    // The piers, reaching from under the deck down to the land or the riverbed below it.
    for (let along = PIER_SPACING / 2; along < deck.length; along += PIER_SPACING) {
      const section = sections.find(entry => entry.along >= along) ?? sections[sections.length - 1]
      if (!section)
        continue
      const foot = relief.height(section.x, section.z) - 1
      const top = deck.at(along) - 0.3
      if (top - foot < 1.5)
        continue
      box(section.x, section.z, top, foot, PIER_SIZE, PIER_SIZE, 0)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.93, metalness: 0 }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * The surface a junction actually has.
 *
 * Where streets meet, their ribbons run into each other and stack up: each one widens its outer edge
 * to carry its own width round the corner, and four of those overlapping is the ragged dark blotch
 * you see from the air wherever two roads cross. A junction is not a pile of ribbons, it is a piece
 * of ground — so this lays one down: a patch as wide as the widest street arriving at it, under the
 * ribbons, once for the carriageway and once for the pavement around it.
 *
 * Every junction in the city is one mesh and one draw.
 */
function junctions(network: RoadNetwork, lift: number, widen: number, material: THREE.Material): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const index: number[] = []
  const SIDES = 12

  for (const node of network.nodes) {
    if (node.edges.length < 2)
      continue

    let widest = 0
    for (const at of node.edges)
      widest = Math.max(widest, network.edges[at]!.width)

    /*
     * The height the streets meeting here are at — taken from the widest of them, at the end that
     * touches this junction. Reading the ground instead would drop a junction on a bridge ramp back
     * down into the water.
     */
    const main = network.edges[node.edges.reduce((best, at) =>
      network.edges[at]!.width > network.edges[best]!.width ? at : best, node.edges[0]!)]!
    const height = main.points[0] === node.x && main.points[1] === node.z
      ? main.height[0]!
      : main.height[main.height.length - 1]!

    const radius = widest / 2 + widen
    const centre = position.length / 3
    position.push(node.x, height + lift, node.z)
    normal.push(0, 1, 0)
    for (let step = 0; step < SIDES; step += 1) {
      const angle = (step / SIDES) * Math.PI * 2
      position.push(node.x + Math.cos(angle) * radius, height + lift, node.z + Math.sin(angle) * radius)
      normal.push(0, 1, 0)
    }
    for (let step = 0; step < SIDES; step += 1) {
      const a = centre + 1 + step
      const b = centre + 1 + ((step + 1) % SIDES)
      index.push(centre, b, a)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}
