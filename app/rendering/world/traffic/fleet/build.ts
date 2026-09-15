/**
 * Making a fleet: the meshes, the travellers and where each one starts.
 *
 * One instanced mesh per character per baked walk phase — instancing cannot skin, so a walk is four
 * frozen poses and a traveller is drawn into whichever one matches where it is in its stride. That
 * is why every extra character costs four draw calls and why the crowd has six of them and the
 * patrol one.
 */

import type { CityModel } from '../../../cityModels'
import type { RoadNetwork } from '../../streets/roadNetwork'
import type { Fleet, FleetPlan, Traveller } from './types'
import * as THREE from 'three/webgpu'
import { genderAt, statureAt } from '../../../../world/citizens'
import { WHITE } from '../../../shared'
import { indexEdges } from '../../streets/roadNetwork'
import { COMPANY_GAP, COMPANY_SHARE, DRIVER_STRAIGHTNESS, GATHER_RANGE, LOITER_POOL, RECYCLE_RANGE, ROAMER_SHARE, WALKER_STRAIGHTNESS } from './types'

export function buildFleet(
  scene: THREE.Scene,
  network: RoadNetwork,
  allowed: Uint8Array,
  models: CityModel[],
  /**
   * One material, or one per character.
   *
   * People get several: the kit gives its twelve characters about two skin tones between them, so
   * each character is drawn with its own recoloured copy of the atlas. Vehicles get one.
   */
  material: THREE.Material | THREE.Material[],
  count: number,
  draw: () => number,
  plan: FleetPlan,
): Fleet {
  const all: Traveller[] = []
  const mount = plan.mount
    ? new THREE.InstancedMesh(plan.mount.geometry, plan.mount.material, count)
    : null
  if (mount) {
    mount.count = 0
    mount.frustumCulled = false
    mount.castShadow = false
    scene.add(mount)
  }

  const fleet: Fleet = {
    meshes: [],
    crews: [],
    phases: [],
    drawn: [],
    all,
    allowed,
    obeysSignals: plan.obeysSignals,
    laneOf: plan.laneOf,
    spread: plan.spread,
    lift: plan.lift,
    stride: plan.stride ?? (plan.walks ?? !plan.obeysSignals),
    mount,
    mountDrop: plan.mount?.drop ?? 0,
    ground: plan.ground ?? null,
    nearby: 0,
    gathers: plan.gatherRange ?? (plan.people === true ? [RECYCLE_RANGE, GATHER_RANGE] : null),
    spacing: plan.spacing,
    queues: !(plan.walks ?? plan.people === true),
    straightness: (plan.walks ?? plan.people === true) ? WALKER_STRAIGHTNESS : DRIVER_STRAIGHTNESS,
    occupancy: new Map(),
    idle: 0,
    density: 1,
    sinceGather: 0,
    index: plan.gatherRange || plan.people === true ? indexEdges(network, allowed) : null,
  }

  const open: number[] = []
  network.edges.forEach((edge, index) => {
    if (allowed[index] === 1 && edge.length > 25)
      open.push(index)
  })
  if (models.length === 0 || open.length === 0)
    return fleet

  // Weighted draw, so the ambulances stay rare without having to hand-place any of them.
  const weights = models.map(plan.weight)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  /*
   * Which models a figure of each gender may be drawn as.
   *
   * Empty for a fleet of vehicles, and the whole point for a fleet of people: the kit's characters
   * carry a gender in their own filename, and a crowd that picked a model by weight and a name by a
   * separate draw produced women called Jonas often enough for a player to notice. Gender comes off
   * the citizen's number now, and both the model and the name are read from it.
   */
  /*
   * The models grouped by the character they are, because several of them are the same person at
   * different moments of the same walk. A traveller belongs to a character for life and is drawn
   * from whichever of its phases matches where it is in its stride.
   */
  const characters: string[] = []
  const phasesOf = new Map<string, number[]>()
  models.forEach((model, index) => {
    const who = model.id.split('#')[0]!
    if (!phasesOf.has(who)) {
      phasesOf.set(who, [])
      characters.push(who)
    }
    phasesOf.get(who)!.push(index)
  })

  const byGender = {
    male: characters.filter(who => who.includes('-male-')),
    female: characters.filter(who => who.includes('-female-')),
  }

  const assigned: Traveller[][] = characters.map(() => [])
  for (let index = 0; index < count; index += 1) {
    const citizen = (plan.citizenBase ?? 0) + index
    let chosen: number
    const pool = plan.people ? byGender[genderAt(citizen, plan.seed)] : []
    if (pool.length > 0) {
      chosen = characters.indexOf(pool[Math.floor(draw() * pool.length)]!)
    }
    else {
      let roll = draw() * total
      chosen = 0
      while (chosen < weights.length - 1 && roll > weights[chosen]!) {
        roll -= weights[chosen]!
        chosen += 1
      }
    }
    const edge = open[Math.floor(draw() * open.length)]!
    const cruise = plan.speed[0] + draw() * (plan.speed[1] - plan.speed[0])
    const traveller: Traveller = {
      edge,
      forward: draw() > 0.5,
      along: draw() * network.edges[edge]!.length,
      speed: cruise,
      cruise,
      lane: draw(),
      rng: draw,
      service: plan.service(models[phasesOf.get(characters[chosen]!)![0]!]!),
      callout: null,
      responding: false,
      gait: draw() * Math.PI * 2,
      partner: null,
      partnerGap: 0,
      fromCamera: 0,
      roams: plan.people === true && draw() < ROAMER_SHARE,
      /*
       * Drawn once and kept, so the same people are the ones standing about. Re-rolling it every
       * month would make the whole crowd twitch between walking and standing.
       */
      loiters: plan.people === true && draw() < LOITER_POOL,
      stature: plan.people ? statureAt(citizen, plan.seed) : 1,
      /*
       * Unique across the whole city, not within a fleet: the pedestrians and the cyclists are two
       * fleets and one population, and a walker and a rider must never turn out to be the same
       * person. `plan.citizenBase` is where this fleet's block of numbers starts.
       */
      citizen,
    }
    assigned[chosen]!.push(traveller)
    all.push(traveller)
  }

  /*
   * Pair some of the crowd up.
   *
   * Two thirds of a pavement is people out with somebody — a couple, two colleagues, a parent and a
   * child — and evenly spaced singles is the one thing a street never looks like. A companion is
   * bound to whoever was made before it, which is arbitrary and exactly right: they are two people
   * who happen to be walking together, not two people who are alike.
   *
   * Nobody is given a companion who already is one, so a group is a pair or a three and never a
   * conga line — which is what this whole change exists to stop.
   */
  if ((plan.walks ?? plan.people === true)) {
    for (let index = 1; index < all.length; index += 1) {
      const traveller = all[index]!
      const leader = all[index - 1]!
      if (leader.partner || draw() > COMPANY_SHARE)
        continue
      traveller.partner = leader
      traveller.partnerGap = COMPANY_GAP[0] + draw() * (COMPANY_GAP[1] - COMPANY_GAP[0])
      // Beside rather than behind: the companion takes the other hand of the same lane.
      traveller.lane = leader.lane > 0.5 ? leader.lane - 0.35 : leader.lane + 0.35
    }
  }

  characters.forEach((who, index) => {
    const crew = assigned[index]!
    if (crew.length === 0)
      return
    fleet.crews.push(crew)
    const row: number[] = []
    for (const modelIndex of phasesOf.get(who)!) {
      const model = models[modelIndex]!
      const size = plan.scale(model)
      const geometry = model.geometry.clone()
      geometry.scale(size, size, size)
      const skin = Array.isArray(material) ? material[index % material.length]! : material
      const mesh = buildMesh(scene, geometry, skin, crew.length)
      row.push(fleet.meshes.length)
      fleet.meshes.push(mesh)
      fleet.drawn.push([])
    }
    fleet.phases.push(row)
  })

  return fleet
}

/** One instanced mesh: the same setup whichever phase of whichever character it holds. */
function buildMesh(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)

  /*
   * Neutral, and left that way.
   *
   * A figure's skin comes from its own recoloured copy of the atlas — see `complexion.ts` — rather
   * than from an instance colour. An instance colour multiplies the whole figure, clothes included,
   * so a dark skin tone arrived with a brown shirt and the crowd ended up looking like one person
   * under different lighting. It also had to be rewritten every pass once the walk cycle started
   * moving figures between slots, and getting that wrong made the whole city flicker.
   */
  for (let instance = 0; instance < capacity; instance += 1) mesh.setColorAt(instance, WHITE)

  /*
   * Traffic casts no shadow. Six hundred cars at two thousand triangles apiece go through the
   * shadow pass as well as the colour one, which is the single largest thing in a frame — measured
   * at four and a half million triangles of the nine a shadow frame was costing. What it buys is a
   * car-shaped smudge on a road that is already in the shade of the buildings either side of it.
   */
  mesh.castShadow = false
  mesh.frustumCulled = false
  mesh.count = 0
  scene.add(mesh)
  return mesh
}
