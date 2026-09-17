import type { CityMetrics } from '../../app/core/contracts'
import type { RandomStream } from '../../app/core/rng'
import type { Hotspot } from '../../app/simulation/hotspots'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { HOTSPOTS, hotspotTemplate } from '../../app/content/hotspots'
import { BASELINE_METRICS } from '../../app/simulation/baseline'
import { answerHotspot, chanceOf, openHotspot, stepHotspots, TIPPING_LEVEL } from '../../app/simulation/hotspots'
import { advanceMonths, createInitialState } from '../../app/simulation/model'

/**
 * Brennpunkte — die zweite Uhr.
 *
 * Zwei Eigenschaften tragen das Ganze, und beide sind unsichtbar, wenn man nur hinsieht:
 *
 * **Er entsteht aus der Kennzahl und nicht aus einem Würfel.** Eine Stadt mit ruhigen Zahlen bekommt
 * keine Serien; wer die Ordnungsbehörde zusammenstreicht, bekommt sie häufiger. Ein fester
 * Zufallswert wäre eine Belästigung ohne Ursache, und genau das verbietet `docs/CITY_LIFE.md`.
 *
 * **Und er eskaliert, solange nichts passiert.** Ein Brennpunkt, den man ignorieren kann, ist keiner.
 * Nur so ist „später" eine Entscheidung und keine Selbstverständlichkeit.
 */

function metrics(over: Partial<CityMetrics> = {}): CityMetrics {
  return { ...BASELINE_METRICS, ...over }
}

/** Ein Strom, der immer dasselbe sagt — damit „passiert es?" keine Frage des Glücks ist. */
function stream(value: number): RandomStream {
  return {
    next: () => value,
    between: (a, b) => a + (b - a) * value,
    integer: (a, b) => Math.floor(a + (b - a + 1) * value),
    pick: <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(items.length * value))]!,
  }
}

const BURGLARY = hotspotTemplate('burglary')

