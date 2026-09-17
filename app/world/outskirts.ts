import type { BuildingRecord, DistrictId, RoadRecord, TreeRecord } from '../core/contracts'
import type { Relief } from './relief'
import { createRandomStream } from '../core/rng'
import { fieldAt } from './terrain'

/**
 * The country around the city — built by the same rules as the city inside it, and joined to it.
 *
 * This used to be a second renderer. Inside 1 500 metres a building was a real footprint extruded
 * into walls with a façade texture, a gabled roof, a base course and a street with pavements either
 * side; outside it a building was a catalogue model with none of that, on a grey line. There was a
 * hard seam right round the city where one stopped and the other began.
 *
 * So there is one kind of building now. This produces the same records the map produces — outlines,
 * heights, roofs, streets — and hands them to the blueprint, where everything downstream treats them
 * exactly like Bremen's own.
 *
 * What it produced, though, was not a landscape. Thirty lanes ran straight out of one centre, two
 * concentric rings crossed them, twenty-two villages sat out in the fields as isolated crossroads,
 * and houses were strung along every metre of all of it at an even spacing. From two kilometres up
 * that is a wheel, and measured it was worse than it looked: **32 of the 76 lanes touched nothing at
 * all**, and the street plan came apart into **126 unconnected pieces**. A car that drove out of
 * town could not arrive anywhere, and the crowd gathered around the camera stood on a lane that
 * began and ended in a field.
 *
 * A landscape is not a wheel. It is *places*, joined to their neighbours by whatever road happens to
 * run between them, with nothing in between but fields. So that is what this builds now:
 *
 * - **places first, roads second.** Villages, hamlets and farms are scattered with a minimum spacing
 *   that grows with distance from the city, so the country thins out the way real country does;
 * - **the city's own road ends are places too.** Every map road that reaches the edge of the extract
 *   is a gate, and the country network is built over the gates and the villages together — which is
 *   what makes the whole thing one street plan instead of two;
 * - **the network is the Gabriel graph** of those places: two places are joined when no third place
 *   lies inside the circle they span. It is the graph you get by asking "is there anything between
 *   us?", which is the question that actually decides whether two villages have a road, and it has
 *   the cross-connections a starburst never can;
 * - **houses stand near places, not along roads.** A plot is built where a village is, and the
 *   density falls away as the lane leaves it, so there are villages with fields between them rather
 *   than one continuous ribbon of houses down every road in the county.
 */

/**
 * Never inside the ground plan the map actually gave us — und die reicht seit dem 4-km-Ausschnitt
 * zweitausend Meter weit statt fünfzehnhundert.
 */
const EXTRACT_HALF = 2_000
/**
 * How far the country reaches beyond that.
 *
 * Mitgewachsen, aber nicht mitgesprungen: das Land ist ab hier 3,4 km breit statt 3,9 km. Ein
 * Horizont, der aus der Überblickskamera ohnehin im Dunst liegt, ist die letzte Stelle, an der man
 * Dreiecke ausgeben will, wenn die Stadt selbst gerade um 80 % gewachsen ist.
 */
const COUNTRY_REACH = 5_400

/**
 * How far apart two places stand, near the city and at the far edge.
 *
 * The whole density gradient is these two numbers. Near the extract the country is suburb: places
 * are close together and their built-up patches almost touch. Out at the edge it is farmland with a
 * hamlet every kilometre.
 */
const SPACING_NEAR = 430
const SPACING_FAR = 1_150
/** How many attempts are made to place one. Rejection sampling, so this is a budget, not a count. */
const PLACE_TRIES = 4_000

/**
 * The longest road the graph may draw between two places.
 *
 * Without it the far corners of the map join to each other across eight kilometres of nothing, which
 * is a road nobody built. With it a place can be left with no link at all, so anything isolated is
 * given one back to its nearest neighbour afterwards.
 */
const MAX_LINK = 1_750

/**
 * How wide a country road is, between the smallest and the biggest.
 *
 * The floor is not a look, it is `DRIVABLE_WIDTH` in `agents.ts`: traffic refuses anything narrower
 * than eight metres, and a road nothing can drive down is an island with tarmac on it — which is the
 * whole fault this file was rewritten to fix. The spread above it is the hierarchy: a lane out to a
 * farm against the road between two villages.
 */
