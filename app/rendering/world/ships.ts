import type { CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y } from '../shared'
import { WATER_LEVEL } from './water'

/**
 * Barges on the river.
 *
 * They follow the deep channel the converter traced down the middle of the water — the same distance
 * transform that gave the banks their height, read the other way round, so a ship can never end up
 * on one. There is no ship in any of the kits, so the hull is built here: a box tapered at the bow
 * with a wheelhouse aft, which is what a Rhine-Weser cargo barge is from more than fifty metres.
 */

const SHIP_COUNT = 7
/** How far from either end of the channel a ship turns round, so none ever sails off the map. */
const CHANNEL_MARGIN = 90

export interface Ships {
  mesh: THREE.InstancedMesh
  crew: { phase: number, speed: number, offset: number, reverse: boolean }[]
  path: Float32Array
  distance: Float32Array
  length: number
}

export function addShips(scene: THREE.Scene, blueprint: CityBlueprint): Ships | null {
  const points = blueprint.waterway
  if (points.length < 8)
    return null

  const path = Float32Array.from(points)
  const count = path.length / 2
  const distance = new Float32Array(count)
  for (let i = 1; i < count; i += 1)
    distance[i] = distance[i - 1]! + Math.hypot(path[i * 2]! - path[(i - 1) * 2]!, path[i * 2 + 1]! - path[(i - 1) * 2 + 1]!)
  const length = distance[count - 1] ?? 0
  if (length < CHANNEL_MARGIN * 3)
    return null

  const rng = createRandomStream(blueprint.definition.seed, 'shipping')
  const mesh = new THREE.InstancedMesh(hull(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.14 }), SHIP_COUNT)
  mesh.castShadow = true
  mesh.frustumCulled = false
  scene.add(mesh)

  const crew = Array.from({ length: SHIP_COUNT }, () => ({
    phase: rng.between(CHANNEL_MARGIN, length - CHANNEL_MARGIN),
    // Slow. A loaded barge does about twelve kilometres an hour and looks wrong doing anything more.
    speed: rng.between(2.4, 4.1),
    offset: rng.next() > 0.5 ? 9 : -9,
    reverse: rng.next() > 0.5,
  }))

  return { mesh, crew, path, distance, length }
}

/** Scratch instances reused across calls, so the loop allocates nothing at all. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

export function updateShips(ships: Ships | null, elapsed: number): void {
  if (!ships)
    return
  const usable = ships.length - CHANNEL_MARGIN * 2
  ships.crew.forEach((ship, index) => {
    /*
     * Back and forth along the channel rather than round it: a river is not a loop, and a barge that
     * vanished at one end and reappeared at the other would be the only thing in the city that does.
     */
    const cycle = (elapsed * ship.speed + ship.phase) % (usable * 2)
    const along = CHANNEL_MARGIN + (cycle < usable ? cycle : usable * 2 - cycle)
    const heading = cycle < usable ? 1 : -1

    const segment = findSegment(ships, along)
    const start = segment * 2
    const ax = ships.path[start]!
    const az = ships.path[start + 1]!
    const bx = ships.path[start + 2]!
    const bz = ships.path[start + 3]!
    const span = Math.max(0.001, ships.distance[segment + 1]! - ships.distance[segment]!)
    const t = (along - ships.distance[segment]!) / span
    const ux = ((bx - ax) / span) * heading
    const uz = ((bz - az) / span) * heading

    const x = ax + (bx - ax) * t - uz * ship.offset
    const z = az + (bz - az) * t + ux * ship.offset
    quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(ux, uz))
    // A hair under the surface, so the waterline is the water rather than a seam.
    matrix.compose(position.set(x, WATER_LEVEL - 0.35, z), quaternion, scale)
    ships.mesh.setMatrixAt(index, matrix)
  })
  ships.mesh.instanceMatrix.needsUpdate = true
}

function findSegment(ships: Ships, along: number): number {
  let low = 0
  let high = ships.distance.length - 2
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (ships.distance[middle]! <= along)
      low = middle
    else high = middle - 1
  }
  return Math.max(0, Math.min(low, ships.distance.length - 2))
}

/**
 * One barge: a hull that comes to a point at the bow, a hold, and a wheelhouse at the stern. Built
 * by hand because no kit here has a boat in it, and colour is in the vertices so the whole fleet
 * still draws from one material.
 */
function hull(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const paint = (geometry: THREE.BufferGeometry, colour: string): THREE.BufferGeometry => {
    const tint = new THREE.Color(colour)
    const count = geometry.attributes.position!.count
    const colours = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      colours[index * 3] = tint.r
      colours[index * 3 + 1] = tint.g
      colours[index * 3 + 2] = tint.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    geometry.deleteAttribute('uv')
    return geometry
  }

  // The hull, tapered at the bow by pulling the front face in.
  const body = new THREE.BoxGeometry(9, 2.6, 46)
  const position = body.attributes.position as THREE.BufferAttribute
  for (let index = 0; index < position.count; index += 1) {
    if (position.getZ(index) > 20)
      position.setX(index, position.getX(index) * 0.28)
  }
  body.computeVertexNormals()
  parts.push(paint(body, '#3d4a52'))

  const hold = new THREE.BoxGeometry(7.6, 1.4, 26)
  hold.translate(0, 1.9, 1)
  parts.push(paint(hold, '#5b5348'))

  const wheelhouse = new THREE.BoxGeometry(5.2, 3.4, 6)
  wheelhouse.translate(0, 3, -17)
  parts.push(paint(wheelhouse, '#cfd3d2'))

  const merged = new THREE.BufferGeometry()
  const positions: number[] = []
  const normals: number[] = []
  const colours: number[] = []
  const index: number[] = []
  for (const part of parts) {
    const base = positions.length / 3
    const p = part.attributes.position as THREE.BufferAttribute
    const n = part.attributes.normal as THREE.BufferAttribute
    const c = part.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i))
      normals.push(n.getX(i), n.getY(i), n.getZ(i))
      colours.push(c.getX(i), c.getY(i), c.getZ(i))
    }
    const source = part.getIndex()
    if (source) {
      for (let i = 0; i < source.count; i += 1) index.push(base + source.getX(i))
    }
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  merged.setIndex(index)
  merged.computeBoundingSphere()
  return merged
}
