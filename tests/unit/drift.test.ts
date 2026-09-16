import { describe, expect, it } from 'vitest'
import { drift, handOver } from '../../app/utils/drift'

/**
 * Der Fehler, den dieser Test festhält, war unsichtbar: die Kopfleiste verglich den Rückhalt mit
 * **sich selbst**, weil sie beim Monatswechsel den schon getauschten Schnappschuss in ihren
 * Vorher-Speicher schrieb. Es gab keine falsche Anzeige, es gab gar keine — und eine Anzeige, die
 * nie erscheint, meldet niemand.
 */

describe('richtung seit dem letzten monat', () => {
  it('reicht den alten Stand weiter, statt ihn zu überschreiben', () => {
    // Monat 1: es gibt noch nichts zu vergleichen.
    let state = handOver<Record<string, number>>(null, { gruene: 0.20 })
    expect(state.previous).toBeNull()

    // Monat 2: der Stand aus Monat 1 wird zum Vorherigen.
    state = handOver(state.settled, { gruene: 0.23 })
    expect(state.previous).toEqual({ gruene: 0.20 })
    expect(state.settled).toEqual({ gruene: 0.23 })

    // Monat 3: und wandert weiter, statt liegen zu bleiben.
    state = handOver(state.settled, { gruene: 0.21 })
    expect(state.previous).toEqual({ gruene: 0.23 })
  })

  it('liest aus zwei aufeinanderfolgenden Monaten eine Richtung', () => {
    const first = handOver<Record<string, number>>(null, { gruene: 0.20 })
    const second = handOver(first.settled, { gruene: 0.23 })
    expect(drift(second.settled.gruene, second.previous?.gruene)).toBe(1)

    const third = handOver(second.settled, { gruene: 0.19 })
    expect(drift(third.settled.gruene, third.previous?.gruene)).toBe(-1)
  })

  it('nennt den ersten Monat nicht „gefallen“, nur weil nichts davor liegt', () => {
    const first = handOver<Record<string, number>>(null, { gruene: 0.20 })
    expect(drift(first.settled.gruene, first.previous?.gruene)).toBe(0)
  })

  it('hält Rauschen für Stillstand und ein Zehntelpunkt für Bewegung', () => {
    expect(drift(0.2001, 0.2)).toBe(0)
    expect(drift(0.2010, 0.2)).toBe(1)
    expect(drift(0.1990, 0.2)).toBe(-1)
  })

  /*
   * Und der Fehler selbst, als Test: den neuen Stand in beide Seiten zu schreiben, ergibt immer
   * Stillstand. Genau das tat die alte Fassung jeden Monat.
   */
  it('zeigt, warum der alte Griff nie etwas anzeigte', () => {
    const wrong = { previous: { gruene: 0.23 }, settled: { gruene: 0.23 } }
    expect(drift(wrong.settled.gruene, wrong.previous.gruene)).toBe(0)
  })
})
