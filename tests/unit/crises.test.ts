import type { EventDefinition } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'

/**
 * The rules that make a crisis a crisis rather than another motion.
 *
 * Lindenhafen has two kinds of event and the difference is not decoration. A decision is something
 * the player puts on the agenda when they have a council behind them. A crisis arrives whether they
 * are ready or not, costs before anybody votes, and gives them a fortnight.
 *
 * These are checked rather than trusted because the two kinds live in one list and are one field
 * apart, and the cheapest possible mistake is to give a flood a coalition threshold — which would
 * mean a minority council simply never has a flood.
 */

/**
 * Reines Kassenglück und Kassenpech: `fin-windfall-*` und `fin-shock-*`.
 *
 * These are held apart from the crises on purpose. A crisis is supposed to be earned — a flood finds
 * the city that never raised its quay wall — and the rule below enforces it. A Betriebsprüfung, a
 * Kreisumlage, a bequest are the opposite by design: they are the weather of a treasury, and the
 * reason the money in this game moves in both directions instead of only down. They get their own
 * rules further below, because "must read the city" is exactly what they must not do.
 */
const FISCAL_LUCK = EVENTS.filter(event => /^fin-(?:windfall|shock)-/.test(event.id))

/**
 * Was die **Lage** in Lindenhafen auslöst: `lage-*`.
 *
 * Auch das passiert dem Spieler, aber es ist keine Krise — es ist die Welt, die eine Tür aufmacht.
 * Ein Gaspreisschock kostet sofort und gehört zu den Krisen; eine Bundesausschreibung und ein
 * Aufschwung, der Flächen sucht, kosten nichts, bevor jemand abgestimmt hat, und sollen es auch
 * nicht. Die Regel „eine Krise kostet, bevor abgestimmt wird" trennt genau diese beiden Fälle, und
 * eine Gelegenheit darf nicht daran scheitern, dass sie eine ist.
 */
const OPPORTUNITIES = EVENTS.filter(event => event.id.startsWith('lage-') && event.immediateEffects.length === 0)

/** What happens *to* the player, as opposed to what they table. */
const CRISES = EVENTS.filter(event =>
  (event.kind === 'incident' || event.kind === 'external')
  && !FISCAL_LUCK.includes(event)
  && !OPPORTUNITIES.includes(event))

function named(event: EventDefinition): string {
  return `${event.id} (${event.title})`
}

