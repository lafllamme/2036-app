import { describe, expect, it } from 'vitest'
import { BLADE_LENGTH, HUB_HEIGHT, rotor, tower } from '../../app/rendering/world/structures/windFarm'

/**
 * Ein Windrad ist die einzige Geometrie in der Szene, deren Drehachse **nicht** die Hochachse ist,
 * und genau daran ist der erste Versuch gescheitert: die Flügel lagen mit ihrer langen Kante auf der
 * Drehachse statt quer dazu. Gezeichnet wurde das als nackter Mast, weil drei Blätter geradeaus nach
 * vorn zeigten und sich dort gegenseitig verdeckten — im Bild sah es aus, als fehlte der Rotor.
 *
 * Das ist ein Fehler, den man am Modell in einer Millisekunde sieht und im Bild erst bei Tageslicht
 * aus der richtigen Richtung. Also wird er hier gesehen.
 */

function extent(geometry: ReturnType<typeof rotor>): { z: number, minZ: number } {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  return { z: box.max.z - box.min.z, minZ: box.min.z }
}

/** Wie weit die Geometrie in der Rotorebene reicht, und in welchen Richtungen sie das tut. */
function reach(geometry: ReturnType<typeof rotor>): { furthest: number, bearings: number[] } {
  const position = geometry.getAttribute('position')
  let furthest = 0
  const bearings: number[] = []
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const radius = Math.hypot(x, y)
    furthest = Math.max(furthest, radius)
    if (radius > BLADE_LENGTH * 0.9)
      bearings.push(Math.atan2(y, x))
  }
  return { furthest, bearings }
}

describe('windrad', () => {
  it('spannt den Rotor quer zur Drehachse auf, nicht entlang', () => {
    const { furthest } = reach(rotor())
    // Quer: eine Flügellänge vom Nullpunkt weg, plus der Versatz aus der Nabe heraus.
    expect(furthest).toBeGreaterThan(BLADE_LENGTH)
    expect(furthest).toBeLessThan(BLADE_LENGTH + 6)
    // Entlang der Achse ist ein Rotor flach. Nabe und Blattdicke, mehr nicht.
    expect(extent(rotor()).z).toBeLessThan(8)
  })

  it('stellt drei Blätter in gleiche Abstände', () => {
    const { bearings } = reach(rotor())
    expect(bearings.length).toBeGreaterThan(0)
    /*
     * Auf ein Drittel einer Umdrehung gefaltet müssen alle Spitzen zusammenfallen. Damit ist geprüft,
     * was ein Bounding-Kasten nicht prüfen kann: dass es wirklich drei Blätter in 120 Grad sind und
     * nicht drei übereinander.
     */
    const tripled = bearings.map(bearing => bearing * 3)
    const mean = Math.hypot(
      tripled.reduce((sum, angle) => sum + Math.cos(angle), 0) / tripled.length,
      tripled.reduce((sum, angle) => sum + Math.sin(angle), 0) / tripled.length,
    )
    // Verdreifacht statt geteilt, weil ein Rest bei 0 und bei 2pi/3 dieselbe Richtung ist und sich
    // beim Teilen an der Naht auseinanderfalten würde. Als Vektorlänge gibt es diese Naht nicht.
    expect(mean).toBeGreaterThan(0.97)
    // Und dass sie tatsächlich in mehr als eine Richtung zeigen.
    const third = (Math.PI * 2) / 3
    expect(new Set(bearings.map(bearing => Math.round(bearing / third))).size).toBeGreaterThan(1)
  })

  it('lässt die Blätter vor der Nabe laufen, damit sie den Turm nicht schneiden', () => {
    // Die Nabe sitzt im Nullpunkt und der Turm steht dahinter, also darf nichts weit nach hinten ragen.
    expect(extent(rotor()).minZ).toBeGreaterThan(-2)
  })

  it('stellt den Turm vom Boden bis zur Nabe', () => {
    const geometry = tower()
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    expect(box.min.y).toBeLessThan(1)
    // Oben die Gondel, die ein Stück über die Nabenhöhe hinausragt.
    expect(box.max.y).toBeGreaterThanOrEqual(HUB_HEIGHT)
    expect(box.max.y).toBeLessThan(HUB_HEIGHT + 4)
  })
})
