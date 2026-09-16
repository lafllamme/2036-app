import type { BuildingRecord, CityBlueprint } from '../../../core/contracts'
import type { CityModels } from '../../cityModels'
import type { StandardInstancedMesh } from '../../shared'
import * as THREE from 'three/webgpu'
import { fieldAt } from '../../../world/terrain'
import { AXIS_Y } from '../../shared'
import { WATER_LEVEL } from './water'

/**
 * Was auf einer Wiese steht, wenn man nah genug dran ist.
 *
 * Die Feldflur hat jetzt Schläge, Ränder und Knicks, und aus zweitausend Metern liest sie sich als
 * Landschaft. Aus fünfzig Metern ist sie **eine gefärbte Ebene** — Gras ist dort eine Textur und
 * kein Bewuchs, und nichts steht darauf. Genau da läuft der Spieler entlang, wenn er einem Einsatz
 * folgt oder sich ein Haus ansieht.
 *
 * Bodendecke ist aber das Zahlreichste, was es überhaupt gibt: ein Büschel je zehn Meter über das
 * offene Land wären zweihunderttausend Stück. Der einzige Grund, aus dem das trotzdem geht, ist,
 * dass **niemand sie aus der Ferne sieht** — und deshalb hat diese Schicht als einzige eine
 * Sichtweite und wandert mit der Kamera mit.
 *
 * Gebaut wie ein Fahrzeugpark: eine feste Zahl Instanzen, die immer wieder neu gesetzt werden. Was
 * hinter dem Rücken der Kamera liegt, wird vorn wieder aufgestellt. Die Zahl der gezeichneten
 * Büschel ist damit **konstant**, ganz gleich wie groß die Karte ist — und das ist der Unterschied
 * zwischen einer Wiese und einem Speicherleck.
 */

/**
 * Wie weit die Bodendecke reicht, und wie dicht sie steht.
 *
 * Die Büschel sitzen auf einem verwackelten Raster und nicht auf gewürfelten Punkten. Das klingt
 * nach weniger, ist aber der ganze Trick: ein Punkt, der aus seiner Zelle kommt, ist **an den Boden
 * gebunden**. Gewürfelt aus einem Strom heraus wäre er an die Kamera gebunden — bei jeder
 * Neuverteilung stünde dasselbe Muster wieder um den Spieler herum, und die Wiese liefe mit ihm mit
 * wie ein Teppich. Ein Raster mit Zellversatz aus der Zellnummer steht dagegen still.
 */
const COVER_RANGE = 130
const COVER_STEP = 3
/** Grob die Zahl der Zellen in der Scheibe. */
const COVER_COUNT = Math.ceil((Math.PI * COVER_RANGE * COVER_RANGE) / (COVER_STEP * COVER_STEP))
/** Wie hoch ein Büschel steht. Rasen, nicht Schilf. */
const COVER_HEIGHT = 0.38
/**
 * Wie stark die Kitfarbe an den Boden angeglichen wird.
 *
 * Der Boden ist eine gemessene Feldfarbe in linearem Raum — Grünland liegt bei etwa 0,09/0,12/0,06.
 * Das Kit liefert seine Halme fünfmal so hell, und aufgestellt saßen sie als blasse Plättchen auf
 * einer dunklen Fläche statt als Bewuchs darin. Angeglichen bleiben sie ein Stück heller als der
 * Boden — ein Halm fängt mehr Licht als die Krume —, aber im selben Wertebereich.
 */
const COVER_TONE = 0.3
/**
 * Wie oft eine Art vorkommt.
 *
 * Zwei Gründe, und beide zählen. Gleichverteilt wäre erstens jeder fünfte Halm eine Blüte, und eine
 * Wiese, die zu vierzig Prozent aus Blumen besteht, liest als Zierbeet — Blumen sind der Akzent,
 * Gras ist die Fläche.
 *
 * Zweitens kosten die fünf Modelle **nicht dasselbe**: gemessen 36 Dreiecke für `grass_leafs`, 132
 * für `grass` und 224 für `grass_large`. Gleichverteilt lagen damit 600.000 Dreiecke in der
 * Bodendecke, bei einem Bild von einer Million auf dem Land. Zwei Grasbüschel unterscheidet auf
 * fünfzehn Metern niemand, ihre Dreieckszahl schon — also steht überwiegend das billige da, und die
 * teuren sind die Abwechslung darin.
 */
