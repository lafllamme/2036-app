import type { DistrictId, DistrictType } from '../core/contracts'
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
  /** Wie viele freie Bauparzellen das Viertel überhaupt hat. Siehe `PARCELS`. */
  parcels: number
}

const NAMES = new Map(LINDENHAFEN.districts.map(district => [district.id, district.name]))

/**
 * Lage, Tempo und Ärger — an der **Art** des Viertels, nicht an seinem Namen.
 *
 * Es waren acht Zeilen von Hand. Mit zwanzig Vierteln wären es zwanzig, von denen sechzehn aus
 * derselben Überlegung folgen: bauen in einem Gründerzeitblock ist teuer, dauert und ärgert die
 * Nachbarn, ganz gleich ob der Block Lindentor oder Westerfeld heißt. Einmal je Archetyp, und ein
 * Viertel erbt es.
 */
const SITE_GRADIENT: Record<DistrictType, { cost: number, pace: number, resistance: number, note: string }> = {
  'industrial': { cost: 0.62, pace: 0.85, resistance: 0.08, note: 'Brachflächen, erschlossen, niemand wohnt daneben. Dafür liegt es weit ab.' },
  'fringe': { cost: 0.66, pace: 0.92, resistance: 0.12, note: 'Marsch und Deich, billig zu haben — und eine halbe Stunde von allem entfernt.' },
  'regenerated-docks': { cost: 0.78, pace: 0.9, resistance: 0.16, note: 'Alte Kaikante, bereits umgewidmet: Platz, Zufahrt und ein Bebauungsplan, der steht.' },
  'post-war-estate': { cost: 0.84, pace: 0.95, resistance: 0.4, note: 'Abstandsgrün zwischen den Zeilen — planungsrechtlich einfach, in der Nachbarschaft nicht.' },
  'garden-suburb': { cost: 0.88, pace: 0.95, resistance: 0.46, note: 'Flächen am Rand, gut erreichbar — und Nachbarn, die schon da sind.' },
  'mixed-fair': { cost: 0.94, pace: 0.98, resistance: 0.3, note: 'Hallen, Parkplatz, Stellflächen: viel Raum, wenig Widerspruch, kein Charme.' },
  'residential': { cost: 1, pace: 1, resistance: 0.5, note: 'Mittendrin, gewachsen, und fast vollständig bebaut.' },
  'mixed-quarter': { cost: 1.08, pace: 1.05, resistance: 0.55, note: 'Baulücken zwischen drei Baualtern — jede einzeln, jede mit eigenem Eigentümer.' },
  'civic-campus': { cost: 1.18, pace: 1.1, resistance: 0.28, note: 'Öffentliche Flächen und abgestimmte Planung — die Stadt baut hier mit sich selbst.' },
  'mixed-transit': { cost: 1.24, pace: 1.05, resistance: 0.58, note: 'Beste Anbindung der Stadt, und jeder Quadratmeter hat schon einen Eigentümer.' },
  'dense-residential': { cost: 1.45, pace: 1.2, resistance: 0.72, note: 'Dichte Blockränder, Hinterhöfe — und eine Nachbarschaft, die sich meldet.' },
  'civic-green': { cost: 1.7, pace: 1.3, resistance: 0.92, note: 'Am Park zu bauen heißt, den Park zu verkleinern. Das erklärt niemandem jemand.' },
  'historic-core': { cost: 1.85, pace: 1.35, resistance: 0.85, note: 'Größte Wirkung, größter Widerstand, und jede Grube ist eine Grabung.' },
}

/**
 * Wie viele freie Bauparzellen jedes Viertel hat.
 *
 * **Gemessen, nicht geschätzt.** `findGrowthSlots` liest aus der Karte, welche Flächen unbebaut sind
 * — Baustellen und offene Wiese, gerastert und freigehalten von allem, was schon steht. Die Zahlen
 * hier sind das Ergebnis dieses Laufs über den 4-km-Ausschnitt.
 *
 * **106 im ganzen Stadtgebiet**, und nur sechs Viertel haben genug davon: der Stadtgarten 35, das
 * Marschland 21, Hafentor 20, das Universitätsviertel 10, die Speicherstadt 8 und die Neustadt 5.
 * Vierzehn Viertel haben drei oder weniger — eine gewachsene Stadt hat ihre Reserven dort, wo einmal
 * etwas anderes stand.
 *
 * Sie stehen ausgeschrieben, weil der Simulationsworker sie in seiner ersten Millisekunde braucht
 * und die Karte erst über das Netz kommt. `tests/unit/siting.test.ts` hält fest, was daran nicht
 * kaputtgehen darf; wer den Ausschnitt ändert, misst neu.
 *
 * Der Grund, warum es diese Zahl überhaupt gibt: der erste Wurf hat den Standort frei aus allen
 * Vierteln angeboten, und die Altstadt war die teure Wahl mit der größten Wirkung. Gewählt, bezahlt,
 * und dann **nichts** — kein Kran, kein Haus, weil dort kein Quadratmeter frei ist. Eine Altstadt
 * ist voll; ein Angebot, das sie trotzdem anbietet, verkauft einen Bauplatz, den es nicht gibt.
 */
const PARCELS: Record<DistrictId, number> = {
  altstadt: 1,
  bahnhofsviertel: 0,
  neustadt: 5,
  lindentor: 0,
  stadtgarten: 35,
  kleinfeld: 3,
  speicherstadt: 8,
  marschland: 21,
  messeviertel: 0,
  westerfeld: 0,
  buntenhorst: 3,
  steinviertel: 0,
  hohenfeld: 0,
  hafentor: 20,
  universitaetsviertel: 10,
  fesenau: 0,
  gartenstadt: 0,
  werfthafen: 0,
  wolterdeich: 0,
  suedring: 0,
}

/**
 * Wie viele freie Parzellen ein Viertel mindestens haben muss, um angeboten zu werden.
 *
 * Ein Wohnungsbauprogramm, das in einem Viertel mit einer einzigen Lücke landet, liefert ein Haus
 * und danach nichts mehr. Das ist kein Standort, das ist eine Baulücke.
 */
const ENOUGH_LAND = 5

export const SITE_PROFILES: Record<DistrictId, SiteProfile> = Object.fromEntries(
  LINDENHAFEN.districts.map((district) => {
    const gradient = SITE_GRADIENT[district.type]
    return [district.id, {
      districtId: district.id,
      name: NAMES.get(district.id) ?? district.id,
      cost: gradient.cost,
      pace: gradient.pace,
      resistance: gradient.resistance,
      note: gradient.note,
      parcels: PARCELS[district.id],
    } satisfies SiteProfile]
  }),
) as Record<DistrictId, SiteProfile>

/** Alle zwanzig, vom günstigsten zum teuersten. */
export const SITES_BY_COST: SiteProfile[] = Object.values(SITE_PROFILES).sort((a, b) => a.cost - b.cost)

/**
 * Und die, auf denen wirklich gebaut werden kann — das Angebot.
 *
 * Nicht jedes Viertel ist ein Standort, und das ist die Aussage: eine gewachsene Stadt hat ihre
 * Reserven dort, wo einmal etwas anderes stand, und nicht dort, wo man sie gern hätte.
 */
export const BUILDABLE_BY_COST: SiteProfile[] = SITES_BY_COST.filter(site => site.parcels >= ENOUGH_LAND)
