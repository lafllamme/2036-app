import type { DistrictId, DistrictType } from '../core/contracts'
import { LINDENHAFEN } from './model/lindenhafen'

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
 * Und die Wände — **abgemessen an einer echten Altstadt, nicht ausgedacht.**
 *
 * Hier lag der Rest des Problems, und zwei Anläufe haben ihn verfehlt. Erst waren die Grundpaletten
 * neutral und Farbe kam nur als Ausnahme herein; dann war Farbe die Regel, aber die Töne waren zu
 * satt und gleichzeitig zu dunkel, und die Stadt sah aus wie ein Farbkasten.
 *
 * Also nachgeschlagen statt weiter geraten. Das Farbkonzept der Altstadt Stralsund — Hansestadt an
 * der Ostsee, UNESCO-Welterbe, derselbe Bautyp wie Lindenhafen — nennt 105 Fassadentöne in
 * NCS-Notation. Umgerechnet nach sRGB:
 *
 * | | Stralsund | die Palette davor |
 * | --- | --- | --- |
 * | Sättigung, Median | **17 %** | 29–41 % |
 * | 90. Perzentil | **29 %** | — |
 * | Helligkeit | 60–84 % | 42–58 % |
 * | Familien | 87× Gelb–Rot, 13× Olivgrün, 4× Rot, **0× Blau** | vier Rotgruppen plus Blau |
 *
 * Der Grund dafür ist bauphysikalisch und nicht geschmacklich: historische Fassaden sind Kalkfarbe,
 * und Kalk verliert seine Bindekraft über etwa zehn Prozent Pigmentanteil. Was übrig bleibt, sind
 * farbschwache Erdpigmente — Ocker, Umbra, Eisenoxidrot. Eine Altstadt ist deshalb **hell und
 * stumpf**, nicht dunkel und satt. Genau andersherum als das, was hier stand.
 *
 * Die Listen unten sind darum aus echten NCS-Codes gebaut; jede trägt sie als Kommentar. Die eine
 * Ausnahme ist `klinker`: gebrannter Ton ist keine Kalkfarbe und darf satter sein — er ist der
 * einzige Ton der Stadt über 40 % Sättigung, und das ist richtig so.
 *
 * Median über alle Töne: **16 %.**
 */
const WALL = {
  // S4040-Y70R, S5040-Y70R, S4030-Y60R, S5030-Y80R
  klinker: ['#884d41', '#6f3328', '#8e6656', '#71403f'],
  // S2030-Y90R, S2020-Y80R, S3020-Y80R, S2020-Y70R
  rotocker: ['#bc868d', '#c3a2a1', '#a98888', '#c4a6a0'],
  // S2040-Y10R, S2020-Y20R, S3020-Y20R, S1515-Y20R, S2030-Y20R
  ocker: ['#cab268', '#cabb9b', '#b0a182', '#d7ccb4', '#c8b283'],
  // S1515-Y30R, S2020-Y30R, S1510-Y20R, S2010-Y30R
  sandgelb: ['#d6c9b5', '#c8b79c', '#d8d0c0', '#cac1b4'],
  // S1515-Y60R, S2010-Y60R, S1515-Y50R, S2020-Y40R
  altrosa: ['#d3bfb7', '#c8bbb6', '#d4c2b6', '#c7b29d'],
  // S3010-Y40R, S3010-Y20R, S4010-Y30R, S3005-Y50R
  lehmbraun: ['#b0a69b', '#b1aa9a', '#978e81', '#b1aba7'],
  // S3020-G80Y, S4010-G30Y, S3010-G50Y, S2020-G80Y
  olivgruen: ['#a8a884', '#879187', '#a6ac9e', '#c2c19d'],
  // S2005-G70Y, S3005-G80Y, S2010-G50Y
  graugruen: ['#c8c9c1', '#b0b0a7', '#bfc5b8'],
  // S3010-B10G, S2010-B, S4010-B30G
  taubenblau: ['#99a7ab', '#b2c0c5', '#808e90'],
  // S1505-Y20R, S1510-Y50R, S1005-Y20R
  sandstein: ['#d8d4cd', '#d6cac2', '#e5e1d9'],
  // S1002-Y, S1005-Y10R, S0505-Y20R
  creme: ['#e6e5e0', '#e5e2d9', '#f2eee6'],
  // S0502-Y, S1002-Y50R
  weissputz: ['#f2f1ed', '#e5e3e1'],
  // S2002-G, S1502-B, S2500-N
  hellgrau: ['#c7cac9', '#d4d6d7', '#bfbfbf'],
  // S6005-B20G, S7000-N, S5005-B80G
  anthrazit: ['#596062', '#4c4c4c', '#737a79'],
  // S3005-Y20R, S4005-Y20R, S2502-Y
  beton: ['#b2aea6', '#98958d', '#bfbeba'],
} as const

