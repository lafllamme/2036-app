import type { EventOption, PartyId } from '../../app/core/contracts'
import type { VoteContext } from '../../app/simulation/council'
import { describe, expect, it } from 'vitest'
import { EVENTS, getEvent } from '../../app/content/events'
import { getParty, mapParties, PARTIES } from '../../app/content/parties'
import { createRandomStream } from '../../app/core/rng'
import { castVote, forecastVote, supportFor } from '../../app/simulation/council'
import { advanceMonths, createInitialState, forecastsForEvent, proposePolicy } from '../../app/simulation/model'

const seats = mapParties(party => party.stats.councilSeats)
const noSalience = mapParties(() => false)

function context(overrides: Partial<VoteContext> = {}): VoteContext {
  return {
    parties: PARTIES,
    seatsByParty: seats,
    coalitionPartyIds: [],
    playerPartyId: null,
    playerNegotiation: 50,
    relationships: {},
    publicPressure: 0,
    fiscalStress: 0,
    salientCategories: noSalience,
    ...overrides,
  }
}

function option(overrides: Partial<EventOption> = {}): EventOption {
  return {
    id: 'test-option',
    label: 'Testvorlage',
    rationale: 'Test',
    oneOffCost: 0,
    monthlyCost: 0,
    axes: {},
    salience: {},
    effects: [],
    sourceIds: [],
    ...overrides,
  }
}

