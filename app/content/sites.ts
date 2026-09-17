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
  /**
   * Wie viele freie Bauparzellen der Bezirk überhaupt hat.
   *
   * Gemessen und nicht geschätzt: `findGrowthSlots` liest aus der Karte, welche Flächen unbebaut
   * sind, und kommt auf **87 im ganzen Stadtgebiet** — 42 in der Gründerzeit Nord, 23 in der
   * Vorstadt West, 14 im Hafen, 7 am Bahnhof, eine im Wohnring Süd und **keine einzige** in der
   * Altstadt, auf dem Campus und in Gewerbe Ost.
   *
   * Das ist der Grund, warum die Zahl hier steht. Der erste Wurf hat den Standort frei aus allen acht
   * Bezirken angeboten, und die Altstadt war die teure Wahl mit der größten Wirkung. Gewählt, bezahlt,
   * und dann: **nichts.** Kein Kran, kein Haus, nichts — weil dort kein Quadratmeter frei ist. Eine
   * Altstadt ist voll, das ist ihre Eigenschaft; ein Angebot, das sie trotzdem anbietet, verkauft
   * einen Bauplatz, den es nicht gibt.
   */
  parcels: number
}

const NAMES = new Map(LINDENHAFEN.districts.map(district => [district.id, district.name]))

function profile(districtId: DistrictId, cost: number, pace: number, resistance: number, parcels: number, note: string): SiteProfile {
  return { districtId, name: NAMES.get(districtId) ?? districtId, cost, pace, resistance, parcels, note }
}

/**
 * Wie viele freie Parzellen ein Bezirk mindestens haben muss, um angeboten zu werden.
 *
 * Der Wohnring Süd hat genau **eine**. Ein Wohnungsbauprogramm, das dort landet, liefert ein Haus
 * und danach nichts mehr — das ist kein Standort, das ist eine Baulücke.
 */
const ENOUGH_LAND = 5

export const SITE_PROFILES: Record<DistrictId, SiteProfile> = {
  'hafen-industrie': profile('hafen-industrie', 0.62, 0.85, 0.08, 14, 'Brachflächen, erschlossen, niemand wohnt daneben. Dafür liegt es weit ab.'),
  'gewerbe-ost': profile('gewerbe-ost', 0.78, 0.9, 0.16, 0, 'Platz und Zufahrt wären da — nur ist nichts mehr frei.'),
  'vorstadt-west': profile('vorstadt-west', 0.88, 0.95, 0.46, 23, 'Flächen am Rand, gut erreichbar — und Nachbarn, die schon da sind.'),
  'wohnring-sued': profile('wohnring-sued', 1, 1, 0.5, 1, 'Mittendrin, und bis auf eine Lücke vollständig bebaut.'),
  'universitaet-klinikum': profile('universitaet-klinikum', 1.18, 1.1, 0.28, 0, 'Öffentliche Flächen, abgestimmte Planung — und kein freies Grundstück.'),
  'bahnhof': profile('bahnhof', 1.24, 1.05, 0.58, 7, 'Beste Anbindung der Stadt, und jeder Quadratmeter hat schon einen Eigentümer.'),
  'gruenderzeit-nord': profile('gruenderzeit-nord', 1.45, 1.2, 0.72, 42, 'Die größte Reserve der Stadt — dichte Blockränder und eine Nachbarschaft, die sich meldet.'),
  'innenstadt': profile('innenstadt', 1.85, 1.35, 0.85, 0, 'Größte Wirkung, größter Widerstand — und kein Quadratmeter frei.'),
}

/** Alle acht, vom günstigsten zum teuersten. */
export const SITES_BY_COST: SiteProfile[] = Object.values(SITE_PROFILES).sort((a, b) => a.cost - b.cost)

/**
 * Und die, auf denen wirklich gebaut werden kann — das Angebot.
 *
 * Vier von acht: Hafen, Vorstadt West, Bahnhof, Gründerzeit Nord. Die Spanne bleibt: 0,62 gegen
 * 1,45 ist mehr als das Doppelte, und der teure Standort ist zugleich der mit der größten Reserve.
 */
export const BUILDABLE_BY_COST: SiteProfile[] = SITES_BY_COST.filter(site => site.parcels >= ENOUGH_LAND)
