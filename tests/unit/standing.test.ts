import { describe, expect, it } from 'vitest'
import {
  advanceMonths,
  createInitialState,
  negotiate,
  negotiationCost,
  tableMotion,
} from '../../app/simulation/model'

/**
 * Das Verhältnis zu einer Fraktion — und was es kostet, es zu verspielen.
 *
 * `relationships` gibt es seit jeher: Verhandeln hebt es, und monatlich klingt es ab. Gelesen hat es
 * bis hierher **nur die Abstimmung**, und ausgegeben wurde dafür immer derselbe Betrag. Damit war
 * die einzige Frage, ob man sich zwölf Kapital leisten kann — eine Fraktion, die man zweimal für
 * sich gewonnen hat, und eine, die gerade vor der Presse Front gegen einen gemacht hat, waren
 * derselbe Knopf zum selben Preis.
 *
 * Zwei Zeilen ändern das, und beide sind hier abgesichert: Frontmachen drückt das Verhältnis, und
 * der Preis einer Verhandlung hängt daran.
 */

const SEED = 2036

describe('verhältnis zu den fraktionen', () => {
  it('kostet mehr bei schlechtem und weniger bei gutem Verhältnis', () => {
    const neutral = createInitialState(SEED)
    expect(negotiationCost(neutral, 'cdu')).toBe(12)

    const warm = { ...neutral, relationships: { ...neutral.relationships, cdu: 1 } }
    const cold = { ...neutral, relationships: { ...neutral.relationships, cdu: -1 } }
    expect(negotiationCost(warm, 'cdu')).toBeLessThan(12)
    expect(negotiationCost(cold, 'cdu')).toBeGreaterThan(12)
    // Und die Spanne muss spürbar sein, sonst ist es eine Nachkommastelle mit Erzählung.
    expect(negotiationCost(cold, 'cdu') / negotiationCost(warm, 'cdu')).toBeGreaterThan(2)
  })

  /**
   * Der eigentliche Punkt: wer sich öffentlich gegen eine Vorlage stellt, kann eine Woche später
   * nicht zum selben Preis umfallen. Das ist keine Verhandlung, das ist eine Beleidigung.
   */
  it('macht die Fraktion teurer, die gerade Front gemacht hat', () => {
    let seen = 0
    for (const party of ['linke', 'gruene', 'spd', 'cdu', 'fdp', 'afd'] as const) {
      const before = createInitialState(SEED, party, [])
      const after = tableMotion(before, 'shared-consolidation', 'shared-consolidation')
      const against = after.motionPrep['shared-consolidation']?.counteredBy ?? []
      for (const id of against) {
        expect(negotiationCost(after, id), `${party} → ${id}`).toBeGreaterThan(negotiationCost(before, id))
        seen += 1
      }
    }
    expect(seen, 'irgendwer stellt sich quer').toBeGreaterThan(0)
  })

  /** Verhandeln hebt das Verhältnis — also ist die zweite Werbung um dieselbe Fraktion billiger. */
  it('belohnt, wer dieselbe Fraktion zweimal umwirbt', () => {
    const before = createInitialState(SEED)
    const after = negotiate(before, 'motion-a', 'cdu')
    expect(negotiationCost(after, 'cdu')).toBeLessThan(negotiationCost(before, 'cdu'))
  })

  /** Und es ist eine Verzögerung, kein Bann: das Verhältnis klingt ab. */
  it('lässt einen Groll über die Monate verblassen', () => {
    const crossed = createInitialState(SEED)
    const angry = { ...crossed, relationships: { ...crossed.relationships, cdu: -1 } }
    const later = advanceMonths(angry, 24)
    expect(negotiationCost(later, 'cdu')).toBeLessThan(negotiationCost(angry, 'cdu'))
  })
})
