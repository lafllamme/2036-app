import type { CityDefinition, DistrictDefinition, DistrictId } from '../../core/contracts'

const DISTRICTS: DistrictDefinition[] = [
  { id: 'innenstadt', name: 'Innenstadt / Altstadt', shortName: 'Innenstadt', type: 'historic-core', color: '#d7955f', bounds: { minX: -500, maxX: 450, minZ: -500, maxZ: 500 }, population: 22_500 },
  { id: 'bahnhof', name: 'Bahnhofsviertel', shortName: 'Bahnhof', type: 'mixed-transit', color: '#d85f4a', bounds: { minX: -450, maxX: 450, minZ: 500, maxZ: 1450 }, population: 15_000 },
  { id: 'gruenderzeit-nord', name: 'Gründerzeit Nord', shortName: 'Nord', type: 'dense-residential', color: '#b98d70', bounds: { minX: -1450, maxX: -500, minZ: 250, maxZ: 1450 }, population: 20_000 },
  { id: 'wohnring-sued', name: 'Wohnring Süd', shortName: 'Süd', type: 'residential', color: '#e0b777', bounds: { minX: -500, maxX: 650, minZ: -1450, maxZ: -500 }, population: 21_000 },
  { id: 'universitaet-klinikum', name: 'Universität & Klinikum', shortName: 'Campus', type: 'civic-campus', color: '#6bb4a4', bounds: { minX: 450, maxX: 1450, minZ: -450, maxZ: 550 }, population: 12_500 },
  { id: 'hafen-industrie', name: 'Hafen & Industrie', shortName: 'Hafen', type: 'industrial', color: '#718999', bounds: { minX: -1450, maxX: -500, minZ: -1450, maxZ: 250 }, population: 7_500 },
  { id: 'gewerbe-ost', name: 'Gewerbe Ost', shortName: 'Gewerbe', type: 'commercial', color: '#8d9d77', bounds: { minX: 650, maxX: 1450, minZ: 400, maxZ: 1450 }, population: 8_500 },
  { id: 'vorstadt-west', name: 'Vorstadt West', shortName: 'Vorstadt', type: 'suburban', color: '#9ab37c', bounds: { minX: 450, maxX: 1450, minZ: -1450, maxZ: -450 }, population: 13_000 },
]

export const LINDENHAFEN: CityDefinition = {
  schemaVersion: 1,
  id: 'lindenhafen',
  name: 'Lindenhafen',
  seed: 2036,
  bounds: { minX: -1500, maxX: 1500, minZ: -1500, maxZ: 1500 },
  chunkSize: 128,
  population: 120_000,
  districts: DISTRICTS,
}

export function districtAt(x: number, z: number): DistrictId {
  const district = DISTRICTS.find(({ bounds }) => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ)
  if (district)
    return district.id
  if (x < -500)
    return z > 200 ? 'gruenderzeit-nord' : 'hafen-industrie'
  if (x > 650)
    return z > 400 ? 'gewerbe-ost' : 'vorstadt-west'
  return z > 500 ? 'bahnhof' : z < -500 ? 'wohnring-sued' : 'innenstadt'
}
