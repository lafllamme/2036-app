import type { DistrictId } from '../core/contracts'
import { LINDENHAFEN } from '../world/model/lindenhafen'

/**
 * Was es bedeutet, ein Vorhaben **hier** zu bauen und nicht dort.
 *
 * Bis hierher war jeder Beschluss ortlos. „Wohnungsbau-Turbo" hieß: die Zahl der Wohnungen steigt,
 * irgendwo, und der Renderer füllte die freien Parzellen von der Mitte nach außen — in einer
 * Reihenfolge, die der Spieler nicht gewählt hat und nicht ändern konnte. Die Stadt war damit
 * Ausgabe und kein Eingabefeld: man konnte über sie fliegen, aber nichts an ihr entscheiden.
 *
 * Ein Ratsbeschluss sagt künftig **was**, und der Spieler sagt **wo**. Das ist keine Erfindung —
 * Bauleitplanung ist Ratsgeschäft — und es macht die Karte zur Bedienfläche, ohne dass aus dem Spiel
 * ein Städtebauspiel wird: es wird kein Gebäude gesetzt, es wird ein Standort beschlossen.
 *
 * ## Warum der Ort etwas kostet, bevor es Bezirkskennzahlen gibt
 *
 * Eine Wahl, die nichts ändert, ist keine. Echte Kennzahlen je Bezirk sind ein großer Umbau am
 * Modell — bis dahin wirkt der Ort über drei Größen, die es **alle schon gibt**: Geld, Zeit und
 * Widerstand. Damit ist die Entscheidung ab dem ersten Tag echt, und Bezirkskennzahlen machen sie
 * später tiefer statt überhaupt erst wahr.
 *
 * Die Werte sind Lagefaktoren und keine Behauptung über reale Grundstückspreise: bauen in einer
 * Gründerzeit-Altstadt ist teurer und dauert länger als auf einer Industriebrache, und es ärgert
 * mehr Leute. Das ist der Zusammenhang, den das Spiel abbildet.
 */

export interface SiteProfile {
  districtId: DistrictId
  name: string
  /** Was ein Vorhaben hier kostet, als Vielfaches seines Preises. */
  cost: number
  /** Wie lange es dauert, als Vielfaches seiner Bauzeit. Größer ist langsamer. */
  pace: number
  /**
   * Wie viel Widerstand der Standort auslöst, 0 bis 1.
   *
   * Wirkt auf die Zufriedenheit, einmalig, beim Beschluss. Ein Neubau in der Altstadt hat eine
   * Bürgerinitiative, bevor der erste Bagger da ist; dieselbe Halle im Hafen hat niemanden.
   */
  resistance: number
  /** Ein Satz, der im Blatt steht. Sagt warum, nicht was. */
  note: string
}

const NAMES = new Map(LINDENHAFEN.districts.map(district => [district.id, district.name]))

function profile(districtId: DistrictId, cost: number, pace: number, resistance: number, note: string): SiteProfile {
  return { districtId, name: NAMES.get(districtId) ?? districtId, cost, pace, resistance, note }
}

export const SITE_PROFILES: Record<DistrictId, SiteProfile> = {
  'hafen-industrie': profile('hafen-industrie', 0.62, 0.85, 0.08, 'Brachflächen, erschlossen, niemand wohnt daneben. Dafür liegt es weit ab.'),
  'gewerbe-ost': profile('gewerbe-ost', 0.78, 0.9, 0.16, 'Platz und Zufahrt sind da, der Boden ist günstig.'),
  'vorstadt-west': profile('vorstadt-west', 0.88, 0.95, 0.46, 'Flächen am Rand, gut erreichbar — und Nachbarn, die schon da sind.'),
  'wohnring-sued': profile('wohnring-sued', 1, 1, 0.5, 'Die naheliegende Wahl: mittendrin, ohne Besonderheiten.'),
  'universitaet-klinikum': profile('universitaet-klinikum', 1.18, 1.1, 0.28, 'Öffentliche Flächen, abgestimmte Planung, längere Wege durch die Gremien.'),
  'bahnhof': profile('bahnhof', 1.24, 1.05, 0.58, 'Beste Anbindung der Stadt, und jeder Quadratmeter hat schon einen Eigentümer.'),
  'gruenderzeit-nord': profile('gruenderzeit-nord', 1.45, 1.2, 0.72, 'Dichte Blockränder, kaum Lücken, und eine Nachbarschaft, die sich meldet.'),
  'innenstadt': profile('innenstadt', 1.85, 1.35, 0.85, 'Größte Wirkung und größter Widerstand: Denkmalschutz, Anlieger, jede Woche ein Termin.'),
}

/** Alle acht, vom günstigsten Standort zum teuersten. Die Reihenfolge ist das Angebot. */
export const SITES_BY_COST: SiteProfile[] = Object.values(SITE_PROFILES).sort((a, b) => a.cost - b.cost)
