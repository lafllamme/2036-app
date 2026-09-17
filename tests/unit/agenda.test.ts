import { describe, expect, it } from 'vitest'
import {
  advanceMonths,
  AGENDA_SEATS,
  callUrgent,
  createInitialState,
  forecastsForEvent,
  holdSession,
  tableMotion,
  URGENCY_COST,
  withdrawMotion,
} from '../../app/simulation/model'

/**
 * Der Sitzungskalender.
 *
 * Die Zahl, um die es geht: Verhandeln kostet 12 politisches Kapital, eine Kampagne 18, und über die
 * ganze Amtszeit bekommt man rund 210 — genug für etwa siebzehn Verhandlungen in elf Jahren. Bis
 * hierher hat davon **niemand je einen Punkt ausgegeben**, und zwar aus einem einzigen Grund: wer
 * einbringt, stimmt in derselben Sekunde ab. Wer sofort abstimmen lassen kann, verhandelt nicht.
 *
 * Der Kalender legt einen Monat dazwischen. Das ist die ganze Änderung, und sie macht zwei fertig
 * gebaute Mechaniken zum ersten Mal zu einer Entscheidung.
 */

const SEED = 2036

describe('sitzungskalender', () => {
  it('bringt ein, ohne abzustimmen', () => {
    const before = createInitialState(SEED)
    const tabled = tableMotion(before, 'shared-consolidation', 'shared-consolidation')

    expect(tabled.agenda.map(item => item.sourceId)).toEqual(['shared-consolidation'])
    // Nichts beschlossen, nichts bezahlt, keine Maßnahme.
    expect(tabled.policies).toHaveLength(0)
    expect(tabled.metrics.cityBudget).toBe(before.metrics.cityBudget)
    expect(tabled.measures).toHaveLength(before.measures.length)
  })

  it('nimmt dieselbe Vorlage nicht zweimal und die vierte gar nicht', () => {
    let state = createInitialState(SEED)
    state = tableMotion(state, 'a', 'a')
    state = tableMotion(state, 'a', 'a')
    expect(state.agenda).toHaveLength(1)

    for (const id of ['b', 'c', 'd', 'e'])
      state = tableMotion(state, id, id)
    expect(state.agenda).toHaveLength(AGENDA_SEATS)
  })

  it('lässt einen Antrag zurückziehen, solange die Sitzung nicht war', () => {
    let state = tableMotion(createInitialState(SEED), 'shared-consolidation', 'shared-consolidation')
    state = withdrawMotion(state, 'shared-consolidation')
    expect(state.agenda).toHaveLength(0)
  })

  /** Und am Monatsende wird darüber abgestimmt — über alles, was draufsteht. */
  it('stimmt in der Sitzung über die ganze Tagesordnung ab', () => {
    let state = createInitialState(SEED)
    state = tableMotion(state, 'shared-consolidation', 'shared-consolidation')
    state = tableMotion(state, 'shared-maintenance', 'shared-maintenance')

    const session = holdSession(state)
    expect(session.results).toHaveLength(2)
    expect(session.state.agenda).toHaveLength(0)
  })

  it('führt die Sitzung beim Monatswechsel von selbst', () => {
    const tabled = tableMotion(createInitialState(SEED), 'shared-consolidation', 'shared-consolidation')
    const after = advanceMonths(tabled, 1)

    expect(after.agenda).toHaveLength(0)
    expect(after.lastSession).toHaveLength(1)
  })

  /**
   * Der Ausweg, ohne den der Kalender eine Falle wäre: Krisenereignisse haben Fristen von ein bis
   * zwei Monaten, und eine gesperrte Hafenbrücke wartet nicht auf die nächste Sitzung.
   */
  it('stimmt auf Dringlichkeitsantrag sofort ab, gegen Kapital', () => {
    const before = createInitialState(SEED)
    const outcome = callUrgent(before, 'shared-consolidation', 'shared-consolidation')

    expect(outcome.result).not.toBeNull()
    expect(outcome.state.metrics.politicalCapital).toBe(before.metrics.politicalCapital - URGENCY_COST)
    // Und sie liegt danach nicht mehr auf der Tagesordnung, sonst käme sie am Monatsende nochmal dran.
    expect(outcome.state.agenda).toHaveLength(0)
  })

  it('verweigert den Dringlichkeitsantrag ohne das Kapital dafür', () => {
    const broke = { ...createInitialState(SEED) }
    broke.metrics = { ...broke.metrics, politicalCapital: URGENCY_COST - 1 }

    const outcome = callUrgent(broke, 'shared-consolidation', 'shared-consolidation')
    expect(outcome.result).toBeNull()
    expect(outcome.state).toBe(broke)
  })

  it('kostet spürbar: eine Dringlichkeit ist fast eine Kampagne', () => {
    // 15 gegen 18 für eine Kampagne und 12 für eine Verhandlung — teuer genug, um selten zu sein.
    expect(URGENCY_COST).toBeGreaterThan(12)
    expect(URGENCY_COST).toBeLessThan(18)
  })

  /**
   * Der Monat gehört beiden Seiten.
   *
   * Bis hierher hat ihn nur eine benutzt: der Spieler verhandelte und machte Kampagne, und der Rat
   * sah zu. Ein Fenster, in dem nur einer arbeitet, ist kein Fenster, sondern eine Wartezeit mit
   * Knöpfen.
   *
   * Der Gegenwind entsteht beim **Einbringen** und nicht in der Sitzung, und das ist der ganze
   * Unterschied: am Monatsende entstünde er in derselben Sekunde wie die Abstimmung — sichtbar für
   * niemanden und zu beantworten von niemandem.
   */
  it('lässt die Gegenseite sich sofort gegen einen Antrag stellen', () => {
    let seen = 0
    // Über acht Parteikonstellationen, damit es nicht am Würfel eines einzigen Laufs hängt.
    for (const party of ['linke', 'gruene', 'spd', 'cdu', 'fdp', 'afd'] as const) {
      const state = tableMotion(createInitialState(SEED, party, []), 'shared-consolidation', 'shared-consolidation')
      if ((state.motionPrep['shared-consolidation']?.counteredBy.length ?? 0) > 0)
        seen += 1
    }
    expect(seen, 'irgendwer stellt sich quer').toBeGreaterThan(0)
  })

  it('stellt die eigene Fraktion nie gegen den eigenen Antrag', () => {
    for (const party of ['linke', 'gruene', 'spd', 'cdu', 'fdp', 'afd'] as const) {
      const state = tableMotion(createInitialState(SEED, party, []), 'shared-maintenance', 'shared-maintenance')
      expect(state.motionPrep['shared-maintenance']?.counteredBy ?? [], party).not.toContain(party)
    }
  })

  /** Und der Gegenwind muss die Abstimmung wirklich kosten, sonst ist er eine Meldung. */
  it('drückt die Aussicht der Vorlage, gegen die Front gemacht wird', () => {
    const plain = createInitialState(SEED, 'spd', [])
    const quiet = forecastsForEvent({ ...plain, motionPrep: {} }, 'saf-burglary-series')
    const loud = forecastsForEvent(
      { ...plain, motionPrep: { 'saf-burglary-series': { negotiatedPartyIds: [], campaignedOptionIds: [], counteredBy: ['cdu', 'fdp'] } } },
      'saf-burglary-series',
    )

    const option = Object.keys(quiet)[0]!
    expect(loud[option]!.majorityProbability).toBeLessThan(quiet[option]!.majorityProbability)
  })
})