const LANE_MIN = 8
const LANE_MAX = 11

/** Plot rhythm: how far apart front doors are and how far back from the kerb they stand. */
const PLOT = 27
const SETBACK = 9
const HOUSE_MIN = 9
const HOUSE_MAX = 15
const DEPTH_MIN = 8
const DEPTH_MAX = 13
/** A storey and the plinth under the ground floor, exactly as the converter measures the city. */
const STOREY = 3.1
const BASE = 1.1
/** One plot in nine is something bigger — a workshop, a school, a shop with flats over it. */
const LARGER_SHARE = 0.11
/** How much the ground may move across a plot before it is left empty. */
const BUILDABLE_SLOPE = 1.6
/** One tree for roughly this share of plots, plus what stands in the gaps. */
const TREE_SHARE = 0.55

/**
 * How much space a place keeps clear at its own centre, in metres.
 *
 * Wide enough that six lanes meeting there do not lay six rows of houses into the same ground, and
 * narrow enough that the village still reads as one place rather than as a ring.
 */
const VILLAGE_CLEARING = 42

/**
 * Die Knicks — und warum sie das Wichtigste an dieser Landschaft sind.
 *
 * Eine norddeutsche Feldflur ist nicht durch ihre Äcker gegliedert, sondern durch das, was zwischen
 * ihnen steht: Wallhecken auf den Grenzen, seit der Verkoppelung angelegt, um Vieh zu halten und
 * Wind zu brechen. Sie sind der Grund, aus dem man aus der Luft überhaupt Felder *sieht* — ohne sie
 * ist eine Feldflur eine Fläche mit Farbverläufen darauf, und genau so sah sie hier aus.
 *
 * Gepflanzt wird auf den Grenzen, die `fieldAt` ohnehin kennt: ein Raster über das offene Land, jeder
 * Punkt gefragt, wie weit er vom Rand seines Schlages entfernt ist, und wo er dicht genug daran
 * steht, kommt ein Gehölz hin. Nicht auf jede Grenze — ein Knick an jedem Rand wäre ein Gitter, und
 * die Verkoppelung war nicht ordentlicher als die Leute, die sie gemacht haben.
 */
const KNICK_STEP = 15
const KNICK_EDGE = 0.06
/** Anteil der Grenzen, der überhaupt einen Knick trägt. */
const KNICK_SHARE = 0.58

/**
 * Wie viele Wälder im offenen Land stehen, wie viele Bäume jeder hält und wie weit er reicht.
 *
 * Es waren 190 Bestände zu 34 Bäumen auf 110 Meter Radius — nachgerechnet **ein Baum je 1.100
 * Quadratmeter**. Das ist keine Waldfläche, das ist eine Streuobstwiese, und aus der Höhe sah es
 * genau so aus: Sprenkel auf einer leeren Ebene.
 *
 * Ein geschlossener Bestand steht bei einem Baum je 25 bis 60 Quadratmeter. Also weniger Wälder,
 * dafür richtige: 120 Stück zu 210 Bäumen auf 95 Meter — rund **135 Quadratmeter je Baum**, was
 * zwischen Waldrand und Bestand liegt und aus zweitausend Metern als geschlossene dunkle Fläche
 * liest, ohne die Dreieckszahl zu sprengen.
 *
 * Die Rechnung dazu, weil sie der Grund für die Zahlen ist: 25.200 Bäume gegen vorher 6.460. Bäume
 * sind instanziert — elf Arten, elf Draws, **ganz gleich wie viele stehen** —, es kostet also
 * ausschließlich Dreiecke, und die Arten sind zugunsten der billigen Modelle gewichtet.
 */
const WOOD_COUNT = 120
const WOOD_TREES = 210
const WOOD_SPREAD = 95

export interface Outskirts {
  buildings: BuildingRecord[]
  roads: RoadRecord[]
  trees: TreeRecord[]
}

interface Stream { next: () => number, between: (a: number, b: number) => number }

/**
 * A place in the country: a village, a hamlet, a farm — or a gate, which is where one of the city's
 * own streets leaves the extract.
 */
