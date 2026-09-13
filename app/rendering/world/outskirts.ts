import type { CityBlueprint } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import type { CityModels } from '../cityModels'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'
import { AXIS_Y, WHITE } from '../shared'
import { ribbonSections } from './ribbon'

/**
 * Where the map's own data stops and filler begins.
 *
 * The extract is three kilometres square, so the real city reaches 1 500 m along the axes and 2 120
 * into the corners. Everything past that is ours, and the point of it is that the city should thin
 * out instead of stopping at a line.
 *
 * The first attempt scattered houses over a circle and snapped them to a ninety-metre rhythm. From
 * above that passes; from anywhere near the ground it is a board game — boxes standing on bare grass
 * in a grid, some of them forty metres wide and one storey tall, with nothing between them. What
 * makes a suburb read as a suburb is not the houses, it is that they stand in rows along a lane, at
 * a house's distance from each other, with trees and hedges in between and a road they face. So the
 * lanes come first here and the houses are placed along them.
 *
 * All of it is the kit's low-detail models: two hundred triangles apiece against twelve hundred for
 * the real ones, which is what lets fifteen hundred of them exist at all. None of it is ever touched
 * by the simulation; it is generated here, from its own seeded stream, and never enters the
 * blueprint.
 */

const EXTRACT_HALF = 1_500
/** Roughly where the built-up area gives out, before the edge is made to wander. */
const CITY_EDGE = 1_900
/** How far past that the suburbs reach, and how far out the villages are scattered. */
const SUBURB_DEPTH = 1_150
const VILLAGE_COUNT = 22
const VILLAGE_REACH = 4_400

/** How many lanes run out of the city, and how many ring roads cross them. */
const RADIAL_LANES = 30
const RING_LANES = 2
/** A lane is drawn every so many metres, wandering a little at each step. */
const LANE_STEP = 95
const LANE_WIDTH = 6.5

/** Plot rhythm: how far apart front doors are, and how far back from the lane they stand. */
const PLOT = 27
const SETBACK = 13
/** A house, in metres. Not forty: that was the whole problem. */
const HOUSE_MIN = 10
const HOUSE_MAX = 17
const STOREY_MIN = 5.5
const STOREY_MAX = 9.5
/** One plot in eleven is something bigger — a workshop, a school, a block of flats. */
const LARGER_SHARE = 0.09

/** How much the ground may move across a plot before it is left empty. */
const BUILDABLE_SLOPE = 1.5
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const

/** Render, brick and pebbledash: what a German suburb is, in the six colours it comes in. */
const BELT_COLOURS = [0xC9C0AE, 0xB3A896, 0xA88F7C, 0xC4BCAC, 0x9E9B90, 0xBFAE99]
/** One tree for every this many plots, give or take, plus what stands along the verges. */
const TREE_SHARE = 0.55
const TREE_HEIGHT = 9

interface Plot {
  x: number
  z: number
  angle: number
  footprint: number
  height: number
  pick: number
  ground: number
}

export function addOutskirts(blueprint: CityBlueprint, models: CityModels): THREE.Group {
  const group = new THREE.Group()
  group.name = 'outskirts'
  const rng = createRandomStream(blueprint.definition.seed, 'outskirts')
  const relief = blueprint.relief

  const lanes = layOutLanes(rng)
  const plots: Plot[] = []
  const trees: { x: number, z: number, scale: number, spin: number }[] = []

  for (const lane of lanes)
    buildAlong(lane, rng, relief, plots, trees)

  group.add(laneSurface(lanes, relief))
  group.add(...houses(plots, models))
  const planting = greenery(trees, relief, models)
  if (planting)
    group.add(planting)

  return group
}

/**
 * The lanes: a wandering edge to the built-up area, roads running out of it, and a couple of rings
 * crossing them, plus a short crossroads for every village out in the fields.
 */
