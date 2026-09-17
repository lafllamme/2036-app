import type { DistrictId } from '../core/contracts'
import type { DistrictShare } from './districts'
import { getPolicy } from '../content/policies'
import { shift } from './districts'

/**
 * Die Blocksanierung: ein Beschluss, der auf **ein bestimmtes Haus** zeigt.
 *
 * Alles, was der Rat bisher beschließen konnte, galt für die Stadt oder für ein Viertel. Das ist
 * richtig für ein Wohnungsbauprogramm und falsch für das, was eine Kommune tatsächlich am häufigsten
 * tut: sie richtet einen Häuserzug her. Dach, Fassade, Leitungen, Heizung, achtzehn Monate Gerüst.
 *
 * ## Warum das erst jetzt geht
 *
 * Weil ein Haus seit `wear` seinen Zustand im Bild trägt. Vorher wäre „welcher Block?" eine Frage
 * ohne Auskunft gewesen — man hätte irgendwo hingezeigt, achtzehn Monate gewartet und nichts
 * gesehen. Jetzt sieht man dem Häuserzug an, dass ihn seit dreißig Jahren niemand angefasst hat,
 * und danach sieht man, dass es jemand getan hat. Das ist die ganze Schleife, und sie schließt sich
 * auf der Karte statt in einer Tabelle.
 *
 * ## Und warum ein Block und nicht ein Haus
 *
 * Ein einzelnes Haus ist aus der Überblickskamera nichts — ein Fleck von vier Pixeln. Geklickt wird
 * trotzdem ein Haus, weil man auf ein Haus zeigen kann; saniert wird, was um es herum steht. Das ist
 * auch das Ehrlichere: eine Kommune saniert Blöcke, keine Einzelobjekte, und der Effekt auf eine
 * Nachbarschaft ist genau der Punkt der Übung.
 *
 * ## Der Konflikt
 *
 * Sanierter Bestand ist teurer Bestand. Das Programm senkt den Investitionsstau der Stadt und hebt
 * die Zufriedenheit — und hebt die Miete **in dem Viertel, in dem der Block steht**, Monat für Monat,
 * solange gebaut wird. Wer die schlechtesten Häuser der Stadt herrichtet, verdrängt die Leute, die
 * darin wohnen; wer es lässt, lässt sie im Schimmel wohnen. Das ist keine Konstruktion, das ist die
 * Frage.
 *
 * Stadtweit ändert die Verdrängung nichts: `shift` normiert, die Durchschnittsmiete der Stadt bleibt,
 * was die Dynamik sagt. Es ist eine Umverteilung im Gefälle und keine zweite Preisspirale — siehe
 * `districts.ts` und den Grund, warum dort erhalten und nicht gerechnet wird.
 */

/**
 * Wie weit um das angeklickte Haus herum saniert wird, in Metern.
 *
 * Hundertzehn Meter sind in dieser Stadt ein Blockrand mit Hinterhof — gemessen am Grundriss, nicht
 * geschätzt: die Gründerzeitblöcke in der Neustadt haben 90 bis 130 Meter Kantenlänge. Größer wäre
 * ein Quartier und damit dieselbe Frage wie die Standortwahl, nur ungenauer gestellt.
 */
export const RENEWAL_RADIUS = 110

/** Achtzehn Monate Gerüst. So lange dauert es wirklich, und so lange sieht man es auch. */
export const RENEWAL_MONTHS = 18

/**
 * Wie viel Zustand eine Sanierung zurückholt.
 *
 * Nicht alles: ein saniertes Gründerzeithaus ist ein gutes Haus und kein neues. 0,85 heißt, dass vom
 * Verschleiß ein Siebtel stehen bleibt — genug, dass ein sanierter Block sich von einem Neubaublock
 * noch unterscheidet, und wenig genug, dass man die Sanierung aus der Überblickskamera sieht.
 */
export const RENEWAL_RECOVERY = 0.85

/**
 * Wie stark die Miete im Viertel steigt, je Monat Bauzeit.
 *
 * Stand auf 0,0085 und damit auf **16 % über achtzehn Monate** — gemessen im Spiel: die Altstadtmiete
 * ging von 18,60 auf 22,73 €. Für sechsundzwanzig sanierte Häuser in einem Viertel mit achttausend
 * Einwohnern ist das keine Verdrängung, das ist eine Preisbombe. Ein Block ist ein Block.
 *
 * 0,0035 sind rund 6,5 % über die Bauzeit: genug, dass man es im Lagebild und auf der Karte sieht
 * und dass drei Sanierungen in einem Viertel wehtun, und wenig genug, dass eine einzelne Entscheidung
 * nicht die halbe Stadt umpreist.
 */
const DISPLACEMENT = 0.0035
/** Und wie der Leerstand dort fällt: saniert wird, was leer steht, und danach steht es nicht mehr leer. */
const REOCCUPATION = -0.005

export interface Renewal {
  id: string
  policyId: string
  districtId: DistrictId
  /** Der Mittelpunkt des Blocks — das Haus, auf das gezeigt wurde. */
  x: number
  z: number
  startedMonth: number
}

/** Ob diese Vorlage nach einem Block fragt. Ausdrücklich am Inhalt, nicht aus den Wirkungen geraten. */
export function needsBlock(policyId: string): boolean {
  return getPolicy(policyId)?.renews === true
}

/**
 * Wie weit eine Sanierung ist, 0 bis 1.
 *
 * Fertig bleibt fertig: nach achtzehn Monaten steht eine Eins, und sie bleibt stehen. Ein saniertes
 * Haus verfällt nicht wieder, nur weil die Uhr weiterläuft — das täte es über Jahrzehnte, und über
 * elf Jahre wäre es eine Behauptung ohne Beleg.
 */
export function progressOf(renewal: Renewal, month: number): number {
  return Math.max(0, Math.min(1, (month - renewal.startedMonth) / RENEWAL_MONTHS))
}

/** Ob noch gebaut wird — das ist es, was die Verwaltung bindet und die Miete treibt. */
export function running(renewal: Renewal, month: number): boolean {
  return progressOf(renewal, month) < 1
}

/** Ob dieses Haus zu diesem Block gehört. Kreis um den Klick, kein Rechteck: ein Block ist rund genug. */
export function inBlock(renewal: Renewal, x: number, z: number): boolean {
  return Math.hypot(x - renewal.x, z - renewal.z) <= RENEWAL_RADIUS
}

/**
 * Der Monatsschritt: wo gebaut wird, wird es teurer und voller.
 *
 * Läuft je laufender Sanierung einmal. Zwei Sanierungen im selben Viertel wirken doppelt, und das
 * ist richtig — zwei sanierte Blöcke sind zwei sanierte Blöcke.
 */
export function displace(rent: DistrictShare, vacancy: DistrictShare, renewals: Renewal[], month: number): { rent: DistrictShare, vacancy: DistrictShare } {
  let movedRent = rent
  let movedVacancy = vacancy
  for (const renewal of renewals) {
    if (!running(renewal, month))
      continue
    movedRent = shift(movedRent, renewal.districtId, DISPLACEMENT)
    movedVacancy = shift(movedVacancy, renewal.districtId, REOCCUPATION)
  }
  return { rent: movedRent, vacancy: movedVacancy }
}
