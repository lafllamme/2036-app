/**
 * Writing one traveller into its instanced mesh.
 *
 * The end of the pipeline and the only part that touches the GPU. Everything it needs has already
 * been decided — this works out the pose, the lean and the bob, composes one matrix and writes it.
 */

import type { Fleet, Streets, Traveller } from './types'
import * as THREE from 'three/webgpu'
import { AXIS_Y } from '../../../shared'
import { acrossLane } from '../../streets/lanes'
import { sampleEdge } from '../../streets/roadNetwork'
import { matrix, mount, MOUNT_SCALE, position, quaternion, sample, scale } from './scratch'
import { PEOPLE_EARSHOT, STRIDE_BOB, STRIDE_RATE, TRAFFIC_EARSHOT } from './types'
/** Put one traveller where it has got to, on its own side of the road, facing the way it is going. */
export function place(mesh: THREE.InstancedMesh, index: number, streets: Streets, fleet: Fleet, traveller: Traveller, elapsed: number, camera?: THREE.Vector3): void {
  const edge = streets.network.edges[traveller.edge]
  if (!edge)
    return

  sampleEdge(edge, THREE.MathUtils.clamp(traveller.along, 0, edge.length), sample)
  const ux = traveller.forward ? sample.ux : -sample.ux
  const uz = traveller.forward ? sample.uz : -sample.uz
  /*
   * Half a carriageway to one hand of the centre line. The offset is taken from the direction of
   * travel rather than from the street, so the two directions end up on opposite sides without
   * anything having to decide which is which.
   */
  /*
   * How far out to sit, worked out from the street rather than from a constant.
   *
   * The lane a fleet keeps is a function of the width of the road it is on: a pavement is outside
   * the kerb wherever the kerb happens to be, and a carriageway lane is half of half the road. The
   * traveller's own share of it only decides where within that lane they are, so that a pavement is
   * a crowd rather than a queue.
   */
  /*
   * How far out to sit, and on which hand.
   *
   * A fleet that walks takes the side the street actually has a pavement on — worked out once
   * against the whole network, because "just outside my own kerb" is the middle of somebody else's
   * carriageway at every junction in the city. Everything else keeps to the hand it is travelling
   * on, which is what puts the two directions of traffic on opposite sides without anything having
   * to decide which is which.
   */
  const lane = acrossLane(fleet.laneOf(edge.width), fleet.spread, traveller.lane)
    * (fleet.stride && edge.footpath !== 0 ? edge.footpath * (traveller.forward ? 1 : -1) : 1)
  const x = sample.x - uz * lane
  const z = sample.z + ux * lane

  quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(ux, uz))
  /*
   * A walker rises and falls with every step. The figures are frozen in one pose — they are instanced
   * and instances cannot be skinned — and without this a pavement is a row of statues sliding along
   * it. Half a step's worth of bob, at each one's own phase, and from any distance a player can see a
   * person at, it reads as walking.
   */
  const bob = fleet.stride ? Math.abs(Math.sin(traveller.gait + elapsed * STRIDE_RATE)) * STRIDE_BOB : 0
  /*
   * The road's own surface, so traffic goes over a bridge instead of through the river under it —
   * and, for anyone whose lane is outside the kerb, the ground if the ground is higher, so the
   * crowd stands on the verge its pavement is laid on rather than inside it.
   */
  const surface = fleet.ground ? Math.max(sample.y, fleet.ground(x, z)) : sample.y
  scale.setScalar(traveller.stature)
  matrix.compose(position.set(x, surface + fleet.lift * traveller.stature + bob, z), quaternion, scale)
  mesh.setMatrixAt(index, matrix)

  /*
   * And the thing being ridden, in the same place and at the same bearing but on the ground rather
   * than at saddle height, and at its own scale — the rider is scaled to the kit's units and the
   * bike is written out in metres.
   */
  if (fleet.mount && mount.written < fleet.mount.instanceMatrix.count) {
    // A child's bike is a child's bike: the machine takes the rider's own scale.
    MOUNT_SCALE.setScalar(traveller.stature)
    matrix.compose(position.set(x, surface + (fleet.lift - fleet.mountDrop) * traveller.stature, z), quaternion, MOUNT_SCALE)
    fleet.mount.setMatrixAt(mount.written, matrix)
    mount.written += 1
  }

  /*
   * What is within earshot. A quiet street is quiet however busy the rest of the city is, so the
   * sound counts what is actually near the listener rather than what exists.
   */
  if (camera && Math.hypot(x - camera.x, z - camera.z) < (fleet.stride ? PEOPLE_EARSHOT : TRAFFIC_EARSHOT))
    fleet.nearby += 1
}
