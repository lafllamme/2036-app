import { describe, expect, it } from 'vitest'
import { citizenAt } from '../../app/world/citizens'

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

  it('gives nobody a working life they are too young or too old for', () => {
    for (let index = 0; index < 500; index += 1) {
      const person = citizenAt(index, 2_036, SHARE)
      expect(person.age).toBeGreaterThanOrEqual(16)
      expect(person.age).toBeLessThan(90)
      if (person.age > 66)
        expect(person.job).toBe('Rente')
      if (person.age < 19)
        expect(['Schule', 'Studium']).toContain(person.job)
      // Nobody arrived before they were born.
      expect(person.since).toBeGreaterThanOrEqual(2_026 - person.age)
    }
  })
})
