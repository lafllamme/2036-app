import type { DistrictId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { cityFrom, initialSpread, normalise, shift, valueIn } from '../../app/simulation/districts'
import { advanceMonths, applyPolicy, chooseSite, createInitialState, snapshotOf } from '../../app/simulation/model'

/**
 * Die Verteilung einer Stadtzahl auf acht Bezirke.
 *
 * Eine Eigenschaft trägt das ganze Verfahren, und sie ist der Grund, warum es überhaupt so gebaut ist:
 * **das gewichtete Mittel der Bezirke ist immer exakt der Stadtwert.** Acht parallel driftende
 * Teilstädte hätten diese Garantie nicht — und `goals.test.ts` hat an einem einzigen Tag zweimal
 * gezeigt, wie eng die Zielschwellen sitzen. Die beste von 36 Durchspielungen kommt teils auf 0,2 an
 * ihr Ziel heran; eine Summe, die um ein Prozent wegläuft, wäre das Ende dieser Balance.
 *
 * Deshalb wird hier nicht gerechnet, sondern erhalten: verschiebt sich ein Bezirk, verschieben sich
 * die anderen gegenläufig. Diese Datei fragt genau das ab, und zwar nach jedem Eingriff.
 */

const DISTRICTS: DistrictId[] = [
  'innenstadt',
  'bahnhof',
  'gruenderzeit-nord',
  'wohnring-sued',
  'universitaet-klinikum',
  'hafen-industrie',
  'gewerbe-ost',
  'vorstadt-west',
]

/** Der Stadtwert, aus den Bezirken zurückgerechnet. Muss herauskommen, was hineinging. */
function backFrom(share: Record<DistrictId, number>, cityValue: number): number {
  return cityFrom(share, id => valueIn(cityValue, share, id))
}

describe('bezirkskennzahlen', () => {
  it('trifft mit dem gewichteten Mittel immer genau den Stadtwert', () => {
    const spread = initialSpread()
    expect(backFrom(spread.averageRent, 13.2)).toBeCloseTo(13.2, 9)
    expect(backFrom(spread.burglaryRate, 9)).toBeCloseTo(9, 9)
    expect(backFrom(spread.vacantUnits, 1394)).toBeCloseTo(1394, 6)
  })

  it('hält das auch nach einer Verschiebung', () => {
    let share = initialSpread().averageRent
    share = shift(share, 'gruenderzeit-nord', -0.2)
    expect(backFrom(share, 13.2)).toBeCloseTo(13.2, 9)

    share = shift(share, 'innenstadt', 0.35)
    share = shift(share, 'hafen-industrie', -0.5)
    expect(backFrom(share, 13.2)).toBeCloseTo(13.2, 9)
  })

  /** Ohne Gefälle wären acht Bezirke acht gleiche Bezirke, und jeder Standort austauschbar. */
  it('gibt der Stadt von Anfang an ein Gefälle', () => {
    const spread = initialSpread()
    expect(valueIn(13.2, spread.averageRent, 'innenstadt'))
      .toBeGreaterThan(valueIn(13.2, spread.averageRent, 'hafen-industrie') * 1.5)
    expect(valueIn(9, spread.burglaryRate, 'bahnhof'))
      .toBeGreaterThan(valueIn(9, spread.burglaryRate, 'vorstadt-west'))
    expect(valueIn(1394, spread.vacantUnits, 'hafen-industrie'))
      .toBeGreaterThan(valueIn(1394, spread.vacantUnits, 'innenstadt'))
  })

  it('senkt an einem Ort und hebt damit die anderen', () => {
    const before = initialSpread().averageRent
    const after = shift(before, 'gruenderzeit-nord', -0.25)

    expect(after['gruenderzeit-nord']).toBeLessThan(before['gruenderzeit-nord'])
    // Und woanders wird es dadurch relativ teurer — die Stadtmiete hat sich ja nicht geändert.
    expect(after['hafen-industrie']).toBeGreaterThan(before['hafen-industrie'])
  })

  /** Zwei Welten in einer Stadt reichen: ohne Deckel läuft ein Bezirk über ein Jahrzehnt davon. */
  it('lässt keinen Bezirk ins Unermessliche laufen', () => {
    let share = initialSpread().burglaryRate
    for (let round = 0; round < 60; round += 1)
      share = shift(share, 'bahnhof', 0.2)

    expect(share.bahnhof).toBeLessThanOrEqual(2.2)
    expect(backFrom(share, 9)).toBeCloseTo(9, 9)
    for (const id of DISTRICTS)
      expect(share[id], id).toBeGreaterThan(0)
  })

  it('normiert auch eine Verteilung, die schon daneben liegt', () => {
    const crooked = Object.fromEntries(DISTRICTS.map(id => [id, 3])) as Record<DistrictId, number>
    const fixed = normalise(crooked)
    for (const id of DISTRICTS)
      expect(fixed[id], id).toBeCloseTo(1, 9)
  })

  /**
   * Und dasselbe durch das ganze Modell: die Stadtzahl im Lagebild und die acht auf der Karte dürfen
   * nach zehn gespielten Jahren nicht auseinanderliegen. Es gäbe sonst zwei Wahrheiten.
   */
  it('bleibt nach zehn gespielten Jahren mit der Stadtzahl deckungsgleich', () => {
    const built = chooseSite(applyPolicy(createInitialState(2036), 'housing-accelerator'), 'hafen-industrie')
    const snapshot = snapshotOf(advanceMonths(built, 120))
    /* Die Gewichte stecken in `cityFrom`; die Faktoren hier sind nur der Schlüsselsatz der Bezirke. */
    const keys = Object.fromEntries(DISTRICTS.map(id => [id, 1])) as Record<DistrictId, number>

    for (const metric of ['averageRent', 'burglaryRate', 'vacantUnits'] as const) {
      const back = cityFrom(keys, id => snapshot.districtMetrics[id][metric])
      expect(back, metric).toBeCloseTo(snapshot.metrics[metric], 6)
    }
  })

  /** Und der gewählte Standort muss im Gefälle zu sehen sein, sonst war die Wahl Dekoration. */
  it('drückt die Miete dort, wo gebaut wurde', () => {
    const waiting = applyPolicy(createInitialState(2036), 'housing-accelerator')
    const before = snapshotOf(waiting).districtMetrics

    const built = chooseSite(waiting, 'hafen-industrie')
    const after = snapshotOf(built).districtMetrics

    expect(after['hafen-industrie'].averageRent).toBeLessThan(before['hafen-industrie'].averageRent)
    expect(after['hafen-industrie'].vacantUnits).toBeGreaterThan(before['hafen-industrie'].vacantUnits)
    // Und anderswo wird es dadurch relativ teurer, weil die Stadtmiete dieselbe geblieben ist.
    expect(after.innenstadt.averageRent).toBeGreaterThan(before.innenstadt.averageRent)
  })
})