function layOutLanes(rng: { next: () => number, between: (a: number, b: number) => number }): number[][] {
  const lanes: number[][] = []
  // The city limit as a wandering line rather than a radius: three harmonics with seeded phases.
  const phases = [rng.next() * Math.PI * 2, rng.next() * Math.PI * 2, rng.next() * Math.PI * 2]
  const edge = (angle: number): number => CITY_EDGE * (
    1
    + 0.17 * Math.sin(angle * 3 + (phases[0] ?? 0))
    + 0.10 * Math.sin(angle * 5 + (phases[1] ?? 0))
    + 0.06 * Math.sin(angle * 8 + (phases[2] ?? 0))
  )

  for (let index = 0; index < RADIAL_LANES; index += 1) {
    const angle = (index / RADIAL_LANES) * Math.PI * 2 + rng.between(-0.04, 0.04)
    const from = edge(angle) - 320
    const to = from + SUBURB_DEPTH + rng.between(-220, 320)
    const path: number[] = []
    let drift = 0
    for (let radius = from; radius <= to; radius += LANE_STEP) {
      drift += rng.between(-0.014, 0.014)
      const bearing = angle + drift
      path.push(Math.cos(bearing) * radius, Math.sin(bearing) * radius)
    }
    lanes.push(path)
  }

  for (let ring = 0; ring < RING_LANES; ring += 1) {
    const radius = CITY_EDGE + 230 + ring * 520
    const path: number[] = []
    for (let angle = 0; angle <= Math.PI * 2 + 0.1; angle += 0.06) {
      const wobble = radius * (1 + 0.05 * Math.sin(angle * 4 + ring) + 0.03 * Math.sin(angle * 7 - ring))
      path.push(Math.cos(angle) * wobble, Math.sin(angle) * wobble)
    }
    lanes.push(path)
  }

  for (let village = 0; village < VILLAGE_COUNT; village += 1) {
    const angle = rng.next() * Math.PI * 2
    const radius = CITY_EDGE + SUBURB_DEPTH + rng.next() ** 0.7 * VILLAGE_REACH
    const centreX = Math.cos(angle) * radius
    const centreZ = Math.sin(angle) * radius
    // A village is a crossroads with houses down both arms, which is what a village is.
    for (const bearing of [rng.next() * Math.PI, 0]) {
      const heading = bearing === 0 ? rng.next() * Math.PI : bearing
      const reach = rng.between(150, 330)
      lanes.push([
        centreX - Math.cos(heading) * reach,
        centreZ - Math.sin(heading) * reach,
        centreX,
        centreZ,
        centreX + Math.cos(heading) * reach,
        centreZ + Math.sin(heading) * reach,
      ])
    }
  }

  return lanes
}

/** Walk a lane and put a house on every plot down both sides of it, where the land allows. */
function buildAlong(
  path: number[],
  rng: { next: () => number, between: (a: number, b: number) => number },
  relief: Relief,
  plots: Plot[],
  trees: { x: number, z: number, scale: number, spin: number }[],
): void {
  let carried = rng.next() * PLOT
  for (let i = 0; i < path.length / 2 - 1; i += 1) {
    const ax = path[i * 2]!
    const az = path[i * 2 + 1]!
    const bx = path[(i + 1) * 2]!
    const bz = path[(i + 1) * 2 + 1]!
    const span = Math.hypot(bx - ax, bz - az)
    if (span < 1)
      continue
    const ux = (bx - ax) / span
    const uz = (bz - az) / span
    const facing = Math.atan2(ux, uz)

    for (let along = PLOT - carried; along < span; along += PLOT) {
      for (const side of [1, -1]) {
        if (rng.next() > 0.86) {
          // A gap in the row: a field, a yard, somewhere nobody built.
          plantVerge(ax + ux * along, az + uz * along, ux, uz, side, rng, trees)
          continue
        }
        const bigger = rng.next() < LARGER_SHARE
        const footprint = bigger ? rng.between(20, 30) : rng.between(HOUSE_MIN, HOUSE_MAX)
        const offset = (SETBACK + footprint / 2) * side
        const x = ax + ux * along - uz * offset + rng.between(-2.5, 2.5)
        const z = az + uz * along + ux * offset + rng.between(-2.5, 2.5)
        if (Math.abs(x) < EXTRACT_HALF && Math.abs(z) < EXTRACT_HALF)
          continue

        /*
         * Only where the land is flat enough to build on. These are catalogue models with a flat
         * underside and no skirt, and the hills out here are real: across fifty metres the ground
         * can move seven, which buries one corner of a house to the eaves. Nobody builds there
         * either — a village sits on the flat between the hills, not on the side of one.
         */
        const half = footprint / 2
        let lowest = Infinity
        let highest = -Infinity
        for (const [dx, dz] of CORNERS) {
          const ground = relief.height(x + dx * half, z + dz * half)
          lowest = Math.min(lowest, ground)
          highest = Math.max(highest, ground)
        }
        if (highest - lowest > BUILDABLE_SLOPE)
          continue

        plots.push({
          x,
          z,
          // Square to the lane, give or take the way a plot is never quite square to it.
          angle: facing + (side > 0 ? 0 : Math.PI) + rng.between(-0.06, 0.06),
          footprint,
          height: bigger ? rng.between(8, 13) : rng.between(STOREY_MIN, STOREY_MAX),
          pick: rng.next(),
          ground: highest,
        })
        if (rng.next() < TREE_SHARE)
          plantVerge(ax + ux * along, az + uz * along, ux, uz, side, rng, trees)
      }
    }
    carried = (carried + span) % PLOT
  }
}