const COVER_WEIGHT: Record<string, number> = {
  grass_leafs: 20,
  grass: 5,
  grass_large: 2,
  flower_yellowA: 1,
  flower_purpleA: 1,
}
const COVER_WEIGHT_DEFAULT = 4
/** Erst neu verteilen, wenn die Kamera so weit gewandert ist. Sonst rechnet es jeden Frame umsonst. */
const RESEED_AFTER = 60
/** Nicht auf den Feldrand, wo schon die Knicks stehen. */
const FIELD_EDGE_CLEAR = 0.1
/** Auf dem Wasser wächst nichts, und am Ufer auch nicht. */
const DRY_ENOUGH = WATER_LEVEL + 0.15

/*
 * Wo nichts wachsen darf, als Raster.
 *
 * Gras auf der Fahrbahn und Gras im Wohnzimmer sind beides Fehler, die man sofort sieht. Die Probe
 * dagegen muss ein paar tausend Mal je Neuverteilung laufen, und über alle Straßen und Häuser zu
 * iterieren wäre dafür zwanzigtausend Mal zu langsam. Also wird einmal beim Aufbau ein grobes
 * Belegungsraster gestempelt — ein Byte je acht Meter — und die Probe ist danach ein Feldzugriff.
 *
 * Das Raster spannt nur über das, was **gebaut** ist, und nicht über die ganze Karte. Eine feste
 * Kantenlänge war der erste Versuch und ein Fehler: die Landstraßen reichen weiter hinaus, als die
 * Zahl geraten hatte, und draußen las jede Probe als „nicht im Raster“ — gemessen 2.629 von 2.629,
 * also genau dort keine Wiese, wo Wiese hingehört. Außerhalb der Grenzen steht nichts, und was dort
 * nicht steht, sperrt auch nichts.
 */
const CELL = 8
/** Etwas Luft um Fahrbahnkanten und Hauswände, damit kein Halm in der Bordsteinfuge steht. */
const ROAD_MARGIN = 2.5
const BUILDING_MARGIN = 1.5

export interface Meadow {
  meshes: StandardInstancedMesh[]
  /** Wo die Kamera stand, als zuletzt verteilt wurde. */
  anchor: THREE.Vector3
  seeded: boolean
  /** Ein Byte je `CELL`-Quadrat: gesetzt heißt Straße oder Haus. */
  hard: HardGrid
  /** Die Arten, so oft wiederholt, wie sie vorkommen sollen. Eine Ziehung daraus ist die Gewichtung. */
  lottery: number[]
}

/**
 * Eine Zufallszahl, die an einer Zelle klebt.
 *
 * Kein Strom, sondern eine Funktion: dieselbe Zelle liefert immer dieselben Zahlen, ganz gleich wann
 * und aus welcher Richtung man sie besucht. Genau das hält die Wiese still, während die Kamera
 * darüber wandert. `run` trennt Versatz, Art, Drehung und Größe voneinander.
 */
function jitter(ix: number, iz: number, run: number): number {
  let h = Math.imul(ix, 0x27D4EB2D) ^ Math.imul(iz, 0x165667B1) ^ Math.imul(run, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000
}

interface HardGrid {
  cells: Uint8Array
  minX: number
  minZ: number
  span: number
}

function cellOf(grid: HardGrid, x: number, z: number): number {
  const ix = Math.floor((x - grid.minX) / CELL)
  const iz = Math.floor((z - grid.minZ) / CELL)
  if (ix < 0 || iz < 0 || ix >= grid.span || iz >= grid.span)
    return -1
  return iz * grid.span + ix
}

/** Der Mittelpunkt einer Zelle, um die Probe gegen den echten Radius zu führen statt gegen ihren Kasten. */
function centreOf(grid: HardGrid, value: number, minimum: number, step: number): number {
  return (Math.floor((value - minimum) / CELL) + step + 0.5) * CELL + minimum
}

/**
 * Ein Kreis um einen Punkt, in Zellen.
 *
 * Geprüft wird der Zellmittelpunkt gegen den echten Radius und nicht der Kasten um ihn herum. Der
 * Unterschied ist nicht kosmetisch: eine acht Meter breite Straße hat einen Radius von sechseinhalb
 * Metern, und als Kasten gestempelt legt sie ein Drei-mal-drei-Feld um sich — vierundzwanzig Meter
 * Sperrzone für eine Anliegerstraße. Gemessen blieben so in der Innenstadt von 2.629 Proben 2.620
 * hängen, und die Wiese hatte nirgends Platz.
 */
function stampDisc(grid: HardGrid, x: number, z: number, radius: number): void {
  const reach = Math.ceil(radius / CELL)
  for (let dz = -reach; dz <= reach; dz += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const cx = centreOf(grid, x, grid.minX, dx)
      const cz = centreOf(grid, z, grid.minZ, dz)
      if ((cx - x) ** 2 + (cz - z) ** 2 > radius * radius)
        continue
      const cell = cellOf(grid, cx, cz)
      if (cell >= 0)
        grid.cells[cell] = 1
    }
  }
}

