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
  /**
   * Die Dächer des Viertels — **das Wichtigste von dieser Kamera aus.**
   *
   * Man schaut von schräg oben auf Lindenhafen, und dabei sieht man vor allem Dachflächen. Die
   * Dachfarben hingen aber am Gebäudetyp, und weil die meisten Häuser `residential` oder `modern`
   * sind, war das ganze Bild braungrau — ganz gleich, wie breit die Wandpaletten darunter wurden.
   * Ein Viertel wird von oben durch seine Dächer erkannt: rote Ziegel in der Altstadt, Bitumen und
   * Kies auf den Zeilen, Trapezblech über den Hallen.
   */
  roofs: string[]
  /**
   * Die Wände des Viertels. Leer heißt: es gilt die Palette des Gebäudetyps.
   *
   * Eine Halle ist eine Halle, wo immer sie steht, und ein Klinikum sieht nicht aus wie das Haus
   * daneben — deshalb behalten `industrial` und `civic` ihre Typpalette. Alles andere bekommt die
   * des Ortes, weil ein Wohnblock in der Altstadt eben nicht aussieht wie einer am Ring.
   */
  walls: string[]
  /**
   * Wie viele Häuser aus der Reihe tanzen, und in welchen Farben.
   *
   * Das war eine feste Quote je Gebäudetyp, über die ganze Stadt gleich — also wieder keine
   * Ortsaussage, sondern Rauschen. In Wirklichkeit ist das sehr ungleich verteilt: die Altstadt ist
   * bunt, das Industriegebiet ist es nicht, und in einer Vorstadt streicht jeder sein eigenes Haus,
   * weshalb dort die größte Streuung überhaupt herrscht.
   */
  accentShare: number
  accents: string[]
}

/*
 * Töne, die mehrfach gebraucht werden. Namen statt Hexcodes, damit eine Palette lesbar bleibt.
 *
 * **Tiefer und satter angelegt, als sie aussehen sollen.** Eine Dachfläche liegt waagerecht und
 * fängt damit von allen Flächen eines Hauses das meiste Licht: derselbe Ton, der an einer Wand
 * richtig wirkt, bleicht oben zu Weiß aus — und genau daran lag es, dass Lindenhafen von schräg oben
 * grau blieb, obwohl die Paletten darunter längst breit waren. Ein Ziegelrot muss hier fast
 * rostbraun eingegeben werden, damit es im Bild als Rot ankommt.
 */
const ROOF = {
  ziegelrot: ['#8e3a22', '#7d3019', '#9c4529', '#71301c'],
  altziegel: ['#6b3526', '#5d2e21', '#7a3d2b', '#56312a'],
  dunkelziegel: ['#3f2c26', '#332723', '#4a3229'],
  schiefer: ['#33383c', '#282d31', '#3e4449'],
  blech: ['#6e7477', '#7f8482', '#5c6164'],
  bitumen: ['#292c2f', '#212426', '#33373a'],
  kies: ['#635f55', '#57534a', '#6e6a5e'],
  begruent: ['#42532f', '#374627', '#4d5f38'],
  rost: ['#6e4331', '#5e3828'],
} as const

