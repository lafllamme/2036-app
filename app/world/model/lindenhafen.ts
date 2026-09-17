import type { CityDefinition, DistrictDefinition } from '../../core/contracts'

/**
 * Wer die zwanzig Viertel von Lindenhafen sind.
 *
 * **Nicht, wo sie liegen.** Der Umriss steht in `lindenhafen.json` und kommt über das Netz; hier
 * steht, was der Simulationsworker in seiner ersten Millisekunde braucht — Name, Art, Einwohnerzahl,
 * Pflegezustand. Vorher stand beides zusammen, und das ging nur, weil ein Viertel ein Rechteck war,
 * das man hinschreiben konnte: acht Kästen in einem 3 × 3-Raster über einem echten Stadtgrundriss.
 * In der Kartenansicht sah man genau das.
 *
 * ## Woher die Zahlen kommen
 *
 * Die **Fläche** ist gemessen: `scripts/cityDistricts.mjs` schneidet die echten Ortsteilgrenzen auf
 * den 4 × 4-km-Ausschnitt und rechnet die Hektar aus. Die **Einwohnerzahl** folgt daraus, über eine
 * Wohndichte je Art — 155 je Hektar in der Gründerzeit, 28 im Industriegebiet, 16 im Park — und ist
 * dann auf die 120.000 der Stadt normiert. Sie steht hier ausgeschrieben statt gerechnet, weil sie
 * das Gewicht jedes Viertels im Stadtdurchschnitt ist und sich nicht ändern darf, nur weil jemand
 * eine Grenze um zehn Meter verschiebt.
 *
 * Der **Pflegezustand** ist gesetzt, nicht gemessen: er ist die eine Zahl, mit der ein Viertel sagt,
 * wie es ihm geht, und sie soll ein Gefälle ergeben, das man auf der Karte sieht — 0,42 in Kleinfeld
 * gegen 0,90 in der Gartenstadt. Siehe `districtCharacter.ts` und das `wear`-Attribut.
 */
const DISTRICTS: DistrictDefinition[] = [
  { id: 'neustadt', name: 'Neustadt', shortName: 'Neustadt', type: 'dense-residential', color: '#b98d70', population: 20_700, upkeep: 0.72 },
  { id: 'kleinfeld', name: 'Kleinfeld', shortName: 'Kleinfeld', type: 'post-war-estate', color: '#a9a89a', population: 15_800, upkeep: 0.42 },
  { id: 'lindentor', name: 'Lindentor', shortName: 'Lindentor', type: 'dense-residential', color: '#c79a72', population: 12_800, upkeep: 0.84 },
  { id: 'bahnhofsviertel', name: 'Bahnhofsviertel', shortName: 'Bahnhof', type: 'mixed-transit', color: '#d85f4a', population: 8_800, upkeep: 0.52 },
  { id: 'altstadt', name: 'Altstadt', shortName: 'Altstadt', type: 'historic-core', color: '#d7955f', population: 8_300, upkeep: 0.88 },
  { id: 'westerfeld', name: 'Westerfeld', shortName: 'Westerfeld', type: 'dense-residential', color: '#b07f68', population: 7_700, upkeep: 0.58 },
  { id: 'buntenhorst', name: 'Buntenhorst', shortName: 'Buntenhorst', type: 'residential', color: '#e0b777', population: 6_100, upkeep: 0.74 },
  { id: 'hohenfeld', name: 'Hohenfeld', shortName: 'Hohenfeld', type: 'residential', color: '#d9b585', population: 5_400, upkeep: 0.62 },
  { id: 'steinviertel', name: 'Steinviertel', shortName: 'Steinviertel', type: 'mixed-quarter', color: '#c2a084', population: 5_200, upkeep: 0.66 },
  { id: 'fesenau', name: 'Fesenau', shortName: 'Fesenau', type: 'dense-residential', color: '#bf8f78', population: 5_100, upkeep: 0.8 },
  { id: 'speicherstadt', name: 'Speicherstadt', shortName: 'Speicher', type: 'regenerated-docks', color: '#8d9d77', population: 4_200, upkeep: 0.86 },
  { id: 'messeviertel', name: 'Messeviertel', shortName: 'Messe', type: 'mixed-fair', color: '#cfae8c', population: 4_200, upkeep: 0.7 },
  { id: 'hafentor', name: 'Hafentor', shortName: 'Hafentor', type: 'mixed-quarter', color: '#b39a86', population: 4_100, upkeep: 0.56 },
  { id: 'suedring', name: 'Südring', shortName: 'Südring', type: 'residential', color: '#d5c08c', population: 3_000, upkeep: 0.68 },
  { id: 'universitaetsviertel', name: 'Universitätsviertel', shortName: 'Universität', type: 'civic-campus', color: '#6bb4a4', population: 2_300, upkeep: 0.78 },
  { id: 'gartenstadt', name: 'Gartenstadt', shortName: 'Gartenstadt', type: 'garden-suburb', color: '#9ab37c', population: 1_800, upkeep: 0.9 },
  { id: 'stadtgarten', name: 'Stadtgarten', shortName: 'Stadtgarten', type: 'civic-green', color: '#7fb083', population: 1_500, upkeep: 0.9 },
  { id: 'marschland', name: 'Marschland', shortName: 'Marsch', type: 'fringe', color: '#a8b98e', population: 1_400, upkeep: 0.6 },
  { id: 'werfthafen', name: 'Werfthafen', shortName: 'Werfthafen', type: 'industrial', color: '#718999', population: 800, upkeep: 0.46 },
  { id: 'wolterdeich', name: 'Wolterdeich', shortName: 'Wolterdeich', type: 'industrial', color: '#7d8a92', population: 800, upkeep: 0.5 },
]

export const LINDENHAFEN: CityDefinition = {
  schemaVersion: 1,
  id: 'lindenhafen',
  name: 'Lindenhafen',
  seed: 2036,
  bounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 },
  chunkSize: 128,
  population: 120_000,
  districts: DISTRICTS,
}

/** Nachschlagen statt suchen: zwanzig Einträge, und danach wird nur noch gefragt. */
export const DISTRICT_BY_ID = new Map(DISTRICTS.map(district => [district.id, district]))