/** Der Grundriss eines Hauses, gedreht. Ein Reihenhaus ist lang und schmal, keine Scheibe. */
function stampBox(grid: HardGrid, building: BuildingRecord): void {
  const halfX = building.width / 2 + BUILDING_MARGIN
  const halfZ = building.depth / 2 + BUILDING_MARGIN
  const reach = Math.ceil(Math.hypot(halfX, halfZ) / CELL)
  const cos = Math.cos(-building.rotation)
  const sin = Math.sin(-building.rotation)

  for (let dz = -reach; dz <= reach; dz += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const cx = centreOf(grid, building.x, grid.minX, dx)
      const cz = centreOf(grid, building.z, grid.minZ, dz)
      const ox = cx - building.x
      const oz = cz - building.z
      if (Math.abs(ox * cos - oz * sin) > halfX || Math.abs(ox * sin + oz * cos) > halfZ)
        continue
      const cell = cellOf(grid, cx, cz)
      if (cell >= 0)
        grid.cells[cell] = 1
    }
  }
}

/**
 * Straßen und Häuser einmal ins Raster stempeln.
 *
 * Straßen werden entlang ihrer Stützpunkte abgeschritten statt nur an ihnen gestempelt: eine
 * Landstraße hat Stützpunkte im Abstand von dreißig Metern, und dazwischen wäre sonst Wiese.
 */
function hardSurfaces(blueprint: CityBlueprint): HardGrid {
  const roads = [...blueprint.roads, ...blueprint.rails]
  const buildings = [...blueprint.buildings, ...blueprint.growthSlots]

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  const see = (x: number, z: number): void => {
    low = Math.min(low, x, z)
    high = Math.max(high, x, z)
  }
  for (const road of roads) {
    for (let i = 0; i + 1 < road.path.length; i += 2)
      see(road.path[i]!, road.path[i + 1]!)
  }
  for (const building of buildings)
    see(building.x, building.z)

  if (low > high)
    return { cells: new Uint8Array(0), minX: 0, minZ: 0, span: 0 }

  // Ein quadratisches Raster mit etwas Rand: die Stempel greifen über ihren Mittelpunkt hinaus.
  const minX = low - 60
  const span = Math.ceil((high - low + 120) / CELL)
  const grid: HardGrid = { cells: new Uint8Array(span * span), minX, minZ: minX, span }

  for (const road of roads) {
    const radius = road.width / 2 + ROAD_MARGIN
    for (let i = 0; i + 3 < road.path.length; i += 2) {
      const ax = road.path[i]!
      const az = road.path[i + 1]!
      const bx = road.path[i + 2]!
      const bz = road.path[i + 3]!
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / CELL))
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        stampDisc(grid, ax + (bx - ax) * t, az + (bz - az) * t, radius)
      }
    }
  }

  for (const building of buildings)
    stampBox(grid, building)

  return grid
}

/** Die Eckfarben eines Modells an den Boden angleichen. Siehe `COVER_TONE`. */
function tone(geometry: THREE.BufferGeometry): void {
  const colour = geometry.getAttribute('color')
  if (!colour)
    return
  for (let i = 0; i < colour.count; i += 1) {
    colour.setXYZ(i, colour.getX(i) * COVER_TONE, colour.getY(i) * COVER_TONE, colour.getZ(i) * COVER_TONE)
  }
  colour.needsUpdate = true
}

