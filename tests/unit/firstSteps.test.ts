import type { StepWorld } from '../../app/content/firstSteps'
import { describe, expect, it } from 'vitest'
import { FIRST_STEPS, stepCleared } from '../../app/content/firstSteps'

/**
 * Das Drehbuch der Einarbeitung, geprüft ohne Oberfläche.
 *
 * Die Einarbeitung hat eine Eigenschaft, die ihr niemand ansieht und die alles entscheidet: sie
 * **wartet** an vier Stellen auf den Spieler. Steht dort versehentlich `hand`, klickt man sich in
 * zehn Sekunden durch und hat nichts getan; fehlt umgekehrt zu einem wartenden Schritt der Satz, der
 * sagt, worauf gewartet wird, sitzt man vor einer Karte ohne Knopf und weiß nicht, dass man an der
 * Reihe ist. Beides sieht in der Vorschau richtig aus.
 */

const ANCHORS = ['none', 'railButton', 'motionsButton', 'rail', 'seats', 'motions', 'ways', 'submit', 'advance']

const NOTHING: StepWorld = { railOpen: false, decisionsOpen: false, sheetOpen: false, voteCast: false }
const EVERYTHING: StepWorld = { railOpen: true, decisionsOpen: true, sheetOpen: true, voteCast: true }

describe('einarbeitung', () => {
  /**
   * Die Reihenfolge ist die Reihenfolge, in der jemand das Spiel kennenlernt: erst die Bedienung
   * (zwei Schubladen aufmachen), dann die eigene Vorlage, dann die Abstimmung. Wer das umstellt,
   * zeigt auf eine Fläche, die es an dieser Stelle noch gar nicht gibt.
   */
  it('lässt den Spieler viermal wirklich handeln, und in der richtigen Reihenfolge', () => {
    const waits = FIRST_STEPS.filter(step => step.gate !== 'hand')
    expect(waits.map(step => step.gate)).toEqual(['railOpen', 'decisionsOpen', 'sheetOpen', 'voteCast'])
  })

  /** Und die Fläche, die ein Schritt erklärt, kommt nach dem Klick, der sie aufmacht. */
  it('erklärt eine Schublade erst, nachdem sie aufgegangen ist', () => {
    const order = FIRST_STEPS.map(step => step.id)
    expect(order.indexOf('railButton')).toBeLessThan(order.indexOf('rail'))
    expect(order.indexOf('motionsButton')).toBeLessThan(order.indexOf('seats'))
    expect(order.indexOf('motionsButton')).toBeLessThan(order.indexOf('motions'))
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

  /**
   * Der erste Satz muss von der eigenen Fraktion handeln und der letzte den Spieler beim Namen
   * nennen — sonst hat die Einarbeitung mit niemandem gesprochen.
   */
  it('redet den Spieler am Anfang und am Ende persönlich an', () => {
    const withParty = FIRST_STEPS.filter(step => step.title.includes('{partei}') || step.body.includes('{partei}'))
    expect(withParty).toHaveLength(1)
    expect(withParty[0]).toBe(FIRST_STEPS[0])

    const withName = FIRST_STEPS.filter(step => step.title.includes('{name}') || step.body.includes('{name}'))
    expect(withName).toHaveLength(1)
    expect(withName[0]).toBe(FIRST_STEPS[FIRST_STEPS.length - 1])
    // Ohne Namen soll die Anrede spurlos verschwinden, also muss ein Komma davorstehen.
    expect(withName[0]!.title).toContain(', {name}')
  })

  it('hält einen wartenden Schritt fest, bis genau seine Handlung passiert ist', () => {
    for (const step of FIRST_STEPS.filter(item => item.gate !== 'hand')) {
      expect(stepCleared(step, NOTHING), step.id).toBe(false)
      expect(stepCleared(step, EVERYTHING), step.id).toBe(true)
      // Und nicht durch eine der anderen drei Handlungen.
      for (const other of ['railOpen', 'decisionsOpen', 'sheetOpen', 'voteCast'] as const) {
        if (other === step.gate)
          continue
        expect(stepCleared(step, { ...NOTHING, [other]: true }), `${step.id} durch ${other}`).toBe(false)
      }
    }
  })

  it('geht bei einem Schritt mit Knopf nie von selbst weiter', () => {
    for (const step of FIRST_STEPS.filter(step => step.gate === 'hand'))
      expect(stepCleared(step, EVERYTHING), step.id).toBe(false)
  })
})
