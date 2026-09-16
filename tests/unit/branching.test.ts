import type { EventDrawState } from '../../app/simulation/events'
import { describe, expect, it } from 'vitest'
import { EVENTS, getEvent } from '../../app/content/events'
import { BASELINE_METRICS } from '../../app/simulation/baseline'
import { eligibleEvents } from '../../app/simulation/events'
import { BASELINE_SITUATION } from '../../app/simulation/situation'

/**
 * The doors: what a decision makes impossible.
 *
 * A decade in which every event turns up regardless of what the player did is a decade in which
 * nothing was decided. These check the one thing that is easy to get wrong and impossible to notice
 * — an event that can never appear, because a door names a choice that does not exist.
 */

/** A city with nothing decided, nothing carried, nothing on cooldown, every metric at the baseline. */
function drawState(overrides: Partial<EventDrawState> = {}): EventDrawState {
  return {
    month: 40,
    metrics: { ...BASELINE_METRICS, ...BASELINE_SITUATION },
    firedOnce: [],
    choices: [],
    cooldowns: {},
    streaks: {},
    activeMeasureSources: [],
    openDecisions: 0,
    coalitionSeats: 60,
    ...overrides,
  }
}

function canAppear(id: string, state: EventDrawState): boolean {
  return eligibleEvents(state, 6).some(event => event.id === id)
}

/** Every measure id a `blockedByMeasureIds` names — which is an *event* id, not a choice. */
function everyMeasureDoor(): { event: string, measure: string }[] {
  return EVENTS.flatMap(event =>
    (event.trigger.blockedByMeasureIds ?? []).map(measure => ({ event: event.id, measure })))
}

/** Every `eventId:optionId` a door names, across the whole library. */
function everyDoor(): { event: string, field: string, choice: string }[] {
  return EVENTS.flatMap(event => [
    ...(event.trigger.requiresChoiceIds ?? []).map(choice => ({ event: event.id, field: 'requiresChoiceIds', choice })),
    ...(event.trigger.blockedByChoiceIds ?? []).map(choice => ({ event: event.id, field: 'blockedByChoiceIds', choice })),
  ])
}

describe('the doors in the event library', () => {
  /*
   * The test worth having. A door whose choice id is misspelled does not fail, does not warn and
   * does not crash — the event simply never appears for the rest of the decade, in every campaign,
   * and the only way anybody finds out is by not finding out.
   */
  it('names only choices that actually exist', () => {
    const doors = everyDoor()
    expect(doors.length, 'no event gates on a choice — the branching is decorative').toBeGreaterThan(0)
    for (const door of doors) {
      const [eventId, optionId] = door.choice.split(':')
      const event = getEvent(eventId ?? '')
      expect(event, `${door.event}.${door.field}: no event "${eventId}"`).toBeDefined()
      const option = event?.options.find(candidate => candidate.id === optionId)
      expect(option, `${door.event}.${door.field}: "${eventId}" has no option "${optionId}"`).toBeDefined()
    }
  })

  it('blocks only on measures that a real event can actually start', () => {
    const doors = everyMeasureDoor()
    expect(doors.length, 'blockedByMeasureIds is in the contract and used by nothing').toBeGreaterThan(0)
    for (const door of doors) {
      const source = getEvent(door.measure)
      expect(source, `${door.event} blocks on measure "${door.measure}", which is no event`).toBeDefined()
      expect(source?.options.length, `"${door.measure}" has no options, so it can start no measure`).toBeGreaterThan(0)
    }
  })

  it('never gates an event on a choice made in itself, which could never be reached', () => {
    for (const door of everyDoor()) {
      if (door.field !== 'requiresChoiceIds')
        continue
      expect(door.choice.split(':')[0], `${door.event} requires a choice in itself`).not.toBe(door.event)
    }
  })

  it('keeps an event behind its door until the choice has been carried', () => {
    const behind = EVENTS.find(event => event.trigger.requiresChoiceIds?.length)
    expect(behind).toBeDefined()
    const required = behind!.trigger.requiresChoiceIds![0]!
    expect(canAppear(behind!.id, drawState())).toBe(false)
    expect(canAppear(behind!.id, drawState({ choices: [required] }))).toBe(true)
  })

  /*
   * The distinction the whole design rests on. `firedOnce` says the council was *asked*; `choices`
   * says the city *did* it. A motion tabled and voted down changes what the street thinks of the
   * player and does not change a single street — so it opens nothing.
   */
  it('does not open a door for a motion that was put and lost', () => {
    const behind = EVENTS.find(event => event.trigger.requiresChoiceIds?.length)!
    const source = behind.trigger.requiresChoiceIds![0]!.split(':')[0]!
    expect(canAppear(behind.id, drawState({ firedOnce: [source] }))).toBe(false)
  })

  it('shuts an event for good once the choice that blocks it has been carried', () => {
    const blocked = EVENTS.find(event => event.trigger.blockedByChoiceIds?.length)
    expect(blocked).toBeDefined()
    const shut = blocked!.trigger.blockedByChoiceIds![0]!
    expect(canAppear(blocked!.id, drawState({ choices: [shut] }))).toBe(false)
  })

  /*
   * One site, two futures. This is the fork the design is named after: whichever of the two the
   * council takes first, the other stops being on offer — not delayed, gone.
   */
  it('lets the Kesselbrink site be a park or a data centre, and never both', () => {
    const park = 'env-green-offensive'
    const centre = 'eco-datacenter'
    const thin = { ...BASELINE_METRICS, ...BASELINE_SITUATION, greenSpacePerCapita: 18 }

    const open = drawState({ month: 40, metrics: thin })
    expect(canAppear(park, open) && canAppear(centre, open), 'both are on offer while the site is free').toBe(true)

    const parked = drawState({ month: 40, metrics: thin, choices: ['env-green-offensive:env-green-program'] })
    expect(canAppear(centre, parked)).toBe(false)

    const built = drawState({ month: 40, metrics: thin, choices: ['eco-datacenter:eco-datacenter-accept'] })
    expect(canAppear(park, built)).toBe(false)
  })

  /*
   * Only for `requiresChoiceIds`. A block has no ordering to get wrong — it says "if this has
   * already happened", and it is perfectly reasonable for the thing that blocks to be the later of
   * the two. A requirement does have one: an event that can arrive before the decision it waits for
   * is possible is an event that waits for nothing.
   */
  it('puts every required choice within reach before the event that waits for it', () => {
    for (const door of everyDoor()) {
      if (door.field !== 'requiresChoiceIds')
        continue
      const source = getEvent(door.choice.split(':')[0] ?? '')!
      const gated = EVENTS.find(event => event.id === door.event)!
      expect(
        source.trigger.earliestMonth,
        `${door.event} can arrive before ${source.id} is even possible`,
      ).toBeLessThanOrEqual(gated.trigger.earliestMonth)
    }
  })
})
