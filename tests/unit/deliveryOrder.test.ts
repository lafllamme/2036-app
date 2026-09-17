import { describe, expect, it } from 'vitest'
import { deliveryOrder } from '../../app/rendering/world/cityState'

/**
 * Welche Bauparzelle als Nächstes dran ist.
 *
 * Bis zum Standortbeschluss war das die Reihenfolge, in der die Parzellen entstanden sind: von der
 * Mitte nach außen. Das war auch der Grund, warum ein Beschluss unsichtbar blieb — der Rat entschied,
 * **wo** gebaut wird, und gebaut wurde trotzdem in der Mitte.
 *
 * Die eine Eigenschaft, an der alles hängt und die man im Bild erst nach Monaten sieht: **der
 * gelieferte Teil darf sich nie ändern.** Sortiert man die ganze Liste um, springen fertige Häuser
 * quer durch die Stadt, sobald ein zweiter Standort beschlossen wird — und das passiert zum ersten
 * Mal im dritten Spieljahr, wo es niemand mehr mit dieser Reihenfolge in Verbindung bringt.
 */

/** Zwölf Parzellen: vier im Hafen, vier in der Altstadt, vier im Süden, gemischt verteilt. */
const DISTRICTS = ['hafen', 'altstadt', 'sued', 'hafen', 'altstadt', 'sued', 'hafen', 'altstadt', 'sued', 'hafen', 'altstadt', 'sued']
const districtOf = (slot: number): string => DISTRICTS[slot] ?? ''
const START = DISTRICTS.map((_, index) => index)

describe('lieferreihenfolge', () => {
  it('lässt alles wie es war, solange nichts beschlossen ist', () => {
    expect(deliveryOrder(START, 0, districtOf, [])).toEqual(START)
  })

  it('zieht die Parzellen des beschlossenen Bezirks nach vorn', () => {
    const order = deliveryOrder(START, 0, districtOf, ['altstadt'])
    expect(order.slice(0, 4).map(districtOf)).toEqual(['altstadt', 'altstadt', 'altstadt', 'altstadt'])
    // Innerhalb des Bezirks bleibt es bei „von der Mitte nach außen".
    expect(order.slice(0, 4)).toEqual([1, 4, 7, 10])
    // Und der Rest behält seine ursprüngliche Ordnung.
    expect(order.slice(4)).toEqual([0, 2, 3, 5, 6, 8, 9, 11])
  })

  it('hält die Reihenfolge der Beschlüsse ein', () => {
    const order = deliveryOrder(START, 0, districtOf, ['sued', 'hafen'])
    expect(order.slice(0, 4).map(districtOf)).toEqual(['sued', 'sued', 'sued', 'sued'])
    expect(order.slice(4, 8).map(districtOf)).toEqual(['hafen', 'hafen', 'hafen', 'hafen'])
    expect(order.slice(8).map(districtOf)).toEqual(['altstadt', 'altstadt', 'altstadt', 'altstadt'])
  })

  /** Das Herzstück: was steht, bleibt stehen. */
  it('rührt keine einzige gelieferte Parzelle an', () => {
    const built = deliveryOrder(START, 0, districtOf, ['hafen'])
    // Fünf Häuser stehen im Hafen und im ersten Rest.
    const after = deliveryOrder(built, 5, districtOf, ['hafen', 'altstadt'])

    expect(after.slice(0, 5)).toEqual(built.slice(0, 5))
    /*
     * Und dahinter kommt jetzt die Altstadt — drei Stück und nicht vier: die vierte Altstadtparzelle
     * ist schon gebaut, sie steckt im gelieferten Teil. Genau das ist der Punkt.
     */
    expect(after.slice(5, 8).map(districtOf)).toEqual(['altstadt', 'altstadt', 'altstadt'])
    expect(districtOf(after[8]!)).not.toBe('altstadt')
  })

  it('verliert und verdoppelt keine Parzelle', () => {
    for (const sited of [[], ['hafen'], ['sued', 'altstadt'], ['altstadt', 'hafen', 'sued']]) {
      const order = deliveryOrder(START, 3, districtOf, sited)
      expect(new Set(order).size, sited.join()).toBe(START.length)
      expect([...order].sort((a, b) => a - b)).toEqual(START)
    }
  })
})
