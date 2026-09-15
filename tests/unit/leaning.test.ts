import type { PartyId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { PARTIES } from '../../app/content/parties'
import { initialSupport } from '../../app/simulation/electorate'
import { citizenAt } from '../../app/world/citizens'
import { leaningOf, positionOf } from '../../app/world/leaning'

/**
 * Who the people on the pavement would vote for.
 *
 * The city computes a whole electorate and the player could only read it as a percentage in the
 * corner of the screen, while four hundred and twenty people with names and biographies walked past
 * without an opinion between them. These are the same thing from two ends.
 */
const SEED = 2036
const CROWD = 2_000
const people = Array.from({ length: CROWD }, (_, index) => ({ index, citizen: citizenAt(index, SEED, 0.22) }))

function tally(support: Record<PartyId, number>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const person of people) {
    const party = leaningOf(person.citizen, person.index, SEED, support)
    counts[party] = (counts[party] ?? 0) + 1
  }
  return counts
}

describe('a person on the pavement', () => {
  it('answers the same way twice', () => {
    const support = initialSupport()
    for (const person of people.slice(0, 50))
      expect(leaningOf(person.citizen, person.index, SEED, support)).toBe(leaningOf(person.citizen, person.index, SEED, support))
  })

  it('stands somewhere on every axis, and never off the scale', () => {
    for (const person of people.slice(0, 200)) {
      for (const [axis, value] of Object.entries(positionOf(person.citizen, person.index, SEED))) {
        expect(value, `${person.index}/${axis}`).toBeGreaterThanOrEqual(-1)
        expect(value, `${person.index}/${axis}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('keeps the same position however the city leans', () => {
    // People do not become different people because the council did something. Only which party is
    // nearest to them can change.
    const before = positionOf(people[7]!.citizen, 7, SEED)
    const after = positionOf(people[7]!.citizen, 7, SEED)
    expect(after).toEqual(before)
  })
})

describe('the crowd as a whole', () => {
  it('has voters for every party', () => {
    const counts = tally(initialSupport())
    for (const party of PARTIES)
      expect(counts[party.id] ?? 0, party.id).toBeGreaterThan(0)
  })

  it('follows the city when the city turns', () => {
    /*
     * The committed do not move and the margin does — which is what an electorate is. A party the
     * city is turning toward takes the people who were nearly there anyway.
     */
    const even = Object.fromEntries(PARTIES.map(party => [party.id, 1 / PARTIES.length])) as Record<PartyId, number>
    for (const party of PARTIES) {
      const swung = { ...even, [party.id]: 0.6 }
      const normalised = normalise(swung)
      expect(tally(normalised)[party.id] ?? 0, party.id).toBeGreaterThan(tally(even)[party.id] ?? 0)
    }
  })

  it('never hands the whole city to one party', () => {
    // Weather, not gravity. Even at sixty per cent support, the parties furthest from it keep the
    // people who are furthest from it too.
    const swung = normalise({ cdu: 0.6, afd: 0.08, spd: 0.08, gruene: 0.08, linke: 0.08, fdp: 0.08 })
    const counts = tally(swung)
    expect((counts.cdu ?? 0) / CROWD).toBeLessThan(0.9)
  })

  it('is older on the cautious side and younger on the climate side', () => {
    /*
     * Not a claim about anybody's politics — a demographic tendency, and the only one worth
     * asserting because it is the one the model deliberately puts in. Any individual can come out
     * anywhere; what has to survive is the shape of the whole crowd.
     */
    const olds = people.filter(person => person.citizen.age >= 68)
    const youngs = people.filter(person => person.citizen.age >= 18 && person.citizen.age <= 30)
    const mean = (group: typeof people, axis: 'climateAmbition'): number =>
      group.reduce((sum, person) => sum + positionOf(person.citizen, person.index, SEED)[axis], 0) / Math.max(1, group.length)
    expect(mean(youngs, 'climateAmbition')).toBeGreaterThan(mean(olds, 'climateAmbition'))
  })
})

function normalise(support: Record<PartyId, number>): Record<PartyId, number> {
  const total = Object.values(support).reduce((sum, value) => sum + value, 0)
  return Object.fromEntries(Object.entries(support).map(([id, value]) => [id, value / total])) as Record<PartyId, number>
}

describe('the crowd against the poll', () => {
  /*
   * They are not the same thing and should not match exactly: `support` is the whole electorate, the
   * crowd is the few hundred people on the pavement at this hour. What must hold is that a party
   * with real support is never invisible on the street — the first version of this model gave the
   * party furthest from the centre no voters at all, because a cloud of centrists is nearest to
   * nobody's corner.
   */
  it('never leaves a party with real support invisible on the street', () => {
    const support = initialSupport()
    const counts = tally(support)
    for (const party of PARTIES) {
      if (support[party.id] < 0.1)
        continue
      expect((counts[party.id] ?? 0) / CROWD, party.id).toBeGreaterThan(0.04)
    }
  })
})
