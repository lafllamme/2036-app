import type { DistrictId, PartyId } from '../core/contracts'
import type { Spread } from './districts'
import type { Support } from './electorate'
import { LINDENHAFEN } from '../world/model/lindenhafen'
import { initialSpread } from './districts'
import { ELECTION_MONTHS } from './election'
import { normalise } from './electorate'

/**
 * Der Wahlkampf: die drei Monate, in denen die Karte zum Wahlkampfbrett wird.
 *
 * `ELECTION_MONTHS` steht seit Wochen und `holdElection` rechnet — aber die Monate davor liefen wie
 * jeder andere. Elf Jahre hatten damit keinen Bogen, sondern 132 gleiche Monate mit zwei
 * Auszählungen darin. Ein Wahltermin, den man erst am Wahltag bemerkt, ist ein Würfelwurf.
 *
 * ## Was man im Wahlkampf tut
 *
 * Man tritt in einem Viertel auf. Das ist die ganze Handlung, und sie ist genau deshalb interessant,
 * weil sie nicht überall gleich viel bringt: **wie viel ein Auftritt einbringt, hängt davon ab, wie
 * es dem Viertel unter der eigenen Regierung ergangen ist.** Wo die Miete relativ gefallen ist und
 * weniger eingebrochen wird, hat man eine Bilanz; wo sie gestiegen ist, tritt man vor Leute, die
 * das anders sehen — und dann schadet der Auftritt.
 *
 * Damit hängt die Wahl zum ersten Mal an den Vierteln und nicht nur an der Stadtzahl. Es ist auch
 * die ehrliche Abbildung: eine Kommunalwahl gewinnt man dort, wo man geliefert hat, und man
 * verliert sie, wo man es nicht hat.
 *
 * ## Und warum der Vergleich gegen den Anfang geht
 *
 * Der Maßstab ist `initialSpread()` — das Gefälle, mit dem die Stadt angetreten ist. Kein
 * zusätzlicher Zustand, keine Momentaufnahme, die irgendwo mitgeschleppt werden muss: eine reine
 * Funktion gegen eine reine Funktion. Und inhaltlich richtig, denn gemessen wird eine **Amtszeit**
 * und nicht der letzte Monat.
 */

/** Wie lange der Wahlkampf läuft. Drei Monate: lang genug für eine Runde, kurz genug für ein Finale. */
export const CAMPAIGN_MONTHS = 3

/** Was ein Auftritt kostet. Zwischen Verhandeln (12) und Kampagne (18) — es ist beides zugleich. */
export const APPEARANCE_COST = 14

/** Ob dieser Monat zum Wahlkampf gehört, und wie viele Monate bis zur Wahl noch bleiben. */
export function campaignAhead(month: number): number | null {
  for (const election of ELECTION_MONTHS) {
    if (month >= election - CAMPAIGN_MONTHS && month < election)
      return election - month
  }
  return null
}

/**
 * Die Bilanz in einem Viertel, −1 bis 1.
 *
 * Zwei Kennzahlen, und beide zählen als Faktor gegen den Stadtschnitt und nicht als absolute Zahl:
 * eine Stadt, in der die Miete überall gestiegen ist, hat keinem Viertel etwas getan, das man ihm
 * vorwerfen könnte. Gefragt ist, ob **dieses** Viertel besser oder schlechter dasteht als am Anfang.
 *
 * Miete zählt doppelt. Das ist keine Feinabstimmung, sondern die Aussage: an einer Kommunalwahl
 * hängt vor allem, was das Wohnen kostet.
 */
export function recordIn(spread: Spread, districtId: DistrictId): number {
  const start = initialSpread()
  const rent = (start.averageRent[districtId] - spread.averageRent[districtId]) / 0.3
  const burglary = (start.burglaryRate[districtId] - spread.burglaryRate[districtId]) / 0.45
  return Math.max(-1, Math.min(1, rent * 0.66 + burglary * 0.34))
}

/**
 * Was ein Auftritt der eigenen Partei einbringt, in Anteilspunkten.
 *
 * Das Gewicht des Viertels mal seiner Bilanz. Ein Auftritt im Kleinfeld — 15.800 Einwohner — wiegt
 * das Zwanzigfache eines Auftritts im Werfthafen, und das ist richtig: dort wohnt niemand.
 *
 * Es kann negativ sein, und das ist der Punkt der ganzen Übung. Wer vierzehn Kapital ausgibt, um
 * sich in dem Viertel zu zeigen, in dem die Miete unter ihm um ein Drittel gestiegen ist, bekommt
 * einen Abend, den er lieber nicht gehabt hätte.
 */
const APPEARANCE_REACH = 0.055

/**
 * Was ein Auftritt schon dafür einbringt, dass man überhaupt gekommen ist.
 *
 * Ohne diesen Sockel war ein Auftritt in einem Viertel ohne Bilanz **exakt null** — vierzehn Kapital
 * für nichts, und das ist keine Entscheidung, sondern eine Falle. Im Spiel gemessen: nach 46 Monaten
 * ohne einen einzigen Standortbeschluss stand die Bilanz in allen zwanzig Vierteln auf 0,0000, und
 * jeder Klick auf der Karte hätte Kapital verbrannt.
 *
 * Es ist auch inhaltlich richtig: wer einen Saal füllt, bewegt Leute, die ihn vorher nicht kannten.
 * Erst ab einer Bilanz von −0,35 kippt der Abend, und dann kippt er wirklich.
 */
const APPEARANCE_FLOOR = 0.35

export function appearanceGain(spread: Spread, districtId: DistrictId): number {
  const district = LINDENHAFEN.districts.find(entry => entry.id === districtId)
  if (!district)
    return 0
  const weight = district.population / LINDENHAFEN.population
  return (recordIn(spread, districtId) + APPEARANCE_FLOOR) * weight * APPEARANCE_REACH
}

/**
 * Den Auftritt auf die Unterstützung buchen.
 *
 * Nullsummig wie alles in `electorate.ts`: was die eigene Partei gewinnt, verlieren die anderen
 * anteilig ihrer Größe. Eine Stimme kommt immer von irgendwo.
 */
export function afterAppearance(support: Support, spread: Spread, districtId: DistrictId, partyId: PartyId): Support {
  const gain = appearanceGain(spread, districtId)
  if (gain === 0)
    return support

  const next: Support = { ...support }
  const others = Object.entries(support).filter(([id]) => id !== partyId) as [PartyId, number][]
  const rest = others.reduce((sum, [, share]) => sum + share, 0)
  next[partyId] = Math.max(0.01, (next[partyId] ?? 0) + gain)
  for (const [id, share] of others)
    next[id] = Math.max(0.005, share - gain * (share / Math.max(1e-6, rest)))
  return normalise(next)
}
