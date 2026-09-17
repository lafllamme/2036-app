/**
 * The city as data: what Lindenhafen is made of before anybody draws it.
 *
 * Everything here comes out of `public/city/lindenhafen.json`, which the build script writes from
 * OpenStreetMap. The simulation never reads it and the renderer never writes it.
 */

import type { Relief } from '../../world/relief'

/**
 * Die zwanzig Viertel von Lindenhafen.
 *
 * Es waren acht, und sie waren acht **Rechtecke** in einem 3 × 3-Raster über einem echten
 * Stadtgrundriss — aus der Kartenansicht sah man genau das. Sie kommen jetzt aus echten
 * Ortsteilgrenzen, unregelmäßig, am Fluss und an der Bahn entlang; siehe `scripts/cityDistricts.mjs`
 * und `docs/CITY_DATA.md`. Die Namen sind erfunden wie bisher.
 */
export type DistrictId
  = | 'altstadt'
    | 'bahnhofsviertel'
    | 'neustadt'
    | 'lindentor'
    | 'stadtgarten'
    | 'kleinfeld'
    | 'speicherstadt'
    | 'marschland'
    | 'messeviertel'
    | 'westerfeld'
    | 'buntenhorst'
    | 'steinviertel'
    | 'hohenfeld'
    | 'hafentor'
    | 'universitaetsviertel'
    | 'fesenau'
    | 'gartenstadt'
    | 'werfthafen'
    | 'wolterdeich'
    | 'suedring'

/**
 * Was für ein Ort ein Viertel ist.
 *
 * Trägt alles, was nicht seine Lage ist: Farbpalette, Parzellenkörnung, Geschosshöhe, Dachdeckung,
 * Wohndichte und das Gefälle bei Miete, Einbruch und Leerstand. Zwanzig Viertel von Hand
 * durchzuschreiben wäre zwanzig Mal dieselbe Entscheidung; zwölf Archetypen sind die Entscheidung
 * **einmal**, und jedes Viertel sagt nur noch, welcher es ist.
 */
export type DistrictType
  = | 'historic-core'
    | 'mixed-transit'
    | 'dense-residential'
    | 'mixed-quarter'
    | 'mixed-fair'
    | 'residential'
    | 'post-war-estate'
    | 'garden-suburb'
    | 'civic-campus'
    | 'civic-green'
    | 'regenerated-docks'
    | 'industrial'
    | 'fringe'

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

/**
 * Wer ein Viertel ist — **nicht, wo es liegt.**
 *
 * Die Trennung ist der Grund, warum diese Datei überhaupt noch synchron gelesen werden kann. Der
 * Umriss eines Viertels ist Kartendaten und kommt mit `lindenhafen.json` über das Netz; wer es ist
 * und wie viele darin wohnen, ist Spielinhalt und muss dem Simulationsworker in der ersten
 * Millisekunde zur Verfügung stehen. Vorher stand beides zusammen, und es ging nur, weil der Umriss
 * ein Rechteck war, das man hinschreiben konnte.
 */
export interface DistrictDefinition {
  id: DistrictId
  name: string
  shortName: string
  type: DistrictType
  color: string
  population: number
  /** 0 … 1, wie gut der Bestand gehalten wird. Siehe `districtCharacter.ts`. */
  upkeep: number
}

/** Und wo es liegt: aus `lindenhafen.json`, geschnitten auf den Ausschnitt. */
export interface DistrictShape {
  id: DistrictId
  /** Die Grenze als x,z-Paare in Metern, gegen den Uhrzeigersinn. */
  polygon: number[]
  bounds: Bounds2D
  /** Wo die Karte den Namen hinschreibt: der Punkt im Inneren mit dem größten Abstand zur Grenze. */
  centre: { x: number, z: number }
  hectares: number
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
  /**
   * Steht hier eine Hecke statt eines Baumes?
   *
   * Knicks auf den Feldgrenzen sind das Zahlreichste, was in dieser Landschaft wächst — vierzehntausend
   * Gehölze —, und aus dem vollen Artenpool gezogen wären sie vierzehntausend Eichen zu vierhundert
   * Dreiecken. Eine Wallhecke ist aber ein Strauch. Das Feld leitet sie auf die beiden Buschmodelle
   * um, und das ist der Unterschied zwischen 830.000 zusätzlichen Dreiecken und einem Bruchteil davon.
   */
  hedge?: boolean
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
  /** Die zwanzig Viertelsumrisse, für die Karte. */
  districts: DistrictShape[]
  /**
   * In welchem Viertel ein Punkt liegt.
   *
   * Gefragt rund fünfzigtausend Mal beim Laden — einmal je Gebäude — und danach bei jedem Einsatz
   * und jedem Standort. Dahinter steht kein Punkt-in-Polygon gegen zwanzig Ringe, sondern ein
   * 256 × 256-Raster aus der Kartendatei: zwei Divisionen und ein Feldzugriff. Es ist lückenlos, also
   * gibt es keinen Punkt im Ausschnitt ohne Viertel — und außerhalb gilt das nächstgelegene.
   */
  districtAt: (x: number, z: number) => DistrictId
}