export function addMeadow(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): Meadow {
  const pool = models.groundCover
  const meshes: StandardInstancedMesh[] = []
  if (pool.length === 0)
    return { meshes, lottery: [], anchor: new THREE.Vector3(), seeded: false, hard: { cells: new Uint8Array(0), minX: 0, minZ: 0, span: 0 } }

  const material = models.natureMaterial.clone()
  material.vertexColors = true
  const weights = pool.map(model => COVER_WEIGHT[model.id] ?? COVER_WEIGHT_DEFAULT)
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  for (const [index, model] of pool.entries()) {
    const geometry = model.geometry.clone()
    // Auf eine Höhe ziehen, die als Bewuchs und nicht als Strauch liest.
    const wanted = COVER_HEIGHT / Math.max(0.001, model.size.y)
    geometry.scale(wanted, wanted, wanted)
    tone(geometry)
    // Ein Drittel Luft: der Hash trifft seinen Anteil nicht auf die Instanz genau.
    const share = Math.ceil((COVER_COUNT * weights[index]! / total) * 1.35)
    const mesh = new THREE.InstancedMesh(geometry, material, share) as StandardInstancedMesh
    mesh.count = 0
    mesh.castShadow = false
    mesh.receiveShadow = false
    /*
     * Nie weggeschnitten: die Instanzen sitzen immer um die Kamera herum, und eine Hüllkugel, die
     * jeden Frame neu berechnet werden müsste, kostet mehr als sie spart.
     */
    mesh.frustumCulled = false
    scene.add(mesh)
    meshes.push(mesh)
  }

  return {
    meshes,
    lottery: weights.flatMap((weight, index) => Array.from({ length: weight }).fill(index)),
    anchor: new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0),
    seeded: false,
    hard: hardSurfaces(blueprint),
  }
}

/**
 * Die Büschel um den Blickpunkt herum neu aufstellen.
 *
 * Nur, wenn die Kamera weit genug gewandert ist — sonst wäre das eine vollständige Neuverteilung je
 * Frame für ein Bild, das sich nicht geändert hat. Und nur bis `COVER_RANGE`, weil ein Grasbüschel
 * auf zweihundert Metern kein Pixel mehr trifft.
 */
export function updateMeadow(meadow: Meadow, blueprint: CityBlueprint, focus: THREE.Vector3, cameraDistance: number): void {
  if (meadow.meshes.length === 0)
    return

  // Aus der Höhe sieht man keine Halme, also stehen dann auch keine da.
  if (cameraDistance > COVER_RANGE * 3.2) {
    for (const mesh of meadow.meshes) mesh.count = 0
    meadow.seeded = false
    return
  }

  if (meadow.seeded && focus.distanceTo(meadow.anchor) < RESEED_AFTER)
    return

  const relief = blueprint.relief
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const placed = meadow.meshes.map(() => 0)

  const reach = Math.ceil(COVER_RANGE / COVER_STEP)
  const centreX = Math.round(focus.x / COVER_STEP)
  const centreZ = Math.round(focus.z / COVER_STEP)

  for (let dz = -reach; dz <= reach; dz += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      if (dx * dx + dz * dz > reach * reach)
        continue
      const ix = centreX + dx
      const iz = centreZ + dz
      const x = (ix + jitter(ix, iz, 1) - 0.5) * COVER_STEP
      const z = (iz + jitter(ix, iz, 2) - 0.5) * COVER_STEP

      // Nicht auf der Fahrbahn und nicht im Haus. Außerhalb des Rasters steht nichts im Weg.
      const cell = cellOf(meadow.hard, x, z)
      if (cell >= 0 && meadow.hard.cells[cell] === 1)
        continue
      // Nicht auf dem Feldrand, wo die Knicks stehen.
      if (fieldAt(x, z, blueprint.definition.seed).edge < FIELD_EDGE_CLEAR)
        continue
      const ground = relief.height(x, z)
      if (ground < DRY_ENOUGH)
        continue

      const which = meadow.lottery[Math.min(meadow.lottery.length - 1, Math.floor(jitter(ix, iz, 3) * meadow.lottery.length))]!
      const mesh = meadow.meshes[which]!
      const slot = placed[which]!
      if (slot >= mesh.instanceMatrix.count)
        continue

      const size = 0.7 + jitter(ix, iz, 4) * 0.6
      quaternion.setFromAxisAngle(AXIS_Y, jitter(ix, iz, 5) * Math.PI * 2)
      scale.setScalar(size)
      matrix.compose(position.set(x, ground, z), quaternion, scale)
      mesh.setMatrixAt(slot, matrix)
      placed[which] = slot + 1
    }
  }

  meadow.meshes.forEach((mesh, index) => {
    mesh.count = placed[index]!
    mesh.instanceMatrix.needsUpdate = true
  })
  meadow.anchor.copy(focus)
  meadow.seeded = true
}