interface Place {
  x: number
  z: number
  /**
   * How built-up it is, 0 … 1.
   *
   * Decides three things at once, which is why it is one number: how wide the roads leaving it are,
   * how far its houses reach down them, and how big those houses get. A gate is a 1 because the city
   * is on the other side of it.
   */
  weight: number
  gate: boolean
}

export function buildOutskirts(seed: number, relief: Relief, cityRoads: RoadRecord[], districtAt: (x: number, z: number) => DistrictId): Outskirts {
  const rng = createRandomStream(seed, 'outskirts')
  const buildings: BuildingRecord[] = []
  const roads: RoadRecord[] = []
  const trees: TreeRecord[] = []

  const places = [...gatesOf(cityRoads), ...scatterPlaces(rng)]
  const links = gabrielLinks(places)
  /*
   * Everything already built, on a coarse grid.
   *
   * Two lanes leaving the same place run apart slowly, so their first plots are near each other and
   * their houses were laid straight through one another — measured, a tenth of the country's
   * buildings stood inside another one. A plot now has to find room.
   */
  const taken = new Map<number, { x: number, z: number, radius: number }[]>()

  for (const [from, to] of links) {
    const a = places[from]!
    const b = places[to]!
    const path = wander(a, b, rng)
    roads.push({
      id: `o-${roads.length.toString(36)}`,
      path,
      width: round(LANE_MIN + (LANE_MAX - LANE_MIN) * Math.max(a.weight, b.weight)),
      arterial: false,
      bridge: false,
      // Country. What decides how many people and cars belong on it: see `gather` in `fleet/`.
      rural: true,
    })
    buildAlong(path, a, b, rng, relief, buildings, trees, taken, districtAt)
  }

  scatterWoods(rng, relief, places, trees)
  layKnicks(rng, relief, seed, places, trees)

  return { buildings, roads, trees }
}

/**
 * Where the city's own streets leave the extract.
 *
 * These are what make the country part of the same street plan rather than a pattern drawn around
 * it. Every map road that ends near the boundary is one; they are thinned onto a coarse grid so that
 * a dual carriageway's two halves do not become two places a few metres apart.
 */
function gatesOf(cityRoads: RoadRecord[]): Place[] {
  const CELL = 210
  const taken = new Set<number>()
  const gates: Place[] = []

  for (const road of cityRoads) {
    const count = road.path.length / 2
    if (count < 2)
      continue
    for (const index of [0, count - 1]) {
      const x = road.path[index * 2]!
      const z = road.path[index * 2 + 1]!
      // Only where the extract runs out. A dead end in the middle of town is not a way out of it.
      if (Math.max(Math.abs(x), Math.abs(z)) < EXTRACT_HALF - 190)
        continue
      const key = Math.round(x / CELL) * 100_000 + Math.round(z / CELL)
      if (taken.has(key))
        continue
      taken.add(key)
      gates.push({ x: round(x), z: round(z), weight: 1, gate: true })
    }
  }

  return gates
}

/**
 * The villages, hamlets and farms, scattered by rejection with a spacing that grows outward.
 *
 * Rejection sampling rather than a grid or a ring, because the point is that there is no pattern to
 * find. What it does keep is a minimum distance, so the country is irregular without being clumped —
 * which is the difference between a landscape and a handful of dice.
 */
function scatterPlaces(rng: Stream): Place[] {
  const places: Place[] = []

  for (let attempt = 0; attempt < PLACE_TRIES; attempt += 1) {
    const x = rng.between(-COUNTRY_REACH, COUNTRY_REACH)
    const z = rng.between(-COUNTRY_REACH, COUNTRY_REACH)
    const radius = Math.hypot(x, z)
    if (radius > COUNTRY_REACH)
      continue
    // Never inside the real ground plan; that city is the map's, not ours.
    if (Math.abs(x) < EXTRACT_HALF + 120 && Math.abs(z) < EXTRACT_HALF + 120)
      continue

    const out = Math.min(1, Math.max(0, (radius - EXTRACT_HALF) / (COUNTRY_REACH - EXTRACT_HALF)))
    const spacing = SPACING_NEAR + (SPACING_FAR - SPACING_NEAR) * out
    let clear = true
    for (const place of places) {
      if (Math.hypot(place.x - x, place.z - z) < spacing) {
        clear = false
        break
      }
    }
    if (!clear)
      continue

    /*
     * Big near the city, small out in the fields — and never quite predictable, so that there is the
     * odd substantial village a long way out and the odd farm just past the ring road.
     */
    const weight = Math.min(1, Math.max(0.1, (1 - out) ** 1.4 * rng.between(0.75, 1.5)))
    places.push({ x: round(x), z: round(z), weight, gate: false })
  }

  return places
}

