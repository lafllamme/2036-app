import type { CityMetrics, PartyId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { CAMPAIGN_GOALS, goalIsMet } from '../../app/content/goals'
import { hotspotTemplate } from '../../app/content/hotspots'
import { policiesFor } from '../../app/content/policies'
import { advanceMonths, answerSituation, createInitialState, motionOnTheAgenda, resolveDecision, voteOnMotion, voteOnPolicy } from '../../app/simulation/model'

/**
 * Ein Ziel muss zu schaffen sein — und nicht von allein.
 *
 * Der vorherige Zielkatalog stand als Wunschzettel in `GAME_DESIGN.md`, und sieben seiner zehn Ziele
 * waren über zehn durchgespielte Jahrzehnte nicht einmal annähernd erreichbar: „Beschäftigung über
 * 75 %" gegen einen Höchstwert von 74,1, „Ohne Wohnung unter 300" gegen eine Zahl, die sich in jedem
 * Lauf verdreifachte. Auffallen konnte das nicht — ein Ziel, das man verfehlt, sieht aus wie ein
 * Ziel, das man verfehlt hat.
 *
 * Also wird hier gespielt statt geschätzt: sechs Parteien, acht Haltungen, jeweils zehn Jahre. Ein
 * Ziel muss in mindestens einem dieser Läufe erfüllt sein und in mindestens einem verfehlt. Beides
 * hat denselben Grund — eine Wertung, die niemand schafft, ist keine, und eine, die jeder
 * nebenher mitnimmt, auch nicht.
 */

const PARTIES: PartyId[] = ['spd', 'cdu', 'gruene', 'linke', 'fdp', 'afd']
const FIELDS: string[][] = [
  ['housing'],
  ['economy', 'finance'],
  ['safety'],
  ['environment'],
  ['mobility'],
  ['social'],
  ['housing', 'economy', 'finance', 'safety', 'environment', 'mobility', 'social', 'governance'],
  [],
]

/** Ein Jahrzehnt, in dem der Spieler alles mitträgt, was in seine Ressorts fällt. */
function play(party: PartyId, favour: string[]): CityMetrics {
  let state = createInitialState(2036, party, [])
  if (favour.length > 0) {
    for (const policy of policiesFor(party)) state = voteOnPolicy(state, policy.id).state
  }

  for (let month = 0; month < 131; month += 1) {
    state = advanceMonths(state, 1)
    /*
     * Brennpunkte beantworten, und zwar mit dem billigsten, was frei ist.
     *
     * Dieser Lauf spielt einen kompetenten, nicht einen ehrgeizigen Spieler — und ein kompetenter
     * lässt eine Einbruchserie nicht vier Monate laufen, bis sie ihn Kapital kostet und eine andere
     * Fraktion die Vorlage einbringt. Ohne diese drei Zeilen maß der Test die Stadt eines Spielers,
     * der eine ganze Mechanik nicht kennt, und erklärte prompt ein Kampagnenziel für unerreichbar.
     */
    for (const spot of [...state.hotspots]) {
      if (spot.answer)
        continue
      const free = hotspotTemplate(spot.kind).answers.filter(answer => !answer.needsPolicy).sort((a, b) => (a.cost + a.monthly * a.months) - (b.cost + b.monthly * b.months))[0]
      if (free)
        state = answerSituation(state, spot.id, free.id)
    }
    for (const entry of [...state.pending]) {
      const event = EVENTS.find(candidate => candidate.id === entry.eventId)!
      const wanted = favour.includes(event.category)
      const single = motionOnTheAgenda(state, entry.eventId)
      if (single) {
        const option = event.options.find(candidate => candidate.id === single)!
        state = voteOnMotion(state, entry.eventId, wanted || option.monthlyCost <= 0 ? 'yes' : 'no').state
        continue
      }
      const ranked = [...event.options].sort((a, b) =>
        (b.oneOffCost + b.monthlyCost * 60) - (a.oneOffCost + a.monthlyCost * 60))
      const option = wanted ? ranked[0] : ranked[ranked.length - 1]
      if (option)
        state = resolveDecision(state, entry.eventId, option.id).state
    }
  }
  return state.metrics
}

const outcomes: CityMetrics[] = PARTIES.flatMap(party => FIELDS.map(favour => play(party, favour)))

describe('the three hard goals', () => {
  it('can each be reached, and each be missed', () => {
    const impossible: string[] = []
    const free: string[] = []
    for (const goal of CAMPAIGN_GOALS) {
      const values = outcomes.map(metrics => metrics[goal.metric as keyof CityMetrics] as number)
      const met = values.filter(value => goalIsMet(goal, value)).length
      const span = `${Math.min(...values).toFixed(1)} … ${Math.max(...values).toFixed(1)}`
      if (met === 0)
        impossible.push(`${goal.id}: ${goal.direction === 'above' ? '>' : '<'} ${goal.threshold}, erreicht wird nur ${span}`)
      if (met === values.length)
        free.push(`${goal.id}: ${goal.direction === 'above' ? '>' : '<'} ${goal.threshold}, immer erfüllt (${span})`)
    }
    expect(impossible, 'diese Ziele kann niemand erreichen').toEqual([])
    expect(free, 'diese Ziele bekommt man geschenkt').toEqual([])
  })

  it('names a metric the city actually has, and a field that exists', () => {
    const fields = new Set(['housing', 'employment', 'mobility', 'climate', 'cohesion', 'fiscalHealth'])
    for (const goal of CAMPAIGN_GOALS) {
      expect(outcomes[0]![goal.metric as keyof CityMetrics], `${goal.id} nennt keine Kennzahl`).toBeTypeOf('number')
      expect(fields.has(goal.field), `${goal.id} nennt kein Politikfeld`).toBe(true)
    }
  })

  it('offers enough of a catalogue that three choices are a choice', () => {
    expect(CAMPAIGN_GOALS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(CAMPAIGN_GOALS.map(goal => goal.id)).size).toBe(CAMPAIGN_GOALS.length)
    // Und jedes Politikfeld trägt mindestens ein Ziel, sonst wäre der Schwerpunkt unwählbar.
    for (const field of ['housing', 'employment', 'mobility', 'climate', 'cohesion', 'fiscalHealth'])
      expect(CAMPAIGN_GOALS.some(goal => goal.field === field), `${field} hat kein Ziel`).toBe(true)
  })
})
