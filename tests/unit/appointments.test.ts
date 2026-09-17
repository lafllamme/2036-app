import { describe, expect, it } from 'vitest'
import { APPOINTMENTS } from '../../app/content/appointments'
import { createRandomStream } from '../../app/core/rng'
import { effectOf, expire, MOST_OPEN, openAppointment, viewOf } from '../../app/simulation/appointments'
import { advanceMonths, createInitialState, keepAppointment, negotiationCost, snapshotOf } from '../../app/simulation/model'

/**
 * Termine — die einzige Stelle, an der politisches Kapital entsteht.
 *
 * Bis hierher kam es von nirgendwo: `BASE_CAPITAL_PER_MONTH` tropft eine feste Rate in die Kasse,
 * ausgegeben wird sie für Verhandeln, Kampagne und Dringlichkeit. Eine Währung, die eine Stoppuhr
 * ist, enthält keine Entscheidung — man kann nur warten, bis man genug hat.
 *
 * Was hier geprüft wird, ist deshalb nicht „ein Termin öffnet sich", sondern die drei Eigenschaften,
 * die ihn von einem Brennpunkt unterscheiden und die man beim Draufschauen nicht sieht: er kann
 * Kapital **einbringen**, er verschiebt Verhältnisse in **beide** Richtungen, und er verfällt, statt
 * zu eskalieren.
 */

const SEED = 2036

