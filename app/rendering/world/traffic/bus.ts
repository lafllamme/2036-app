import type { CityModel } from '../../cityModels'
import * as THREE from 'three/webgpu'

/**
 * Der Stadtbus — und warum er hier steht und nicht im Kit.
 *
 * Es gibt in keinem der vier Kits einen Bus. Das Fahrzeugkit hält dreizehn Modelle, von der Limousine
 * bis zum Müllwagen, und jedes einzelne ist bereits in Gebrauch; ein Bus ist nicht darunter. Für die
 * Schiffe stand dieselbe Frage und bekam dieselbe Antwort — `transit/ships.ts` baut seinen Rumpf
 * selbst —, und das ist auch hier die bessere: ein zugekauftes Modell aus einer anderen Hand trifft
 * den Stil nicht, und dieser Stil ist so einfach, dass er sich nachbauen lässt.
 *
 * Ein Gelenkbus ist aus fünfzig Metern ein langer Kasten mit abgesetztem Dach, einem dunklen
 * Fensterband und vier Rädern. Genau das steht hier: **90 Dreiecke**, Vertexfarben statt Textur, ein
 * einziges Mesh — und damit wird er von derselben Flottenmechanik gefahren wie jedes Auto, ohne ein
 * zusätzliches Material und ohne einen zusätzlichen Draw.
 *
 * Er ist außerdem das sichtbarste Politikergebnis, das die Straße hergibt. Ein Bus ist doppelt so
 * lang wie ein Auto und trägt eine Farbe, die sonst niemand fährt: ob die Stadt Nahverkehr bestellt
 * hat oder nicht, sieht man an ihm noch aus der Überblickskamera.
 */

/** Maße eines Gelenkbusses in Metern — und die Farben, aus denen er besteht. */
const LENGTH = 11.6
const WIDTH = 2.55
const HEIGHT = 2.5
const WHEEL = 0.5
/** Das Fensterband: wie hoch es sitzt und wie hoch es ist. */
const GLASS_FOOT = 1.25
const GLASS_HEIGHT = 0.78
/*
 * Drei Linienfarben, nicht vier.
 *
 * Jede Farbe ist eine eigene Instanz und damit ein eigener Draw. Vier waren gemessen vier Draws für
 * vier sichtbare Busse — ein Draw je Fahrzeug ist genau das, was Instanzierung vermeiden soll. Drei
 * reichen, damit nicht die ganze Stadt dieselbe Linie fährt, und teilen sich die Flotte zu je einem
 * Drittel.
 */
const LIVERY = ['#1f6f4f', '#2a5f8c', '#c8a23c']
const GLASS = '#2e3a41'
const ROOF = '#d8d6cf'
const TYRE = '#26262a'

/**
 * Ein Bus als Modell, wie ihn die Flotte erwartet.
 *
 * `livery` wählt die Hausfarbe. Vier Linienfarben, damit nicht jeder Bus der Stadt derselbe ist —
 * derselbe Grund, aus dem die Häuser nicht alle dieselbe Wand haben.
 */
export function busModels(): CityModel[] {
  return LIVERY.map((paint, index) => {
    const geometry = body(paint)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox ?? new THREE.Box3()
    const size = new THREE.Vector3()
    box.getSize(size)
    return {
      id: `bus-${index}`,
      geometry,
      size,
      slenderness: size.y / Math.max(size.x, size.z),
    }
  })
}

/** Kasten, Dach, Fensterband, vier Räder — verschmolzen zu einem Mesh mit Vertexfarben. */
function body(paint: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const add = (geometry: THREE.BufferGeometry, colour: string, x: number, y: number, z: number): void => {
    geometry.translate(x, y, z)
    const shade = new THREE.Color(colour)
    const count = geometry.attributes.position!.count
    const colours = new Float32Array(count * 3)
    for (let vertex = 0; vertex < count; vertex += 1) {
      colours[vertex * 3] = shade.r
      colours[vertex * 3 + 1] = shade.g
      colours[vertex * 3 + 2] = shade.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    parts.push(geometry)
  }

  // Der Wagenkasten, in zwei Bändern: unter dem Fenster die Hausfarbe, darüber ebenfalls.
  add(new THREE.BoxGeometry(WIDTH, GLASS_FOOT - WHEEL * 0.5, LENGTH), paint, 0, WHEEL + (GLASS_FOOT - WHEEL * 0.5) / 2, 0)
  add(new THREE.BoxGeometry(WIDTH, HEIGHT - GLASS_FOOT - GLASS_HEIGHT, LENGTH), paint, 0, GLASS_FOOT + GLASS_HEIGHT + (HEIGHT - GLASS_FOOT - GLASS_HEIGHT) / 2, 0)
  /*
   * Das Fensterband, einen Fingerbreit schmaler als der Kasten. Der Rücksprung ist das, was aus zwei
   * gestapelten Quadern einen Bus macht: er wirft die waagerechte Schattenlinie, an der man ihn von
   * einem Lastwagen unterscheidet.
   */
  add(new THREE.BoxGeometry(WIDTH - 0.12, GLASS_HEIGHT, LENGTH - 0.5), GLASS, 0, GLASS_FOOT + GLASS_HEIGHT / 2, 0)
  // Das Dach steht flach und hell auf dem Ganzen — von oben ist das die einzige Fläche, die man sieht.
  add(new THREE.BoxGeometry(WIDTH - 0.18, 0.12, LENGTH - 0.8), ROOF, 0, HEIGHT + 0.06, 0)

  for (const side of [-1, 1]) {
    for (const along of [-LENGTH * 0.32, LENGTH * 0.34]) {
      const wheel = new THREE.CylinderGeometry(WHEEL, WHEEL, 0.26, 8)
      wheel.rotateZ(Math.PI / 2)
      add(wheel, TYRE, (side * WIDTH) / 2 - side * 0.05, WHEEL, along)
    }
  }

  return merge(parts)
}

/** Alle Teile in einen Puffer, damit ein Bus ein Mesh ist und keine acht. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const position: number[] = []
  const normal: number[] = []
  const colour: number[] = []
  const index: number[] = []
  let offset = 0

  for (const part of parts) {
    const points = part.attributes.position as THREE.BufferAttribute
    const normals = part.attributes.normal as THREE.BufferAttribute
    const colours = part.attributes.color as THREE.BufferAttribute
    for (let vertex = 0; vertex < points.count; vertex += 1) {
      position.push(points.getX(vertex), points.getY(vertex), points.getZ(vertex))
      normal.push(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex))
      colour.push(colours.getX(vertex), colours.getY(vertex), colours.getZ(vertex))
    }
    const parked = part.getIndex()
    if (parked) {
      for (let slot = 0; slot < parked.count; slot += 1)
        index.push(parked.getX(slot) + offset)
    }
    offset += points.count
    part.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3))
  // Die Flotte mappt Fahrzeuge über den Atlas; ein Bus malt über Vertexfarben und braucht trotzdem UVs.
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((position.length / 3) * 2), 2))
  merged.setIndex(index)
  return merged
}
