import type * as THREE from 'three/webgpu'

/**
 * Die Freitreppe vor einer Haustür.
 *
 * Sie stand vorher mitten im Extruder und war dort dreimal falsch, jedes Mal auf eine Art, die man
 * erst im Bild sieht:
 *
 * - **Sie hatte die Farbe des Sockels**, vor dem sie steht. Eine Stufenkante ist ein Millimeter
 *   Schatten; in derselben Farbe wie die Fläche dahinter ist sie aus jedem flachen Winkel unsichtbar.
 * - **Sie war 35 Zentimeter hoch.** Der Fußboden liegt auf ebenem Boden genau `PLINTH` über dem
 *   Gehweg, und über 35 Zentimeter baut niemand eine Treppe. Was herauskam, war eine Bordsteinkante,
 *   die 1,6 Meter weit aus der Fassade ragte — flach, breit, sinnlos.
 * - **Ihre Tiefe war fest.** Eine Treppe hat aber keine feste Tiefe, sie hat eine feste *Stufe*: das
 *   Steigungsverhältnis ist gebaute Wirklichkeit, und der Auftritt folgt daraus. Drei Stufen sind
 *   kurz, sechs sind lang, und das muss man ihr ansehen.
 *
 * Hier steht sie als eigenes Stück, gegen eine Senke statt gegen ein `Tile`, damit sich ihre
 * Normalen und ihre Maße prüfen lassen, ohne die halbe Stadt zu bauen — siehe
 * `tests/unit/stoop.test.ts`.
 */

export type Corner = [number, number, number]

const UP: Corner = [0, 1, 0]

/** Eine Senke für Volumen: Ecken hinein, Dreiecke darauf. Genau so viel, wie eine Treppe braucht. */
export interface SolidSink {
  /** Legt eine Ecke ab und gibt ihren Index zurück. */
  vertex: (x: number, y: number, z: number, normal: readonly [number, number, number], colour: THREE.Color) => number
  face: (a: number, b: number, c: number) => void
}

/**
 * Das Steigungsverhältnis, aus dem sich alles andere ergibt.
 *
 * 17 Zentimeter Steigung auf 29 Auftritt ist die Regelstufe, nach der in Deutschland jedes
 * Treppenhaus gebaut wird. Sie ist hier keine Zierde: sie ist der Grund, aus dem eine hohe Treppe
 * weiter in den Gehweg ragt als eine niedrige, und genau das macht sie von oben als Treppe lesbar.
 */
const RISE = 0.17
const RUN = 0.29
/** Wie breit eine Haustreppe ist, und wie weit ihr Podest über die Tür hinaussteht. */
const WIDTH = 3.1
const LANDING = 0.5
/** Wie tief die unterste Stufe im Boden steckt, damit am Hang keine Lücke darunter steht. */
const FOOTING = 0.5
/** Mehr als das baut niemand vor eine Haustür; darüber ist es eine Rampe oder ein Kellerabgang. */
const STEPS_MAX = 6
/** Unter dieser Höhe ist es eine Schwelle und keine Treppe — die steckt schon im Sockel. */
export const STOOP_MINIMUM = 0.42

export interface StoopPlan {
  /** Die Mitte der Straßenwand, auf Höhe des Gehwegs davor. */
  centre: readonly [number, number]
  /** Die Achse längs der Wand und die nach außen — beide mit gleicher Händigkeit. */
  along: readonly [number, number]
  outward: readonly [number, number]
  /** Der Boden vor der Tür und der Fußboden dahinter. */
  ground: number
  floor: number
  riser: THREE.Color
  tread: THREE.Color
}

/**
 * Baut die Treppe. Gibt zurück, wie weit sie in den Gehweg ragt — null, wenn keine gebaut wurde.
 *
 * Die Stufen sind ineinander geschachtelte Kästen: die unterste ragt am weitesten heraus, die
 * oberste liegt an der Wand. Damit steht jede Setzstufe frei vor der darüber, und genau diese
 * Kantenfolge ist das, was eine Treppe auf Entfernung als Treppe lesbar macht.
 *
 * Die Rückseite jedes Kastens fehlt: sie liegt an der Stufe dahinter oder an der Hauswand und ist
 * von keiner erreichbaren Kamera aus zu sehen. Das spart je Stufe zwei Dreiecke.
 */
