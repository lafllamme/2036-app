import { describe, expect, it } from 'vitest'
import { POLICIES } from '../../src/content/policies'
import {
  LINDENHAFEN_COUNCIL_SEATS,
  PARTIES,
  PARTY_CONTENT_AS_OF,
  PARTY_EVIDENCE,
} from '../../src/content/parties'

describe('fictional party content', () => {
  it('uses unique fictional identities with the intended German abbreviations', () => {
    expect(PARTIES.map(({ abbreviation }) => abbreviation)).toEqual(['CDU', 'AfD', 'SPD', 'GRÜNE', 'LINKE', 'FDP'])
    expect(PARTIES.find(({ id }) => id === 'afd')?.name).toBe('Alternative für Demokratie')
    expect(new Set(PARTIES.map(({ id }) => id)).size).toBe(PARTIES.length)
    expect(new Set(PARTIES.map(({ color }) => color)).size).toBe(PARTIES.length)
  })

  it('balances one complete fictional council and support baseline', () => {
    expect(PARTIES.reduce((sum, party) => sum + party.stats.councilSeats, 0)).toBe(LINDENHAFEN_COUNCIL_SEATS)
    expect(PARTIES.reduce((sum, party) => sum + party.stats.publicSupport, 0)).toBe(100)
    expect(PARTIES.every((party) => party.stats.organization >= 0 && party.stats.organization <= 100)).toBe(true)
    expect(PARTIES.every((party) => party.stats.negotiation >= 0 && party.stats.negotiation <= 100)).toBe(true)
  })

  it('maps every party position to a policy and dated official evidence', () => {
    const policyIds = new Set(POLICIES.map(({ id }) => id))
    const evidenceById = new Map(PARTY_EVIDENCE.map((source) => [source.id, source]))

    for (const party of PARTIES) {
      expect(party.asOf).toBe(PARTY_CONTENT_AS_OF)
      expect(party.policyPositions).toHaveLength(POLICIES.length)
      expect(party.sourceIds.length).toBeGreaterThan(0)
      for (const sourceId of party.sourceIds) expect(evidenceById.get(sourceId)?.url).toMatch(/^https:\/\//)
      for (const position of party.policyPositions) {
        expect(policyIds.has(position.policyId)).toBe(true)
        expect(position.sourceIds.length).toBeGreaterThan(0)
        for (const sourceId of position.sourceIds) expect(evidenceById.get(sourceId)?.claimType).toBe('position')
      }
    }
  })
})
