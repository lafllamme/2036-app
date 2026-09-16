import type { BuildingRecord } from '../../../core/contracts'
import type { Trade } from '../../../world/tenancy'
import type { ShopSeat } from './buildings'
import * as THREE from 'three/webgpu'
import { tenancyAt } from '../../../world/tenancy'
import { addTiled } from '../tiledInstances'

/**
 * Die Schilder über den Ladentüren.
 *
 * Seit `world/tenancy.ts` hat jedes Erdgeschoss eine Nutzung — aber nur, wenn man das Haus anklickt.
 * Eine Stadt, in der man ein Gebäude anfassen muss, um zu erfahren, dass dort ein Bäcker ist, hat
 * keine Läden, sondern eine Datenbank. Das Schild ist der Unterschied zwischen beidem.
 *
 * ## Warum Instanzen und keine Kachelgeometrie
 *
 * Was im Erdgeschoss ist, hängt am Einzelhandelsbestand und **ändert sich über die Amtszeit**. In
 * die Fassadenkachel gebacken wäre ein Schild für immer festgelegt; als Instanz ist es eine Matrix
 * und eine Farbe, und beides lässt sich jeden Monat neu setzen. Zumachen heißt dann: die Farbe geht
 * von der Ladenfarbe auf ein stumpfes Grau, so wie ein Schild aussieht, an dem seit zwei Jahren
 * niemand mehr etwas ausgewechselt hat.
 *
 * Gekachelt aus demselben Grund wie die Bäume: eine Hüllkugel über die ganze Stadt schneidet den
 * Sichtkegel immer, und dann zahlt man jedes Schild in jedem Bild. Gemessen hat genau das bei der
 * Bepflanzung ein Drittel des Bildes gekostet.
 */

/** Maße eines Ladenschilds über einem Türsturz. */
const BOARD_WIDTH = 2.3
const BOARD_HEIGHT = 0.52
const BOARD_DEPTH = 0.1
/** Wie weit es von der Fassade absteht. Genug für eine eigene Schattenkante. */
const BOARD_PROUD = 0.13

/**
 * Die Farben, in denen Ladenschilder gestrichen werden.
 *
 * Nach Art des Geschäfts und nicht als Schlüssel: niemand soll aus der Farbe die Branche ablesen
 * können, sie soll nur plausibel sein. Eine Apotheke ist rot, eine Kita bunt, eine Kanzlei
 * zurückhaltend — das sind Konventionen, keine Kodierung.
 */
const PAINT: Record<Trade, string> = {
  bakery: '#8a5a2b',
  butcher: '#7d2f2a',
  greengrocer: '#4f6b32',
  kiosk: '#2f5d7c',
  snack: '#a4642a',
  cafe: '#5c4432',
  hairdresser: '#4a3b5e',
  beauty: '#7a4a5c',
  laundry: '#3f6474',
  tailor: '#54514a',
  pharmacy: '#a33226',
  doctor: '#2e6a6b',
  physio: '#3a6f5a',
  optician: '#33506e',
  books: '#5a4a34',
  flowers: '#6b4370',
  bicycles: '#2d6152',
  hardware: '#5f5a4e',
  bank: '#3a4a63',
  insurance: '#414e5c',
  lawyer: '#3c3f48',
  estate: '#55504a',
  nursery: '#c07a2c',
  workshop: '#4e4a44',
  brewery: '#6d4a24',
}

/** Ein Schild, an dem seit Jahren niemand mehr etwas ausgewechselt hat. */
const CLOSED = '#3c3d3b'

export interface Shopfronts {
  meshes: THREE.InstancedMesh[]
  /** Je Instanz: welches Haus, in welchem Mesh, an welcher Stelle. Für das monatliche Umfärben. */
  seats: { record: BuildingRecord, mesh: THREE.InstancedMesh, at: number }[]
}

export function addShopfronts(
  scene: THREE.Scene,
  seats: (ShopSeat & { record: BuildingRecord })[],
  seed: number,
): Shopfronts {
  /*
   * Gebaut wird für **volle Vitalität**, also für jedes Haus, das überhaupt eine Ladenzeile hat.
   * Welche davon offen sind, entscheidet später `fitShopfronts` über die Farbe — Geometrie, die je
   * nach Haushaltslage entsteht und vergeht, wäre ein Neuaufbau je Monat.
   */
  const placements: { matrix: THREE.Matrix4, colour: THREE.Color, record: BuildingRecord }[] = []
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)

  for (const seat of seats) {
    if (!tenancyAt(seat.record, seed, 1))
      continue
    // Die Drehung aus der Wandrichtung: das Brett liegt längs der Wand und schaut nach außen.
    quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(seat.nx, seat.nz), 0))
    position.set(
      seat.x + seat.nx * BOARD_PROUD,
      seat.y,
      seat.z + seat.nz * BOARD_PROUD,
    )
    placements.push({
      matrix: new THREE.Matrix4().copy(matrix.compose(position, quaternion, scale)),
      colour: new THREE.Color(CLOSED),
      record: seat.record,
    })
  }

  if (placements.length === 0)
    return { meshes: [], seats: [] }

  const material = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.82, metalness: 0.03 })
  const tiled = addTiled(scene, board(), material, placements, (mesh) => {
    mesh.castShadow = false
    mesh.receiveShadow = true
  })

  // Die Zuordnung Instanz → Haus kommt aus `addTiled` zurück, statt hier nachgebaut zu werden.
  const registry: Shopfronts['seats'] = []
  tiled.buckets.forEach((bucket, tile) => {
    const mesh = tiled.meshes[tile]
    if (!mesh)
      return
    bucket.forEach((entry, at) => registry.push({ record: entry.record, mesh, at }))
  })

  return { meshes: tiled.meshes, seats: registry }
}

/**
 * Wer heute offen hat.
 *
 * Läuft, wenn sich der Einzelhandelsbestand geändert hat, und sonst nicht — das ist einmal im Monat
 * und nicht je Bild. Zwölftausend Farben zu setzen kostet dort nichts.
 */
export function fitShopfronts(shopfronts: Shopfronts, seed: number, vitality: number): void {
  const colour = new THREE.Color()
  const touched = new Set<THREE.InstancedMesh>()

  for (const seat of shopfronts.seats) {
    const tenancy = tenancyAt(seat.record, seed, vitality)
    colour.set(tenancy?.open ? PAINT[tenancy.trade] : CLOSED)
    seat.mesh.setColorAt(seat.at, colour)
    touched.add(seat.mesh)
  }

  for (const mesh of touched) {
    if (mesh.instanceColor)
      mesh.instanceColor.needsUpdate = true
  }
}

/**
 * Ein Brett über der Tür: zwölf Dreiecke.
 *
 * Kein Ausleger, kein Rahmen, keine Schrift. Aus Augenhöhe auf der Straße ist ein Ladenschild ein
 * farbiges Rechteck über einer Tür, und alles darüber hinaus wäre Geometrie für eine Entfernung, in
 * der ohnehin niemand steht.
 */
function board(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_DEPTH)
  geometry.deleteAttribute('uv')
  return geometry
}
