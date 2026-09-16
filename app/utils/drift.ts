/**
 * Wohin sich ein Wert seit dem letzten abgeschlossenen Monat bewegt hat.
 *
 * Steht hier und nicht in der Komponente, weil genau diese Rechnung schon einmal still
 * kaputtgegangen ist. Die alte Kopfleiste schrieb beim Monatswechsel den **neuen** Rückhalt in ihren
 * Vorher-Speicher — wenn dieser Watcher läuft, ist der Schnappschuss ja bereits getauscht. Verglichen
 * wurde der Monat mit sich selbst, die Differenz war immer null, und der Richtungspfeil ist in der
 * ganzen Kampagne kein einziges Mal erschienen. Niemand hat es gemeldet: es fehlte nichts, es stand
 * nur nie etwas da.
 *
 * `handOver` ist der Griff, der dabei fehlte, und `drift` die Ableitung daraus. Beide sind rein und
 * geprüft; die Komponente hält nur noch die zwei Refs.
 */

export type Drift = -1 | 0 | 1

/** Ein Zehntelpunkt Rückhalt zählt noch als Bewegung, alles darunter ist Rauschen. */
const NOTICEABLE = 0.0005

/**
 * Den Monatswechsel vollziehen: was gerade galt, wird zum Vorherigen, und erst dann kommt der neue
 * Stand herein. Gibt beide Stände zurück, statt sie an Ort und Stelle zu ändern.
 */
export function handOver<T>(settled: T | null, incoming: T): { previous: T | null, settled: T } {
  return { previous: settled, settled: incoming }
}

/** −1, 0 oder 1. Ohne Vergleichswert ist die Antwort 0 und nicht „gefallen". */
export function drift(now: number | null | undefined, before: number | null | undefined): Drift {
  if (now === null || now === undefined || before === null || before === undefined)
    return 0
  const change = now - before
  if (Math.abs(change) < NOTICEABLE)
    return 0
  return change > 0 ? 1 : -1
}