describe('termine', () => {
  it('bringt Kapital ein, statt nur welches zu kosten', () => {
    const gains = APPOINTMENTS.flatMap(entry => entry.options).filter(option => option.capital > 0)
    expect(gains.length, 'kein einziger Termin bringt etwas ein').toBeGreaterThan(APPOINTMENTS.length)
    // Und mindestens einer muss auch wehtun, sonst ist es eine Sammelbüchse und keine Entscheidung.
    expect(APPOINTMENTS.flatMap(entry => entry.options).some(option => option.capital < 0)).toBe(true)
  })

  /** Jede Zusage hat einen Adressaten und einen Preis. Eine Haltung, die niemandem auffällt, ist keine. */
  it('lässt jede Zusage bei irgendwem etwas kosten', () => {
    for (const template of APPOINTMENTS) {
      expect(template.options.length, template.id).toBeGreaterThanOrEqual(2)
      const moving = template.options.filter(option => option.warms.length + option.cools.length > 0)
      expect(moving.length, `${template.id} bewegt gar kein Verhältnis`).toBeGreaterThan(0)
      // Und keine Fraktion steht bei derselben Antwort auf beiden Seiten.
      for (const option of template.options)
        expect(option.warms.filter(id => option.cools.includes(id)), `${template.id}/${option.id}`).toHaveLength(0)
    }
  })

  it('zahlt aus und verschiebt die Verhältnisse in beide Richtungen', () => {
    const before = createInitialState(SEED, 'spd', [])
    const opened = { ...before, appointments: [{ id: 'a', templateId: 'traders', openedMonth: 0, until: 2 }] }
    const after = keepAppointment(opened, 'a', 'side-with')

    expect(after.metrics.politicalCapital).toBeGreaterThan(before.metrics.politicalCapital)
    expect(after.appointments).toHaveLength(0)
    expect(after.relationships.cdu ?? 0).toBeGreaterThan(before.relationships.cdu ?? 0)
    expect(after.relationships.gruene ?? 0).toBeLessThan(before.relationships.gruene ?? 0)
  })

  /**
   * Und das ist der Punkt, an dem es kein Buchhaltungsposten mehr ist: was man dem einen zusagt,
   * macht die Stimme des anderen in der nächsten Sitzung **teurer**.
   */
  it('macht die nächste Verhandlung mit der Gegenseite teurer', () => {
    const opened = { ...createInitialState(SEED, 'spd', []), appointments: [{ id: 'a', templateId: 'traders', openedMonth: 0, until: 2 }] }
    const after = keepAppointment(opened, 'a', 'side-with')

    expect(negotiationCost(after, 'gruene')).toBeGreaterThan(negotiationCost(opened, 'gruene'))
    expect(negotiationCost(after, 'cdu')).toBeLessThan(negotiationCost(opened, 'cdu'))
  })

  it('kostet Kapital, wenn man sich quer stellt', () => {
    const opened = { ...createInitialState(SEED, 'spd', []), appointments: [{ id: 'a', templateId: 'traders', openedMonth: 0, until: 2 }] }
    const after = keepAppointment(opened, 'a', 'refuse')
    expect(after.metrics.politicalCapital).toBeLessThan(opened.metrics.politicalCapital)
  })

  /** Ein Termin eskaliert nicht — er verfällt. Das ist der ganze Unterschied zum Brennpunkt. */
  it('läuft ab, statt zu eskalieren', () => {
    const open = [{ id: 'a', templateId: 'traders', openedMonth: 0, until: 2 }]
    expect(expire(open, 2)).toHaveLength(1)
    expect(expire(open, 3)).toHaveLength(0)
  })

  it('lässt nie mehr als zwei gleichzeitig offen stehen', () => {
    const full = Array.from({ length: MOST_OPEN }, (_, at) => ({ id: `a${at}`, templateId: APPOINTMENTS[at]!.id, openedMonth: 0, until: 9 }))
    expect(openAppointment(full, {}, 1, createRandomStream(SEED, 'x'))).toBeNull()
  })

  /** Und derselbe Gesprächspartner steht nicht alle drei Monate wieder auf der Matte. */
  it('lässt einen beantworteten Termin ein Jahr ruhen', () => {
    for (let month = 1; month < 12; month += 1) {
      const drawn = openAppointment([], { traders: 0 }, month, createRandomStream(SEED, `m${month}`))
      expect(drawn?.templateId, `Monat ${month}`).not.toBe('traders')
    }
  })

  it('ist eine reine Rechnung, die die eigene Fraktion ausspart', () => {
    const effect = effectOf('traders', 'side-with', 'cdu')
    expect(effect?.relationships.cdu).toBeUndefined()
    expect(effect?.relationships.fdp).toBeGreaterThan(0)
  })

  /**
   * Im Spiel aufgefallen: die Spielerin führte die Grünen, der Sportbund-Schlüssel kühlte „gruene"
   * ab — und weil das die eigene Fraktion war, fiel der Nachteil ersatzlos weg. Übrig blieb ein
   * kostenloses **+12**, ausgerechnet bei der Antwort, die als die teure gedacht war.
   */
  it('lässt den Nachteil nicht verschwinden, nur weil die eigene Fraktion gemeint ist', () => {
    const fremd = effectOf('sports', 'adopt', 'spd')
    const eigen = effectOf('sports', 'adopt', 'gruene')
    expect(fremd?.capital).toBeGreaterThan(0)
    expect(eigen?.capital).toBeLessThan(fremd!.capital)
    expect(eigen?.outcome).toContain('eigenen Fraktion')
  })

  /** Und am Knopf muss stehen, was wirklich ankommt — sonst verspricht die Karte mehr als die Kasse bekommt. */
  it('zeigt in der Ansicht denselben Preis, den die Rechnung zahlt', () => {
    const open = [{ id: 'a', templateId: 'sports', openedMonth: 0, until: 2 }]
    const shown = viewOf(open, 0, 'gruene')[0]!.options.find(option => option.id === 'adopt')!
    expect(shown.capital).toBe(effectOf('sports', 'adopt', 'gruene')!.capital)
    // Und die eigene Fraktion steht nicht als Betroffene an der Zeile.
    expect(shown.cools).not.toContain('gruene')
  })

  /** Und über eine gespielte Amtszeit muss wirklich jemand anrufen, sonst ist die Mechanik tot. */
  it('bittet über ein Jahrzehnt oft genug um ein Gespräch', () => {
    const played = advanceMonths(createInitialState(SEED), 132)
    expect(played.appointmentsAnswered).toBeDefined()
    // Beantwortet wird im Test nichts, also müssen sie sich in der Ansicht stauen und ablaufen.
    expect(snapshotOf(played).appointments.length).toBeLessThanOrEqual(MOST_OPEN)
  })
})