/**
 * The Gabriel graph: two places are joined when no third place lies inside the circle that has them
 * as its diameter.
 *
 * In plain terms, "is there anybody between us?" — and if there is not, there is a road. It is the
 * question that actually decides whether two villages are directly connected, and unlike a starburst
 * it produces the cross-links that make a network a network. Links longer than `MAX_LINK` are cut,
 * and anything left with no link at all is given one back to its nearest neighbour, so nothing ends
 * up stranded.
 */
function gabrielLinks(places: Place[]): [number, number][] {
  const links: [number, number][] = []
  const degree = new Uint16Array(places.length)

  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const a = places[i]!
      const b = places[j]!
      const span = Math.hypot(b.x - a.x, b.z - a.z)
      if (span > MAX_LINK)
        continue
      const midX = (a.x + b.x) / 2
      const midZ = (a.z + b.z) / 2
      const radius = span / 2

      let between = false
      for (let k = 0; k < places.length; k += 1) {
        if (k === i || k === j)
          continue
        const other = places[k]!
        if (Math.hypot(other.x - midX, other.z - midZ) < radius) {
          between = true
          break
        }
      }
      if (between)
        continue

      links.push([i, j])
      degree[i]! += 1
      degree[j]! += 1
    }
  }

  for (let i = 0; i < places.length; i += 1) {
    if (degree[i]! > 0)
      continue
    let nearest = -1
    let best = Infinity
    for (let j = 0; j < places.length; j += 1) {
      if (j === i)
        continue
      const span = Math.hypot(places[j]!.x - places[i]!.x, places[j]!.z - places[i]!.z)
      if (span < best) {
        best = span
        nearest = j
      }
    }
    if (nearest >= 0) {
      links.push([i, nearest])
      degree[i]! += 1
      degree[nearest]! += 1
    }
  }

  return links
}

/**
 * The road between two places: a shallow bow with a little wander in it.
 *
 * A country road is not a straight line and it is not a random walk either — it goes where it is
 * going, around whatever was in the way two hundred years ago. One bow across the whole length gives
 * it that, and the jitter on top keeps two roads of the same length from having the same shape.
 */
function wander(a: Place, b: Place, rng: Stream): number[] {
  const span = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(2, Math.round(span / 150))
  const ux = (b.x - a.x) / (span || 1)
  const uz = (b.z - a.z) / (span || 1)
  const bow = rng.between(-0.09, 0.09) * span

  const path: number[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const across = Math.sin(Math.PI * t) * bow + (step === 0 || step === steps ? 0 : rng.between(-14, 14))
    path.push(
      round(a.x + (b.x - a.x) * t - uz * across),
      round(a.z + (b.z - a.z) * t + ux * across),
    )
  }
  return path
}

/**
 * Walk a lane and put houses on it — but only near the places at its two ends.
 *
 * This is the difference between a landscape and a wiring diagram. A plot used to be built every
 * twenty-seven metres down every lane in the county, so every road was a continuous terrace and the
 * country between two villages looked exactly like the villages. The chance of a plot now falls away
 * with distance from whichever end of the lane is nearer, over a reach set by how big that place is:
 * a village has a few hundred metres of houses around it and then fields.
 */