describe('brennpunkte', () => {
  it('bleibt aus, solange die Kennzahl ruhig ist', () => {
    expect(chanceOf(BURGLARY, metrics({ burglaryRate: BURGLARY.quiet }))).toBe(0)
    expect(chanceOf(BURGLARY, metrics({ burglaryRate: BURGLARY.quiet - 5 }))).toBe(0)
  })

  it('kommt häufiger, je schlechter die Zahl steht', () => {
    // Ein Zehntel über der Schwelle — mehr bewegt sich diese Kennzahl im ganzen Spiel nicht.
    const wenig = chanceOf(BURGLARY, metrics({ burglaryRate: BURGLARY.quiet + 0.1 }))
    const viel = chanceOf(BURGLARY, metrics({ burglaryRate: BURGLARY.loud }))
    expect(wenig).toBeGreaterThan(0)
    expect(viel).toBeGreaterThan(wenig)
    // Und nie so oft, dass jeder Monat einen bringt.
    expect(chanceOf(BURGLARY, metrics({ burglaryRate: 500 }))).toBeLessThan(0.5)
  })

  it('macht höchstens einen auf und nie zweimal im selben Bezirk', () => {
    const loud = metrics({ burglaryRate: 500, investmentBacklog: 500 })
    const first = openHotspot([], loud, 3, stream(0))!
    expect(first).not.toBeNull()

    const again = openHotspot([first], loud, 4, stream(0))!
    expect(again.districtId).not.toBe(first.districtId)
  })

  it('steigt jeden Monat ohne Antwort und kippt am Ende', () => {
    let open: Hotspot[] = [{ id: 'a', kind: 'burglary', districtId: 'gruenderzeit-nord', level: 1, openedMonth: 0, answer: null }]
    const levels: number[] = []
    let tipped = 0
    for (let month = 1; month <= 6; month += 1) {
      const step = stepHotspots(open, month)
      open = step.open
      tipped += step.tipped.length
      if (open[0])
        levels.push(open[0].level)
    }
    expect(levels).toEqual([2, 3, 4])
    expect(tipped).toBe(1)
    expect(open).toHaveLength(0)
  })

  /** Der Unterschied zwischen „ich habe etwas getan" und „ich habe es weggeklickt". */
  it('steigt nicht, solange eine Antwort läuft', () => {
    const open: Hotspot[] = [{ id: 'a', kind: 'burglary', districtId: 'gruenderzeit-nord', level: 3, openedMonth: 0, answer: { id: 'patrols', until: 9 } }]
    const step = stepHotspots(open, 5)
    expect(step.open[0]!.level).toBe(3)
    expect(step.tipped).toHaveLength(0)

    // Und wenn sie ausgelaufen ist, geht es weiter, wo es aufgehört hat.
    expect(stepHotspots(open, 9).open[0]!.level).toBe(4)
  })

  it('beendet die Lage, wenn die Antwort den Pegel unter eins drückt', () => {
    const open: Hotspot[] = [{ id: 'a', kind: 'burglary', districtId: 'gruenderzeit-nord', level: 2, openedMonth: 0, answer: null }]
    const done = answerHotspot(open, 'a', 'patrols', 4, () => true)!

    expect(done.closed).toBe(true)
    expect(done.open).toHaveLength(0)
    expect(done.monthly).toBeGreaterThan(0)
  })

  it('deckelt nur, wenn die Antwort zu schwach für den Pegel ist', () => {
    const open: Hotspot[] = [{ id: 'a', kind: 'burglary', districtId: 'gruenderzeit-nord', level: 4, openedMonth: 0, answer: null }]
    const done = answerHotspot(open, 'a', 'lighting', 4, () => true)!

    expect(done.closed).toBe(false)
    expect(done.open[0]!.level).toBe(3)
    expect(done.cost).toBeGreaterThan(0)
  })

  /**
   * Der Satz, den das Spiel bisher nie ausspricht: auf der Karte kannst du fast nichts, bis ein
   * Beschluss es freigeschaltet hat.
   */
  it('gibt die gesperrte Antwort erst nach dem Ratsbeschluss frei', () => {
    const open: Hotspot[] = [{ id: 'a', kind: 'burglary', districtId: 'gruenderzeit-nord', level: 4, openedMonth: 0, answer: null }]
    expect(answerHotspot(open, 'a', 'cameras', 4, () => false)).toBeNull()
    expect(answerHotspot(open, 'a', 'cameras', 4, () => true)?.closed).toBe(true)
  })

  it('nimmt keine zweite Antwort an, solange eine läuft', () => {
    const open: Hotspot[] = [{ id: 'a', kind: 'burglary', districtId: 'gruenderzeit-nord', level: 3, openedMonth: 0, answer: { id: 'patrols', until: 9 } }]
    expect(answerHotspot(open, 'a', 'lighting', 5, () => true)).toBeNull()
  })

  it('hält jede Lage in Bezirken, in denen sie überhaupt vorkommen kann', () => {
    for (const template of HOTSPOTS) {
      expect(template.districts.length, template.kind).toBeGreaterThanOrEqual(3)
      expect(template.answers.length, template.kind).toBeGreaterThanOrEqual(2)
      // Mindestens eine Antwort ohne Beschluss, sonst ist die Lage keine Handlung, sondern eine Strafe.
      expect(template.answers.some(answer => !answer.needsPolicy), template.kind).toBe(true)
      /*
       * Und der stärkste Hebel muss eine Lage auf der **letzten** Stufe beenden können. Kann er es
       * nicht, gibt es einen Zustand, aus dem man mit keiner Antwort mehr herauskommt — dann ist die
       * teure Antwort keine Lösung, sondern eine Verzögerung mit Rechnung.
       */
      expect(Math.max(...template.answers.map(answer => answer.relief)), template.kind).toBeGreaterThanOrEqual(TIPPING_LEVEL)
    }
  })

  /**
   * Die Kette statt zweier Stränge.
   *
   * „Einbruchserie im Wohnring Süd“ gab es schon als Ratsereignis, und beim Durchspielen standen
   * kurz beide nebeneinander — zweimal dieselbe Sache mit zwei Bedienungen. Wer die Lage aussitzt,
   * bekommt sie jetzt als Vorlage auf den Tisch, und dann muss es dieses Ereignis auch geben.
   */
  it('eskaliert in eine Vorlage, die es wirklich gibt', () => {
    for (const template of HOTSPOTS) {
      const event = EVENTS.find(entry => entry.id === template.escalation)
      expect(event, `${template.kind} → ${template.escalation}`).toBeDefined()
      // Und in eine, über die der Rat auch abstimmen kann.
      expect(event!.options.length, template.escalation).toBeGreaterThan(0)
      expect(event!.kind, template.escalation).toBe('decision')
    }
  })

  /** Und derselbe Weg einmal ganz: ausgesessen, gekippt, im Rat gelandet. */
  it('legt die ausgesessene Lage als Vorlage auf den Tisch und schickt die Rechnung', () => {
    const opened: Hotspot = { id: 'x', kind: 'burglary', districtId: 'gruenderzeit-nord', level: TIPPING_LEVEL, openedMonth: 0, answer: null }
    const before = { ...createInitialState(2036), hotspots: [opened] }
    const after = advanceMonths(before, 1)

    expect(after.hotspots).toHaveLength(0)
    // Bezahlt wird im Rat und nicht bei den Mieten.
    expect(after.metrics.politicalCapital).toBeLessThan(before.metrics.politicalCapital)
    expect(after.pending.map(entry => entry.eventId)).toContain('saf-burglary-series')
  })

  /**
   * Die Schwellen gegen das, was die Kennzahlen wirklich tun.
   *
   * Dreimal danebengelegen, und jedes Mal unsichtbar: `burglaryRate` startet bei 3,4 und erreicht in
   * einer völlig vernachlässigten Amtszeit höchstens 4,4 — eine Schwelle bei 9 heißt, dass es diese
   * Lage im ganzen Spiel nicht gibt. Beim Sanierungsstau lief es umgekehrt: bei 60 gegen 160 stand er
   * die halbe Amtszeit auf der Höchstwahrscheinlichkeit, bei 95 gegen 300 passierte gar nichts mehr.
   *
   * Aufgefallen ist es erst, als die Bezirkswerte auf der Gebäudekarte standen und dort „Einbrüche
   * 3,9 / 1.000“ zu lesen war. Ein Inhalt, den niemand je sieht, meldet sich nicht — also fragt ihn
   * dieser Test.
   */
  it('lässt über ein vernachlässigtes Jahrzehnt beide Arten wirklich vorkommen', () => {
    let state = createInitialState(2036)
    const count: Record<string, number> = { burglary: 0, fire: 0 }

    for (let month = 0; month < 131; month += 1) {
      const before = state.hotspots.length
      state = advanceMonths(state, 1)
      const newest = state.hotspots[state.hotspots.length - 1]
      if (state.hotspots.length > before && newest)
        count[newest.kind] = (count[newest.kind] ?? 0) + 1
    }

    expect(count.burglary, 'Einbruchserien').toBeGreaterThan(0)
    expect(count.fire, 'Brandserien').toBeGreaterThan(0)
    // Etwa alle fünf Monate einer. Deutlich mehr wäre Lärm, deutlich weniger tote Mechanik.
    const total = count.burglary! + count.fire!
    expect(total).toBeGreaterThanOrEqual(12)
    expect(total).toBeLessThanOrEqual(45)
  })
})
