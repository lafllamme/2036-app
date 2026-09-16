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
 * grau blieb, obwohl die Paletten darunter längst breit waren.
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

/*
 * Und die Wände.
 *
 * Hier lag der Rest des Problems: die Grundpaletten waren neutral, und nur acht bis vierunddreißig
 * Prozent der Häuser tanzten als „Akzent" aus der Reihe. Damit *musste* die Stadt überwiegend weiß,
 * grau und creme bleiben — Farbe war die Ausnahme und nicht die Regel.
 *
 * Eine norddeutsche Wohnstadt ist das Gegenteil. Backstein und Klinker in allen Rottönen, Putz in
 * Ocker und Senf, die Sanierungswelle der Neunziger in Salbei und Mint, die Kontorhäuser in
 * Taubenblau, dazwischen Altrosa und Terracotta. Weiß und Creme gehören dazu, aber als *ein* Ton
 * unter vielen. Die Listen unten sind darum aus Farben gebaut, mit den Neutralen als Minderheit.
 */
const WALL = {
  klinker: ['#bf5c43', '#bf725c', '#b2503a', '#c17f69', '#a44533'],
  backstein: ['#b35d41', '#a24e34', '#b97457'],
  ocker: ['#c8974a', '#d9a441', '#b8842f', '#cea45c', '#bd8c3a'],
  senf: ['#c4aa3a', '#d3b35a', '#b39a2f'],
  salbei: ['#8aa08c', '#7d9a86', '#94a998', '#6f8a78'],
  mint: ['#9db9ad', '#8aa89c', '#b0c7bc'],
  flaschengruen: ['#628a6b', '#587e5d', '#709778'],
  taubenblau: ['#6e91a6', '#587f98', '#83a0b1', '#4c738a'],
  altrosa: ['#c08f80', '#b8786b', '#cb9d8f', '#a86c60'],
  terracotta: ['#c2683f', '#b35b35', '#cf7a51'],
  sandstein: ['#d5c39a', '#c6b184', '#e0d1ab'],
  creme: ['#e8ded0', '#dfd3c1', '#efe8dc'],
  weissputz: ['#f0ece4', '#e6e2d8'],
  hellgrau: ['#c2c4c0', '#b1b4b0', '#d0d2ce'],
  anthrazit: ['#747c81', '#636c73', '#868d91'],
  beton: ['#b8b2a6', '#a8a196', '#c6c0b4'],
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
    walls: [
      ...WALL.klinker,
      ...WALL.backstein,
      ...WALL.ocker,
      ...WALL.senf,
      ...WALL.altrosa,
      ...WALL.terracotta,
      ...WALL.taubenblau,
      ...WALL.flaschengruen,
      ...WALL.sandstein,
      ...WALL.creme,
    ],
    accentShare: 0.12,
    accents: [...WALL.flaschengruen, ...WALL.taubenblau, '#8a3f5c', '#2f4858'],
  },
  /** Bahnhofsviertel: durchmischt, viel Durchgangsverkehr, wenig Eigentümerstolz. */
  'bahnhof': {
    upkeep: 0.52,
    grain: 0.92,
    storeyRise: 1.02,
    roofs: [...ROOF.altziegel, ...ROOF.bitumen, ...ROOF.schiefer],
    walls: [
      ...WALL.klinker,
      ...WALL.ocker,
      ...WALL.beton,
      ...WALL.hellgrau,
      ...WALL.altrosa,
      ...WALL.sandstein,
      ...WALL.creme,
      ...WALL.anthrazit,
    ],
    accentShare: 0.1,
    accents: [...WALL.terracotta, ...WALL.taubenblau, ...WALL.senf],
  },
  /** Gründerzeit: schmale Parzellen, hohe Räume, Stuck in Ocker und Altrosa, rote Ziegel oben drauf. */
  'gruenderzeit-nord': {
    upkeep: 0.82,
    grain: 0.74,
    storeyRise: 1.24,
    roofs: [...ROOF.altziegel, ...ROOF.ziegelrot, ...ROOF.schiefer],
    walls: [
      ...WALL.ocker,
      ...WALL.senf,
      ...WALL.altrosa,
      ...WALL.klinker,
      ...WALL.salbei,
      ...WALL.sandstein,
      ...WALL.terracotta,
      ...WALL.creme,
    ],
    accentShare: 0.12,
    accents: [...WALL.flaschengruen, ...WALL.taubenblau, ...WALL.backstein],
  },
  /**
   * Der Wohnring: Zeilenbau der sechziger und siebziger Jahre. **Absichtlich eintöniger** als der
   * Rest — die Monotonie ist der Punkt, und sie ist erst zu sehen, wenn die Altstadt daneben bunt
   * ist. Eintönig heißt hier aber nicht farblos: die Sanierungswelle hat auch diese Zeilen in Mint
   * und Salbei gestrichen, nur eben zwei Blöcke am Stück in derselben Farbe.
   */
  'wohnring-sued': {
    upkeep: 0.44,
    grain: 1.28,
    storeyRise: 0.88,
    roofs: [...ROOF.bitumen, ...ROOF.kies, ...ROOF.dunkelziegel],
    walls: [
      ...WALL.beton,
      ...WALL.hellgrau,
      ...WALL.creme,
      ...WALL.salbei,
      ...WALL.mint,
      ...WALL.sandstein,
      ...WALL.ocker,
    ],
    accentShare: 0.09,
    accents: [...WALL.terracotta, ...WALL.taubenblau, ...WALL.senf],
  },
  /** Universität und Klinikum: Nachkriegsbeton, Waschbeton, Flachdächer mit Kies und Grün. */
  'universitaet-klinikum': {
    upkeep: 0.76,
    grain: 1.16,
    storeyRise: 1.06,
    roofs: [...ROOF.kies, ...ROOF.begruent, ...ROOF.bitumen],
    walls: [
      ...WALL.beton,
      ...WALL.weissputz,
      ...WALL.hellgrau,
      ...WALL.klinker,
      ...WALL.sandstein,
      ...WALL.salbei,
    ],
    accentShare: 0.1,
    accents: [...WALL.taubenblau, ...WALL.terracotta, ...WALL.flaschengruen],
  },
  /** Hafen und Industrie: Hallen, Silos, Trapezblech. **Das langweiligste Viertel**, und zu Recht. */
  'hafen-industrie': {
    upkeep: 0.48,
    grain: 1.45,
    storeyRise: 1.3,
    roofs: [...ROOF.blech, ...ROOF.rost, ...ROOF.bitumen],
    walls: [],
    accentShare: 0.14,
    accents: [...WALL.taubenblau, '#7a4a38', ...WALL.flaschengruen],
  },
  /** Gewerbe Ost: Neubaugebiet auf der grünen Wiese, helles Blech, Firmenfarben am Giebel. */
  'gewerbe-ost': {
    upkeep: 0.86,
    grain: 1.35,
    storeyRise: 1.14,
    roofs: [...ROOF.blech, ...ROOF.bitumen],
    walls: [],
    accentShare: 0.2,
    accents: [...WALL.klinker, ...WALL.taubenblau, ...WALL.senf, ...WALL.anthrazit, ...WALL.flaschengruen],
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
    walls: [
      ...WALL.klinker,
      ...WALL.ocker,
      ...WALL.salbei,
      ...WALL.mint,
      ...WALL.taubenblau,
      ...WALL.altrosa,
      ...WALL.senf,
      ...WALL.weissputz,
      ...WALL.creme,
      ...WALL.sandstein,
      ...WALL.terracotta,
    ],
    accentShare: 0.14,
    accents: [...WALL.flaschengruen, ...WALL.backstein, '#3f5f72', '#8a6f4a'],
  },
}

/** Der Bauzustand, den ein Viertel seinem Bestand mitgibt: eine Spanne, keine Zahl. */
export function conditionRange(upkeep: number): { low: number, high: number } {
  // Auch ein vernachlässigtes Viertel hat instand gehaltene Häuser, und im besten steht eine Ruine.
  return { low: 0.3 + upkeep * 0.45, high: 0.62 + upkeep * 0.36 }
}