function buildAlong(
  path: number[],
  from: Place,
  to: Place,
  rng: Stream,
  relief: Relief,
  buildings: BuildingRecord[],
  trees: TreeRecord[],
  taken: Map<number, { x: number, z: number, radius: number }[]>,
  districtAt: (x: number, z: number) => DistrictId,
): void {
  const total = pathLength(path)
  let travelled = 0
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
      /*
       * How built-up it is here: near the end of the lane, at the reach of whichever place that end
       * belongs to. A gate keeps its houses back — the far side of it is the map's own city and it
       * already has buildings there.
       */
      const distance = travelled + along
      /*
       * Nothing right at the crossroads.
       *
       * Every lane leaving a place started its plots at the first twenty-seven metres, so at a node
       * where six lanes met, six rows of houses were laid into the same fifty metres from six
       * directions — a knot of overlapping roofs with a road under it, which is what a village
       * looked like from above. A real one has a middle: a green, a square, a churchyard, the space
       * the roads actually meet in. This is that space, and it also happens to be the only thing
       * standing between six rows of houses and each other.
       */
      if (Math.min(distance, total - distance) < VILLAGE_CLEARING)
        continue
      const settled = Math.max(
        from.gate ? 0 : reachOf(from) === 0 ? 0 : 1 - distance / reachOf(from),
        to.gate ? 0 : reachOf(to) === 0 ? 0 : 1 - (total - distance) / reachOf(to),
      )
      if (settled <= 0)
        continue

      for (const side of [1, -1]) {
        const x0 = ax + ux * along
        const z0 = az + uz * along
        // A gap in the row: a field, a yard, somewhere nobody built. Commoner the further out it is.
        if (rng.next() > 0.2 + 0.7 * settled) {
          if (rng.next() < 0.25)
            plant(x0, z0, ux, uz, side, rng, trees)
          continue
        }

        const bigger = rng.next() < LARGER_SHARE * (0.4 + settled)
        const width = bigger ? rng.between(17, 26) : rng.between(HOUSE_MIN, HOUSE_MAX)
        const depth = bigger ? rng.between(13, 19) : rng.between(DEPTH_MIN, DEPTH_MAX)
        const offset = (LANE_MAX / 2 + SETBACK + depth / 2) * side
        const x = x0 - uz * offset + rng.between(-2, 2)
        const z = z0 + ux * offset + rng.between(-2, 2)
        if (Math.abs(x) < EXTRACT_HALF && Math.abs(z) < EXTRACT_HALF)
          continue

        // Square to the lane, give or take the way a plot is never quite square to it.
        const rotation = facing + (side > 0 ? 0 : Math.PI) + rng.between(-0.05, 0.05)
        const footprint = rectangle(x, z, width, depth, rotation)

        /*
         * Only where the land is flat enough to build on. A building stands on the highest ground its
         * outline covers, so on a steep plot the downhill end would be standing on a wall of base
         * course — and nobody builds there either: a village sits on the flat between the hills.
         */
        let lowest = Infinity
        let highest = -Infinity
        for (let corner = 0; corner < footprint.length; corner += 2) {
          const ground = relief.height(footprint[corner]!, footprint[corner + 1]!)
          lowest = Math.min(lowest, ground)
          highest = Math.max(highest, ground)
        }
        if (highest - lowest > BUILDABLE_SLOPE)
          continue

        // And not on top of something already standing there. See `taken`.
        const radius = Math.max(width, depth) / 2
        if (occupied(taken, x, z, radius))
          continue
        claimPlot(taken, x, z, radius)

        /*
         * The same massing the converter gives the real city: storeys are walls and the roof goes on
         * top of them. Out here that is one or two storeys, which is what a suburb is.
         */
        const storeys = bigger ? (rng.next() > 0.5 ? 2 : 3) : (rng.next() > 0.72 ? 2 : 1)
        const wall = storeys * STOREY + BASE
        /*
         * A roof is a roof and not most of the house. A bungalow's walls are four metres, so a
         * three-and-a-half-metre ridge on top of them is a tent — the exact shape that made the rest
         * of the city look sunk before the converter stopped subtracting the roof twice.
         */
        const roofHeight = rng.next() > 0.14 ? Math.min(rng.between(2.6, 3.6), wall * 0.6) : 0
        buildings.push({
          id: `o-${buildings.length.toString(36)}`,
          districtId: districtAt(x, z),
          type: roofHeight > 0.4 ? 'residential' : bigger ? 'industrial' : 'residential',
          x: round(x),
          z: round(z),
          width: round(width),
          depth: round(depth),
          height: round(wall + roofHeight),
          rotation,
          condition: rng.between(0.7, 0.99),
          occupancy: rng.between(0.8, 0.99),
          footprint,
          roofHeight: round(roofHeight),
        })

        if (rng.next() < TREE_SHARE)
          plant(x0, z0, ux, uz, side, rng, trees)
      }
    }
    carried = (carried + span) % PLOT
    travelled += span
  }
}