describe('council voting', () => {
  it('gives the most support to the party whose position is closest', () => {
    const climateMotion = option({ axes: { climateAmbition: 0.9 }, salience: { climateAmbition: 1 } })
    const supports = PARTIES.map(party => ({ id: party.id, support: supportFor(party, climateMotion, context()) }))
    const best = supports.reduce((top, entry) => (entry.support > top.support ? entry : top))
    expect(best.id).toBe('gruene')
  })

  it('caps support for an option that crosses a red line', () => {
    const party = getParty('gruene')
    const antiClimate = option({ axes: { climateAmbition: -0.9 }, salience: { climateAmbition: 1 } })
    expect(supportFor(party, antiClimate, context())).toBeLessThanOrEqual(0.15)
  })

  it('produces an exact majority probability between zero and one', () => {
    const forecast = forecastVote(option({ axes: { redistribution: 0.5 }, salience: { redistribution: 1 } }), context())
    expect(forecast.majorityProbability).toBeGreaterThanOrEqual(0)
    expect(forecast.majorityProbability).toBeLessThanOrEqual(1)
    const seatTotal = forecast.parties.reduce((sum, party) => sum + party.seats, 0)
    expect(seatTotal).toBe(60)
    for (const party of forecast.parties) {
      const total = party.probabilities.yes + party.probabilities.no + party.probabilities.abstain
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('reproduces the same vote from the same seed, so a defeat cannot be rerolled', () => {
    const motion = option({ axes: { marketVsPublic: -0.4 }, salience: { marketVsPublic: 1 } })
    const cast = () => castVote(motion, context(), createRandomStream(2036, 'vote:12:test:test-option'))
    expect(cast()).toEqual(cast())
  })

  it('counts a majority of votes cast, ignoring abstentions', () => {
    const motion = option({ axes: { fiscalRestraint: 0.5 }, salience: { fiscalRestraint: 1 } })
    const result = castVote(motion, context(), createRandomStream(7, 'vote:1:x:y'))
    expect(result.yesSeats + result.noSeats + result.abstainSeats).toBe(60)
    expect(result.passed).toBe(result.yesSeats > result.noSeats)
  })

  it('raises support when the player has negotiated with a party', () => {
    const party = getParty('fdp')
    const motion = option({ axes: { marketVsPublic: -0.3 }, salience: { marketVsPublic: 1 } })
    const before = supportFor(party, motion, context({ playerNegotiation: 80 }))
    const after = supportFor(party, motion, context({ playerNegotiation: 80, relationships: { fdp: 1 } }))
    expect(after).toBeGreaterThan(before)
  })
})

describe('a motion of your own', () => {
  /*
   * Die eigene Fraktion stimmte auf eigenen Vorlagen wie jede andere — gewürfelt aus der
   * inhaltlichen Nähe. Das Ergebnis war absurd: die LINKE brachte den Gewerbesteuer-Pakt ein und
   * ihre eigenen Abgeordneten stimmten zu hundert Prozent dagegen, während das Modell das
   * Einbringen gleichzeitig als Zustimmung wertete. Wer fragt, ist dafür.
   */
  it('is backed by your own group, whoever you are and whatever it says', () => {
    for (const party of PARTIES) {
      const state = createInitialState(2036, party.id, [])
      for (const policyId of ['housing-accelerator', 'transit-network', 'business-tax-balance']) {
        const forecast = forecastsForEvent(state, policyId)[policyId]
        const own = forecast?.parties.find(entry => entry.partyId === party.id)
        expect(own?.probabilities.yes, `${party.id} auf ${policyId}`).toBe(1)
      }
    }
  })

  it('counts those seats when the chamber actually votes', () => {
    // Die gemeinsame Konsolidierungsvorlage: die LINKE kann sie einbringen und mag sie nicht.
    // Genau deshalb ist sie der Prüfstein — wer einbringt, stimmt zu, auch gegen die eigene Neigung.
    const state = createInitialState(2036, 'linke', [])
    const { result } = proposePolicy(state, 'shared-consolidation')
    const own = result?.votes.find(entry => entry.partyId === 'linke')
    expect(own?.vote).toBe('yes')
    expect(result!.yesSeats).toBeGreaterThanOrEqual(own!.seats)
  })

  it('refuses to table another group\'s programme', () => {
    // Bis hierher bekam jede Partei dieselben drei Vorlagen: die LINKE konnte die
    // Gewerbesteuersenkung einbringen und die FDP den kommunalen Wohnungsbau.
    const linke = createInitialState(2036, 'linke', [])
    expect(proposePolicy(linke, 'business-tax-balance').result).toBeNull()
    const fdp = createInitialState(2036, 'fdp', [])
    expect(proposePolicy(fdp, 'housing-accelerator').result).toBeNull()
    // Das eigene Programm und das gemeinsame gehen weiterhin.
    expect(proposePolicy(fdp, 'business-tax-balance').result).not.toBeNull()
    expect(proposePolicy(linke, 'shared-maintenance').result).not.toBeNull()
  })

  it('leaves a foreign motion rolled, because that vote is the question', () => {
    let state = createInitialState(2036, 'spd', [])
    state = advanceMonths(state, 40)
    const foreign = state.pending.find(entry => entry.tabledBy)
    if (!foreign)
      return
    const forecast = forecastsForEvent(state, foreign.eventId)[foreign.tabledOptionId!]
    const own = forecast?.parties.find(entry => entry.partyId === 'spd')
    expect(own?.probabilities.yes).toBeLessThan(1)
  })
})

describe('a motion somebody else tabled', () => {
  /*
   * Stage six of the political model. A council in which only one group ever brings anything forward
   * is not a council; it is a vending machine with six observers. What the player brings to a foreign
   * motion is what every other party has always brought — their seats, and which way they go.
   */
  function played(party: PartyId, months: number) {
    return advanceMonths(createInitialState(2_036, party, ['affordable-rent', 'work', 'reliable-transit']), months)
  }

  it('happens, and names both the party and the option they chose', () => {
    let state = createInitialState(2_036, 'cdu', ['affordable-rent', 'work', 'reliable-transit'])
    const tabled: { by: PartyId, option: string }[] = []
    for (let month = 0; month < 131; month += 1) {
      const before = state.pending.map(entry => entry.eventId)
      state = advanceMonths(state, 1)
      for (const entry of state.pending) {
        if (before.includes(entry.eventId) || !entry.tabledBy)
          continue
        tabled.push({ by: entry.tabledBy, option: entry.tabledOptionId! })
      }
    }
    expect(tabled.length, 'a whole decade without one opposition motion').toBeGreaterThan(0)
    for (const motion of tabled)
      expect(motion.option, 'a proposer tabled nothing in particular').toBeTruthy()
  })

  /*
   * The first one is not rolled for, and the reason is the complaint that produced it: at a rate
   * that only looked reasonable on paper, a decade holds about fifteen motions and a quarter of them
   * being foreign meant a player could go two years without meeting the mechanic at all. An
   * opposition the player never learns they have is not an opposition.
   */
  it('has the opposition table something within the first year, whoever the player is', () => {
    for (const party of ['spd', 'cdu', 'gruene', 'linke', 'fdp', 'afd'] as PartyId[]) {
      let state = createInitialState(2_036, party, ['affordable-rent', 'work', 'reliable-transit'])
      let first = -1
      for (let month = 0; month < 24 && first < 0; month += 1) {
        const before = state.pending.map(entry => entry.eventId)
        state = advanceMonths(state, 1)
        for (const entry of state.pending) {
          if (!before.includes(entry.eventId) && entry.tabledBy)
            first = month + 1
        }
      }
      expect(first, `${party} never met the chamber they are in`).toBeGreaterThan(0)
      expect(first, `${party} waited too long for it`).toBeLessThanOrEqual(12)
    }
  })

  /*
   * And the other side of the same dial. The core of the game is the player's own agenda — choosing
   * an option, campaigning for it, negotiating it through — so the opposition has to be a constant
   * presence without taking the chamber over.
   */
  it('still leaves most of the agenda to the player', () => {
    let foreign = 0
    let own = 0
    for (const party of ['spd', 'cdu', 'gruene', 'linke'] as PartyId[]) {
      let state = createInitialState(2_036, party, ['affordable-rent', 'work', 'reliable-transit'])
      for (let month = 0; month < 131; month += 1) {
        const before = state.pending.map(entry => entry.eventId)
        state = advanceMonths(state, 1)
        for (const entry of state.pending) {
          if (before.includes(entry.eventId))
            continue
          if (entry.tabledBy)
            foreign += 1
          else own += 1
        }
      }
    }
    const share = foreign / (foreign + own)
    expect(share, 'the opposition has gone quiet again').toBeGreaterThan(0.2)
    expect(share, 'the player is no longer running the council').toBeLessThan(0.45)
  })

  /*
   * Not answering is abstaining, not vetoing and not choosing something else.
   *
   * The first version applied the event's own `defaultOptionId` when any motion expired, which for a
   * foreign motion meant ignoring the CDU quietly adopted an option the CDU had not tabled and
   * nobody had voted on. A chamber votes on what is on the agenda.
   */
  it('votes on an ignored foreign motion anyway, with the player abstaining', () => {
    let state = createInitialState(2_036, 'gruene', ['affordable-rent', 'work', 'reliable-transit'])
    let tabled: { eventId: string, optionId: string, expires: number } | null = null
    for (let month = 0; month < 40 && !tabled; month += 1) {
      state = advanceMonths(state, 1)
      const entry = state.pending.find(candidate => candidate.tabledBy)
      if (entry)
        tabled = { eventId: entry.eventId, optionId: entry.tabledOptionId!, expires: entry.expiresMonth }
    }
    expect(tabled, 'no foreign motion inside three years').not.toBeNull()

    // Sit on it until it lapses.
    while (state.month <= tabled!.expires)
      state = advanceMonths(state, 1)

    expect(state.pending.some(entry => entry.eventId === tabled!.eventId), 'it is still waiting').toBe(false)
    expect(state.firedOnce, 'the chamber never voted on it').toContain(tabled!.eventId)
    const other = getEvent(tabled!.eventId)!.options.find(option => option.id !== tabled!.optionId)
    expect(
      state.choices.includes(`${tabled!.eventId}:${other?.id}`),
      'an option nobody tabled was adopted instead',
    ).toBe(false)
  })

  it('is never tabled by the player or by anybody in their coalition', () => {
    let state = createInitialState(2_036, 'spd', ['affordable-rent', 'work', 'reliable-transit'])
    for (let month = 0; month < 131; month += 1) {
      const coalition = state.coalitionPartyIds
      state = advanceMonths(state, 1)
      for (const entry of state.pending) {
        if (!entry.tabledBy)
          continue
        expect(entry.tabledBy, 'the player tabled their own opposition motion').not.toBe('spd')
        expect(coalition, 'a coalition partner tabled against the coalition').not.toContain(entry.tabledBy)
      }
    }
  })

  /*
   * The player's group is the one party in the chamber whose vote is decided rather than rolled. The
   * roll is still taken, so that a foreign motion consumes the stream exactly as an own motion does —
   * otherwise the same council would vote differently depending on who happened to table it.
   */
  it('counts the player’s seats the way the player casts them', () => {
    const state = played('spd', 40)
    const event = EVENTS.find(candidate => candidate.options.length > 1)!
    const option = event.options[0]!
    const base = context({ seatsByParty: state.seatsByParty, coalitionPartyIds: state.coalitionPartyIds, playerPartyId: 'spd' })
    for (const choice of ['yes', 'no', 'abstain'] as const) {
      const result = castVote(option, { ...base, playerVote: choice }, createRandomStream(1, 'vote'))
      expect(result.votes.find(record => record.partyId === 'spd')?.vote).toBe(choice)
    }
  })

  it('leaves every other party rolled exactly as it would have been', () => {
    const state = played('spd', 40)
    const event = EVENTS.find(candidate => candidate.options.length > 1)!
    const option = event.options[0]!
    const base = context({ seatsByParty: state.seatsByParty, coalitionPartyIds: state.coalitionPartyIds, playerPartyId: 'spd' })
    const rolled = castVote(option, base, createRandomStream(7, 'vote'))
    const decided = castVote(option, { ...base, playerVote: 'no' }, createRandomStream(7, 'vote'))
    const others = (result: typeof rolled) => result.votes.filter(record => record.partyId !== 'spd')
    expect(others(decided)).toEqual(others(rolled))
  })
})