describe('the crises', () => {
  it('exist in a useful number', () => {
    expect(CRISES.length, 'the half of the game that happens to you is the thin half').toBeGreaterThanOrEqual(8)
  })

  /*
   * The one that matters most. A crisis with a coalition threshold is a crisis a minority council
   * never has — which would turn the hardest way to play the game into the safest.
   */
  it('never waits for a majority', () => {
    for (const crisis of CRISES)
      expect(crisis.trigger.minCoalitionSeats, `${named(crisis)} waits for a coalition`).toBeUndefined()
  })

  it('costs something before anybody has voted on it', () => {
    for (const crisis of CRISES) {
      if (crisis.options.length === 0)
        continue
      expect(crisis.immediateEffects.length, `${named(crisis)} is a decision wearing a crisis's clothes`).toBeGreaterThan(0)
    }
  })

  it('gives the council a fortnight, not a year', () => {
    for (const crisis of CRISES)
      expect(crisis.expiresInMonths, `${named(crisis)} can be sat on`).toBeLessThanOrEqual(3)
  })

  /*
   * Sitting on a crisis is an answer, and `defaultOptionId` is what that answer costs. An event
   * whose default names nothing silently does nothing instead, which is a different game.
   */
  it('says what happens when the council does not answer', () => {
    for (const crisis of CRISES) {
      if (crisis.options.length < 2)
        continue
      const fallback = crisis.options.find(option => option.id === crisis.defaultOptionId)
      expect(fallback, `${named(crisis)}: defaultOptionId names no option of its own`).toBeDefined()
    }
  })

  /*
   * Most of them are earned — by a number the council has been moving for years (a flood defence
   * nobody maintained, an administration nobody patched, a city that let itself split) or by a
   * decision it actually took, which is the strongest kind of all.
   *
   * Not every one. A virus is not the council's fault and pretending it is would be worse modelling
   * than admitting it. But if *most* crises fired out of nowhere, the game would be weather rather
   * than politics.
   */
  it('is mostly earned rather than rolled', () => {
    const earned = CRISES.filter(crisis =>
      crisis.trigger.conditions.length > 0
      || (crisis.trigger.requiresChoiceIds?.length ?? 0) > 0
      || (crisis.trigger.requiresEventIds?.length ?? 0) > 0)
    expect(earned.length * 2, 'more than half the crises read nothing about the city').toBeGreaterThan(CRISES.length)
  })

  it('buys capacity rather than writing outcomes, like everything else', () => {
    const outcomeOnly = ['crimeRate', 'burglaryRate', 'satisfaction', 'employment', 'youthUnemployment', 'averageRent']
    for (const crisis of CRISES) {
      for (const option of crisis.options) {
        for (const write of option.effects)
          expect(outcomeOnly, `${named(crisis)} sets ${write.target} directly`).not.toContain(write.target)
      }
    }
  })

  /*
   * Was für das Kassenglück gilt, statt „verdient sein".
   */
  it('keeps fiscal luck two-sided and bounded', () => {
    const cash = (event: EventDefinition) =>
      event.immediateEffects.filter(e => e.target === 'cityBudget').reduce((sum, e) => sum + e.expected, 0)

    const up = FISCAL_LUCK.filter(event => cash(event) > 0)
    const down = FISCAL_LUCK.filter(event => cash(event) < 0)
    expect(up.length, 'kein Kassenglück, nur Pech').toBeGreaterThan(0)
    expect(down.length, 'kein Kassenpech, nur Glück').toBeGreaterThan(0)

    // Weder Seite darf die andere erdrücken: ein Jahrzehnt soll sich beides anfühlen können.
    const plus = up.reduce((sum, event) => sum + cash(event), 0)
    const minus = -down.reduce((sum, event) => sum + cash(event), 0)
    expect(Math.max(plus, minus) / Math.min(plus, minus), 'eine Seite wiegt mehr als doppelt so schwer').toBeLessThan(2)

    for (const event of FISCAL_LUCK) {
      // 20 Mio. sind gut zwei Drittel eines Monatsumsatzes. Darüber ist es keine Laune mehr,
      // sondern ein Ereignis, über das der Rat abstimmen können müsste.
      expect(Math.abs(cash(event)), `${named(event)} bewegt zu viel auf einmal`).toBeLessThanOrEqual(20)
      expect(event.options, `${named(event)} hat Optionen — dann gehört es zu den Entscheidungen`).toEqual([])
    }
  })

  it('lets the world open a door as well as slam one', () => {
    // Die Lage muss in beide Richtungen wirken, sonst ist sie nur ein zweiter Krisengenerator.
    const world = EVENTS.filter(event => event.id.startsWith('lage-'))
    expect(world.length, 'die Lage löst nichts aus').toBeGreaterThanOrEqual(4)
    expect(OPPORTUNITIES.length, 'die Lage bringt nur schlechte Nachrichten').toBeGreaterThan(0)
    expect(world.length - OPPORTUNITIES.length, 'die Lage bringt nur gute Nachrichten').toBeGreaterThan(0)

    // Und jedes davon liest wirklich die Welt, nicht die Stadt.
    const keys = new Set(['gasPrice', 'economy', 'federalFunds', 'migrationPressure'])
    for (const event of world) {
      expect(
        event.trigger.conditions.some(condition => keys.has(condition.metric)),
        `${named(event)} heißt „Lage" und schaut auf keine einzige Weltgröße`,
      ).toBe(true)
    }
  })
})
