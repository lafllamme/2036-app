import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { buildStoop, facet, STOOP_MINIMUM } from '../../app/rendering/world/structures/stoop'

/**
 * Die Freitreppe war dreimal falsch, und jedes Mal so, dass man es erst im Bild gesehen hat: in der
 * Farbe des Sockels davor, 35 Zentimeter hoch bei 1,6 Metern Auskragung, und mit fester Tiefe
 * unabhängig von der Zahl der Stufen. Was davon nachrechenbar ist, steht hier.
 */

/** Eine Senke, die mitschreibt, damit sich die Geometrie prüfen lässt, ohne sie zu zeichnen. */
function recorder() {
  const position: number[] = []
  const normal: number[] = []
  const colour: THREE.Color[] = []
  const index: number[] = []
  return {
    position,
    normal,
    colour,
    index,
    vertex: (x: number, y: number, z: number, n: readonly [number, number, number], shade: THREE.Color) => {
      position.push(x, y, z)
      normal.push(n[0], n[1], n[2])
      colour.push(shade)
      return position.length / 3 - 1
    },
    face: (a: number, b: number, c: number) => {
      index.push(a, b, c)
    },
  }
}

const RISER = new THREE.Color('#6e6f6d')
const TREAD = new THREE.Color('#b4b3ad')

/** Eine Wand, die nach +z zeigt, mit dem Haus bei negativem z. */
function plan(floor: number, ground = 0) {
  return {
    centre: [0, 0] as const,
    along: [1, 0] as const,
    outward: [0, 1] as const,
    ground,
    floor,
    riser: RISER,
    tread: TREAD,
  }
}

/** Die tatsächliche Normale eines Dreiecks aus seiner Wicklung — nicht die, die drangeschrieben steht. */
function facing(recorded: ReturnType<typeof recorder>, triangle: number): THREE.Vector3 {
  const corner = (slot: number): THREE.Vector3 => {
    const at = recorded.index[triangle * 3 + slot]! * 3
    return new THREE.Vector3(recorded.position[at], recorded.position[at + 1], recorded.position[at + 2])
  }
  const a = corner(0)
  return new THREE.Vector3().subVectors(corner(1), a).cross(new THREE.Vector3().subVectors(corner(2), a)).normalize()
}