export function buildStoop(sink: SolidSink, plan: StoopPlan): number {
  const drop = plan.floor - plan.ground
  if (drop < STOOP_MINIMUM)
    return 0

  const steps = Math.min(STEPS_MAX, Math.max(2, Math.round(drop / RISE)))
  const rise = drop / steps
  const reach = steps * RUN + LANDING
  const half = WIDTH / 2
  const [cx, cz] = plan.centre
  const [tx, tz] = plan.along
  const [nx, nz] = plan.outward

  const at = (alongSign: number, out: number): [number, number] =>
    [cx + tx * half * alongSign + nx * out, cz + tz * half * alongSign + nz * out]

  for (let step = 0; step < steps; step += 1) {
    // Die unterste Stufe ragt am weitesten heraus; die oberste ist das Podest an der Tür.
    const nose = reach - step * RUN
    const top = plan.ground + rise * (step + 1)
    const ring: [number, number][] = [at(-1, 0), at(-1, nose), at(1, nose), at(1, 0)]

    // Linke Wange, Setzstufe, rechte Wange. Die vierte Kante liegt hinten und entfällt.
    for (let edge = 0; edge < 3; edge += 1) {
      const [px, pz] = ring[edge]!
      const [qx, qz] = ring[edge + 1]!
      const length = Math.hypot(qx - px, qz - pz) || 1
      // Aus der Kante heraus — welche der beiden Seiten das ist, entscheidet `quad` selbst.
      const outward: Corner = [-(qz - pz) / length, 0, (qx - px) / length]
      facet(sink, [
        [px, plan.ground - FOOTING, pz],
        [qx, plan.ground - FOOTING, qz],
        [qx, top, qz],
        [px, top, pz],
      ], away(outward, plan), plan.riser)
    }

    facet(sink, ring.map(([px, pz]) => [px, top, pz] as Corner), UP, plan.tread)
  }

  return reach
}

/**
 * Eine Kantennormale so drehen, dass sie vom Haus weg zeigt.
 *
 * Aus einer Kante lassen sich zwei Normalen bilden, und welche die äußere ist, hängt daran, in
 * welche Richtung die Kante läuft. Statt das zu wissen, wird es gefragt: die äußere ist die, die mit
 * der Richtung aus der Wand heraus nicht über Kreuz liegt. Die Wangen einer Treppe stehen quer dazu,
 * für die ist beides recht — entschieden wird nur der Fall, der falsch aussehen würde.
 */
function away(normal: Corner, plan: StoopPlan): Corner {
  const along = normal[0] * plan.outward[0] + normal[2] * plan.outward[1]
  return along < -1e-6 ? [-normal[0], 0, -normal[2]] : normal
}

/**
 * Ein Viereck, gewickelt nach seiner **eigenen** Geometrie statt nach einer Annahme.
 *
 * Hier lag der Fehler, der die Treppe zu einer dünnen Fahne aus der Wand gemacht hat. Die Wicklung
 * war von der Wand abgeschrieben, und die Wände funktionieren nur deshalb, weil die Grundrisse aus
 * dem Kartenmaterial im Uhrzeigersinn laufen — die Reihenfolge der Ecken hing also an einer
 * Eigenschaft der Eingabedaten, die hier niemand mehr im Blick hatte. Wo die Achsen der Treppe
 * anders herum standen, zeigte jede Setzstufe und jede Trittfläche nach innen und wurde
 * weggeschnitten.
 *
 * Dieses Viereck rechnet die Normale aus, die seine Wicklung tatsächlich ergibt, und dreht sie um,
 * wenn sie in die falsche Richtung zeigt. Zwei Kreuzprodukte beim Aufbau, und die Frage stellt sich
 * nie wieder.
 */
export function facet(sink: SolidSink, corners: Corner[], normal: Corner, colour: THREE.Color): void {
  const [a, b, c] = corners as [Corner, Corner, Corner]
  const u: Corner = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v: Corner = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross: Corner = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]
  const ordered = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] >= 0
    ? corners
    : [...corners].reverse()

  const base = sink.vertex(ordered[0]![0], ordered[0]![1], ordered[0]![2], normal, colour)
  for (let corner = 1; corner < 4; corner += 1)
    sink.vertex(ordered[corner]![0], ordered[corner]![1], ordered[corner]![2], normal, colour)
  sink.face(base, base + 1, base + 2)
  sink.face(base, base + 2, base + 3)
}