/** A tree on the verge, between the lane and whatever stands behind it. */
function plantVerge(
  x: number,
  z: number,
  ux: number,
  uz: number,
  side: number,
  rng: { next: () => number, between: (a: number, b: number) => number },
  trees: { x: number, z: number, scale: number, spin: number }[],
): void {
  const offset = rng.between(5, SETBACK - 1) * side
  trees.push({
    x: x - uz * offset + rng.between(-6, 6),
    z: z + ux * offset + rng.between(-6, 6),
    scale: rng.between(0.7, 1.35),
    spin: rng.next() * Math.PI * 2,
  })
}

/**
 * The lanes themselves, as one flat ribbon.
 *
 * They are what the houses are standing along, so leaving them undrawn is what made the belt read as
 * scatter: a row of houses with no road in front of it is not a row, it is a coincidence.
 */
function laneSurface(lanes: number[][], relief: Relief): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const index: number[] = []

  for (const path of lanes) {
    // Sections every few metres, not every ninety: a lane is laid out in long straight runs out here.
    const sections = ribbonSections(path, LANE_WIDTH / 2)
    const first = position.length / 3
    sections.forEach((section, at) => {
      const left = section.x + section.ox
      const leftZ = section.z + section.oz
      const right = section.x - section.ox
      const rightZ = section.z - section.oz
      position.push(
        left,
        relief.height(left, leftZ) + 0.06,
        leftZ,
        right,
        relief.height(right, rightZ) + 0.06,
        rightZ,
      )
      normal.push(0, 1, 0, 0, 1, 0)
      if (at > 0) {
        const a = first + (at - 1) * 2
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    })
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#3b3f41',
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }))
}

/**
 * The houses, bucketed by model so the whole belt is a handful of instanced draws. They cast no
 * shadow: that is most of what a distant building would otherwise cost, and nothing out here is
 * close enough to anything for its shadow to land on it.
 */
function houses(plots: Plot[], models: CityModels): THREE.InstancedMesh[] {
  const pool = models.distant.length > 0 ? models.distant : models.houses
  if (pool.length === 0)
    return []

  const buckets = new Map<string, Plot[]>()
  for (const plot of plots) {
    const model = pool[Math.floor(plot.pick * pool.length)] ?? pool[0]!
    const bucket = buckets.get(model.id) ?? []
    bucket.push(plot)
    buckets.set(model.id, bucket)
  }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const tint = new THREE.Color()
  const meshes: THREE.InstancedMesh[] = []

  for (const [id, bucket] of buckets) {
    const model = pool.find(entry => entry.id === id) ?? pool[0]!
    const mesh = new THREE.InstancedMesh(model.geometry, models.commercialMaterial, bucket.length)
    const footprint = Math.max(0.001, Math.max(model.size.x, model.size.z))
    bucket.forEach((plot, index) => {
      /*
       * The height is set outright rather than as a stretch of the model's own.
       *
       * The kit's low-detail models are four times as tall as they are wide — they are office
       * blocks. Scaled to a fourteen-metre plot and then nudged toward a house's height by a factor
       * that could not go below 0.7, the shortest one they could make was thirty-nine metres. That
       * is what the suburbs were: fifteen hundred tower blocks standing in a field. Squashing the
       * model to the height actually wanted compresses its window bands, which at a kilometre and a
       * half is not something anybody can see, and being the right height is.
       */
      const spread = plot.footprint / footprint
      matrix.compose(
        // On the highest ground the plot covers, like every other building in the city.
        position.set(plot.x, plot.ground, plot.z),
        quaternion.setFromAxisAngle(AXIS_Y, plot.angle),
        scale.set(spread, plot.height / Math.max(0.001, model.size.y), spread),
      )
      mesh.setMatrixAt(index, matrix)
      /*
       * Tinted rather than left white. The low-detail models carry almost no texture, so a whole
       * belt of them reads as a field of blank slabs; a spread of muted renders and brick turns the
       * same geometry into houses at the distance they are actually seen from.
       */
      mesh.setColorAt(index, tint.setHex(BELT_COLOURS[Math.floor(plot.pick * BELT_COLOURS.length)] ?? BELT_COLOURS[0]!))
    })
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.computeBoundingSphere()
    meshes.push(mesh)
  }

  return meshes
}

/** Whatever is growing between the houses. One draw for the whole belt. */
function greenery(trees: { x: number, z: number, scale: number, spin: number }[], relief: Relief, models: CityModels): THREE.InstancedMesh | null {
  const model = models.trees[0]
  if (!model || trees.length === 0)
    return null

  const mesh = new THREE.InstancedMesh(model.geometry, models.natureMaterial, trees.length)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const base = TREE_HEIGHT / Math.max(0.001, model.size.y)

  trees.forEach((tree, index) => {
    const size = base * tree.scale
    matrix.compose(
      position.set(tree.x, relief.height(tree.x, tree.z), tree.z),
      quaternion.setFromAxisAngle(AXIS_Y, tree.spin),
      scale.set(size, size, size),
    )
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, WHITE)
  })
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  mesh.computeBoundingSphere()
  return mesh
}
