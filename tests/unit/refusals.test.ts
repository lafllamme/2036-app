import type { EventDrawState } from '../../app/simulation/events'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { BASELINE_METRICS } from '../../app/simulation/baseline'
import { eligibleEvents } from '../../app/simulation/events'
import { advanceMonths, createInitialState, motionOnTheAgenda, proposePolicy, resolveDecision, voteOnMotion } from '../../app/simulation/model'
import { BASELINE_SITUATION } from '../../app/simulation/situation'

/**
 * „Nein heißt nicht weg."
 *
 * Die Vorlage ist verbraucht — dieselbe kommt nicht wieder, sonst könnte man den Rat so lange fragen,
 * bis er Ja sagt. Die Ursache bleibt und wird teurer: sie kommt in anderer Form zurück, und der
 * Zustand dafür ist die Lücke zwischen zwei Listen, die es ohnehin gibt — gefragt (`firedOnce`),
 * aber nichts beschlossen (`choices`).
 */

const RETURNS = EVENTS.filter(event => event.trigger.requiresRefusedEventIds?.length)

function drawState(overrides: Partial<EventDrawState> = {}): EventDrawState {
  return {
    month: 60,
    metrics: { ...BASELINE_METRICS, ...BASELINE_SITUATION },
    cooldowns: {},
    streaks: {},
    firedOnce: [],
    choices: [],
    openDecisions: 0,
    activeMeasureSources: [],
    coalitionSeats: 31,
    ...overrides,
  }
}

describe('what comes back because it was refused', () => {
  it('exists for the decisions worth returning to', () => {
    expect(RETURNS.length, 'keine einzige Ablehnung hat ein Nachspiel').toBeGreaterThanOrEqual(5)
    for (const event of RETURNS) {
      for (const id of event.trigger.requiresRefusedEventIds!) {
        const parent = EVENTS.find(candidate => candidate.id === id)
        expect(parent, `${event.id} setzt ${id} voraus, das es nicht gibt`).toBeDefined()
        expect(parent!.options.length, `${id} ist keine Vorlage, kann also nicht abgelehnt werden`).toBeGreaterThan(0)
      }
    }
  })

  it('stays away while the council has never been asked', () => {
    for (const event of RETURNS)
      expect(eligibleEvents(drawState(), 1).map(entry => entry.id)).not.toContain(event.id)
  })

  it('stays away when the council carried it after all', () => {
    for (const event of RETURNS) {
      const parentId = event.trigger.requiresRefusedEventIds![0]!
      const parent = EVENTS.find(candidate => candidate.id === parentId)!
      const carried = drawState({ firedOnce: [parentId], choices: [`${parentId}:${parent.options[0]!.id}`] })
      expect(eligibleEvents(carried, 1).map(entry => entry.id), event.id).not.toContain(event.id)
    }
  })

  it('returns once the council was asked and decided nothing', () => {
    for (const event of RETURNS) {
      const parentId = event.trigger.requiresRefusedEventIds![0]!
      const refused = drawState({ firedOnce: [parentId], month: event.trigger.earliestMonth + 1 })
      expect(eligibleEvents(refused, 1).map(entry => entry.id), `${event.id} kommt nach der Ablehnung von ${parentId} nicht wieder`)
        .toContain(event.id)
    }
  })

  it('asks for more than it did the first time', () => {
    // Die Ursache wird teurer. Sonst wäre Ablehnen gratis und das Nachspiel eine zweite Chance.
    for (const event of RETURNS) {
      const parentId = event.trigger.requiresRefusedEventIds![0]!
      const parent = EVENTS.find(candidate => candidate.id === parentId)!
      const price = (options: typeof parent.options): number =>
        Math.max(...options.map(option => option.oneOffCost + option.monthlyCost * 24))
      expect(price(event.options), `${event.id} ist nicht teurer als ${parentId}`)
        .toBeGreaterThan(price(parent.options))
    }
  })

  /*
   * Eine Ablehnung ist kein Beschluss.
   *
   * Der Preis einer Ablehnung läuft durch dieselbe Funktion wie ein Beschluss, weil beide über
   * Monate wirken. Landete er dabei in `choices`, hieß „abgelehnt" dasselbe wie „beschlossen": die
   * Vorlage kam nie wieder, und die Tür, die sich hinter dem Nein öffnen sollte, blieb zu. Gemessen
   * stand danach **keine einzige** der sechs Elternvorlagen jemals als abgelehnt da — 0 von 786
   * Monaten —, während der Rat sie in Wahrheit in vier von fünf Fällen ablehnte.
   */
  it('does not write a refusal into the list of what the council did', () => {
    const parentId = RETURNS[0]!.trigger.requiresRefusedEventIds![0]!
    let state = createInitialState(2036, 'linke', [])
    let refusedOnce = false

    for (let month = 0; month < 131 && !refusedOnce; month += 1) {
      state = advanceMonths(state, 1)
      for (const entry of [...state.pending]) {
        const single = motionOnTheAgenda(state, entry.eventId)
        const options = EVENTS.find(candidate => candidate.id === entry.eventId)?.options ?? []
        const { state: next, result } = single
          ? voteOnMotion(state, entry.eventId, 'no')
          : resolveDecision(state, entry.eventId, options[options.length - 1]!.id)
        state = next
        if (result && !result.passed) {
          refusedOnce = true
          expect(
            state.choices.filter(choice => choice.startsWith(`${entry.eventId}:`)),
            `${entry.eventId} wurde abgelehnt und steht trotzdem unter dem, was der Rat getan hat`,
          ).toEqual([])
          expect(state.firedOnce, 'eine abgelehnte Vorlage gilt trotzdem als gestellt').toContain(entry.eventId)
        }
      }
    }
    expect(refusedOnce, 'in einem Jahrzehnt wurde nichts abgelehnt').toBe(true)
    expect(parentId.length).toBeGreaterThan(0)
  })

  /*
   * Eine stehende Vorlage ist keine, zu der man Haltung bezieht.
   *
   * Sie liegt im eigenen Programm, bis man sie einbringt — und Einbringen *ist* die Haltung. Seit der
   * Formregel zeigte das Blatt auch auf ihr „Dafür · Enthalten · Dagegen", weil sie eine Option hat;
   * der Knopf rief dann `voteOnMotion`, das einen Eintrag in `pending` sucht, für eine stehende
   * Vorlage keinen findet und nichts tut. Das Blatt schloss sich, und die Vorlage lag weiter da.
   */
  it('has no agenda entry for a standing motion, so voting on it does nothing', () => {
    const state = createInitialState(2036, 'spd', [])
    expect(motionOnTheAgenda(state, 'housing-accelerator')).toBeNull()
    expect(voteOnMotion(state, 'housing-accelerator', 'yes').result).toBeNull()
    // Der Weg hinein ist das Einbringen, und das lässt den Rat abstimmen.
    expect(proposePolicy(state, 'housing-accelerator').result).not.toBeNull()
  })
})