/** Cell pitch for the "is anything already here" grid. Wider than any house this file builds. */
const PLOT_CELL = 32

function plotKey(x: number, z: number): number {
  return Math.round(x / PLOT_CELL) * 100_000 + Math.round(z / PLOT_CELL)
}

/** Whether a house of this size would stand in one already built. */
function occupied(taken: Map<number, { x: number, z: number, radius: number }[]>, x: number, z: number, radius: number): boolean {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (const other of taken.get(plotKey(x + dx * PLOT_CELL, z + dz * PLOT_CELL)) ?? []) {
        if (Math.hypot(other.x - x, other.z - z) < (other.radius + radius) * 0.9)
          return true
      }
    }
  }
  return false
}

function claimPlot(taken: Map<number, { x: number, z: number, radius: number }[]>, x: number, z: number, radius: number): void {
  const key = plotKey(x, z)
  const bucket = taken.get(key)
  const plot = { x, z, radius }
  if (bucket)
    bucket.push(plot)
  else taken.set(key, [plot])
}

/** How far a place's houses reach down the lanes leaving it, in metres. */
function reachOf(place: Place): number {
  return place.gate ? 0 : 90 + place.weight * 620
}

function pathLength(path: number[]): number {
  let total = 0
  for (let i = 1; i < path.length / 2; i += 1)
    total += Math.hypot(path[i * 2]! - path[(i - 1) * 2]!, path[i * 2 + 1]! - path[(i - 1) * 2 + 1]!)
  return total
}

/**
 * Woods in the open country.
 *
 * Without them the land between the villages is a lawn, which from the air is the flattest, emptiest
 * green there is. A wood is the cheapest thing that breaks it up: the trees are already instanced,
 * so seventy clumps cost seventy times nothing and give the country somewhere for the eye to stop.
 * Kept well away from the places, because a wood in a village is a park and this is not one.
 */
/**
 * Wallhecken auf die Feldgrenzen.
 *
 * Abgetastet wird das offene Land in einem Raster von `KNICK_STEP`; `fieldAt` sagt für jeden Punkt,
 * wie weit er vom Rand seines Schlages entfernt ist, und wo er dicht genug daran steht, kommt ein
 * Gehölz hin. Dass nur gut die Hälfte der Grenzen einen trägt, entscheidet ein Hash über die
 * Zellenmitte — damit bleibt ein Knick über seine ganze Länge ein Knick und flackert nicht.
 *
 * Klein gehalten: das hier sind Hecken und keine Alleen. Der Maßstab kommt aus `scale`, und die
 * Baumarten sind ohnehin instanziert — es kostet Dreiecke, keinen Draw.
 */
function layKnicks(rng: Stream, relief: Relief, seed: number, places: Place[], trees: TreeRecord[]): void {
  for (let x = -COUNTRY_REACH; x <= COUNTRY_REACH; x += KNICK_STEP) {
    for (let z = -COUNTRY_REACH; z <= COUNTRY_REACH; z += KNICK_STEP) {
      if (Math.hypot(x, z) > COUNTRY_REACH)
        continue
      // Nie im echten Grundriss, und nie mitten in einem Dorf.
      if (Math.abs(x) < EXTRACT_HALF + 160 && Math.abs(z) < EXTRACT_HALF + 160)
        continue
      const { edge } = fieldAt(x, z, seed)
      if (edge > KNICK_EDGE)
        continue
      if (places.some(place => Math.hypot(place.x - x, place.z - z) < 150))
        continue
      if (relief.height(x, z) < 0.6)
        continue
      /*
       * Ob diese Grenze überhaupt eine Hecke trägt, entscheidet der Schlag und nicht der Punkt —
       * sonst zerfällt ein Knick in eine gepunktete Linie.
       */
      if (hedgeAt(x, z, seed) > KNICK_SHARE)
        continue
      trees.push({
        id: `o-knick-${trees.length.toString(36)}`,
        x: round(x + rng.between(-4, 4)),
        z: round(z + rng.between(-4, 4)),
        scale: rng.between(0.34, 0.66),
        hedge: true,
      })
    }
  }
}

