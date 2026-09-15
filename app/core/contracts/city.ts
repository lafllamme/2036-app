/**
 * The city as data: what Lindenhafen is made of before anybody draws it.
 *
 * Everything here comes out of `public/city/lindenhafen.json`, which the build script writes from
 * OpenStreetMap. The simulation never reads it and the renderer never writes it.
 */

import type { Relief } from '../../world/relief'

export type DistrictId
  = | 'innenstadt'
    | 'bahnhof'
    | 'gruenderzeit-nord'
    | 'wohnring-sued'
    | 'universitaet-klinikum'
    | 'hafen-industrie'
    | 'gewerbe-ost'
    | 'vorstadt-west'

export type BuildingType
  = | 'altbau'
    | 'modern'
    | 'residential'
    | 'commercial'
    | 'industrial'
    | 'civic'

export interface Bounds2D {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface DistrictDefinition {
  id: DistrictId
  name: string
  shortName: string
  type: string
  color: string
  bounds: Bounds2D
  population: number
}

export interface CityDefinition {
  schemaVersion: 1
  id: 'lindenhafen'
  name: 'Lindenhafen'
  seed: number
  bounds: Bounds2D
  chunkSize: 128
  population: number
  districts: DistrictDefinition[]
}

export interface BuildingRecord {
  id: string
  districtId: DistrictId
  type: BuildingType
  /** The footprint's centre, and the smallest rectangle around it. The simulation reads these. */
  x: number
  z: number
  width: number
  depth: number
  height: number
  rotation: number
  condition: number
  occupancy: number
  /**
   * The real outline, as x,z pairs in metres, wound counter-clockwise. This is what is drawn — a
   * rectangle is what the city was made of when it was generated from a grid, and it is precisely
   * what made it read as one.
   */
  footprint: number[]
  /** How much of `height` is roof rather than wall. Zero for a flat roof. */
  roofHeight: number
}

export interface RoadRecord {
  id: string
  /** The centre line, as x,z pairs in metres. Real streets bend, fork and meet at odd angles. */
  path: number[]
  width: number
  arterial: boolean
  /**
   * Out in the country rather than in the city.
   *
   * A country lane is the same width as a residential street and carries a hundredth of the people,
   * so width cannot tell them apart and something has to. Without it the crowd kept near the camera
   * spread itself evenly over whatever street was in reach, and a hamlet got a rush hour.
   */
  rural?: boolean
  /**
   * Carried on a deck over whatever is underneath — water, a railway, another road.
   *
   * Without this the map's forty-four bridges were drawn on the ground, so the main road across the
   * river ran *through* it and the street lamps stood in the water.
   */
  bridge: boolean
}

/** A piece of ground that is not plain land: water, parkland, a rail yard, a works. */
export type AreaKind = 'water' | 'park' | 'pitch' | 'forest' | 'grass' | 'industrial' | 'commercial' | 'construction' | 'railway'

export interface AreaRecord {
  id: string
  kind: AreaKind
  /** A closed ring, x,z pairs in metres, wound counter-clockwise. */
  polygon: number[]
}

export interface TreeRecord {
  id: string
  x: number
  z: number
  scale: number
}

export interface CityBlueprint {
  definition: CityDefinition
  buildings: BuildingRecord[]
  /**
   * Parcels the generator left empty. New housing is built here, in generation order, so the city
   * visibly fills in as the construction pipeline delivers — and never overlaps existing buildings.
   */
  growthSlots: BuildingRecord[]
  roads: RoadRecord[]
  /** Rail lines, drawn as track rather than as road. */
  rails: RoadRecord[]
  areas: AreaRecord[]
  trees: TreeRecord[]
  /** How high the ground is, everywhere. Every part of the city is placed on it. */
  relief: Relief
  /** The deep channel down the middle of the water, for anything that floats. */
  waterway: number[]
}
