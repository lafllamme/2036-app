import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'

/**
 * Jede Tür muss auf eine Entscheidung zeigen, die es wirklich gibt.
 *
 * `requiresChoiceIds` und `blockedByChoiceIds` sind Zeichenketten der Form `eventId:optionId`, und
 * eine falsch geschriebene davon **schlägt nie fehl** — sie ist nur eine Bedingung, die niemals
 * eintritt. Nach außen sieht das aus wie ein Ereignis, das man diesmal nicht gezogen hat, und nach
 * innen wie eine Verzweigung, die es gar nicht gibt. Genau dieselbe Klasse Fehler, an der schon die
 * Schwellen hingen, bevor `reachable.test.ts` sie nachgerechnet hat.
 */
describe('die türen zwischen den entscheidungen', () => {
  const choices = new Set(EVENTS.flatMap(event => event.options.map(option => `${event.id}:${option.id}`)))
  const ids = new Set(EVENTS.map(event => event.id))

  it('verweist nur auf Entscheidungen, die es gibt', () => {
    const dangling: string[] = []
    for (const event of EVENTS) {
      for (const field of ['requiresChoiceIds', 'blockedByChoiceIds'] as const) {
        for (const choice of event.trigger[field] ?? []) {
          if (!choices.has(choice))
            dangling.push(`${event.id}.${field} → ${choice}`)
        }
      }
      for (const id of event.trigger.requiresEventIds ?? []) {
        if (!ids.has(id))
          dangling.push(`${event.id}.requiresEventIds → ${id}`)
      }
      for (const id of event.trigger.requiresRefusedEventIds ?? []) {
        if (!ids.has(id))
          dangling.push(`${event.id}.requiresRefusedEventIds → ${id}`)
      }
    }
    expect(dangling, 'diese Türen zeigen ins Leere').toEqual([])
  })

  /**
   * Sich selbst zu versperren ist erlaubt — und meistens richtig.
   *
   * Der erste Entwurf dieses Tests verbot es und schlug sofort an: `env-storm-surge` sperrt sich
   * über die eigenen Optionen, und der Kommentar daneben erklärt auch, warum. Wer die Kaimauer auf
   * Klimaniveau angehoben oder die Hafenkante zurückgebaut hat, bekommt die Sturmflut nicht wieder;
   * wer nur geflickt hat, sehr wohl. Das ist keine Schleife, sondern ein gelöstes Problem.
   *
   * Geprüft wird deshalb das, was wirklich kaputt wäre: eine Vorlage, die sich über **alle** ihre
   * Optionen sperrt, kann nach dem ersten Beschluss nie wiederkommen — dafür gibt es
   * `oncePerCampaign`, und zwei Mechaniken für dieselbe Sache driften auseinander.
   */
  it('sperrt sich nie über jede einzelne Option selbst', () => {
    for (const event of EVENTS) {
      const own = (event.trigger.blockedByChoiceIds ?? []).filter(choice => choice.startsWith(`${event.id}:`))
      if (own.length === 0 || event.options.length === 0)
        continue
      expect(own.length, `${event.id} sperrt sich über jede Option — das ist oncePerCampaign`).toBeLessThan(event.options.length)
    }
  })

  /**
   * Eine Weiche ist erst eine, wenn hinter ihr etwas anders ist. Gezählt wird, wie viele Vorlagen
   * überhaupt an einer früheren Entscheidung hängen — vorher waren es zehn von 78, und zwei
   * Durchläufe überschnitten sich zu 82 %.
   */
  it('hat genug Weichen, dass zwei Durchläufe auseinanderlaufen können', () => {
    const gated = EVENTS.filter(event =>
      (event.trigger.requiresChoiceIds?.length ?? 0) > 0
      || (event.trigger.blockedByChoiceIds?.length ?? 0) > 0
      || (event.trigger.requiresRefusedEventIds?.length ?? 0) > 0,
    )
    expect(gated.length).toBeGreaterThanOrEqual(18)
  })
})
