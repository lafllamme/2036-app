import type { DistrictId } from '../core/contracts'

/**
 * Was ein Viertel von einem anderen unterscheidet.
 *
 * Lindenhafen hat acht Bezirke, jedes Gebäude trägt seinen `districtId`, und trotzdem sahen sie alle
 * gleich aus: der Bauzustand kam aus **einem** Strom für die ganze Stadt — 0,62 bis 0,98, im
 * Villenviertel wie im Wohnring —, und die Fassade las ihn mit sechzehn Prozent Helligkeitsspanne.
 * Acht Namen auf derselben Stadt.
 *
 * Hier steht, was sie voneinander trennt. Drei Zahlen je Viertel, und alle drei sind Bauwirklichkeit
 * und keine Wertung:
 *
 * - **`upkeep`** — wie gut der Bestand gepflegt ist. Bestimmt den Bauzustand und damit, wie stark
 *   eine Fassade verwittert und nachdunkelt.
 * - **`grain`** — die Parzellenkörnung: wie schmal die Häuser stehen und wie eng die Fenster sitzen.
 *   Gründerzeit steht schmal und hoch, die Nachkriegszeile breit und flach. Das ist der stärkste
 *   Unterschied, den man von oben überhaupt sieht, und er kostet nichts: es ist eine UV-Skala.
 * - **`storeyRise`** — wie hoch eine Geschosshöhe ist. Ein Altbau hat vier Meter Raumhöhe, ein
 *   Siebziger-Riegel zweisechzig; bei gleicher Gebäudehöhe hat der eine drei Fensterreihen und der
 *   andere fünf.
 *
 * Nichts davon liest die Simulation. Die Politik entscheidet, was gebaut wird — nicht, wie ein
 * Viertel gewachsen ist.
 */
export interface DistrictCharacter {
  /** 0 … 1. Wie gut der Bestand gehalten wird. */
  upkeep: number
  /** Faktor auf die Fensterbreite. Unter 1 heißt schmalere Achsen, also feinere Körnung. */
  grain: number
  /** Faktor auf die Geschosshöhe. Über 1 heißt hohe Räume und weniger Fensterreihen. */
  storeyRise: number
}

export const DISTRICT_CHARACTER: Record<DistrictId, DistrictCharacter> = {
  /** Die gute Stube: Kontorhäuser, Geschäftslagen, alles instand. */
  'innenstadt': { upkeep: 0.9, grain: 0.86, storeyRise: 1.12 },
  /** Bahnhofsviertel: durchmischt, viel Durchgangsverkehr, wenig Eigentümerstolz. */
  'bahnhof': { upkeep: 0.52, grain: 0.92, storeyRise: 1.02 },
  /** Gründerzeit: schmale Parzellen, hohe Räume, gepflegt bis zur Sanierungswelle. */
  'gruenderzeit-nord': { upkeep: 0.82, grain: 0.74, storeyRise: 1.24 },
  /** Der Wohnring: Zeilenbau der sechziger und siebziger Jahre, breit, flach, in die Jahre gekommen. */
  'wohnring-sued': { upkeep: 0.44, grain: 1.28, storeyRise: 0.88 },
  /** Universität und Klinikum: Nachkriegsbeton, funktional, öffentlich unterhalten. */
  'universitaet-klinikum': { upkeep: 0.76, grain: 1.16, storeyRise: 1.06 },
  /** Hafen und Industrie: Hallen, Silos, Blech. Gepflegt wird, was produziert. */
  'hafen-industrie': { upkeep: 0.48, grain: 1.45, storeyRise: 1.3 },
  /** Gewerbe Ost: Neubaugebiet auf der grünen Wiese, alles unter zwanzig Jahre alt. */
  'gewerbe-ost': { upkeep: 0.86, grain: 1.35, storeyRise: 1.14 },
  /** Vorstadt West: Einfamilienhäuser, Hecken, jeder pflegt sein eigenes. */
  'vorstadt-west': { upkeep: 0.88, grain: 1.05, storeyRise: 0.94 },
}

/** Der Bauzustand, den ein Viertel seinem Bestand mitgibt: eine Spanne, keine Zahl. */
export function conditionRange(upkeep: number): { low: number, high: number } {
  // Auch ein vernachlässigtes Viertel hat instand gehaltene Häuser, und im besten steht eine Ruine.
  return { low: 0.3 + upkeep * 0.45, high: 0.62 + upkeep * 0.36 }
}
