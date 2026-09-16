import { describe, expect, it } from 'vitest'
import { getBackground, LEADER_BACKGROUNDS } from '../../app/content/leaders'
import { PARTIES } from '../../app/content/parties'
import { BASE_CAPITAL_PER_MONTH } from '../../app/simulation/dynamics'
import { axisDistance } from '../../app/simulation/electorate'
import { advanceMonths, campaignCost, capitalPerMonth, createInitialState } from '../../app/simulation/model'

/**
 * Der Vorsitz.
 *
 * Man wählte eine Fraktion und war dann niemand: das Spiel sprach zehn Jahre lang von „der eigenen
 * Partei" und nie von einem Menschen. Ein Werdegang gibt dem Antritt ein Gesicht — und muss etwas
 * tun, sonst ist er Deko.
 */
describe('who takes the chair', () => {
  it('offers backgrounds that each do something different', () => {
    expect(LEADER_BACKGROUNDS.length).toBeGreaterThanOrEqual(4)
    expect(new Set(LEADER_BACKGROUNDS.map(entry => entry.id)).size).toBe(LEADER_BACKGROUNDS.length)

    for (const background of LEADER_BACKGROUNDS) {
      const changes
        = background.capitalPerMonth !== BASE_CAPITAL_PER_MONTH
          || background.startingRelationship !== 0
          || background.startingCapital !== 60
          || (background.campaignDiscount ?? 0) !== 0
      expect(changes, `${background.id} bewirkt nichts`).toBe(true)
      expect(background.effect.length, `${background.id} sagt nicht, was es bewirkt`).toBeGreaterThan(10)
    }
  })

  it('starts the council warmer for somebody the room already knows', () => {
    const union = createInitialState(2036, 'spd', [], { name: 'Test', backgroundId: 'union' })
    const plain = createInitialState(2036, 'spd', [], null)
    for (const party of PARTIES.filter(entry => entry.id !== 'spd'))
      expect(union.relationships[party.id]!).toBeGreaterThan(plain.relationships[party.id]!)
  })

  /*
   * Ein Rat ist am Tag der Konstituierung schon sortiert.
   *
   * Alle Verhältnisse standen auf null: sechs Fraktionen, die einen gleich gut kennen. Abgeleitet
   * wird das jetzt aus dem Achsenabstand — kein neuer Inhalt, keine gepflegte Matrix, und keine
   * Verzweigung auf eine Parteikennung.
   */
  it('seats the chamber before the first month, out of how far apart the groups stand', () => {
    for (const own of PARTIES) {
      const state = createInitialState(2036, own.id, [], null)
      expect(state.relationships[own.id], `${own.id} hat ein Verhältnis zu sich selbst`).toBeUndefined()

      const others = PARTIES.filter(party => party.id !== own.id)
      const sorted = [...others].sort((a, b) =>
        axisDistance(own.axes, a.axes) - axisDistance(own.axes, b.axes))
      const nearest = sorted[0]!
      const furthest = sorted[sorted.length - 1]!
      expect(
        state.relationships[nearest.id]!,
        `${own.id} steht ${furthest.id} näher als ${nearest.id}`,
      ).toBeGreaterThan(state.relationships[furthest.id]!)
    }

    // Und es bleibt ein Rat, kein Lager: niemand startet verfeindet oder verbündet.
    for (const own of PARTIES) {
      for (const value of Object.values(createInitialState(2036, own.id, [], null).relationships))
        expect(Math.abs(value ?? 0)).toBeLessThan(0.6)
    }
  })

  /*
   * `organization` stand in jedem Parteiprofil und wurde von null Code gelesen — 78 bei der CDU,
   * 52 bei der FDP, und für das Spiel war das dieselbe Zahl.
   */
  it('lets a well-run apparatus build capital faster than a thin one', () => {
    const strongest = [...PARTIES].sort((a, b) => b.stats.organization - a.stats.organization)[0]!
    const thinnest = [...PARTIES].sort((a, b) => a.stats.organization - b.stats.organization)[0]!
    expect(capitalPerMonth(null, strongest.id)).toBeGreaterThan(capitalPerMonth(null, thinnest.id))
  })

  it('lets the administration build capital faster than the shopfloor', () => {
    const office = createInitialState(2036, 'spd', [], { name: 'Test', backgroundId: 'administration' })
    const union = createInitialState(2036, 'spd', [], { name: 'Test', backgroundId: 'union' })
    expect(capitalPerMonth(office.leader)).toBeGreaterThan(capitalPerMonth(union.leader))
    // Und es kommt auch wirklich an, statt nur in einer Funktion zu stehen.
    expect(advanceMonths(office, 12).metrics.politicalCapital)
      .toBeGreaterThanOrEqual(advanceMonths(union, 12).metrics.politicalCapital)
  })

  it('charges a known face less for a public campaign', () => {
    const grassroots = { name: 'Test', backgroundId: 'grassroots' as const }
    expect(campaignCost(grassroots)).toBeLessThan(campaignCost(null))
    expect(campaignCost(grassroots)).toBe(18 - (getBackground('grassroots')?.campaignDiscount ?? 0))
  })

  it('plays a decade without one, because a save from before has none', () => {
    const anonymous = advanceMonths(createInitialState(2036, 'spd', [], null), 24)
    expect(anonymous.leader).toBeNull()
    expect(Number.isFinite(anonymous.metrics.politicalCapital)).toBe(true)
  })
})