export const DISTRICT_CHARACTER: Record<DistrictId, DistrictCharacter> = {
  /**
   * Die gute Stube: Kontorhäuser, Geschäftslagen, alles instand — und **das bunteste Viertel**.
   * Eine Altstadt ist über Jahrhunderte Haus für Haus gestrichen worden, jedes von einem anderen
   * Eigentümer, und genau das sieht man ihr an.
   */
  'innenstadt': {
    upkeep: 0.9,
    grain: 0.86,
    storeyRise: 1.12,
    roofs: [...ROOF.ziegelrot, ...ROOF.altziegel, ...ROOF.schiefer],
    walls: ['#e3d4b0', '#d9bd86', '#c9a15e', '#e8ded0', '#c7b394', '#b8674f', '#cf9d7c', '#a8896a', '#dcc9a4'],
    accentShare: 0.3,
    accents: ['#b8563f', '#8e3f33', '#d9a441', '#4f6f56', '#3f5f72', '#c2683f', '#6e8a5e', '#e0c56a'],
  },
  /** Bahnhofsviertel: durchmischt, viel Durchgangsverkehr, wenig Eigentümerstolz. */
  'bahnhof': {
    upkeep: 0.52,
    grain: 0.92,
    storeyRise: 1.02,
    roofs: [...ROOF.altziegel, ...ROOF.bitumen, ...ROOF.schiefer],
    walls: ['#c8bda6', '#b0a894', '#9d9382', '#cbb894', '#8d8578', '#bda593', '#a3907a'],
    accentShare: 0.16,
    accents: ['#a8443a', '#5b7f94', '#d9a441', '#3a3f43'],
  },
  /** Gründerzeit: schmale Parzellen, hohe Räume, Stuck in Ocker und Altrosa, rote Ziegel oben drauf. */
  'gruenderzeit-nord': {
    upkeep: 0.82,
    grain: 0.74,
    storeyRise: 1.24,
    roofs: [...ROOF.altziegel, ...ROOF.ziegelrot, ...ROOF.schiefer],
    walls: ['#d8c193', '#c9a15e', '#c0927e', '#b5a077', '#d3b98f', '#a8896a', '#9d8a6b', '#e0d2b4'],
    accentShare: 0.24,
    accents: ['#b8674f', '#8a5b46', '#6e8a5e', '#5b7f94', '#d9a441', '#c2683f'],
  },
  /**
   * Der Wohnring: Zeilenbau der sechziger und siebziger Jahre. **Absichtlich eintönig** — die
   * Monotonie ist der Punkt, und sie ist erst zu sehen, wenn die Altstadt daneben bunt ist.
   */
  'wohnring-sued': {
    upkeep: 0.44,
    grain: 1.28,
    storeyRise: 0.88,
    roofs: [...ROOF.bitumen, ...ROOF.kies, ...ROOF.dunkelziegel],
    walls: ['#cfc6b3', '#b9b1a1', '#a39a8b', '#8d8578', '#c2b9a6', '#9b9488', '#b4ada0'],
    accentShare: 0.08,
    accents: ['#a86f52', '#6d7f79', '#8a8f6b'],
  },
  /** Universität und Klinikum: Nachkriegsbeton, Waschbeton, Flachdächer mit Kies und Grün. */
  'universitaet-klinikum': {
    upkeep: 0.76,
    grain: 1.16,
    storeyRise: 1.06,
    roofs: [...ROOF.kies, ...ROOF.begruent, ...ROOF.bitumen],
    walls: ['#dcd7cc', '#c4bdb2', '#aaa79e', '#e2e0d9', '#9a9186', '#cdc6b6'],
    accentShare: 0.12,
    accents: ['#a8443a', '#3f5f72', '#4f6f56'],
  },
  /** Hafen und Industrie: Hallen, Silos, Trapezblech. **Das langweiligste Viertel**, und zu Recht. */
  'hafen-industrie': {
    upkeep: 0.48,
    grain: 1.45,
    storeyRise: 1.3,
    roofs: [...ROOF.blech, ...ROOF.rost, ...ROOF.bitumen],
    walls: [],
    accentShare: 0.14,
    accents: ['#8a5f4a', '#3f5f72', '#5a6a66'],
  },
  /** Gewerbe Ost: Neubaugebiet auf der grünen Wiese, helles Blech, Firmenfarben am Giebel. */
  'gewerbe-ost': {
    upkeep: 0.86,
    grain: 1.35,
    storeyRise: 1.14,
    roofs: [...ROOF.blech, ...ROOF.bitumen],
    walls: [],
    accentShare: 0.18,
    accents: ['#a8443a', '#3f5f72', '#d9a441', '#4f6f56', '#3a3f43'],
  },
  /**
   * Vorstadt West: Einfamilienhäuser, Hecken — und **die größte Streuung der Stadt**, weil hier
   * jeder sein eigenes Haus streicht. Rote und dunkle Ziegel, weil ein Satteldach hier die Regel ist.
   */
  'vorstadt-west': {
    upkeep: 0.88,
    grain: 1.05,
    storeyRise: 0.94,
    roofs: [...ROOF.ziegelrot, ...ROOF.dunkelziegel, ...ROOF.altziegel, ...ROOF.schiefer],
    walls: ['#eae4d6', '#dcd2bd', '#d6c9ae', '#c8ccc6', '#e6e8e3', '#cbbda4', '#b9c0b4'],
    accentShare: 0.34,
    accents: ['#b8563f', '#d9a441', '#4f6f56', '#6e8a5e', '#5b7f94', '#3f5f72', '#c2683f', '#8a6f4a', '#a8443a'],
  },
}

/** Der Bauzustand, den ein Viertel seinem Bestand mitgibt: eine Spanne, keine Zahl. */
export function conditionRange(upkeep: number): { low: number, high: number } {
  // Auch ein vernachlässigtes Viertel hat instand gehaltene Häuser, und im besten steht eine Ruine.
  return { low: 0.3 + upkeep * 0.45, high: 0.62 + upkeep * 0.36 }
}
