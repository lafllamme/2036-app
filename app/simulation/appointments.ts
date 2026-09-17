import type { AppointmentTemplate } from '../content/appointments'
import type { PartyId } from '../core/contracts'
import type { RandomStream } from '../core/rng'
import { APPOINTMENT_SWING, APPOINTMENTS, appointmentTemplate } from '../content/appointments'

/**
 * Termine: die Stelle, an der politisches Kapital entsteht.
 *
 * Das Gegenstück zum Brennpunkt und bewusst aus anderem Holz. Ein Brennpunkt ist **ortsgebunden**,
 * hängt an einer Kennzahl und eskaliert, wenn man ihn liegen lässt. Ein Termin ist
 * **beziehungsgebunden**: kein Ort, keine Kennzahl, keine Drohung — er verfällt, und das ist alles,
 * was passiert. Beide füllen denselben Monat mit verschiedenen Fragen.
 *
 * Was hier steht, ist die Mechanik: wann einer kommt, wie lange er wartet, und was eine Antwort
 * bewegt. Der Inhalt liegt in `content/appointments.ts`, weil er Inhalt ist.
 */

export interface Appointment {
  id: string
  templateId: string
  openedMonth: number
  /** Der Monat, in dem er verfällt, wenn niemand hingeht. */
  until: number
}

/**
 * Wie oft jemand um ein Gespräch bittet.
 *
 * Ein Termin je drei Monate im Schnitt. Häufiger, und das Kapital wird zur Selbstbedienung — man
 * nimmt einfach jedes Mal die teuerste Zusage mit und hat immer genug; seltener, und man begegnet
 * der Mechanik in elf Jahren dreißigmal statt vierzigmal, was denselben Unterschied macht wie kein
 * Unterschied. Bei einem Drittel je Monat kommen über die Amtszeit rund vierzig zusammen, von denen
 * man einen Teil verstreichen lässt.
 */
const CHANCE = 0.34

/** Und höchstens zwei gleichzeitig: drei offene Karten sind eine Liste und kein Termin. */
export const MOST_OPEN = 2

/**
 * Ob in diesem Monat jemand anruft — und wer.
 *
 * Nie derselbe zweimal hintereinander offen, und nach einer Antwort steht derselbe Gesprächspartner
 * erst wieder nach einem Jahr auf der Matte. Sonst ist der Handelsverein alle drei Monate mit
 * derselben Frage da, und das ist keine Stadt, das ist ein Abo.
 */
export function openAppointment(
  open: Appointment[],
  answered: Record<string, number>,
  month: number,
  rng: RandomStream,
): Appointment | null {
  if (open.length >= MOST_OPEN || rng.next() > CHANCE)
    return null

  const busy = new Set(open.map(entry => entry.templateId))
  const free = APPOINTMENTS.filter(template =>
    !busy.has(template.id) && month - (answered[template.id] ?? -999) >= 12)
  if (free.length === 0)
    return null

  const template = free[Math.floor(rng.next() * free.length)]!
  return {
    id: `appointment-${template.id}-${month}`,
    templateId: template.id,
    openedMonth: month,
    until: month + template.patience,
  }
}

/** Was abgelaufen ist, fliegt raus. Ein Termin, den man verstreichen lässt, ist verstrichen. */
export function expire(open: Appointment[], month: number): Appointment[] {
  return open.filter(entry => entry.until >= month)
}

export interface AppointmentEffect {
  capital: number
  relationships: Partial<Record<PartyId, number>>
  outcome: string
  caller: string
}

/** Wie viel vom Gewinn übrig bleibt, wenn man die eigene Fraktion vor den Kopf stößt. */
const OWN_BASE_TOLL = 0.35

/**
 * Was eine Antwort bewegt.
 *
 * Reine Rechnung, damit sie prüfbar ist, ohne den halben Spielzustand aufzubauen: das Kapital, das
 * dazukommt oder weggeht, und die Verschiebung je Fraktion. Wer das Ergebnis einbaut, ist `model.ts`.
 *
 * Die eigene Fraktion bleibt bei den Verhältnissen außen vor. Sich selbst näherzukommen ist keine
 * Leistung, und in der Abstimmung liest `relationships` ohnehin nur die anderen.
 *
 * ## Aber der Nachteil darf nicht verschwinden
 *
 * Im Spiel aufgefallen: die Spielerin führte die Grünen, der Sportbund-Schlüssel kühlte „gruene" ab
 * — und weil das die eigene Fraktion war, fiel der Nachteil ersatzlos weg. Übrig blieb ein
 * kostenloses **+12**, und zwar ausgerechnet bei der Antwort, die als die teure gedacht war. Je nach
 * gewählter Partei war ein Drittel der Termine geschenkt.
 *
 * Die eigene Basis vor den Kopf zu stoßen kostet deshalb den Gewinn: davon bleibt ein gutes Drittel.
 * Das ist die ehrlichere Buchung — man kann mit der eigenen Fraktion nicht verhandeln, also kann man
 * den Schaden auch nicht später zurückkaufen. Ein Verlust bleibt ein Verlust; schlimmer wird er nicht.
 */
export function effectOf(templateId: string, optionId: string, own: PartyId): AppointmentEffect | null {
  const template = appointmentTemplate(templateId)
  const option = template?.options.find(entry => entry.id === optionId)
  if (!template || !option)
    return null

  const relationships: Partial<Record<PartyId, number>> = {}
  for (const partyId of option.warms) {
    if (partyId !== own)
      relationships[partyId] = APPOINTMENT_SWING
  }
  for (const partyId of option.cools) {
    if (partyId !== own)
      relationships[partyId] = -APPOINTMENT_SWING
  }

  const ownBase = option.cools.includes(own) && option.capital > 0
  return {
    capital: ownBase ? Math.round(option.capital * OWN_BASE_TOLL) : option.capital,
    relationships,
    outcome: ownBase ? `${option.outcome} In der eigenen Fraktion bleibt Ärger zurück.` : option.outcome,
    caller: template.caller,
  }
}

/** Die offenen Termine, wie die Oberfläche sie braucht — Vorlage nachgeschlagen, Frist ausgerechnet. */
export function viewOf(open: Appointment[], month: number, own: PartyId): {
  id: string
  templateId: string
  caller: string
  title: string
  body: string
  monthsLeft: number
  options: { id: string, label: string, capital: number, warms: PartyId[], cools: PartyId[] }[]
}[] {
  return open.flatMap((entry) => {
    const template = appointmentTemplate(entry.templateId)
    if (!template)
      return []
    return [{
      id: entry.id,
      templateId: entry.templateId,
      caller: template.caller,
      title: template.title,
      body: template.body,
      monthsLeft: Math.max(0, entry.until - month),
      /*
       * Gerechnet und nicht abgeschrieben: am Knopf muss stehen, was wirklich ankommt. Sonst
       * verspricht die Karte +12 und die Kasse bekommt 4, weil die eigene Basis mitgemeint war.
       */
      options: template.options.map(option => ({
        id: option.id,
        label: option.label,
        capital: effectOf(template.id, option.id, own)?.capital ?? option.capital,
        warms: option.warms.filter(id => id !== own),
        cools: option.cools.filter(id => id !== own),
      })),
    }]
  })
}

export type { AppointmentTemplate }
