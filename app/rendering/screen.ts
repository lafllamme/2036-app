import type * as THREE from 'three/webgpu'

/**
 * Von einem Ort in der Stadt zu einem Punkt auf dem Schirm.
 *
 * Die eine Sache, die zwischen der Karte und der Oberfläche gefehlt hat. Das Spiel hat acht Bezirke,
 * Einsätze mit Koordinate und Häuser mit Grundriss — und keinen Weg, irgendetwas davon **dort** zu
 * beschriften, wo es steht. `FEATURE_MATRIX` führt das seit Wochen als offenen Punkt: *„Marking a
 * motion at its place in the city (needs a camera→screen projection at the CityCanvas boundary)."*
 *
 * ## Warum das hier steht und nicht im Renderer
 *
 * Weil es Rechnung ist und kein Zustand. Eine Funktion, die eine Kamera und einen Punkt nimmt, lässt
 * sich mit einer Kamera und einem Punkt prüfen — ohne Canvas, ohne WebGPU, ohne Stadt. Der Renderer
 * reicht sie nur nach außen durch.
 *
 * ## Und warum sie nichts allokiert
 *
 * Sie läuft je Marke und Bild. Bei zwanzig Marken und 120 Bildern sind das 2.400 Aufrufe je Sekunde,
 * und jeder `new Vector3()` darin wäre Müll, den der Sammler später einsammeln muss — mitten im
 * Renderpfad. Das Ergebnis wird deshalb in ein übergebenes Objekt geschrieben.
 */

export interface ScreenPoint {
  /** In CSS-Pixeln, relativ zur linken oberen Ecke der Zeichenfläche. */
  x: number
  y: number
  /** Wie weit der Punkt von der Kamera weg ist, in Metern — für Größe und Reihenfolge. */
  away: number
  /**
   * Ob der Punkt vor der Kamera und innerhalb des Bildes liegt.
   *
   * Beides zusammen, weil das Wichtigere davon unsichtbar ist: ein Punkt **hinter** der Kamera
   * projiziert auf gültig aussehende Koordinaten — gespiegelt am Bildmittelpunkt. Ohne diese Prüfung
   * steht die Marke für ein Haus im Rücken des Spielers vorn im Bild, an der falschen Seite, und
   * wandert beim Drehen in die verkehrte Richtung.
   */
  onScreen: boolean
}

/**
 * Wie weit eine Marke über den Rand hinausragen darf, bevor sie als draußen gilt.
 *
 * Knapp gehalten: bei achtzig Pixeln klebte ein halb abgeschnittenes Schild am Bildrand, und das ist
 * keine Auskunft, sondern Rauschen. Acht Pixel reichen, damit eine Marke am Rand nicht flackert,
 * während die Kamera sie hin- und herschiebt.
 */
const MARGIN = 8

export function project(
  camera: THREE.Camera,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  out: ScreenPoint,
): ScreenPoint {
  /*
   * Von Hand gerechnet statt über `Vector3.project`, aus zwei Gründen: es spart den Vektor, und die
   * homogene Koordinate `w` wird hier gebraucht. `w` ist im Perspektivfall der Abstand entlang der
   * Blickrichtung — negativ heißt hinter der Kamera, und genau das ist der Fall, den die Bibliothek
   * wegteilt, ohne ihn zu melden.
   */
  const view = camera.matrixWorldInverse.elements
  const vx = view[0]! * x + view[4]! * y + view[8]! * z + view[12]!
  const vy = view[1]! * x + view[5]! * y + view[9]! * z + view[13]!
  const vz = view[2]! * x + view[6]! * y + view[10]! * z + view[14]!

  const clip = camera.projectionMatrix.elements
  const cx = clip[0]! * vx + clip[4]! * vy + clip[8]! * vz + clip[12]!
  const cy = clip[1]! * vx + clip[5]! * vy + clip[9]! * vz + clip[13]!
  const cw = clip[3]! * vx + clip[7]! * vy + clip[11]! * vz + clip[15]!

  out.away = Math.sqrt(vx * vx + vy * vy + vz * vz)

  if (cw <= 0) {
    // Hinter der Kamera. Die Zahlen werden trotzdem gesetzt, damit niemand auf alten Werten sitzt.
    out.x = 0
    out.y = 0
    out.onScreen = false
    return out
  }

  out.x = (cx / cw * 0.5 + 0.5) * width
  out.y = (1 - (cy / cw * 0.5 + 0.5)) * height
  out.onScreen = out.x >= -MARGIN && out.x <= width + MARGIN && out.y >= -MARGIN && out.y <= height + MARGIN
  return out
}

/** Ein Ergebnisobjekt, das man wiederverwendet. Siehe oben: kein Müll im Renderpfad. */
export function screenPoint(): ScreenPoint {
  return { x: 0, y: 0, away: 0, onScreen: false }
}
