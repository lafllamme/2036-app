import type { SiteProfile } from '../content/sites'
import type { DistrictId } from '../core/contracts'
import { BUILDABLE_BY_COST, SITE_PROFILES } from '../content/sites'
import { createRandomStream } from '../core/rng'

/**
 * Welche drei Standorte zur Wahl stehen — und was der gewählte kostet.
 *
 * Der Rat beschließt **was**, der Spieler entscheidet **wo**. Damit das eine Entscheidung ist und
 * keine Formalie, muss das Angebot immer eine Spanne haben: der billige Standort, der naheliegende,
 * und der teure mit der größten Wirkung. Drei zufällig gezogene Bezirke wären in jedem dritten Fall
 * drei ähnliche — dann steht der Spieler vor drei Knöpfen, die dasselbe tun.
 *
 * Deshalb wird nicht gezogen, sondern **gespannt**: der günstigste Bezirk, der teuerste, und
 * dazwischen einer, der aus Vorlage und Stadtkeim folgt. Das Angebot ist damit je Vorlage gleich —
 * wer zweimal dieselbe Vorlage einbringt, bekommt dieselben drei Standorte — und über die Vorlagen
 * hinweg verschieden.
 *
 * ## Warum die Mitte wandert und die Ränder nicht
 *
 * Die Ränder sind die Entscheidung: billig und abgelegen gegen teuer und wirksam. Sie wandern zu
 * lassen hieße, dem Spieler manchmal gar keine Wahl zu geben. Die Mitte ist die Abwechslung — und
 * weil sie aus der Vorlagenkennung folgt, ist sie wiederholbar und nicht willkürlich.
 */

export interface SiteOffer {
  /** Von günstig nach teuer, immer drei. */
  sites: SiteProfile[]
}

/** Der günstigste, einer dazwischen, der teuerste. Immer drei, immer mit Spanne. */
export function sitesFor(sourceId: string, seed: number): SiteProfile[] {
  const cheapest = BUILDABLE_BY_COST[0]!
  const dearest = BUILDABLE_BY_COST[BUILDABLE_BY_COST.length - 1]!
  const between = BUILDABLE_BY_COST.slice(1, -1)
  const rng = createRandomStream(seed, `site:${sourceId}`)
  const middle = between[Math.min(between.length - 1, Math.floor(rng.next() * between.length))]!
  return [cheapest, middle, dearest]
}

/** Ob dieser Standort überhaupt im Angebot war. Schützt vor einem Befehl, den niemand anbieten wollte. */
export function offered(sourceId: string, seed: number, districtId: DistrictId): boolean {
  return sitesFor(sourceId, seed).some(site => site.districtId === districtId)
}

/**
 * Was das Vorhaben an diesem Standort kostet.
 *
 * Auf ganze Zehntelmillionen gerundet, weil der Haushalt in Millionen mit einer Nachkommastelle
 * gelesen wird und `28 × 1,85 = 51,8` dort besser aussieht als `51,800000000000004`.
 */
export function costAt(base: number, districtId: DistrictId): number {
  return Math.round(base * SITE_PROFILES[districtId].cost * 10) / 10
}

/**
 * Und wie lange es dauert, in Monaten.
 *
 * Mindestens ein Monat: ein Vorhaben, das in null Monaten fertig ist, hat keine Bauzeit, und die
 * Verzögerung ist der halbe Sinn der Sache. Aufgerundet, weil ein angefangener Monat ein Monat ist.
 */
export function paceAt(base: number, districtId: DistrictId): number {
  return Math.max(1, Math.ceil(base * SITE_PROFILES[districtId].pace))
}

/**
 * Was der Standort an Zufriedenheit kostet, einmalig.
 *
 * Ein Neubau in der Altstadt hat eine Bürgerinitiative, bevor der erste Bagger da ist; dieselbe
 * Halle im Hafen hat niemanden. Der Ausschlag ist bewusst klein — es ist ein Ärgernis und keine
 * Krise —, aber er ist da, und über ein Jahrzehnt summiert er sich, wenn man immer teuer und mitten
 * in der Stadt baut.
 */
const RESISTANCE_BITE = 2.4

export function unrestAt(districtId: DistrictId): number {
  return Math.round(SITE_PROFILES[districtId].resistance * RESISTANCE_BITE * 10) / 10
}

/**
 * Was Platz braucht, braucht einen Ort — und das steht an der Vorlage, nicht in einer Regel.
 *
 * Der erste Versuch hat es abgeleitet: eine Vorlage gilt als verortbar, wenn irgendeine ihrer
 * Wirkungen auf etwas zeigt, das Fläche braucht. Gezählt hat das **19 von 26** — darunter
 * „Haushaltskonsolidierung“, „Beteiligungen auf den Prüfstand“ und „Genehmigung in dreißig Tagen“.
 * Alle drei berühren Gewerbeflächen oder Nahverkehrskapazität, und keine einzige davon baut etwas.
 * Eine Regel, die in sieben von sechsundzwanzig Fällen danebenliegt, ist keine Ersparnis, sondern
 * eine Fehlerquelle mit Kommentar.
 *
 * Also steht es am Inhalt. Sechsundzwanzig Vorlagen sind überschaubar, und wer eine schreibt, weiß
 * besser als jede Heuristik, ob dabei etwas entsteht, das irgendwo steht.
 */
export function needsSite(option: { sited?: boolean }): boolean {
  return option.sited === true
}
