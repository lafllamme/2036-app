import { describe, expect, it } from 'vitest'
import { ageAt, citizenAt, statureAt } from '../../app/world/citizens'

/**
 * Everyone in the street is somebody, and nobody is stored.
 *
 * Two things have to hold and neither is visible from the screen. A citizen has to be the same
 * person every time they are asked about, or pointing at the same figure twice tells the player two
 * different stories. And the share of the city whose family came from elsewhere has to be the only
 * thing the composition follows — because that share comes from the simulation, and everything else
 * about a person must be independent of it.
 */
const SHARE = 0.18

describe('the people in the street', () => {
  it('gives the same answer for the same person every time', () => {
    for (const index of [0, 1, 7, 128, 499]) {
      expect(citizenAt(index, 2_036, SHARE)).toEqual(citizenAt(index, 2_036, SHARE))
    }
  })

  it('gives different people different lives', () => {
    const names = new Set(Array.from({ length: 200 }, (_, index) => citizenAt(index, 2_036, SHARE).name))
    // Not all distinct — a city has repeated names — but nothing like one name for everybody.
    expect(names.size).toBeGreaterThan(120)
  })

  it('follows the city share and only the city share', () => {
    const abroadAt = (share: number): number =>
      Array.from({ length: 600 }, (_, index) => citizenAt(index, 2_036, share))
        .filter(citizen => citizen.origin.country !== 'Deutschland')
        .length / 600

    expect(abroadAt(0)).toBe(0)
    expect(abroadAt(0.2)).toBeGreaterThan(0.12)
    expect(abroadAt(0.2)).toBeLessThan(0.28)
    expect(abroadAt(0.4)).toBeGreaterThan(abroadAt(0.2))
  })

  it('stays in Europe', () => {
    const elsewhere = ['USA', 'Syrien', 'Afghanistan', 'China', 'Brasilien', 'Nigeria']
    const countries = new Set(Array.from({ length: 800 }, (_, index) => citizenAt(index, 2_036, 0.6).origin.country))
    for (const country of elsewhere)
      expect(countries.has(country)).toBe(false)
  })

  it('never lets one part of a person decide another', () => {
    /*
     * The rule the whole thing hangs on. A job is not predictable from an origin and an origin is
     * not predictable from a job: if either were, the game would be telling the player something
     * about people that it has no business telling them.
     */
    const people = Array.from({ length: 1_200 }, (_, index) => citizenAt(index, 2_036, 0.35))
    const german = people.filter(person => person.origin.country === 'Deutschland')
    const abroad = people.filter(person => person.origin.country !== 'Deutschland')

    for (const job of ['Handwerk', 'Pflege', 'Büro und Verwaltung', 'Reinigung']) {
      const hereShare = german.filter(person => person.job === job).length / german.length
      const thereShare = abroad.filter(person => person.job === job).length / abroad.length
      // Within five points of each other: the same distribution, drawn from a different stream.
      expect(Math.abs(hereShare - thereShare), job).toBeLessThan(0.05)
    }
  })

  it('gives nobody a life they are too young or too old for', () => {
    for (let index = 0; index < 800; index += 1) {
      const person = citizenAt(index, 2_036, SHARE)
      expect(person.age).toBeGreaterThanOrEqual(0)
      expect(person.age).toBeLessThan(92)
      if (person.age >= 67)
        expect(person.job).toBe('Rente')
      if (person.age < 6)
        expect(['zu Hause', 'Kita']).toContain(person.job)
      if (person.age >= 6 && person.age < 18)
        expect(['Grundschule', 'Schule']).toContain(person.job)
      // Nobody arrived before they were born.
      expect(person.since).toBeGreaterThanOrEqual(2_026 - person.age)
    }
  })

  it('has children in it at all', () => {
    /*
     * The first version drew an age off a power curve starting at sixteen, so the youngest person in
     * Lindenhafen was a school leaver and the schools the council funds had nobody in them.
     */
    const ages = Array.from({ length: 2_000 }, (_, index) => ageAt(index, 2_036))
    const share = (from: number, to: number): number => ages.filter(age => age >= from && age < to).length / ages.length

    expect(share(0, 18)).toBeGreaterThan(0.12)
    expect(share(0, 6)).toBeGreaterThan(0.03)
    // And is not all children either: Germany's real shape, roughly.
    expect(share(18, 67)).toBeGreaterThan(0.55)
    expect(share(67, 200)).toBeGreaterThan(0.12)
    expect(share(67, 200)).toBeLessThan(0.3)
  })

  it('draws children shorter than adults, from age and nothing else', () => {
    for (let index = 0; index < 400; index += 1) {
      const age = ageAt(index, 2_036)
      const stature = statureAt(index, 2_036)
      expect(stature).toBeGreaterThan(0.3)
      expect(stature).toBeLessThanOrEqual(1)
      if (age >= 18)
        expect(stature).toBeGreaterThan(0.95)
      if (age < 8)
        expect(stature).toBeLessThan(0.8)
    }
    // It has to be the same age both modules see, or a figure's height and its card disagree.
    for (const index of [3, 41, 199])
      expect(ageAt(index, 2_036)).toBe(citizenAt(index, 2_036, SHARE).age)
  })

  it('gives enough different names that a street is not a cast', () => {
    const names = new Set(Array.from({ length: 700 }, (_, index) => citizenAt(index, 2_036, SHARE).name))
    // Repeats are correct — a city of this size has several Anna Meyers — but not many of them.
    expect(names.size).toBeGreaterThan(600)
  })
})
