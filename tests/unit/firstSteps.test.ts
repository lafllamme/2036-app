import { describe, expect, it } from 'vitest'
import { FIRST_STEPS, stepCleared } from '../../app/content/firstSteps'

/**
 * Das Drehbuch der Einarbeitung, geprüft ohne Oberfläche.
 *
 * Die Einarbeitung hat eine Eigenschaft, die ihr niemand ansieht und die alles entscheidet: sie
 * **wartet** an zwei Stellen auf den Spieler. Steht dort versehentlich `hand`, klickt man sich in
 * acht Sekunden durch und hat nichts getan; fehlt umgekehrt zu einem wartenden Schritt der Satz, der
 * sagt, worauf gewartet wird, sitzt man vor einer Karte ohne Knopf und weiß nicht, dass man an der
 * Reihe ist. Beides sieht in der Vorschau richtig aus.
 */

const ANCHORS = ['none', 'seats', 'rail', 'motions', 'ways', 'submit', 'advance']

describe('einarbeitung', () => {
  it('lässt den Spieler zweimal wirklich handeln, und nicht nur klicken', () => {
    const waits = FIRST_STEPS.filter(step => step.gate !== 'hand')
    expect(waits.map(step => step.gate)).toEqual(['sheetOpen', 'voteCast'])
    // Erst die Vorlage öffnen, dann sie einbringen — in dieser Reihenfolge und nicht andersherum.
    expect(FIRST_STEPS.indexOf(waits[0]!)).toBeLessThan(FIRST_STEPS.indexOf(waits[1]!))
  })

  it('sagt bei jedem wartenden Schritt, worauf gewartet wird', () => {
    for (const step of FIRST_STEPS) {
      if (step.gate === 'hand')
        expect(step.waiting).toBeUndefined()
      else expect(step.waiting, step.id).toBeTruthy()
    }
  })

  it('zeigt nur auf Flächen, die es gibt', () => {
    for (const step of FIRST_STEPS)
      expect(ANCHORS, step.id).toContain(step.anchor)
    expect(new Set(FIRST_STEPS.map(step => step.id)).size).toBe(FIRST_STEPS.length)
  })

  /** Der erste Satz muss von der eigenen Fraktion handeln, sonst handelt er von niemandem. */
  it('setzt das eigene Kürzel genau einmal ein, und zwar zuerst', () => {
    const withParty = FIRST_STEPS.filter(step => step.title.includes('{partei}') || step.body.includes('{partei}'))
    expect(withParty).toHaveLength(1)
    expect(withParty[0]).toBe(FIRST_STEPS[0])
  })

  it('hält einen wartenden Schritt fest, bis die Handlung passiert ist', () => {
    const open = FIRST_STEPS.find(step => step.gate === 'sheetOpen')!
    const vote = FIRST_STEPS.find(step => step.gate === 'voteCast')!

    expect(stepCleared(open, { sheetOpen: false, voteCast: false })).toBe(false)
    expect(stepCleared(open, { sheetOpen: true, voteCast: false })).toBe(true)
    // Eine Abstimmung räumt nicht den Schritt davor ab, und umgekehrt auch nicht.
    expect(stepCleared(open, { sheetOpen: false, voteCast: true })).toBe(false)
    expect(stepCleared(vote, { sheetOpen: true, voteCast: false })).toBe(false)
    expect(stepCleared(vote, { sheetOpen: false, voteCast: true })).toBe(true)
  })

  it('geht bei einem Schritt mit Knopf nie von selbst weiter', () => {
    for (const step of FIRST_STEPS.filter(step => step.gate === 'hand'))
      expect(stepCleared(step, { sheetOpen: true, voteCast: true }), step.id).toBe(false)
  })
})
