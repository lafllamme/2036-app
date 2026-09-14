import type { CityBlueprint, RoadRecord } from '../../core/contracts'
import type { Relief } from '../../world/relief'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import * as THREE from 'three/webgpu'
import { CYCLE_MIN_WIDTH, CYCLE_WIDTH, PAVEMENT_WIDTH, pavementLane } from './lanes'
import { deckOf, ribbonSections } from './ribbon'
import { carriageways, sampleEdge } from './roadNetwork'

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
/** How often a pavement strip is sampled along its stretch, in metres. */
const PAVEMENT_STEP = 4
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
/** A bridge's parapet: how high the wall along its edge stands, and how thick it is. */
const PARAPET = 1.1
const PARAPET_THICKNESS = 0.45
/**
 * How deep the deck is, under the surface you drive on.
 *
 * The one number that decides whether a bridge reads as a structure or as a road that happens to be
 * in the air. A carriageway ribbon has no thickness at all; seen from the bank, it was a line.
 */
const DECK_DEPTH = 1.1
/** How far apart a bridge's piers stand, and how thick one is. */
const PIER_SPACING = 26
const PIER_SIZE = 2.2

export function addRoads(scene: THREE.Scene, blueprint: CityBlueprint, network: RoadNetwork): void {
  const relief = blueprint.relief
  /*
   * The pavement goes down first, as strips beside the streets that have one.
   *
   * It used to be the same ribbon as the carriageway, two metres wider each side — one draw for the
   * whole city and most of what makes a street read as a street. What that ignores is every other
   * street: a pavement sits just outside its own kerb, and at a junction that is the middle of
   * somebody else's road. In the centre, where OpenStreetMap draws a crossroads as half a dozen
   * overlapping ways, the result was pale shapes scattered across the tarmac with no relation to
   * anything — and a crowd that looked like it was walking in the road because the road and the
   * pavement had stopped being different places.
   *
   * Now each strip is laid on the side the network says has room for one, sample by sample, and
   * broken wherever a sample is inside another carriageway. It reads the same `footpath` the
   * pedestrians walk on, so where a pavement is drawn and where somebody walks are one decision.
   */
  scene.add(pavements(relief, network, new THREE.MeshStandardMaterial({
    color: '#6e6c66',
    roughness: 0.93,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })))
  scene.add(ribbon(relief, blueprint.roads, ROAD_Y, new THREE.MeshStandardMaterial({
    color: '#33383b',
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }), 1))
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
 * The pavements, as strips beside the streets that have room for one.
 *
 * Built from the network rather than from the ways, because the network already knows where a road's
 * running surface is — and that is the whole question. A pavement sits just outside its own kerb,
 * which at a junction is the middle of somebody else's street; drawn blindly, that is a scattering
 * of pale shapes across the tarmac and a crowd that looks like it is walking in the road.
 *
 * So each side of each stretch is sampled along its length and the strip is broken wherever a sample
 * falls inside another carriageway. The line it straddles is `pavementLane`, the same one the crowd
 * walks along, so where a pavement is drawn and where somebody walks are one decision.
 */
function pavements(relief: Relief, network: RoadNetwork, material: THREE.Material): THREE.Mesh {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const roads = carriageways(network)
  const at = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

  /** One cross-section of a strip: the kerb edge, the outer edge, and how far down the street it is. */
  interface Rung { ix: number, iz: number, iy: number, ox: number, oz: number, oy: number, along: number }

  const emit = (run: Rung[], side: number): void => {
    if (run.length < 2)
      return
    const first = position.length / 3
    for (const rung of run) {
      /*
       * Kerb first going one way, outer edge first going the other. The strip on the left of a
       * street is the mirror of the one on the right, and a mirrored quad is wound the other way
       * round — which, with back faces culled as they are everywhere else, would have made every
       * left-hand pavement in the city invisible from above.
       */
      if (side > 0)
        position.push(rung.ix, rung.iy + PAVEMENT_Y, rung.iz, rung.ox, rung.oy + PAVEMENT_Y, rung.oz)
      else position.push(rung.ox, rung.oy + PAVEMENT_Y, rung.oz, rung.ix, rung.iy + PAVEMENT_Y, rung.iz)
      normal.push(0, 1, 0, 0, 1, 0)
      uv.push(0, rung.along / 8, 1, rung.along / 8)
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      const a = first + i * 2
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }

  for (const edge of network.edges) {
    /*
     * The strip straddles the line the crowd walks along, rather than starting at the kerb and
     * happening to end up there. Same numbers, one source: if `pavementLane` ever moves, the paint
     * moves with it instead of leaving the pedestrians walking beside their own pavement.
     */
    const middle = pavementLane(edge.width)
    const inner = middle - PAVEMENT / 2
    const outer = middle + PAVEMENT / 2
    // Whole steps, so the strip reaches the end of the stretch instead of stopping a metre short.
    const steps = Math.max(1, Math.round(edge.length / PAVEMENT_STEP))

    /*
     * Both sides, not just the walkable one. `footpath` picks the better of the two because a
     * traveller has to be on one or the other; a street has a pavement down each side wherever
     * there is room for one, and drawing only the side the crowd happens to use left every street
     * in the city with a kerb on one hand and grass on the other.
     */
    for (const side of [1, -1]) {
      strip(edge, side, inner, outer, steps)
    }
  }

  /** Lay one side of one street, breaking the strip wherever it would cross another carriageway. */
  function strip(edge: RoadEdge, side: number, inner: number, outer: number, steps: number): void {
    let run: Rung[] = []

    for (let step = 0; step <= steps; step += 1) {
      const along = edge.length * step / steps
      sampleEdge(edge, along, at)
      const ix = at.x - at.uz * inner * side
      const iz = at.z + at.ux * inner * side
      const ox = at.x - at.uz * outer * side
      const oz = at.z + at.ux * outer * side
      /*
       * The higher of the road's own surface and the ground the strip is actually standing on.
       *
       * Neither alone will do. Laid on the ground, a pavement drops into the river under a bridge,
       * because a deck is not the land beneath it. Laid at the road's height, it disappears into the
       * hillside wherever the land rises away from the kerb — measured on this ground plan, that is
       * a third of every pavement position in the city, by up to seven metres, which is why the
       * crowd was walking down a street with grass where its footway should be.
       */
      const rung: Rung = {
        ix,
        iz,
        iy: Math.max(at.y, relief.height(ix, iz)),
        ox,
        oz,
        oy: Math.max(at.y, relief.height(ox, oz)),
        along,
      }

      /*
       * The middle of the strip decides whether there is room. Testing a corner would break the
       * strip wherever a kerb merely brushes another road, and a pavement that stops every few
       * metres is worse than one that overlaps a little.
       */
      if (roads.blocked((ix + ox) / 2, (iz + oz) / 2, edge)) {
        emit(run, side)
        run = []
        continue
      }

      /*
       * A straight stretch needs two rungs, not seventy. The samples are four metres apart because
       * that is the resolution the blocked test needs to notice a side road, but the geometry only
       * needs a rung where the street actually turns or the ground actually bends — which takes the
       * city's pavements from 241,000 triangles to 39,400 for a surface that looks identical.
       */
      const last = run[run.length - 1]
      const before = run[run.length - 2]
      if (last && before && straight(before, last, rung))
        run[run.length - 1] = rung
      else run.push(rung)
    }
    emit(run, side)
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

/** How far a dropped rung may leave the surface, in metres. Three centimetres is under a kerb face. */
const RUNG_SAG = 0.03

/**
 * Whether three rungs of a pavement run in a straight enough line that the middle one adds nothing.
 *
 * Height is judged by how far the middle rung would *sag* from the line between its neighbours, not
 * by how much it differs from them. The difference matters: on any slope at all, consecutive rungs
 * always differ, so comparing them kept every rung on every hill in the city and the simplification
 * saved a fifth of nothing. What a flat quad actually gets wrong is the sag, and a long even gradient
 * has none — it is a straight line that happens not to be level.
 */
function straight(a: Sample, b: Sample, c: Sample): boolean {
  const span = Math.hypot(c.ix - a.ix, c.iz - a.iz)
  if (span <= 0)
    return false
  const t = Math.hypot(b.ix - a.ix, b.iz - a.iz) / span
  if (Math.abs(b.iy - (a.iy + (c.iy - a.iy) * t)) > RUNG_SAG)
    return false
  if (Math.abs(b.oy - (a.oy + (c.oy - a.oy) * t)) > RUNG_SAG)
    return false
  const ax = b.ix - a.ix
  const az = b.iz - a.iz
  const bx = c.ix - b.ix
  const bz = c.iz - b.iz
  const lengths = Math.hypot(ax, az) * Math.hypot(bx, bz)
  return lengths > 0 && (ax * bx + az * bz) / lengths > 0.9995
}

/** What `straight` needs to see of a rung: where it is on the ground, and how high each edge is. */
interface Sample { ix: number, iz: number, iy: number, oy: number }

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

  /**
   * One flat quad, wound so that its front face looks the way it is meant to.
   *
   * The winding is not trusted: the normal is computed from the corners, compared against the
   * direction the face is supposed to look, and the order reversed if the two disagree. Every
   * surface of a bridge is a different plane at a different angle and half of them are mirrors of
   * the other half, so reasoning about handedness four times over is how a wall ends up invisible.
   */
  const quad = (corners: [number, number, number][], facing: [number, number, number]): void => {
    const [a, b, c] = corners as [[number, number, number], [number, number, number], [number, number, number]]
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const length = Math.hypot(nx, ny, nz)
    if (length < 1e-9)
      return
    nx /= length
    ny /= length
    nz /= length

    const order = nx * facing[0] + ny * facing[1] + nz * facing[2] >= 0 ? corners : [...corners].reverse()
    const sign = order === corners ? 1 : -1
    const base = position.length / 3
    for (const [x, y, z] of order) {
      position.push(x, y, z)
      normal.push(nx * sign, ny * sign, nz * sign)
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /** A closed rectangular post, for the piers. */
  const post = (cx: number, cz: number, top: number, bottom: number, size: number): void => {
    const half = size / 2
    const corners: [number, number][] = [[cx - half, cz - half], [cx + half, cz - half], [cx + half, cz + half], [cx - half, cz + half]]
    for (let i = 0; i < 4; i += 1) {
      const [ax, az] = corners[i]!
      const [bx, bz] = corners[(i + 1) % 4]!
      const midX = (ax + bx) / 2 - cx
      const midZ = (az + bz) / 2 - cz
      quad([[ax, bottom, az], [bx, bottom, bz], [bx, top, bz], [ax, top, az]], [midX, 0, midZ])
    }
    quad(corners.map(([x, z]): [number, number, number] => [x, top, z]), [0, 1, 0])
  }

  for (const road of roads) {
    if (!road.bridge)
      continue
    const deck = deckOf(road.path, true, (x, z) => relief.height(x, z))
    const sections = ribbonSections(road.path, road.width / 2 + PAVEMENT)
    if (sections.length < 2)
      continue

    /*
     * Everything below is *swept* along the deck rather than placed as blocks at intervals.
     *
     * The parapet used to be one box per eight-metre section, centred on that section and turned to
     * its bearing. On a straight bridge on the flat that is a wall. On a real one it is not: the
     * boxes separate on the outside of every bend and step apart wherever the deck climbs. Measured
     * on this ground plan, neighbouring blocks stood up to 5.04 m apart with a 4.35 m height step
     * between them, which is why the city's bridges looked like rubble tipped along a road.
     *
     * A swept band cannot do that. Each face shares its two corners with the face before it, so it
     * is continuous by construction however the deck bends or climbs, and the whole structure
     * follows the one deck profile the carriageway and the traffic already follow.
     */
    const edge = (at: number, side: number): [number, number] => {
      const section = sections[at]!
      return [section.x + section.ox * side, section.z + section.oz * side]
    }
    const inward = (at: number, side: number): [number, number] => {
      const section = sections[at]!
      const length = Math.hypot(section.ox, section.oz) || 1
      return [-(section.ox / length) * side, -(section.oz / length) * side]
    }

    for (let i = 1; i < sections.length; i += 1) {
      const previous = sections[i - 1]!
      const current = sections[i]!
      const deckBefore = deck.at(previous.along)
      const deckNow = deck.at(current.along)

      for (const side of [1, -1]) {
        const [ax, az] = edge(i - 1, side)
        const [bx, bz] = edge(i, side)
        const [aInX, aInZ] = inward(i - 1, side)
        const [bInX, bInZ] = inward(i, side)
        const out: [number, number, number] = [-(aInX + bInX) / 2, 0, -(aInZ + bInZ) / 2]

        /*
         * The outside of the bridge, in one face: the parapet above the deck and the depth of the
         * deck below it. A carriageway ribbon is infinitely thin, and without this a bridge seen
         * from the bank is a line hanging over the water.
         */
        quad([
          [ax, deckBefore - DECK_DEPTH, az],
          [bx, deckNow - DECK_DEPTH, bz],
          [bx, deckNow + PARAPET, bz],
          [ax, deckBefore + PARAPET, az],
        ], out)

        // The inside face of the parapet, which is the wall somebody walking the bridge sees.
        const aIn: [number, number] = [ax + aInX * PARAPET_THICKNESS, az + aInZ * PARAPET_THICKNESS]
        const bIn: [number, number] = [bx + bInX * PARAPET_THICKNESS, bz + bInZ * PARAPET_THICKNESS]
        quad([
          [aIn[0], deckBefore, aIn[1]],
          [bIn[0], deckNow, bIn[1]],
          [bIn[0], deckNow + PARAPET, bIn[1]],
          [aIn[0], deckBefore + PARAPET, aIn[1]],
        ], [-out[0], 0, -out[2]])

        // And the coping along the top of it.
        quad([
          [ax, deckBefore + PARAPET, az],
          [bx, deckNow + PARAPET, bz],
          [bIn[0], deckNow + PARAPET, bIn[1]],
          [aIn[0], deckBefore + PARAPET, aIn[1]],
        ], [0, 1, 0])
      }

      // The soffit: the underside of the deck, so a bridge is closed when seen from the water.
      const [aLeftX, aLeftZ] = edge(i - 1, 1)
      const [bLeftX, bLeftZ] = edge(i, 1)
      const [aRightX, aRightZ] = edge(i - 1, -1)
      const [bRightX, bRightZ] = edge(i, -1)
      quad([
        [aLeftX, deckBefore - DECK_DEPTH, aLeftZ],
        [bLeftX, deckNow - DECK_DEPTH, bLeftZ],
        [bRightX, deckNow - DECK_DEPTH, bRightZ],
        [aRightX, deckBefore - DECK_DEPTH, aRightZ],
      ], [0, -1, 0])
    }

    // The piers, reaching from under the deck down to the land or the riverbed below it.
    for (let along = PIER_SPACING / 2; along < deck.length; along += PIER_SPACING) {
      const section = sections.find(entry => entry.along >= along) ?? sections[sections.length - 1]
      if (!section)
        continue
      const foot = relief.height(section.x, section.z) - 1
      const top = deck.at(along) - DECK_DEPTH + 0.1
      if (top - foot < 1.5)
        continue
      post(section.x, section.z, top, foot, PIER_SIZE)
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
