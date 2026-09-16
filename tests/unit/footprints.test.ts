import { describe, expect, it } from 'vitest'
import { inset, pointInside } from '../../app/rendering/world/structures/buildings'

/**
 * Alles, was an ein Gebäude gebaut wird, muss aus seinem **Grundriss** kommen.
 *
 * Schornsteine, Lüfteraufbauten und Freitreppen standen auf `building.x/z/rotation/width/depth` —
 * also auf einer gedachten Kiste um das Haus herum. Für ein Rechteck geht das gut, und elf von
 * vierzehntausend Häusern in Lindenhafen sind Rechtecke. Die anderen sind L-Formen, Ecken und
 * Fünfecke auf einer Kurve, und bei denen liegt der Mittelpunkt dieser Kiste außerhalb des
 * Gebäudes: der Schornstein stand neben dem Dach, die Treppe im Erdgeschoss.
 *
 * Diese Tests halten die zwei Aussagen fest, auf denen die Korrektur beruht.
 */

/** Ein L, dessen Schwerpunkt bekanntermaßen im Hof davor liegt — der Fall, der alles kaputt machte. */
const ELL = [0, 0, 0, 30, 10, 30, 10, 10, 30, 10, 30, 0]
const RECTANGLE = [0, 0, 0, 12, 24, 12, 24, 0]
/** Ein Fünfeck auf einer Kurve, wie es ein Eckhaus an einer Straßenbiegung hat. */
const BEND = [0, 0, 0, 14, 8, 18, 18, 12, 16, 0]

describe('pointInside', () => {
  it('kennt innen und außen an einem Rechteck', () => {
    expect(pointInside(12, 6, RECTANGLE)).toBe(true)
    expect(pointInside(-1, 6, RECTANGLE)).toBe(false)
    expect(pointInside(12, 13, RECTANGLE)).toBe(false)
  })

  it('weist den Schwerpunkt eines L als außen aus', () => {
    // Der arithmetische Mittelwert der Ecken — genau das, was vorher als Standort benutzt wurde.
    const cx = ELL.filter((_, index) => index % 2 === 0).reduce((sum, value) => sum + value, 0) / 6
    const cz = ELL.filter((_, index) => index % 2 === 1).reduce((sum, value) => sum + value, 0) / 6
    expect(pointInside(cx, cz, ELL)).toBe(false)
  })

  it('findet in jedem Umriss den Innenraum', () => {
    expect(pointInside(5, 5, ELL)).toBe(true)
    expect(pointInside(5, 25, ELL)).toBe(true)
    expect(pointInside(25, 25, ELL)).toBe(false)
    expect(pointInside(6, 8, BEND)).toBe(true)
  })
})

describe('inset', () => {
  it('lässt einen Umriss kleiner werden, ohne ihn zu verlassen', () => {
    const shrunk = inset(RECTANGLE, 2)
    for (let i = 0; i < shrunk.length; i += 2)
      expect(pointInside(shrunk[i]!, shrunk[i + 1]!, RECTANGLE)).toBe(true)
  })
})

describe('die Aussenrichtung einer Wand', () => {
  /**
   * Dieselbe Rechnung, die `entrance()` anstellt: eine Kante, ihre Normale, und die Frage, ob ein
   * halber Meter in diese Richtung noch im Gebäude liegt. Wo ja, zeigt die Normale nach innen — und
   * genau dort wuchs die Freitreppe ins Haus.
   */
  const outward = (ring: number[], edge: number): number => {
    const corners = ring.length / 2
    const j = (edge + 1) % corners
    const ax = ring[edge * 2]!
    const az = ring[edge * 2 + 1]!
    const bx = ring[j * 2]!
    const bz = ring[j * 2 + 1]!
    const span = Math.hypot(bx - ax, bz - az)
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    return pointInside(mx - ((bz - az) / span) * 0.5, mz + ((bx - ax) / span) * 0.5, ring) ? -1 : 1
  }

  it('zeigt an jeder Kante jedes Umrisses aus dem Gebäude heraus', () => {
    for (const ring of [RECTANGLE, ELL, BEND, [...RECTANGLE].reverse()]) {
      for (let edge = 0; edge < ring.length / 2; edge += 1) {
        const corners = ring.length / 2
        const j = (edge + 1) % corners
        const ax = ring[edge * 2]!
        const az = ring[edge * 2 + 1]!
        const bx = ring[j * 2]!
        const bz = ring[j * 2 + 1]!
        const span = Math.hypot(bx - ax, bz - az)
        if (span < 0.05)
          continue
        const facing = outward(ring, edge)
        const nx = (-(bz - az) / span) * facing
        const nz = ((bx - ax) / span) * facing
        const mx = (ax + bx) / 2
        const mz = (az + bz) / 2
        // Einen Schritt in Normalenrichtung steht man vor dem Haus, nicht darin.
        expect(pointInside(mx + nx * 0.5, mz + nz * 0.5, ring)).toBe(false)
      }
    }
  })
})