describe('buildStoop', () => {
  it('baut nichts, wo eine Schwelle genügt', () => {
    const sink = recorder()
    expect(buildStoop(sink, plan(STOOP_MINIMUM - 0.01))).toBe(0)
    expect(sink.position).toHaveLength(0)
  })

  it('baut über ein Hochparterre eine echte Treppe', () => {
    const sink = recorder()
    const reach = buildStoop(sink, plan(0.95))
    // Bei 17 Zentimetern Regelsteigung sind das sechs Stufen, und die brauchen ihren Platz.
    expect(reach).toBeGreaterThan(1.5)
    expect(sink.index.length / 3).toBeGreaterThan(20)
  })

  /**
   * Der Fehler, der im Bild zu sehen war: eine flache Zunge, die weiter in den Gehweg ragte, als sie
   * hoch war. Eine Treppe ist nie flacher als eins zu drei — das ist eine Rampe.
   */
  it('ragt nie weiter heraus, als ihre Höhe rechtfertigt', () => {
    for (const floor of [0.5, 0.8, 1.2, 1.8]) {
      const reach = buildStoop(recorder(), plan(floor))
      expect(reach / floor).toBeLessThan(3)
    }
  })

  it('wird länger, je höher sie steigt', () => {
    const low = buildStoop(recorder(), plan(0.5))
    const high = buildStoop(recorder(), plan(1.5))
    expect(high).toBeGreaterThan(low)
  })

  /**
   * Der Fehler, der sie unsichtbar machte: jede Trittfläche muss nach oben zeigen und jede Setzstufe
   * vom Haus weg. Zeigt eine davon nach innen, wird sie weggeschnitten oder von hinten beleuchtet,
   * und die Treppe verschwindet — sichtbar ist sie dann nur noch als dünne Fahne aus der Wand.
   */
  it('zeigt mit jedem Dreieck nach außen oder nach oben', () => {
    const sink = recorder()
    buildStoop(sink, plan(1.1))
    for (let triangle = 0; triangle < sink.index.length / 3; triangle += 1) {
      const normal = facing(sink, triangle)
      // Nach oben, oder vom Haus weg (+z), oder seitlich — niemals in das Haus hinein.
      expect(normal.z).toBeGreaterThan(-0.01)
      expect(normal.y).toBeGreaterThan(-0.01)
    }
  })

  it('hält jede Trittfläche waagerecht und jede Setzstufe senkrecht', () => {
    const sink = recorder()
    buildStoop(sink, plan(1.1))
    let treads = 0
    for (let triangle = 0; triangle < sink.index.length / 3; triangle += 1) {
      const normal = facing(sink, triangle)
      if (normal.y > 0.5) {
        treads += 1
        expect(normal.y).toBeCloseTo(1, 5)
      }
      else {
        expect(Math.abs(normal.y)).toBeLessThan(0.01)
      }
    }
    // Je Stufe zwei Dreiecke Trittfläche.
    expect(treads).toBe((sink.index.length / 3 / 8) * 2)
  })

  it('trägt Beton und nicht die Farbe des Hauses', () => {
    const sink = recorder()
    buildStoop(sink, plan(1.1))
    const tones = new Set(sink.colour.map(shade => shade.getHexString()))
    expect(tones).toEqual(new Set([RISER.getHexString(), TREAD.getHexString()]))
    // Und die Trittfläche ist heller als die Setzstufe — daran erkennt man eine Treppe.
    expect(TREAD.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(RISER.getHSL({ h: 0, s: 0, l: 0 }).l + 0.2)
  })

  it('folgt der Wand, wenn die Wand schräg steht', () => {
    const diagonal = Math.SQRT1_2
    const sink = recorder()
    buildStoop(sink, {
      ...plan(1.1),
      along: [diagonal, -diagonal] as const,
      outward: [diagonal, diagonal] as const,
    })
    // Keine Ecke darf hinter der Wandebene liegen, also niemals im Gebäude.
    for (let corner = 0; corner < sink.position.length; corner += 3) {
      const out = sink.position[corner]! * diagonal + sink.position[corner + 2]! * diagonal
      expect(out).toBeGreaterThan(-0.01)
    }
  })
})

/**
 * Dieselbe Wicklungsannahme steckte auch in den Dachaufbauten, und dort sah man sie noch deutlicher:
 * vom Lüfterkasten blieb ein Deckel übrig, der frei über dem Dach schwebte, mit einer einzigen Wange
 * daran. Die anderen drei Seiten zeigten nach innen und wurden weggeschnitten.
 *
 * `facet` ist die Antwort für beides, also wird sie hier für sich geprüft: eine Fläche muss in die
 * Richtung zeigen, die man ihr nennt, **ganz gleich in welcher Reihenfolge ihre Ecken kommen.**
 */
describe('facet', () => {
  const GREY = new THREE.Color('#808080')
  const square: [number, number, number][] = [
    [-1, 0, -1],
    [-1, 0, 1],
    [1, 0, 1],
    [1, 0, -1],
  ]

  it('zeigt in die genannte Richtung, egal wie herum die Ecken kommen', () => {
    for (const corners of [square, [...square].reverse()]) {
      for (const wanted of [[0, 1, 0], [0, -1, 0]] as const) {
        const sink = recorder()
        facet(sink, corners.map(corner => [...corner] as [number, number, number]), [...wanted], GREY)
        for (let triangle = 0; triangle < sink.index.length / 3; triangle += 1)
          expect(facing(sink, triangle).y).toBeCloseTo(wanted[1], 5)
      }
    }
  })

  it('macht aus einem Viereck zwei Dreiecke und nicht mehr', () => {
    const sink = recorder()
    facet(sink, square.map(corner => [...corner] as [number, number, number]), [0, 1, 0], GREY)
    expect(sink.index.length / 3).toBe(2)
    expect(sink.position.length / 3).toBe(4)
  })
})
