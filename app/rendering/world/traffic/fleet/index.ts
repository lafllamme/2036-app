/**
 * A fleet of things that move, and how they move.
 *
 * They drive the graph in `roadNetwork.ts` rather than a way at a time. That is the difference
 * between traffic and things sliding along lines. A vehicle holds one stretch of street, keeps to
 * its own side of it, keeps its distance from whatever is in front, stops at a red light and picks
 * a new stretch at the junction — preferring to carry straight on, because that is what traffic
 * does. It used to run a way end to end and snap back to the start, which is why cars drove through
 * blocks, sat inside one another and disappeared.
 *
 * One instanced mesh per model, so twelve kinds of car and six people are two dozen draws no matter
 * how many are on the road. Distance-gated: what the player can no longer make out is not animated,
 * because animating it means rewriting and re-uploading its matrix.
 *
 * This module knows nothing about calls, sirens or beacons. A police car in here is a vehicle with
 * a label on it, and what happens when it is given somewhere to be is `dispatch.ts`.
 *
 * | File | What it answers |
 * | --- | --- |
 * | `types.ts` | what a fleet is, and every number that tunes it |
 * | `build.ts` | the meshes and the travellers, made once |
 * | `crowd.ts` | where everybody is, and how the crowd stays near the player |
 * | `motion.ts` | distance, red lights and what to do at a junction |
 * | `place.ts` | one traveller written into its mesh |
 * | `scratch.ts` | the objects reused so that a pass allocates nothing |
 */

import type * as THREE from 'three/webgpu'
import type { Fleet, Streets } from './types'
import { gather, promoteResponders } from './crowd'
import { advance } from './motion'
import { place } from './place'
import { mount } from './scratch'
import { STRIDE_LENGTH } from './types'

export function drive(fleet: Fleet, streets: Streets, delta: number, elapsed: number, share: number, camera?: THREE.Vector3, focus?: THREE.Vector3): void {
  if (share > 0)
    advance(fleet, streets, Math.min(0.2, delta), elapsed)
  if (camera && fleet.gathers)
    gather(fleet, streets, camera, focus ?? camera, fleet.gathers)

  // What this fleet has within earshot, counted fresh: the sound asks the fleets, not the reverse.
  fleet.nearby = 0

  mount.written = 0
  for (const mesh of fleet.meshes) mesh.count = 0

  fleet.crews.forEach((crew, character) => {
    const row = fleet.phases[character]
    if (!row || row.length === 0 || crew.length === 0)
      return

    /*
     * Thinning traffic hides the tail of each crew, and a car on a call was as likely to be in that
     * tail as anywhere else — so the blue light was drawn over an ambulance that was not. Whoever is
     * on a call comes first, and the count is never allowed to cut one off.
     */
    const responders = promoteResponders(crew)
    // The governor's share and what the surroundings can hold, which are different questions.
    const shown = Math.round(crew.length * share * fleet.density)
    const visible = Math.max(responders, Math.min(crew.length, shown))

    for (let index = 0; index < visible; index += 1) {
      const traveller = crew[index]!
      /*
       * Which moment of the walk this one is at.
       *
       * Its own phase plus how far it has travelled, over the length of a stride — so the cycle
       * follows the ground covered rather than the clock, and somebody hurrying takes quicker steps
       * rather than the same steps faster. A figure frozen at one moment slides down the street with
       * its legs apart, which is what the crowd was doing before the walk was baked at four moments.
       */
      const step = row.length > 1
        ? Math.floor((traveller.gait + traveller.along / STRIDE_LENGTH) % row.length + row.length) % row.length
        : 0
      const at = row[step]!
      const mesh = fleet.meshes[at]!
      const slot = mesh.count
      place(mesh, slot, streets, fleet, traveller, elapsed, camera)
      ;(fleet.drawn[at] ??= [])[slot] = traveller
      mesh.count = slot + 1
    }
  })

  for (const mesh of fleet.meshes) mesh.instanceMatrix.needsUpdate = true

  if (fleet.mount) {
    fleet.mount.count = mount.written
    fleet.mount.instanceMatrix.needsUpdate = true
  }
}

/**
 * Bring back anybody who has wandered out of sight, and put them down near the camera.
 *
 * Called every pass, but it only touches whoever is actually too far, which after the first few
 * seconds is a handful. The stretch they are put on is drawn from the same stream they steer with,
 * so a fleet is as reproducible as it was before — a city that looks different on the second run
 * from the same seed is a city nobody can debug.
 */
/**
 * Put whoever has strayed back where the player is looking, and work out how many belong there.
 *
 * `camera` and `focus` are deliberately two arguments. Who gets *drawn* is decided by distance to
 * the lens — that is what makes somebody big enough to see. Where somebody *belongs* is decided by
 * what the player is looking at, and from an oblique overview those are hundreds of metres apart:
 * gathering around the camera collected the whole crowd behind and below the view.
 */

export { buildFleet } from './build'
export { crowdDensity } from './crowd'
export type { Fleet, FleetPlan, Streets, Traveller } from './types'
export { BIG_CAR_LENGTH, BIG_VEHICLES, CAR_LENGTH, PERSON_HEIGHT } from './types'
