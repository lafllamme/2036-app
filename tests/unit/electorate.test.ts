import type { EventOption, PartyId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { PARTIES } from '../../app/content/parties'
import { BASELINE_METRICS } from '../../app/simulation/baseline'
import { driftFromCity, initialSupport, normalise, shiftFromDecision } from '../../app/simulation/electorate'
import { createInitialState, migrateState, snapshotOf } from '../../app/simulation/model'

/**
 * Who the city would vote for.
 *
 * The council was read once out of `parties.ts` and never again, so ten years of decisions changed
 * nothing about who governed. This is the half that was missing, and these are the properties it has
 * to keep whatever is done to it — a share of the vote is not a score.
 */
const PERCEPTION = { safety: 60, housingPressure: 50, trust: 50, mediaAttention: {} as never }
const GOVERNMENT: PartyId[] = ['cdu', 'fdp']
function sum(support: Record<PartyId, number>): number {
  return Object.values(support).reduce((total, value) => total + value, 0)
}

describe('the electorate', () => {
  it('starts as a share of one, not as the authored percentages', () => {
    expect(sum(initialSupport())).toBeCloseTo(1, 10)
    for (const party of PARTIES)
      expect(initialSupport()[party.id], party.id).toBeGreaterThan(0)
  })

  it('still adds to one after a decade of drifting', () => {
    let support = initialSupport()
    for (let month = 0; month < 132; month += 1)
      support = driftFromCity(support, { ...BASELINE_METRICS, satisfaction: 40 }, PERCEPTION, GOVERNMENT)
    expect(sum(support)).toBeCloseTo(1, 10)
  })

  it('credits a government that is making the city better', () => {
    const before = initialSupport()
    const after = driftFromCity(before, { ...BASELINE_METRICS, satisfaction: 88 }, { ...PERCEPTION, trust: 78 }, GOVERNMENT)
    const held = (support: typeof before): number => GOVERNMENT.reduce((total, id) => total + support[id], 0)
    expect(held(after)).toBeGreaterThan(held(before))
  })

  it('debits one that is making it worse', () => {
    const before = initialSupport()
    const after = driftFromCity(before, { ...BASELINE_METRICS, satisfaction: 34 }, { ...PERCEPTION, trust: 26 }, GOVERNMENT)
    const held = (support: typeof before): number => GOVERNMENT.reduce((total, id) => total + support[id], 0)
    expect(held(after)).toBeLessThan(held(before))
  })

  it('moves slowly enough that a term is what decides it', () => {
    /*
     * The one number that decides whether this is an electorate or a slot machine. Support that can
     * swing ten points on a bad month teaches the player to chase the number instead of governing.
     * A badly run city has to lose a term, not a month.
     */
    const before = initialSupport()
    const after = driftFromCity(before, { ...BASELINE_METRICS, satisfaction: 0 }, { ...PERCEPTION, trust: 0 }, GOVERNMENT)
    for (const party of PARTIES)
      expect(Math.abs(after[party.id] - before[party.id]), party.id).toBeLessThan(0.01)
  })

  it('loses a term over five years of governing badly', () => {
    let support = initialSupport()
    const held = (): number => GOVERNMENT.reduce((total, id) => total + support[id], 0)
    const start = held()
    for (let month = 0; month < 60; month += 1)
      support = driftFromCity(support, { ...BASELINE_METRICS, satisfaction: 30 }, { ...PERCEPTION, trust: 24 }, GOVERNMENT)
    expect(start - held()).toBeGreaterThan(0.03)
  })

  it('hands support to the edges in an angry city and to the middle in a calm one', () => {
    /*
     * Which party is "the edge" is not asserted by name — it is whichever is furthest from the
     * government on the seven axes, and naming one would be exactly the identity branch this model
     * is built to avoid.
     */
    const axes = Object.keys(PARTIES[0]!.axes) as (keyof typeof PARTIES[0]['axes'])[]
    const inGovernment = PARTIES.filter(party => GOVERNMENT.includes(party.id))
    const centre = Object.fromEntries(axes.map(axis => [
      axis,
      inGovernment.reduce((total, party) => total + party.axes[axis], 0) / inGovernment.length,
    ])) as Record<typeof axes[number], number>
    const outside = PARTIES.filter(party => !GOVERNMENT.includes(party.id))
    const distance = (party: typeof outside[number]): number =>
      axes.reduce((total, axis) => total + Math.abs(party.axes[axis] - centre[axis]), 0)
    const furthest = [...outside].sort((a, b) => distance(b) - distance(a))[0]!
    const nearest = [...outside].sort((a, b) => distance(a) - distance(b))[0]!

    const before = initialSupport()
    const bad = { ...BASELINE_METRICS, satisfaction: 30 }
    const calm = driftFromCity(before, { ...bad, polarisation: 5 }, { ...PERCEPTION, trust: 30 }, GOVERNMENT)
    const angry = driftFromCity(before, { ...bad, polarisation: 95 }, { ...PERCEPTION, trust: 30 }, GOVERNMENT)

    expect(angry[furthest.id] - before[furthest.id]).toBeGreaterThan(calm[furthest.id] - before[furthest.id])
    expect(calm[nearest.id] - before[nearest.id]).toBeGreaterThan(angry[nearest.id] - before[nearest.id])
  })
})

describe('one decision, seen from the street', () => {
  const anyOption = (): EventOption => {
    const option = EVENTS.flatMap(event => event.options).find(entry => entry.oneOffCost > 0)
    if (!option)
      throw new Error('no option to test with')
    return option
  }

  it('takes from somewhere to give to somewhere', () => {
    const before = initialSupport()
    const after = shiftFromDecision(before, anyOption())
    expect(sum(after)).toBeCloseTo(1, 10)
    // Zero-sum by construction: a decision everybody likes equally moves nothing.
    expect(Object.keys(after)).toHaveLength(PARTIES.length)
  })

  it('moves the vote toward whoever already wanted it', () => {
    const option = anyOption()
    const before = initialSupport()
    const after = shiftFromDecision(before, option)
    const moved = PARTIES.map(party => ({ id: party.id, delta: after[party.id] - before[party.id] }))
    expect(moved.some(entry => entry.delta > 0)).toBe(true)
    expect(moved.some(entry => entry.delta < 0)).toBe(true)
  })

  it('never lets a single motion decide an election', () => {
    const before = initialSupport()
    for (const option of EVENTS.flatMap(event => event.options)) {
      const after = shiftFromDecision(before, option)
      for (const party of PARTIES)
        expect(Math.abs(after[party.id] - before[party.id]), `${option.id}/${party.id}`).toBeLessThan(0.01)
    }
  })
})

describe('normalising', () => {
  it('survives anything it is handed', () => {
    expect(sum(normalise({ cdu: 0, afd: 0, spd: 0, gruene: 0, linke: 0, fdp: 0 }))).toBeCloseTo(1, 10)
    expect(sum(normalise({ cdu: -5, afd: 3, spd: 0, gruene: 0, linke: 0, fdp: 0 }))).toBeCloseTo(1, 10)
  })
})

describe('a campaign saved before the electorate existed', () => {
  /*
   * A save holds the whole simulation state, so every field added afterwards is missing from every
   * save written before it. `support` was the first, and the result was not a subtle bug: the city
   * rendered and the entire interface did not, because the HUD read `snapshot.support[partyId]` and
   * that threw. One line in the console was the only clue.
   */
  it('is brought up to shape rather than taking the interface down', () => {
    const old = createInitialState(2036, 'cdu', []) as unknown as Record<string, unknown>
    delete old.support
    const restored = migrateState(old as never)
    expect(sum(restored.support)).toBeCloseTo(1, 10)
    expect(snapshotOf(restored).support.cdu).toBeGreaterThan(0)
  })

  it('keeps everything the save did have', () => {
    const before = createInitialState(2036, 'gruene', ['climate'])
    const after = migrateState(before)
    expect(after.support).toEqual(before.support)
    expect(after.month).toBe(before.month)
    expect(after.partyId).toBe('gruene')
  })
})