/** Ob auf dieser Feldgrenze eine Hecke steht. Über den Schlag gehasht, damit sie durchgehend ist. */
function hedgeAt(x: number, z: number, seed: number): number {
  const cell = Math.floor(x / 240) * 7919 + Math.floor(z / 240) * 104_729 + seed
  const wobble = Math.sin(cell * 12.9898) * 43_758.5453
  return wobble - Math.floor(wobble)
}

function scatterWoods(rng: Stream, relief: Relief, places: Place[], trees: TreeRecord[]): void {
  for (let wood = 0; wood < WOOD_COUNT; wood += 1) {
    const angle = rng.next() * Math.PI * 2
    const radius = EXTRACT_HALF + 400 + rng.next() ** 0.6 * (COUNTRY_REACH - EXTRACT_HALF - 400)
    const centreX = Math.cos(angle) * radius
    const centreZ = Math.sin(angle) * radius
    if (Math.abs(centreX) < EXTRACT_HALF + 200 && Math.abs(centreZ) < EXTRACT_HALF + 200)
      continue
    if (places.some(place => Math.hypot(place.x - centreX, place.z - centreZ) < 260))
      continue

    const spread = WOOD_SPREAD * rng.between(0.6, 1.6)
    /*
     * Ein Wald ist kein Kreis.
     *
     * Er war einer: gleichverteilt über eine Kreisfläche, und aus der Höhe lagen dann fünf runde
     * Scheiben auf der Ebene, die sofort als gezeichnet auffielen. Ein gewachsener Bestand folgt dem
     * Hang, der Feldgrenze und dem Graben — er hat Buchten und Zungen, und genau daran erkennt man
     * ihn. Drei überlagerte Wellen über den Winkel geben ihm die: eine breite für die Grundform, zwei
     * schmalere für die Ränder. Kostet drei Kosinus je Baum, einmal beim Aufbau.
     */
    const lobes = 2 + Math.floor(rng.next() * 3)
    const twist = rng.next() * Math.PI * 2
    const outline = (bearing: number): number =>
      0.62
      + 0.3 * Math.cos(bearing * lobes + twist)
      + 0.14 * Math.cos(bearing * (lobes * 2 + 1) - twist * 1.7)
      + 0.1 * Math.cos(bearing * 7 + twist * 0.4)
    for (let tree = 0; tree < WOOD_TREES; tree += 1) {
      /*
       * Gleichverteilt in der Fläche statt zur Mitte hin verdichtet.
       *
       * `sqrt` streut gleichmäßig über die Kreisfläche; vorher stand hier dasselbe, nur mit so
       * wenigen Bäumen, dass davon nichts zu sehen war. Ein Bestand ist innen so dicht wie außen —
       * was ihn als Wald lesbar macht, ist nicht der Verlauf zur Mitte, sondern die Kante.
       */
      const bearing = rng.next() * Math.PI * 2
      const away = Math.sqrt(rng.next()) * spread * Math.max(0.25, outline(bearing))
      const x = centreX + Math.cos(bearing) * away
      const z = centreZ + Math.sin(bearing) * away
      if (relief.height(x, z) < 0.8)
        continue
      trees.push({
        id: `o-wood-${trees.length.toString(36)}`,
        x: round(x),
        z: round(z),
        scale: rng.between(0.85, 1.5),
      })
    }
  }
}

/** A tree on the verge, between the lane and whatever stands behind it. */
function plant(
  x: number,
  z: number,
  ux: number,
  uz: number,
  side: number,
  rng: Stream,
  trees: TreeRecord[],
): void {
  const offset = rng.between(4, SETBACK) * side
  trees.push({
    id: `o-tree-${trees.length.toString(36)}`,
    x: round(x - uz * offset + rng.between(-5, 5)),
    z: round(z + ux * offset + rng.between(-5, 5)),
    scale: rng.between(0.7, 1.35),
  })
}

/** The four corners of a plot, wound the way every other footprint in the city is. */
function rectangle(x: number, z: number, width: number, depth: number, angle: number): number[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const ring: number[] = []
  for (const [ox, oz] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]])
    ring.push(round(x + ox! * cos - oz! * sin), round(z + ox! * sin + oz! * cos))
  return ring
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