/**
 * Die zwölf Archetypen, und warum nicht zwanzig Viertel.
 *
 * Es waren acht Viertel und acht Einträge, eins zu eins. Mit zwanzig wäre daraus zwanzig Mal
 * dieselbe Entscheidung geworden — und zwanzig Gelegenheiten, sie ein bisschen anders zu treffen,
 * bis niemand mehr sagen kann, was ein Gründerzeitviertel in dieser Stadt eigentlich ausmacht. Der
 * Archetyp ist die Entscheidung **einmal**; ein Viertel sagt nur noch, welcher es ist.
 *
 * Herausgefallen ist dabei `upkeep`: der ist keine Eigenschaft der Art, sondern des Ortes. Zwei
 * Gründerzeitviertel sehen gleich gebaut aus und werden völlig verschieden gehalten — Lindentor
 * steht auf 0,84, Westerfeld auf 0,58 —, und genau das ist der Unterschied, den man seit dem
 * `wear`-Attribut auf der Karte sieht. Er steht deshalb am Viertel in `lindenhafen.ts`.
 */
export const CHARACTER: Record<DistrictType, Omit<DistrictCharacter, 'upkeep'>> = {
  /**
   * Die gute Stube: Kontorhäuser, Geschäftslagen — und **das bunteste Viertel**. Eine Altstadt ist
   * über Jahrhunderte Haus für Haus gestrichen worden, jedes von einem anderen Eigentümer, und genau
   * das sieht man ihr an.
   */
  'historic-core': {
    grain: 0.86,
    storeyRise: 1.12,
    roofs: [...ROOF.ziegelrot, ...ROOF.altziegel, ...ROOF.schiefer],
    walls: [
      ...WALL.klinker,
      ...WALL.rotocker,
      ...WALL.ocker,
      ...WALL.sandgelb,
      ...WALL.altrosa,
      ...WALL.sandstein,
      ...WALL.creme,
      ...WALL.olivgruen,
    ],
    accentShare: 0.12,
    accents: [...WALL.taubenblau, ...WALL.lehmbraun],
  },
  /** Bahnhofsviertel: durchmischt, viel Durchgangsverkehr, wenig Eigentümerstolz. */
  'mixed-transit': {
    grain: 0.92,
    storeyRise: 1.02,
    roofs: [...ROOF.altziegel, ...ROOF.bitumen, ...ROOF.schiefer],
    walls: [
      ...WALL.lehmbraun,
      ...WALL.beton,
      ...WALL.hellgrau,
      ...WALL.ocker,
      ...WALL.klinker,
      ...WALL.sandstein,
      ...WALL.creme,
      ...WALL.anthrazit,
    ],
    accentShare: 0.1,
    accents: [...WALL.rotocker, ...WALL.taubenblau],
  },
  /** Gründerzeit: schmale Parzellen, hohe Räume, Stuck in Ocker und Altrosa, rote Ziegel oben drauf. */
  'dense-residential': {
    grain: 0.74,
    storeyRise: 1.24,
    roofs: [...ROOF.altziegel, ...ROOF.ziegelrot, ...ROOF.schiefer],
    walls: [
      ...WALL.ocker,
      ...WALL.sandgelb,
      ...WALL.altrosa,
      ...WALL.klinker,
      ...WALL.rotocker,
      ...WALL.sandstein,
      ...WALL.creme,
      ...WALL.graugruen,
    ],
    accentShare: 0.12,
    accents: [...WALL.olivgruen, ...WALL.taubenblau],
  },
  /**
   * Wohnen über Läden: Nachkriegslücken zwischen Vorkriegshäusern, jede Ecke ein Kiosk. Der
   * Archetyp, der **nichts entschieden hat** — und das ist seine Aussage. Die breiteste Mischung aus
   * Dächern und Wandtönen, weil hier drei Baualter nebeneinanderstehen und keines gewonnen hat.
   */
  'mixed-quarter': {
    grain: 0.96,
    storeyRise: 1.06,
    roofs: [...ROOF.altziegel, ...ROOF.bitumen, ...ROOF.ziegelrot, ...ROOF.kies],
    walls: [
      ...WALL.klinker,
      ...WALL.sandstein,
      ...WALL.hellgrau,
      ...WALL.ocker,
      ...WALL.creme,
      ...WALL.beton,
      ...WALL.altrosa,
      ...WALL.graugruen,
    ],
    accentShare: 0.14,
    accents: [...WALL.rotocker, ...WALL.olivgruen, ...WALL.taubenblau],
  },
  /**
   * Das Messeviertel: Hallen neben Wohnzeilen, und dazwischen Parkplatz. Der Maßstab springt hier
   * härter als irgendwo sonst in Lindenhafen — ein Fünfzig-Meter-Dach neben einem Doppelhaus —,
   * und dafür steht die grobe Körnung bei gleichzeitig niedrigen Geschossen.
   */
  'mixed-fair': {
    grain: 1.32,
    storeyRise: 0.96,
    roofs: [...ROOF.blech, ...ROOF.bitumen, ...ROOF.kies, ...ROOF.dunkelziegel],
    walls: [
      ...WALL.hellgrau,
      ...WALL.beton,
      ...WALL.creme,
      ...WALL.sandstein,
      ...WALL.klinker,
      ...WALL.weissputz,
    ],
    accentShare: 0.16,
    accents: [...WALL.taubenblau, ...WALL.anthrazit, ...WALL.rotocker],
  },
  /**
   * Die Wohnstraße: Zwischenkriegs- und frühe Nachkriegsblöcke, vier Geschosse, Satteldach, Vorgarten.
   * Nicht die Zeile und nicht die Vorstadt — das, was zwischen beiden am häufigsten steht, und was
   * deshalb ruhig und ohne Ausschläge aussehen muss.
   */
  'residential': {
    grain: 1.02,
    storeyRise: 0.98,
    roofs: [...ROOF.dunkelziegel, ...ROOF.altziegel, ...ROOF.ziegelrot, ...ROOF.bitumen],
    walls: [
      ...WALL.creme,
      ...WALL.sandgelb,
      ...WALL.sandstein,
      ...WALL.klinker,
      ...WALL.hellgrau,
      ...WALL.graugruen,
      ...WALL.weissputz,
    ],
    accentShare: 0.11,
    accents: [...WALL.ocker, ...WALL.altrosa, ...WALL.taubenblau],
  },
  /**
   * Zeilenbau der sechziger und siebziger Jahre. **Absichtlich eintöniger** als der Rest — die
   * Monotonie ist der Punkt, und sie ist erst zu sehen, wenn die Altstadt daneben bunt ist. Eintönig
   * heißt hier aber nicht farblos: die Sanierungswelle hat auch diese Zeilen in Mint und Salbei
   * gestrichen, nur eben zwei Blöcke am Stück in derselben Farbe.
   */
  'post-war-estate': {
    grain: 1.28,
    storeyRise: 0.88,
    roofs: [...ROOF.bitumen, ...ROOF.kies, ...ROOF.dunkelziegel],
    walls: [
      ...WALL.beton,
      ...WALL.hellgrau,
      ...WALL.creme,
      ...WALL.graugruen,
      ...WALL.sandstein,
      ...WALL.sandgelb,
      ...WALL.lehmbraun,
    ],
    accentShare: 0.09,
    accents: [...WALL.ocker, ...WALL.taubenblau],
  },
  /**
   * Einfamilienhäuser, Hecken — und **die größte Streuung der Stadt**, weil hier jeder sein eigenes
   * Haus streicht. Rote und dunkle Ziegel, weil ein Satteldach hier die Regel ist.
   */
  'garden-suburb': {
    grain: 1.05,
    storeyRise: 0.94,
    roofs: [...ROOF.ziegelrot, ...ROOF.dunkelziegel, ...ROOF.altziegel, ...ROOF.schiefer],
    walls: [
      ...WALL.klinker,
      ...WALL.ocker,
      ...WALL.sandgelb,
      ...WALL.graugruen,
      ...WALL.olivgruen,
      ...WALL.taubenblau,
      ...WALL.altrosa,
      ...WALL.weissputz,
      ...WALL.creme,
      ...WALL.sandstein,
      ...WALL.rotocker,
    ],
    accentShare: 0.14,
    accents: [...WALL.lehmbraun, ...WALL.anthrazit],
  },
  /** Universität und Klinikum: Nachkriegsbeton, Waschbeton, Flachdächer mit Kies und Grün. */
  'civic-campus': {
    grain: 1.16,
    storeyRise: 1.06,
    roofs: [...ROOF.kies, ...ROOF.begruent, ...ROOF.bitumen],
    walls: [
      ...WALL.beton,
      ...WALL.weissputz,
      ...WALL.hellgrau,
      ...WALL.klinker,
      ...WALL.sandstein,
      ...WALL.graugruen,
      ...WALL.lehmbraun,
    ],
    accentShare: 0.1,
    accents: [...WALL.taubenblau, ...WALL.rotocker],
  },
  /**
   * Der Park und was an ihm liegt: Villen an der Kante, ein Vereinsheim, eine Tribüne. Wenige
   * Gebäude, aber die **teuersten** — wer am Park wohnt, streicht sein Haus. Hohe Räume, helle Töne,
   * Schiefer.
   */
  'civic-green': {
    grain: 0.9,
    storeyRise: 1.18,
    roofs: [...ROOF.schiefer, ...ROOF.ziegelrot, ...ROOF.begruent, ...ROOF.altziegel],
    walls: [
      ...WALL.weissputz,
      ...WALL.creme,
      ...WALL.sandstein,
      ...WALL.klinker,
      ...WALL.sandgelb,
      ...WALL.graugruen,
    ],
    accentShare: 0.1,
    accents: [...WALL.taubenblau, ...WALL.olivgruen],
  },
  /** Umgenutzte Hafenkante: Neubau auf Speicherfundamenten, helles Blech, Firmenfarben am Giebel. */
  'regenerated-docks': {
    grain: 1.35,
    storeyRise: 1.14,
    roofs: [...ROOF.blech, ...ROOF.bitumen],
    walls: [],
    accentShare: 0.2,
    accents: [...WALL.klinker, ...WALL.taubenblau, ...WALL.anthrazit, ...WALL.olivgruen],
  },
  /** Hafen und Industrie: Hallen, Silos, Trapezblech. **Das langweiligste Viertel**, und zu Recht. */
  'industrial': {
    grain: 1.45,
    storeyRise: 1.3,
    roofs: [...ROOF.blech, ...ROOF.rost, ...ROOF.bitumen],
    walls: [],
    accentShare: 0.14,
    accents: [...WALL.taubenblau, ...WALL.lehmbraun, ...WALL.olivgruen],
  },
  /**
   * Der Rand: Marsch, Deich, ein Hof alle vierhundert Meter, eine Halle dazwischen. Was hier steht,
   * steht allein und ist gebaut worden, um zu halten und nicht um gesehen zu werden — rotes Blech,
   * geteerte Pappe, verwitterter Klinker, und die breitesten Achsen der ganzen Stadt.
   */
  'fringe': {
    grain: 1.5,
    storeyRise: 1.02,
    roofs: [...ROOF.rost, ...ROOF.dunkelziegel, ...ROOF.blech, ...ROOF.altziegel],
    walls: [
      ...WALL.klinker,
      ...WALL.lehmbraun,
      ...WALL.beton,
      ...WALL.hellgrau,
      ...WALL.olivgruen,
    ],
    accentShare: 0.08,
    accents: [...WALL.rotocker, ...WALL.anthrazit],
  },
}

/**
 * Und das Viertel selbst: sein Archetyp plus sein eigener Pflegezustand.
 *
 * Abgeleitet statt geschrieben — es gibt keine Stelle, an der jemand einem Viertel eine Palette
 * geben könnte, die zu seiner Art nicht passt.
 */
export const DISTRICT_CHARACTER: Record<DistrictId, DistrictCharacter> = Object.fromEntries(
  LINDENHAFEN.districts.map(district => [district.id, { ...CHARACTER[district.type], upkeep: district.upkeep }]),
) as Record<DistrictId, DistrictCharacter>

/** Der Bauzustand, den ein Viertel seinem Bestand mitgibt: eine Spanne, keine Zahl. */
export function conditionRange(upkeep: number): { low: number, high: number } {
  // Auch ein vernachlässigtes Viertel hat instand gehaltene Häuser, und im besten steht eine Ruine.
  return { low: 0.3 + upkeep * 0.45, high: 0.62 + upkeep * 0.36 }
}
