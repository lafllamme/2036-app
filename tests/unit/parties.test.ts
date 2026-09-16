import { describe, expect, it } from 'vitest'
import {
  LINDENHAFEN_COUNCIL_SEATS,
  PARTIES,
  PARTY_CONTENT_AS_OF,
  PARTY_EVIDENCE,
} from '../../app/content/parties'
import { POLICIES, policiesFor } from '../../app/content/policies'

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
    expect(PARTIES.every(party => party.stats.organization >= 0 && party.stats.organization <= 100)).toBe(true)
    expect(PARTIES.every(party => party.stats.negotiation >= 0 && party.stats.negotiation <= 100)).toBe(true)
  })

  it('maps every party position to a policy and dated official evidence', () => {
    const policyIds = new Set(POLICIES.map(({ id }) => id))
    const evidenceById = new Map(PARTY_EVIDENCE.map(source => [source.id, source]))

    for (const party of PARTIES) {
      expect(party.asOf).toBe(PARTY_CONTENT_AS_OF)
      /*
       * Eine dokumentierte Haltung zu genau dem, was die Fraktion einbringen kann.
       *
       * Hier stand `POLICIES.length` — eine Position zu *jeder* Vorlage. Das war richtig, solange
       * alle drei Vorlagen allen gehörten. Mit sechsundzwanzig Parteiprogrammen ist es sinnlos: die
       * LINKE braucht keine belegte Haltung zum Baulandmodell der CDU, weil sie es nicht einbringen
       * kann, und wie sie darüber abstimmt, sagt ohnehin ihr Achsenvektor. Verlangt wird eine
       * belegte Haltung zum eigenen Programm und zu dem, was jeder Rat braucht.
       */
      const tableable = policiesFor(party.id)
      expect(party.policyPositions.map(position => position.policyId).sort())
        .toEqual(tableable.map(policy => policy.id).sort())
      expect(party.sourceIds.length).toBeGreaterThan(0)
      for (const sourceId of party.sourceIds) expect(evidenceById.get(sourceId)?.url).toMatch(/^https:\/\//)
      for (const position of party.policyPositions) {
        expect(policyIds.has(position.policyId)).toBe(true)
        expect(position.sourceIds.length).toBeGreaterThan(0)
        for (const sourceId of position.sourceIds) expect(evidenceById.get(sourceId)?.claimType).toBe('position')
      }
    }
  })

  /*
   * > **Ereignisse sind, was der Stadt passiert — für alle gleich. Eigene Vorlagen sind, was deine
   * > Partei will — je Partei verschieden.**
   *
   * Vorher bekam jede der sechs Parteien dieselben drei Vorlagen. Das ist nicht neutral, sondern
   * inkohärent: man konnte als LINKE die Gewerbesteuersenkung einbringen und als FDP den kommunalen
   * Wohnungsbau. Sechs Parteien unterschieden sich damit nur in Arithmetik — Sitze, Rückhalt,
   * Achsen —, nicht in dem, was man überhaupt tun kann.
   */
  it('gives every party four motions of its own and two that every council needs', () => {
    const shared = POLICIES.filter(policy => !policy.partyIds)
    expect(shared, 'die gemeinsamen Vorlagen fehlen').toHaveLength(2)

    for (const party of PARTIES) {
      const own = POLICIES.filter(policy => policy.partyIds?.includes(party.id))
      expect(own, `${party.id} hat kein eigenes Programm mit vier Vorlagen`).toHaveLength(4)
      expect(policiesFor(party.id)).toHaveLength(6)
    }

    // Kein Programm gehört zwei Parteien: sonst wäre es keins.
    for (const policy of POLICIES.filter(entry => entry.partyIds))
      expect(policy.partyIds, `${policy.id} gehört mehreren Fraktionen`).toHaveLength(1)

    expect(POLICIES).toHaveLength(6 * 4 + 2)
  })

  it('writes a programme out of the party\'s own positions, not out of a cliché', () => {
    /*
     * **Keine Karikatur.** Eine parteieigene Vorlage muss zu dem passen, was die Partei selbst als
     * Position angibt — geprüft an ihrem eigenen Achsenvektor. Die Alternative wäre, dass aus einem
     * politischen Modell ein Cartoon wird, und das wäre das erste Mal in diesem Projekt, dass
     * Haltung gegen Pointe getauscht würde.
     */
    for (const party of PARTIES) {
      for (const policy of POLICIES.filter(entry => entry.partyIds?.includes(party.id))) {
        const axes = Object.keys(policy.axes) as (keyof typeof policy.axes)[]
        const agreeing = axes.filter((axis) => {
          const stance = policy.axes[axis] ?? 0
          const position = party.axes[axis]
          // Gleiche Richtung, oder die Partei ist auf dieser Achse ohnehin unentschieden.
          return Math.abs(position) < 0.25 || Math.sign(stance) === Math.sign(position)
        })
        expect(
          agreeing.length * 2,
          `${policy.id} liegt quer zu dem, was ${party.id} selbst vertritt: ${axes.filter(a => !agreeing.includes(a)).join(', ')}`,
        ).toBeGreaterThanOrEqual(axes.length)
      }
    }
  })
})
