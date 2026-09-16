import { describe, expect, it } from 'vitest'
import { getBackground, LEADER_BACKGROUNDS } from '../../app/content/leaders'
import { BASE_CAPITAL_PER_MONTH } from '../../app/simulation/dynamics'
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
    expect(Object.values(union.relationships).every(value => (value ?? 0) > 0)).toBe(true)
    expect(Object.keys(plain.relationships)).toHaveLength(0)
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
