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

/** What happens *to* the player, as opposed to what they table. */
const CRISES = EVENTS.filter(event => event.kind === 'incident' || event.kind === 'external')

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
      if (crisis.options.length === 0)
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
})
