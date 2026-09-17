import { describe, expect, it } from 'vitest'
import { wearOf } from '../../app/rendering/world/structures/buildings'
import { conditionRange, DISTRICT_CHARACTER } from '../../app/world/districtCharacter'

/**
 * Der Bauzustand, als Zahl für den Shader.
 *
 * `condition` steht seit dem ersten Tag an jedem der 16.782 Gebäude und war im Bild durch nichts zu
 * sehen. Damit er es wird, muss die Abbildung genau die Spanne treffen, die der Stadtaufbau
 * tatsächlich vergibt — und das ist der eine Wert, den man beim Schrauben an `conditionRange`
 * zwangsläufig vergisst. Eine Abbildung, die zu eng greift, macht die halbe Stadt gleich
 * verwahrlost; eine, die zu weit greift, macht sie gleich gepflegt. Beides sieht in einem
 * Bildschirmfoto plausibel aus.
 */

describe('bauzustand als verschleiss', () => {
  it('liegt immer zwischen null und eins', () => {
    for (const condition of [-1, 0, 0.5, 0.92, 1, 2])
      expect(wearOf(condition), String(condition)).toBeGreaterThanOrEqual(0)
    for (const condition of [-1, 0, 0.5, 0.92, 1, 2])
      expect(wearOf(condition), String(condition)).toBeLessThanOrEqual(1)
  })

  it('läuft in die richtige Richtung: je besser gepflegt, desto weniger', () => {
    expect(wearOf(0.95)).toBeLessThan(wearOf(0.7))
    expect(wearOf(0.7)).toBeLessThan(wearOf(0.5))
  })

  /**
   * Der eigentliche Punkt. Über alle acht Viertel reicht `conditionRange` von etwa 0,50 bis 0,94,
   * und die Abbildung muss diese Spanne **ausnutzen**: ganz oben fast sauber, ganz unten fast am
   * Ende. Verschiebt jemand die Pflegewerte der Bezirke, fällt es hier auf und nicht erst im Bild.
   */
  it('nutzt die Spanne aus, die die Bezirke wirklich vergeben', () => {
    const ranges = Object.values(DISTRICT_CHARACTER).map(character => conditionRange(character.upkeep))
    const best = Math.max(...ranges.map(range => range.high))
    const worst = Math.min(...ranges.map(range => range.low))

    expect(wearOf(best), 'das bestgepflegte Haus der Stadt ist so gut wie sauber').toBeLessThan(0.1)
    expect(wearOf(worst), 'das schlechteste steht am Anschlag').toBeGreaterThan(0.9)
  })

  /** Und die Viertel müssen sich unterscheiden, sonst wäre der ganze Aufwand eine graue Stadt. */
  it('trennt die gepflegten Viertel sichtbar von den vernachlässigten', () => {
    const middle = (upkeep: number): number => {
      const range = conditionRange(upkeep)
      return wearOf((range.low + range.high) / 2)
    }
    const kept = middle(DISTRICT_CHARACTER['vorstadt-west'].upkeep)
    const neglected = middle(DISTRICT_CHARACTER['hafen-industrie'].upkeep)
    expect(neglected - kept).toBeGreaterThan(0.25)
  })
})
