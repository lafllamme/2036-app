import type { BuildingRecord, BuildingType } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { tenancyAt } from '../../app/world/tenancy'

/**
 * Die Nutzung eines Erdgeschosses ist Anschauung, keine Mechanik — aber sie muss **verlässliche**
 * Anschauung sein. Wer zweimal auf dasselbe Haus zeigt, bekommt zweimal dieselbe Antwort, und wenn
 * der Einzelhandel einbricht, machen die schwächsten Läden zuerst zu und nicht irgendwelche.
 */

function building(id: string, type: BuildingType = 'commercial'): BuildingRecord {
  return {
    id,
    districtId: 'innenstadt' as BuildingRecord['districtId'],
    type,
    x: 0,
    z: 0,
    width: 12,
    depth: 10,
    height: 14,
    rotation: 0,
    condition: 0.8,
    occupancy: 0.9,
    footprint: [0, 0, 1, 0, 1, 1],
    roofHeight: 3,
  }
}

const SEED = 2036
const ids = Array.from({ length: 400 }, (_, index) => `b-${index.toString(36)}`)

describe('erdgeschoss', () => {
  it('antwortet auf dasselbe Haus immer dasselbe', () => {
    for (const id of ids.slice(0, 40)) {
      const first = tenancyAt(building(id), SEED, 1)
      const again = tenancyAt(building(id), SEED, 1)
      expect(again).toEqual(first)
    }
  })

  it('gibt einem öffentlichen Gebäude nie einen Laden', () => {
    for (const id of ids)
      expect(tenancyAt(building(id, 'civic'), SEED, 1)).toBeNull()
  })

  it('vermietet in einem Industriebau nur, was dorthin gehört', () => {
    const trades = new Set(ids
      .map(id => tenancyAt(building(id, 'industrial'), SEED, 1)?.trade)
      .filter(Boolean))
    expect(trades.size).toBeGreaterThan(0)
    for (const trade of trades)
      expect(['workshop', 'brewery', 'hardware']).toContain(trade)
  })

  it('besetzt Geschäftshäuser viel häufiger als Wohnhäuser', () => {
    const share = (type: BuildingType): number =>
      ids.filter(id => tenancyAt(building(id, type), SEED, 1)).length / ids.length
    expect(share('commercial')).toBeGreaterThan(0.8)
    expect(share('residential')).toBeLessThan(0.25)
    expect(share('commercial')).toBeGreaterThan(share('altbau'))
    expect(share('altbau')).toBeGreaterThan(share('residential'))
  })

  /*
   * Der eigentliche Punkt der ganzen Übung: die Zahl im Lagebild wird zu etwas, das man auf der
   * Straße sieht. Fällt der Bestand, fallen Läden aus — und zwar monoton, ohne dass einer wieder
   * aufmacht, während der Bestand weiter sinkt.
   */
  it('schließt Läden, wenn der Einzelhandel einbricht, und keinen wieder auf', () => {
    const open = (vitality: number): number =>
      ids.filter(id => tenancyAt(building(id), SEED, vitality)?.open).length

    const steps = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
    const counts = steps.map(open)
    for (let at = 1; at < counts.length; at += 1)
      expect(counts[at]!).toBeLessThanOrEqual(counts[at - 1]!)

    expect(counts[0]!).toBeGreaterThan(counts[counts.length - 1]!)
  })

  it('lässt Versorgung länger offen als Zerstreuung', () => {
    const openAt = (trade: string, vitality: number): number =>
      ids.map(id => tenancyAt(building(id), SEED, vitality))
        .filter(shop => shop?.trade === trade && shop.open)
        .length
    const allAt = (trade: string): number =>
      ids.map(id => tenancyAt(building(id), SEED, 1)).filter(shop => shop?.trade === trade).length

    // Bei halbem Bestand: Apotheken stehen noch, Buchläden überwiegend nicht.
    const pharmacies = openAt('pharmacy', 0.5) / Math.max(1, allAt('pharmacy'))
    const books = openAt('books', 0.5) / Math.max(1, allAt('books'))
    expect(pharmacies).toBeGreaterThan(books)
  })
})
