import type { BuildingRecord, BuildingType, CityBlueprint } from '../../../core/contracts'
import type { DistrictCharacter } from '../../../world/districtCharacter'
import type { Relief } from '../../../world/relief'
import type { SolidSink } from './stoop'
import { attribute, float, mix, normalWorld, positionWorld, select, texture, uv, vec2 } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../../core/rng'
import { DISTRICT_CHARACTER } from '../../../world/districtCharacter'
import { BAY_WIDTH, FACADE_REPEAT, facadeTexture, GROUND_REPEAT, groundFloorTexture, REAR_U, ROOF_GRAIN, roofTexture, STOREY_HEIGHT, windowLightTexture } from './facade'
import { buildStoop, facet } from './stoop'
import { findTownHall } from './townHall'

/**
 * The city, extruded from its real footprints.
 *
 * Every building is its own outline rather than a box or a kit model: a five-sided corner house on a
 * bend is five-sided and stands on the bend. Twelve thousand of them come to about a quarter of a
 * million triangles — a fraction of what the same city cost as catalogue models — because a wall is
 * two triangles and the detail on it is a texture.
 *
 * They are merged into a handful of tiles rather than drawn one by one. Instancing cannot help here
 * (no two footprints are alike), so the answer is the other one: fewer, larger meshes. A tile is
 * also the unit of frustum culling, which is what the old whole-city meshes could never be.
 */

/**
 * How many tiles the city is cut into, and how far they reach.
 *
 * The grid has to cover the country as well as the city now that both are built out of the same kind
 * of building, so it is wider and finer: a tile is about a kilometre and it is the unit of frustum
 * culling, which is what keeps street level down to a handful of draws.
 */
const TILES = 6
const CITY_EXTENT = 3_400
/** How far a roof draws in from the wall below it, where it has to be a truncated pyramid. */
const ROOF_INSET = 2.4

/**
 * The town hall's tower. The only thing in Lindenhafen taller than the building under it.
 *
 * Sunk a little into the roof it rises from, so it reads as part of the building rather than as
 * something balanced on it.
 */
const TOWER_WIDTH = 8.5
const TOWER_HEIGHT = 26
const TOWER_SINK = 3
/**
 * The belfry: the wider stage between the shaft and the spire.
 *
 * The one element that decides whether a tower reads as a town hall or as a chimney. Without it the
 * silhouette is a shaft and a point, which is an obelisk — and that is exactly what the version
 * before this looked like.
 */
const BELFRY_FLARE = 1.32
const BELFRY_HEIGHT = 3.6
const SPIRE_HEIGHT = 10
/** The clock: how big, how far below the top, and how far proud of the wall it stands. */
const CLOCK_SIZE = 2.9
const CLOCK_DROP = 3.6
const CLOCK_PROUD = 0.22
const CLOCK_FACE = /* @__PURE__ */ new THREE.Color('#efe9d8')
/** The tall opening in each face of the shaft, so it is masonry with windows rather than a slab. */
const SLIT_WIDTH = 1.5
const SLIT_HEIGHT = 5.5
const SLIT_FOOT = 7
const SLIT_DARK = /* @__PURE__ */ new THREE.Color('#3d3a33')
/**
 * How far a gable's eaves reach past the wall.
 *
 * Most of the city is rectangular — eleven thousand of fourteen — and a rectangle with a pitched roof
 * is a house with a gable: a ridge down the long axis, two slopes, two triangular ends. It was a
 * truncated pyramid like everything else, which is a marquee, and it is the single reason the small
 * houses read as sheds. A gable costs six triangles against the pyramid's ten, so this is cheaper
 * than what it replaces. The overhang is what casts the line of shadow along the wall that tells you
 * a roof is a roof.
 */
const EAVES = 0.5
/**
 * How far a building's walls are buried below the ground at each corner.
 *
 * It used to be twelve metres below the height at the building's *centre*, which is a different
 * thing entirely: on a slope one corner of a long building stood metres under the surface and
 * another hung metres over it. A building is rigid — it stands on the highest ground under its
 * outline — and the skirt now follows the ground corner by corner, so it only ever has to cover the
 * couple of metres a wall can drop between two of them.
 */
const SKIRT = 8
/**
 * The base course: the band between the ground and the floor of the building standing on it.
 *
 * This is what was missing, and it accounts for two thirds of the city. A building stands on the
 * highest ground its outline covers, so on any slope part of its wall is below that floor — and that
 * part was drawn with the façade texture at a negative height, which repeats. A window row grew out
 * of the grass on the downhill side of nine thousand buildings, which is exactly what a house sunk
 * into the ground looks like. The band is now its own piece of geometry in the roof's draw group:
 * plain stone, no windows, sized to whatever the slope needs, and never less than this so every
 * building sits on something instead of growing out of the lawn.
 */
const PLINTH = 0.35
/**
 * Das Hochparterre: wie weit über dem Gehweg der Fußboden eines Hauses wirklich liegt.
 *
 * Er lag bei jedem Gebäude in Lindenhafen genau `PLINTH` darüber — fünfunddreißig Zentimeter. Das
 * ist der Grund, aus dem hier keine Freitreppe zu sehen war und auch keine zu sehen sein konnte:
 * über fünfunddreißig Zentimeter baut niemand eine Treppe, das ist eine Bordsteinkante.
 *
 * Gebaut ist es anders, und zwar aus einem Grund. Ein Gründerzeithaus hat einen Keller mit Fenstern,
 * und die brauchen Licht: also liegt der Kellerboden halb über dem Gehweg, der Wohnungsboden
 * anderthalb Meter darüber, und **deshalb** führt eine Freitreppe hinauf. Ein öffentlicher Bau tut
 * dasselbe aus Repräsentation. Ein Nachkriegsriegel hat eine Schwelle, eine Halle gar nichts — dort
 * fährt der Lastwagen bis an das Tor.
 */
const HOCHPARTERRE: Record<BuildingType, number> = {
  altbau: 0.95,
  civic: 0.8,
  residential: 0.3,
  modern: 0.2,
  commercial: 0.15,
  industrial: 0,
}
/**
 * How much darker the base course is than the wall above it, and what it is made of.
 *
 * Es war die Wandfarbe mal 0,62 — also dieselbe Farbe, nur dunkler, und damit las sich der Sockel
 * an einem Hang als eine mehrere Meter hohe, vollkommen tote Fläche derselben Farbe wie das Haus.
 * Ein Sockel ist aber ein anderes Material als die Wand darüber: Beton, Naturstein, Klinker. Er zieht
 * deshalb zusätzlich in Richtung Stein, statt nur abzudunkeln.
 */
const PLINTH_SHADE = 0.62
/**
 * Die Treppe vor der Haustür.
 *
 * Ein Haus steht auf dem **höchsten** Boden, den sein Umriss überdeckt — es ist starr, das ist
 * richtig so —, und am Hang liegt sein Fußboden deshalb einen bis drei Meter über dem Gehweg davor.
 * Die Tür, die dort sitzt, ging bisher ins Leere: die Leute in Lindenhafen hätten fliegen müssen.
 *
 * Eine Freitreppe ist außerdem das eine Detail, das an einer Fassade auf jede Entfernung wirkt, weil
 * sie aus dem Haus herausragt und dadurch einen eigenen Schatten wirft — die Fassade selbst ist eine
 * Ebene und kann das nicht. Sie kostet je Stufe zehn Dreiecke und steht nur dort, wo es wirklich
 * einen Höhenunterschied zu überwinden gibt.
 */
/** Wie breit eine Wand mindestens sein muss, damit eine Freitreppe davor Platz hat. */
const STOOP_CLEARANCE = 4.4

/**
 * Woraus eine Freitreppe ist — **und warum nicht aus dem Material der Fassade.**
 *
 * Sie hatte die Farbe des Sockels, also die Wandfarbe abgedunkelt. Damit stand sie vor einer Fläche
 * derselben Farbe, und eine Stufenkante ist ein Millimeter Schatten: aus jedem flachen Winkel war
 * die ganze Treppe schlicht nicht zu erkennen. Sie war da, sie war nur unsichtbar.
 *
 * Eine Freitreppe ist in Wirklichkeit auch nie aus dem Putz der Fassade — sie ist Werkstein. Welcher,
 * das ist aber keine Frage der ganzen Stadt: hier stehen vier, und das Haus sucht sich seinen aus.
 * Ein einziges Betongrau über vierzehntausend Häuser wäre wieder das, was Lindenhafen zu Anfang
 * ausgemacht hat — ein Detail, achtzigmal kopiert.
 *
 * Die Trittfläche ist in jedem davon deutlich heller als die Setzstufe. Die eine zeigt nach oben und
 * die andere nach vorn, also bekommt die eine Himmel und die andere fast nichts — **das** ist es, was
 * eine Treppe auf Entfernung als Treppe lesbar macht, nicht ihre Form.
 */
const STOOP_STONE: [string, string][] = [
  // Beton, grau und kühl. Der Nachkriegsbestand.
  ['#6f716f', '#b6b7b3'],
  // Sandstein, warm. Was unter einem Gründerzeithaus liegt.
  ['#7d7362', '#c3b9a4'],
  // Granit, dunkel und blaustichig. Unter allem Öffentlichen.
  ['#5b5f63', '#a3a8ab'],
  // Ziegelstufen, rotbraun. Selten, aber es gibt sie, und man sieht sie sofort.
  ['#6e4b3e', '#ab8674'],
]
const STOOP_STONE_COLOURS: [THREE.Color, THREE.Color][] = /* @__PURE__ */ STOOP_STONE.map(
  ([riser, tread]) => [new THREE.Color(riser), new THREE.Color(tread)],
)
/** Die Haustür: wie breit, wie hoch, und wie weit ihr Rahmen vor der Wand steht. */
const DOOR_WIDTH = 1.25
const DOOR_HEIGHT = 2.35
const DOOR_PROUD = 0.09
const DOOR_LEAF = /* @__PURE__ */ new THREE.Color('#3b2f27')
const DOOR_FRAME = /* @__PURE__ */ new THREE.Color('#e6e2d8')
const PLINTH_STONE = /* @__PURE__ */ new THREE.Color('#544f48')
const PLINTH_STONINESS = 0.45
/** The low wall a flat roof stops at. */
const PARAPET = 0.9

/**
 * Woraus die Stadt gebaut ist.
 *
 * Hier standen fünf Töne je Typ, die nachgemessen keine waren: `residential` spannte **3 Grad**
 * Farbton und zwölf Punkte Helligkeit, `civic` genau **null Grad**, und modern, Gewerbe und Industrie
 * lagen bei zwei bis acht Prozent Sättigung — also Grau, in dem eine Farbtonspanne nichts bedeutet.
 * Fünfmal dieselbe Farbe mit fünf Namen. Das ist der Grund, aus dem sich Lindenhafen anfühlte wie ein
 * Haus, achtzigmal kopiert.
 *
 * Jetzt echter Bestand statt Rauschen um einen Mittelwert. Eine norddeutsche Stadt ist gedämpft, aber
 * nicht einfarbig: Gründerzeit steht in Ocker, Creme, Altrosa und Blassgrün neben rotem und gelbem
 * Klinker; die Nachkriegszeilen sind weiß verputzt, sandfarben, hellgrau; die Siebziger brachten
 * Braun und Waschbeton. Jeder Typ spannt jetzt dreißig bis vierzig Punkte Helligkeit und hat Töne mit
 * genug Sättigung, dass man sie als Farbe sieht — und **es kostet keinen einzigen Draw**, weil die
 * Wandfarbe eine Vertex-Farbe auf einer weißen Textur ist und immer war.
 */
const WALL_COLOURS: Record<BuildingType, string[]> = {
  // Gründerzeit: Stuck in Ocker und Creme, Altrosa, Blassgrün — und dazwischen roter Klinker.
  altbau: [
    '#c9a15e',
    '#d8c193',
    '#b8674f',
    '#a8896a',
    '#8f6f52',
    '#c0927e',
    '#9d8a6b',
    '#8a5b46',
    '#d3b98f',
    '#7e6550',
    '#b5a077',
    '#96785c',
  ],
  // Nachkriegszeilen und Siebziger: weißer Putz, Sand, Hellgrau, dazu Braun und Waschbeton.
  residential: [
    '#e2dacb',
    '#cfc6b3',
    '#b9b1a1',
    '#a39a8b',
    '#8d8578',
    '#d6c9ae',
    '#c2a98d',
    '#9d8b74',
    '#c8ccc6',
    '#b0b4ad',
    '#7f7a70',
    '#dcd2bd',
  ],
  // Neubau: weiß, Anthrazit, Glasgrau, warmer Sichtbeton, dunkles Holz.
  modern: [
    '#eceae6',
    '#d2d5d6',
    '#a8adaf',
    '#7d8386',
    '#565b5e',
    '#c4bdb2',
    '#9a9186',
    '#6e675f',
    '#b9c2c4',
    '#8c9599',
  ],
  // Gewerbe: Blaugrau, Glas, Weiß, Verkehrsgrau.
  commercial: [
    '#dfe2e2',
    '#b6bfc3',
    '#8d989d',
    '#67727a',
    '#4c555c',
    '#a5aeb0',
    '#7b8489',
    '#c9cdca',
  ],
  // Industrie: Trapezblech in Grau und Blau, Rostrot, verblichenes Grün.
  industrial: [
    '#b7bcbb',
    '#93999a',
    '#6f7679',
    '#8a5f4a',
    '#a86f52',
    '#6d7f79',
    '#5a6a66',
    '#a9a293',
    '#828a86',
  ],
  /*
   * Public buildings are a different stone, and noticeably so.
   *
   * They used to be a shade of the residential beige apart, which meant a hundred and forty-six
   * schools, offices and halls were indistinguishable from the flats around them — and the Rathaus
   * read as a block of maisonettes. Sandstein, roter Backstein und heller Putz sind, woraus
   * öffentlicher Bestand in einer norddeutschen Stadt wirklich besteht.
   */
  civic: [
    '#ded0a6',
    '#cdbb8c',
    '#b9a377',
    '#a8836a',
    '#9c5f4a',
    '#e4dcc4',
    '#c6b596',
    '#8f7d63',
  ],
}

/**
 * Und was oben drauf liegt.
 *
 * Dieselbe Messung, dasselbe Ergebnis: vier Töne je Typ innerhalb weniger Prozent. Ein Dach ist aber
 * das, was man von dieser Kamera aus überhaupt zuerst sieht — rote und dunkle Ziegel, Schiefergrau,
 * Blech, Bitumen, und auf Flachdächern der grüne Kies.
 */
const ROOF_COLOURS: Record<BuildingType, string[]> = {
  altbau: ['#8f4a38', '#a85a3f', '#6b4a41', '#4a4440', '#5f4239', '#7c5a4b', '#3f3b38', '#96543c'],
  residential: ['#7d4f3d', '#6f5a4c', '#54504b', '#8a5b42', '#625249', '#413e3c', '#7a6653'],
  modern: ['#4e5355', '#6a6f70', '#3b3f41', '#7d8281', '#585c5b', '#2f3335'],
  commercial: ['#4a5052', '#61686a', '#3a4042', '#727877', '#545a5c'],
  industrial: ['#6c7170', '#565c5c', '#7e817a', '#8a5f4a', '#455049'],
  civic: ['#4f5a52', '#6b7469', '#3e4a43', '#7a5747', '#5d6a62', '#8a5b42'],
}

export interface CityBuildings {
  buildingMeshes: THREE.Mesh[]
  buildingRecords: Map<THREE.Mesh, BuildingRecord[]>
  /** Where each building's vertices live in its tile, so one can be tinted without touching the rest. */
  buildingRanges: Map<THREE.Mesh, { start: number, count: number }[]>
  /** Which building each triangle belongs to, so a ray hit can be turned back into a building. */
  buildingOfTriangle: Map<THREE.Mesh, Uint16Array>
  /**
   * Ein Kasten je Gebäude, damit ein Strahl nicht durch alle Dreiecke muss.
   *
   * Die Stadt liegt in 36 zusammengelegten Meshes mit zusammen 1,37 Millionen Dreiecken und ohne
   * Beschleunigungsstruktur. Ein Strahl dagegen prüft jedes einzelne Dreieck — gemessen 15 ms, und
   * die liefen bei jeder Mausbewegung. Gegen zwölftausend Kästen zu prüfen ist zwei Größenordnungen
   * billiger, und für ein Überfahren reicht der Kasten: ein Haus ist ein extrudierter Grundriss und
   * füllt seinen Kasten fast aus.
   */
  buildingBoxes: Map<THREE.Mesh, THREE.Box3[]>
  buildingColors: Map<THREE.Mesh, THREE.Color[]>
  /** The two materials the whole city is drawn with: its walls and its roofs. */
  buildingMaterials: THREE.MeshStandardMaterial[]
}

interface Tile {
  records: BuildingRecord[]
  position: number[]
  normal: number[]
  uv: number[]
  colour: number[]
  /** Walls and roofs are separate draw groups so a roof never gets a window drawn on it. */
  wallIndex: number[]
  roofIndex: number[]
  ranges: { start: number, count: number }[]
  colours: THREE.Color[]
}

export function createBuildings(scene: THREE.Scene, blueprint: CityBlueprint): CityBuildings {
  const rng = createRandomStream(blueprint.definition.seed, 'facades')
  const relief = blueprint.relief
  const tiles: Tile[] = Array.from({ length: TILES * TILES }, () => ({
    records: [],
    position: [],
    normal: [],
    uv: [],
    colour: [],
    wallIndex: [],
    roofIndex: [],
    ranges: [],
    colours: [],
  }))

  /*
   * The one building that gets more than a footprint. See `townHall.ts` for how it is chosen and
   * `landmark()` below for what it gets — which costs no draw call at all, because it is written
   * into the same tile the rest of the city is.
   */
  const hall = findTownHall(blueprint.buildings)

  for (const building of blueprint.buildings) {
    const tile = tiles[tileOf(building.x, building.z)]
    if (tile)
      extrude(tile, building, rng, relief, building === hall)
  }

  const wallMaterial = new THREE.MeshStandardMaterial({
    emissiveMap: windowLightTexture(),
    emissive: '#ffffff',
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
  })
  /*
   * Das Erdgeschoss ist ein anderes Geschoss — und das kostet hier nichts.
   *
   * Ein Haus hatte fünf Mal dasselbe Stockwerk übereinander: keine Tür, kein Laden, kein Sockel, und
   * das fünfte sah aus wie das erste. Der übliche Weg dahin wäre ein eigenes Band Geometrie am Fuß
   * jeder Wand — zwei Dreiecke je Fläche mehr, also die halbe Stadt noch einmal.
   *
   * Nötig ist das nicht. Die Wand trägt ihre Geschosszahl längst in `v`: null am Fußboden, eins nach
   * dem ersten Stockwerk. Der Shader weiß damit ohne ein einziges zusätzliches Attribut, wo er steht,
   * und liest unterhalb von eins die Erdgeschosskachel statt der Fensterkachel. Zwei Fetches statt
   * einem auf einer 256er-Textur, die vollständig im Cache liegt — **kein Dreieck und kein Draw.**
   *
   * Beide Kacheln bekommen ihre Wiederholung hier eingerechnet, statt über `texture.repeat`: die
   * Matrix des Materials gilt für eine Textur, und hier sind es zwei mit verschiedenem Takt.
   */
  const facade = texture(facadeTexture(), uv().mul(vec2(...FACADE_REPEAT)))
  /*
   * Vorder- und Rückseite liegen in derselben Kachel übereinander, und welche gilt, steht im Versatz
   * der u-Koordinate. Das kostet keinen zweiten Zugriff: es ist dieselbe Textur, nur eine Zeile
   * höher gelesen — und `v` läuft im Erdgeschoss immer zwischen null und eins, kann also nie in die
   * falsche Zeile umlaufen.
   */
  const backside = uv().x.greaterThan(REAR_U / 2)
  const groundUv = vec2(uv().x, uv().y.add(select(backside, 1, 0))).mul(vec2(...GROUND_REPEAT))
  const ground = texture(groundFloorTexture(), groundUv)
  wallMaterial.colorNode = select(uv().y.lessThan(1), ground, facade).mul(attribute('color', 'vec3'))
  const roofMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 })
  /*
   * Die Dachhaut, über die Weltkoordinate gelegt.
   *
   * Dachflächen tragen keine UVs — `(0, 0)` auf jedem Eckpunkt —, und ihnen welche zu geben hieße,
   * für Walm, Sattel, Pyramide, Attika, Schornstein und Freitreppe je eine eigene Abwicklung zu
   * rechnen. Ein Dach liegt aber fast waagerecht, also *ist* seine Lage in der Welt schon eine
   * brauchbare Koordinate. Das Raster liegt damit über der ganzen Stadt statt über dem einzelnen
   * Dach, was nebenbei dafür sorgt, dass zwei Nachbarhäuser verschiedene Ausschnitte bekommen.
   *
   * Dieselbe Gruppe zeichnet aber auch Senkrechtes: Sockel, Schornsteinwangen, Treppenflanken. Auf
   * denen würde eine Textur über x und z zu Streifen verschmieren, und deshalb hängt ihre Stärke an
   * der Neigung — waagerecht voll, senkrecht gar nicht. Drei Rechenschritte, kein Draw, kein Dreieck.
   */
  const grain = texture(roofTexture(), positionWorld.xz.div(ROOF_GRAIN))
  const flatness = normalWorld.y.abs()
  roofMaterial.colorNode = mix(float(1), grain.r, flatness).mul(attribute('color', 'vec3'))

  const buildingMeshes: THREE.Mesh[] = []
  const buildingRecords = new Map<THREE.Mesh, BuildingRecord[]>()
  const buildingRanges = new Map<THREE.Mesh, { start: number, count: number }[]>()
  const buildingOfTriangle = new Map<THREE.Mesh, Uint16Array>()
  const buildingBoxes = new Map<THREE.Mesh, THREE.Box3[]>()
  const buildingColors = new Map<THREE.Mesh, THREE.Color[]>()

  for (const tile of tiles) {
    if (tile.records.length === 0)
      continue

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(tile.position, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(tile.normal, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(tile.uv, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tile.colour, 3))
    geometry.setIndex([...tile.wallIndex, ...tile.roofIndex])
    geometry.addGroup(0, tile.wallIndex.length, 0)
    geometry.addGroup(tile.wallIndex.length, tile.roofIndex.length, 1)
    geometry.computeBoundingSphere()

    const mesh = new THREE.Mesh(geometry, [wallMaterial, roofMaterial])
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    buildingMeshes.push(mesh)
    buildingRecords.set(mesh, tile.records)
    buildingRanges.set(mesh, tile.ranges)
    buildingColors.set(mesh, tile.colours)
    buildingOfTriangle.set(mesh, triangleOwners(tile))
    buildingBoxes.set(mesh, boxesOf(geometry, tile.ranges))
  }

  return { buildingMeshes, buildingRecords, buildingRanges, buildingOfTriangle, buildingBoxes, buildingColors, buildingMaterials: [wallMaterial, roofMaterial] }
}

/** Je Gebäude der Kasten um seine Ecken, aus dem Bereich, den es in der Kachel belegt. */
function boxesOf(geometry: THREE.BufferGeometry, ranges: { start: number, count: number }[]): THREE.Box3[] {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const point = new THREE.Vector3()

  return ranges.map((range) => {
    const box = new THREE.Box3()
    for (let at = range.start; at < range.start + range.count; at += 1) {
      const vertex = index ? index.getX(at) : at
      box.expandByPoint(point.fromBufferAttribute(position, vertex))
    }
    return box
  })
}

/**
 * Eine Farbe, so wie sie nach Jahren ohne Pflege aussieht.
 *
 * Verwitterung nimmt Helligkeit **und** Sättigung: Putz kreidet aus, Anstrich bleicht, und was übrig
 * bleibt, zieht ins Graubraune. Nur abzudunkeln ließ ein verwahrlostes Haus wie ein beschattetes
 * aussehen.
 */
/**
 * Woraus dieses Haus an diesem Ort gebaut ist.
 *
 * Die Farbe hing am **Gebäudetyp**, und damit an nichts, was auf der Karte zu sehen ist: ein
 * Wohnblock in der Altstadt sah aus wie einer im Gewerbegebiet, und die Akzentquote war überall
 * dieselbe. Streuung ohne Ortsaussage ist aber nur Rauschen — von oben blieb die Stadt grau, weil
 * nichts davon irgendwo *hingehörte*.
 *
 * Jetzt fragt sie zuerst das Viertel. Eine Halle und ein Klinikum behalten ihre Typpalette, weil eine
 * Halle eine Halle ist, wo immer sie steht; alles andere bekommt die Farben seines Ortes. Und wie
 * viele Häuser aus der Reihe tanzen, entscheidet ebenfalls der Ort: die Altstadt ist über
 * Jahrhunderte Haus für Haus gestrichen worden und ist bunt, die Vorstadt streicht jeder selbst und
 * ist noch bunter, und das Industriegebiet ist es nicht.
 */
function wallColour(building: BuildingRecord, character: DistrictCharacter, rng: { next: () => number }): THREE.Color {
  if (rng.next() < character.accentShare && character.accents.length > 0)
    return pick(character.accents, rng)
  const own = building.type === 'industrial' || building.type === 'civic' ? [] : character.walls
  return pick(own.length > 0 ? own : WALL_COLOURS[building.type], rng)
}

/**
 * Und was oben drauf liegt — **das Wichtigste von dieser Kamera aus.**
 *
 * Man schaut von schräg oben auf Lindenhafen und sieht vor allem Dachflächen. Die hingen am
 * Gebäudetyp, und weil die meisten Häuser `residential` oder `modern` sind, war das ganze Bild
 * braungrau, ganz gleich wie breit die Wandpaletten darunter wurden. Ein Viertel erkennt man von
 * oben an seinen Dächern: rote Ziegel über der Altstadt, Bitumen und Kies über den Zeilen,
 * Trapezblech über den Hallen.
 */
function roofColour(building: BuildingRecord, character: DistrictCharacter, wall: THREE.Color, rng: { next: () => number }): THREE.Color {
  const industrial = building.type === 'industrial'
  return separated(pick(industrial ? ROOF_COLOURS.industrial : character.roofs, rng), wall)
}

/**
 * Ein Dach muss sich vom Putz darunter **im Hellwert** unterscheiden, nicht nur im Ton.
 *
 * Sonst verschmilzt das Haus: ein ockerfarbenes Dach über einer ockerfarbenen Wand ist aus dreißig
 * Metern Höhe eine einzige Masse, ganz gleich wie sorgfältig beide Töne gewählt sind. In Wirklichkeit
 * ist ein Dach fast immer deutlich dunkler als die Wand — Ziegel, Schiefer, Bitumen, Blech, alles
 * davon schluckt mehr Licht als Putz. Eine Garantie statt einer Hoffnung: wo der Abstand unter
 * fünfzehn Punkten liegt, wird das Dach so weit abgedunkelt, bis er stimmt.
 */
const ROOF_CONTRAST = 0.15

function separated(roof: THREE.Color, wall: THREE.Color): THREE.Color {
  const roofHsl = { h: 0, s: 0, l: 0 }
  const wallHsl = { h: 0, s: 0, l: 0 }
  roof.getHSL(roofHsl)
  wall.getHSL(wallHsl)
  if (wallHsl.l - roofHsl.l >= ROOF_CONTRAST)
    return roof
  return roof.clone().setHSL(roofHsl.h, roofHsl.s, Math.max(0.04, wallHsl.l - ROOF_CONTRAST))
}

/** Wohin eine Fassade zieht, wenn die Sonne jahrelang darauf steht. */
const SUN_BLEACH = /* @__PURE__ */ new THREE.Color('#f2ece0')

/** Wie weit Süd- und Nordseite eines Hauses auseinandergehen dürfen. */
const ORIENTATION_TINT = 0.085

/**
 * Eine Wand, gealtert nach Himmelsrichtung.
 *
 * Positiv heißt Sonnenseite: heller und eine Spur wärmer. Negativ heißt Schattenseite: dunkler,
 * kühler, ein Hauch Grün von dem, was auf feuchtem Putz wächst.
 */
function tinted(base: THREE.Color, exposure: number): THREE.Color {
  const colour = base.clone()
  const hsl = { h: 0, s: 0, l: 0 }
  colour.getHSL(hsl)
  const hue = (hsl.h + (exposure < 0 ? 0.012 : -0.006) + 1) % 1
  return colour.setHSL(hue, hsl.s * (1 - exposure * 0.1), THREE.MathUtils.clamp(hsl.l * (1 + exposure), 0.03, 0.97))
}

/**
 * Verwitterung — aber nicht bis ins Schwarze.
 *
 * Ein dunkler Anstrich bei schlechtem Bauzustand verlor ein Drittel seiner Helligkeit, und weil eine
 * senkrechte Wand ohnehin nur einen Bruchteil des Lichts eines Daches bekommt, landete Flaschengrün
 * am Wohnring als schwarzer Fleck. Verwitterung *bleicht* Putz aber eher aus, als ihn abzudunkeln:
 * sie nimmt vor allem Sättigung. Der Helligkeitsverlust bleibt, hat jetzt aber einen Boden, unter den
 * keine Fassade fällt.
 */
const WEATHERED_FLOOR = 0.26

function weathered(base: THREE.Color, condition: number): THREE.Color {
  const colour = base.clone()
  const hsl = { h: 0, s: 0, l: 0 }
  colour.getHSL(hsl)
  const wear = 1 - THREE.MathUtils.clamp(condition, 0, 1)
  return colour.setHSL(hsl.h, hsl.s * (1 - wear * 0.55), Math.max(WEATHERED_FLOOR, hsl.l * (1 - wear * 0.26)))
}

function tileOf(x: number, z: number): number {
  const column = THREE.MathUtils.clamp(Math.floor(((x + CITY_EXTENT) / (CITY_EXTENT * 2)) * TILES), 0, TILES - 1)
  const row = THREE.MathUtils.clamp(Math.floor(((z + CITY_EXTENT) / (CITY_EXTENT * 2)) * TILES), 0, TILES - 1)
  return row * TILES + column
}

/**
 * One building: a ring of walls, and a roof on top of them.
 *
 * A pitched roof is drawn as a truncated pyramid — the outline again, drawn in by a couple of metres
 * and lifted. It is not what a roof is, but at every distance the camera can reach it is what one
 * looks like, and it costs two triangles an edge instead of a hip-and-valley solver.
 */
function extrude(tile: Tile, building: BuildingRecord, rng: { next: () => number }, relief: Relief, landmarked = false): void {
  const ring = building.footprint
  const corners = ring.length / 2
  if (corners < 3)
    return

  const start = tile.position.length / 3
  /*
   * Where the ground is under each corner, and the highest of them.
   *
   * A building has one floor level, and that level is the top of the ground it covers — put it any
   * lower and the uphill end of the building is inside the hill, which is precisely what a fifth of
   * the city was doing. The walls then reach down to their own corner's ground and a little past it,
   * so the downhill end is buried rather than standing on stilts.
   */
  const corner: number[] = Array.from({ length: corners })
  let ground = -Infinity
  for (let i = 0; i < corners; i += 1) {
    corner[i] = relief.height(ring[i * 2]!, ring[i * 2 + 1]!)
    ground = Math.max(ground, corner[i]!)
  }

  const wallTop = ground + Math.max(2 + PLINTH, building.height - building.roofHeight)
  /*
   * The floor sits a little above the ground it stands on, the way a real one does. Everything the
   * façade texture is mapped from starts here, so `v` is zero at the floor and never below it.
   */
  const floor = ground + PLINTH + HOCHPARTERRE[building.type]
  /*
   * Wie eine Fassade aussieht, wenn sie dreißig Jahre niemand angefasst hat.
   *
   * Der Bauzustand skalierte die Helligkeit um sechzehn Prozent und sonst nichts — ein verwahrlostes
   * Haus war ein leicht dunkleres. Verwitterung ist aber vor allem ein *Verlust an Farbe*: Putz
   * kreidet aus, Anstrich bleicht, alles zieht ins Graubraune. Also beides, und deutlich: ein Haus
   * bei `condition` 0,3 steht dreißig Prozent dunkler und halb so satt wie dasselbe Haus in Ordnung.
   */
  const keep = building.condition
  const character = DISTRICT_CHARACTER[building.districtId]
  const wall = weathered(wallColour(building, character, rng), keep)
  /*
   * Der Verlauf über die Höhe.
   *
   * Ein Haus war **eine** Farbe, von der Sohlbank bis zur Traufe — und nichts sieht so sehr nach
   * Computer aus wie eine gleichmäßig eingefärbte Box. Eine echte Fassade ist unten dunkler: Spritz-
   * wasser, Reifenabrieb, Abgase, und im Erdgeschoss oft ein anderer Sockelputz. Oben bleicht die
   * Sonne sie aus. Das kostet keinen Draw und kein Dreieck — der Quader hat unten und oben eigene
   * Ecken, und die Wandfarbe war immer schon eine Vertex-Farbe.
   */
  const soiling = (1 - keep) * 0.5 + 0.1
  const wallFoot = wall.clone().multiplyScalar(1 - soiling * 0.34)
  const wallHead = wall.clone().lerp(SUN_BLEACH, 0.05 + (1 - keep) * 0.12)
  const plinth = wall.clone().lerp(PLINTH_STONE, PLINTH_STONINESS).multiplyScalar(PLINTH_SHADE)
  const roof = roofColour(building, character, wall, rng)
  tile.records.push(building)
  tile.colours.push(wall)

  /*
   * Die Körnung des Viertels: wie schmal die Achsen stehen und wie hoch die Räume sind.
   *
   * Gründerzeit steht auf schmalen Parzellen mit vier Metern Raumhöhe, die Nachkriegszeile breit mit
   * zweisechzig. Bei gleicher Gebäudehöhe hat der eine drei Fensterreihen und der andere fünf — und
   * das ist der stärkste Unterschied, den man von dieser Kamera aus überhaupt sieht. Er kostet
   * nichts: es ist eine UV-Skala, kein zusätzliches Dreieck und kein zusätzlicher Draw.
   */
  const bayWidth = BAY_WIDTH * character.grain
  const storeyHeight = STOREY_HEIGHT * character.storeyRise

  // ---- walls ----
  const storeys = Math.max(1, Math.round((wallTop - floor) / storeyHeight))
  /*
   * Welche Wand die Straßenseite ist.
   *
   * Die längste. Das ist keine Vereinfachung, sondern die Regel, nach der eine Stadt gebaut ist: eine
   * Parzelle ist schmal und tief, das Haus steht mit seiner langen Seite an der Straße, und die
   * kurzen Seiten sind Brandwand oder Hof. Wo es nicht stimmt — am Eckhaus —, hat das Haus eben eine
   * Ladenfront und eine Hofseite statt zweier Ladenfronten, was immer noch richtiger ist als vier.
   */
  let street = 0
  let longest = -1
  for (let i = 0; i < corners; i += 1) {
    const j = (i + 1) % corners
    const length = Math.hypot(ring[j * 2]! - ring[i * 2]!, ring[j * 2 + 1]! - ring[i * 2 + 1]!)
    if (length > longest) {
      longest = length
      street = i
    }
  }
  for (let i = 0; i < corners; i += 1) {
    const j = (i + 1) % corners
    const ax = ring[i * 2]!
    const az = ring[i * 2 + 1]!
    const bx = ring[j * 2]!
    const bz = ring[j * 2 + 1]!
    const span = Math.hypot(bx - ax, bz - az)
    if (span < 0.05)
      continue

    // Counter-clockwise in x/z means the outward normal is the edge turned to the right.
    const nx = -(bz - az) / span
    const nz = (bx - ax) / span
    /*
     * Whole window bays along the wall and whole storeys up it. The texture is one storey by one bay,
     * so anything else cuts a window in half at the corner or at the roof — and it did both: `v` used
     * to run from the bottom of the buried skirt, which put the ground-floor row underground and
     * every row above it a third of a storey out.
     */
    const bays = Math.max(1, Math.round(span / bayWidth))
    // Der Versatz ist ein Vielfaches der Kachelbreite: die Fensterreihen darüber sitzen auf dem Texel
    // genau wie vorher, und nur das Erdgeschoss liest daraufhin die Hofseite statt der Straßenseite.
    const u0 = i === street ? 0 : REAR_U
    const u1 = u0 + bays
    const vTop = storeys

    /*
     * The base course first: from below this edge's own ground up to the floor. It carries no UVs
     * worth the name and goes in the roof's draw group, which has no façade texture on it at all —
     * so whatever the slope does here, no window can appear below the ground floor.
     */
    const base = tile.position.length / 3
    push(tile, ax, corner[i]! - SKIRT, az, nx, nz, 0, 0, plinth)
    push(tile, bx, corner[j]! - SKIRT, bz, nx, nz, 0, 0, plinth)
    push(tile, bx, floor, bz, nx, nz, 0, 0, plinth)
    push(tile, ax, floor, az, nx, nz, 0, 0, plinth)
    // Wound so the outward face is the one that is kept: a ring that is counter-clockwise on the
    // map is clockwise to a camera looking down at it, and the whole city was inside out.
    tile.roofIndex.push(base, base + 2, base + 1, base, base + 3, base + 2)

    // And the wall above it, one storey of façade per storey of building, starting at the floor.
    /*
     * Jede Seite eines Hauses hat ihre eigene Tönung.
     *
     * Ein Quader in genau einer Farbe ist das, was eine Fläche wie eine Fläche aussehen lässt und
     * nicht wie ein Gebäude — und alle vier Wände eines Hauses trugen exakt denselben Ton. In
     * Wirklichkeit unterscheiden sie sich immer: die Südseite bleicht über Jahre aus, die Nordseite
     * bleibt feucht, setzt Algen an und zieht ins Grüngraue. Das ist der billigste verfügbare
     * Unterschied — die Vertex-Farbe wird ohnehin je Wandfläche geschrieben, es kostet kein Dreieck
     * und keinen Draw.
     */
    const exposure = ORIENTATION_TINT * nz
    const faceFoot = tinted(wallFoot, exposure)
    const faceHead = tinted(wallHead, exposure)

    const vertex = tile.position.length / 3
    push(tile, ax, floor, az, nx, nz, u0, 0, faceFoot)
    push(tile, bx, floor, bz, nx, nz, u1, 0, faceFoot)
    push(tile, bx, wallTop, bz, nx, nz, u1, vTop, faceHead)
    push(tile, ax, wallTop, az, nx, nz, u0, vTop, faceHead)
    tile.wallIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
  }

  /*
   * Und die Stufen davor, an der Straßenseite.
   *
   * Sie sitzen in der Mitte der längsten Wand, dort, wo die Erdgeschosskachel ihren Hauseingang hat,
   * und sie überwinden genau den Unterschied zwischen dem Boden vor der Tür und dem Fußboden dahinter.
   * Wo der unter einem halben Meter liegt, steht keine Treppe — da ist eine Schwelle, und die ist im
   * Sockel schon drin.
   */
  entrance(tile, ring, street, corners, floor, relief, rng)

  // ---- roof ----
  const capHeight = ground + building.height
  /*
   * A rectangle gets a real gable. Anything else — an L, a corner block, a five-sided house on a
   * bend — keeps the truncated pyramid, which is what a hipped roof looks like from any distance the
   * camera can reach and costs nothing to work out.
   */
  if (corners === 4 && building.roofHeight > 0.4) {
    gable(tile, ring, wallTop, capHeight, roof, wallHead)
    roofFurniture(tile, ring, wallTop, capHeight, wall, roof, rng)
    if (landmarked)
      landmark(tile, building, capHeight, wall, roof)
    tile.ranges.push({ start, count: tile.position.length / 3 - start })
    return
  }

  const cap = building.roofHeight > 0.4 ? inset(ring, ROOF_INSET) : ring
  if (building.roofHeight > 0.4) {
    for (let i = 0; i < corners; i += 1) {
      const j = (i + 1) % corners
      const vertex = tile.position.length / 3
      const ax = ring[i * 2]!
      const az = ring[i * 2 + 1]!
      const bx = ring[j * 2]!
      const bz = ring[j * 2 + 1]!
      const cx = cap[j * 2]!
      const cz = cap[j * 2 + 1]!
      const dx = cap[i * 2]!
      const dz = cap[i * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az) || 1
      const nx = -(bz - az) / span
      const nz = (bx - ax) / span
      push(tile, ax, wallTop, az, nx, nz, 0, 0, roof)
      push(tile, bx, wallTop, bz, nx, nz, 0, 0, roof)
      push(tile, cx, capHeight, cz, nx, nz, 0, 0, roof)
      push(tile, dx, capHeight, dz, nx, nz, 0, 0, roof)
      tile.roofIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
    }
  }

  /*
   * A parapet: the low wall a flat roof stops at. Without it a big block is a slab with a lid, which
   * is exactly how the towers read — the roof edge is most of what tells you a building has a top.
   */
  if (building.roofHeight <= 0.4 && building.height > 9) {
    for (let i = 0; i < corners; i += 1) {
      const j = (i + 1) % corners
      const vertex = tile.position.length / 3
      const ax = ring[i * 2]!
      const az = ring[i * 2 + 1]!
      const bx = ring[j * 2]!
      const bz = ring[j * 2 + 1]!
      const span = Math.hypot(bx - ax, bz - az) || 1
      const nx = -(bz - az) / span
      const nz = (bx - ax) / span
      push(tile, ax, wallTop, az, nx, nz, 0, 0, roof)
      push(tile, bx, wallTop, bz, nx, nz, 0, 0, roof)
      push(tile, bx, wallTop + PARAPET, bz, nx, nz, 0, 0, roof)
      push(tile, ax, wallTop + PARAPET, az, nx, nz, 0, 0, roof)
      tile.roofIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
    }
  }

  const capBase = tile.position.length / 3
  for (let i = 0; i < corners; i += 1)
    push(tile, cap[i * 2]!, capHeight, cap[i * 2 + 1]!, 0, 0, 0, 0, roof, true)
  for (const triangle of triangulate(cap))
    tile.roofIndex.push(capBase + triangle[2], capBase + triangle[1], capBase + triangle[0])

  roofFurniture(tile, ring, wallTop, capHeight, wall, roof, rng)

  if (landmarked)
    landmark(tile, building, capHeight, wall, roof)
  tile.ranges.push({ start, count: tile.position.length / 3 - start })
}

/** Vertex with a horizontal normal, or an upward one for a roof cap. */
/**
 * What makes the town hall look like one: a clock tower.
 *
 * Written straight into the tile the rest of the city is written into, so it shares the walls' own
 * material and the roofs' own material and costs **no draw call at all**. Twenty-odd quads for the
 * one building in Lindenhafen a player is ever asked to look for.
 *
 * Everything about it is deliberate rather than decorative. A tower is the only thing on this
 * skyline taller than its own building, so it reads as a landmark from any distance the camera can
 * reach. The clock faces are in the roof group, which carries no façade texture, so they stay flat
 * pale discs rather than growing windows. And the cap is a spire rather than a hip, because a hip is
 * what every other roof in the city already is.
 */
function landmark(tile: Tile, building: BuildingRecord, roofTop: number, wall: THREE.Color, roof: THREE.Color): void {
  // Square, and never wider than the building it stands on.
  const half = Math.min(TOWER_WIDTH, Math.min(building.width, building.depth) * 0.36) / 2
  const base = roofTop - TOWER_SINK
  const top = base + TOWER_HEIGHT
  const cos = Math.cos(building.rotation)
  const sin = Math.sin(building.rotation)
  // Counter-clockwise in the building's own frame, so each edge's outward normal points out.
  const corner = (x: number, z: number): [number, number] =>
    [building.x + x * cos - z * sin, building.z + x * sin + z * cos]
  const ring = [[-half, -half], [-half, half], [half, half], [half, -half]].map(([x, z]) => corner(x!, z!))
  const flare = half * BELFRY_FLARE
  const flared = [[-flare, -flare], [-flare, flare], [flare, flare], [flare, -flare]].map(([x, z]) => corner(x!, z!))

  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = ring[i]!
    const [bx, bz] = ring[(i + 1) % 4]!
    const span = Math.hypot(bx - ax, bz - az)
    const nx = -(bz - az) / span
    const nz = (bx - ax) / span

    /*
     * The shaft, and in the roof group rather than the wall group — which is to say without the
     * façade texture on it. A clock tower is masonry with a few openings in it; drawing the city's
     * window grid up thirty metres of it made the one landmark in Lindenhafen read as a lift
     * overrun, which is precisely what the first version looked like.
     */
    const shaft = tile.position.length / 3
    push(tile, ax, base, az, nx, nz, 0, 0, wall)
    push(tile, bx, base, bz, nx, nz, 0, 0, wall)
    push(tile, bx, top, bz, nx, nz, 0, 0, wall)
    push(tile, ax, top, az, nx, nz, 0, 0, wall)
    tile.roofIndex.push(shaft, shaft + 2, shaft + 1, shaft, shaft + 3, shaft + 2)

    /*
     * One tall opening per face, low down, so the shaft is not a blank slab. Dark rather than
     * textured: at any distance the camera can reach, a window is a dark rectangle.
     */
    const slit = tile.position.length / 3
    const openX = (ax + bx) / 2 + nx * CLOCK_PROUD
    const openZ = (az + bz) / 2 + nz * CLOCK_PROUD
    const runX = (bx - ax) / span * SLIT_WIDTH / 2
    const runZ = (bz - az) / span * SLIT_WIDTH / 2
    push(tile, openX - runX, base + SLIT_FOOT, openZ - runZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, openX + runX, base + SLIT_FOOT, openZ + runZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, openX + runX, base + SLIT_FOOT + SLIT_HEIGHT, openZ + runZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, openX - runX, base + SLIT_FOOT + SLIT_HEIGHT, openZ - runZ, nx, nz, 0, 0, SLIT_DARK)
    tile.roofIndex.push(slit, slit + 2, slit + 1, slit, slit + 3, slit + 2)

    /*
     * The clock: a pale square standing a hand's breadth proud of the shaft, near the top. Proud of
     * it rather than flush, because flush means z-fighting with the wall behind it at every distance
     * and a flickering clock is worse than none.
     */
    const midX = (ax + bx) / 2 + nx * CLOCK_PROUD
    const midZ = (az + bz) / 2 + nz * CLOCK_PROUD
    const alongX = (bx - ax) / span * CLOCK_SIZE / 2
    const alongZ = (bz - az) / span * CLOCK_SIZE / 2
    const clockY = top - CLOCK_DROP
    const rim = tile.position.length / 3
    const rimX = (bx - ax) / span * CLOCK_SIZE * 0.66
    const rimZ = (bz - az) / span * CLOCK_SIZE * 0.66
    push(tile, midX - rimX, clockY - CLOCK_SIZE * 0.66, midZ - rimZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, midX + rimX, clockY - CLOCK_SIZE * 0.66, midZ + rimZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, midX + rimX, clockY + CLOCK_SIZE * 0.66, midZ + rimZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, midX - rimX, clockY + CLOCK_SIZE * 0.66, midZ - rimZ, nx, nz, 0, 0, SLIT_DARK)
    tile.roofIndex.push(rim, rim + 2, rim + 1, rim, rim + 3, rim + 2)
    const face = tile.position.length / 3
    const faceX = midX + nx * CLOCK_PROUD
    const faceZ = midZ + nz * CLOCK_PROUD
    push(tile, faceX - alongX, clockY - CLOCK_SIZE / 2, faceZ - alongZ, nx, nz, 0, 0, CLOCK_FACE)
    push(tile, faceX + alongX, clockY - CLOCK_SIZE / 2, faceZ + alongZ, nx, nz, 0, 0, CLOCK_FACE)
    push(tile, faceX + alongX, clockY + CLOCK_SIZE / 2, faceZ + alongZ, nx, nz, 0, 0, CLOCK_FACE)
    push(tile, faceX - alongX, clockY + CLOCK_SIZE / 2, faceZ - alongZ, nx, nz, 0, 0, CLOCK_FACE)
    tile.roofIndex.push(face, face + 2, face + 1, face, face + 3, face + 2)

    /*
     * The belfry, flared out over the shaft: an underside, a face with its own opening, and then the
     * spire off the top of it. Three stages rather than two is the whole difference.
     */
    const [fax, faz] = flared[i]!
    const [fbx, fbz] = flared[(i + 1) % 4]!
    const belfryTop = top + BELFRY_HEIGHT

    const under = tile.position.length / 3
    push(tile, ax, top, az, 0, 0, 0, 0, roof)
    push(tile, bx, top, bz, 0, 0, 0, 0, roof)
    push(tile, fbx, top, fbz, 0, 0, 0, 0, roof)
    push(tile, fax, top, faz, 0, 0, 0, 0, roof)
    tile.roofIndex.push(under, under + 1, under + 2, under, under + 2, under + 3)

    const stage = tile.position.length / 3
    push(tile, fax, top, faz, nx, nz, 0, 0, wall)
    push(tile, fbx, top, fbz, nx, nz, 0, 0, wall)
    push(tile, fbx, belfryTop, fbz, nx, nz, 0, 0, wall)
    push(tile, fax, belfryTop, faz, nx, nz, 0, 0, wall)
    tile.roofIndex.push(stage, stage + 2, stage + 1, stage, stage + 3, stage + 2)

    // The bell opening, dark and nearly the width of the stage: what a belfry is.
    const bell = tile.position.length / 3
    const bellX = (fax + fbx) / 2 + nx * CLOCK_PROUD
    const bellZ = (faz + fbz) / 2 + nz * CLOCK_PROUD
    const bellSpan = Math.hypot(fbx - fax, fbz - faz)
    const bellRunX = (fbx - fax) / bellSpan * bellSpan * 0.34
    const bellRunZ = (fbz - faz) / bellSpan * bellSpan * 0.34
    push(tile, bellX - bellRunX, top + 0.7, bellZ - bellRunZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, bellX + bellRunX, top + 0.7, bellZ + bellRunZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, bellX + bellRunX, belfryTop - 0.7, bellZ + bellRunZ, nx, nz, 0, 0, SLIT_DARK)
    push(tile, bellX - bellRunX, belfryTop - 0.7, bellZ - bellRunZ, nx, nz, 0, 0, SLIT_DARK)
    tile.roofIndex.push(bell, bell + 2, bell + 1, bell, bell + 3, bell + 2)

    // And the spire off the belfry, one triangle per side, up to a point over the middle.
    const spire = tile.position.length / 3
    push(tile, fax, belfryTop, faz, nx, nz, 0, 0, roof)
    push(tile, fbx, belfryTop, fbz, nx, nz, 0, 0, roof)
    push(tile, building.x, belfryTop + SPIRE_HEIGHT, building.z, nx, nz, 0, 0, roof)
    tile.roofIndex.push(spire, spire + 2, spire + 1)
  }
}

function push(tile: Tile, x: number, y: number, z: number, nx: number, nz: number, u: number, v: number, colour: THREE.Color, up = false): void {
  tile.position.push(x, y, z)
  tile.normal.push(up ? 0 : nx, up ? 1 : 0, up ? 0 : nz)
  tile.uv.push(u, v)
  tile.colour.push(colour.r, colour.g, colour.b)
}

/**
 * Ein `Tile` als Senke für Volumen, damit ein Bauteil gebaut und geprüft werden kann, ohne die halbe
 * Stadt dafür hochzuziehen. Alles darin geht in die Dachgruppe — also ohne Fassadentextur, was für
 * Beton genau richtig ist.
 */
function sinkOf(tile: Tile): SolidSink {
  return {
    vertex: (x, y, z, normal, colour) => {
      tile.position.push(x, y, z)
      tile.normal.push(normal[0], normal[1], normal[2])
      tile.uv.push(0, 0)
      tile.colour.push(colour.r, colour.g, colour.b)
      return tile.position.length / 3 - 1
    },
    face: (a, b, c) => {
      tile.roofIndex.push(a, b, c)
    },
  }
}

/** Vertex with a normal of its own, which a sloping roof plane needs and the walls never do. */
function pushSloped(tile: Tile, x: number, y: number, z: number, normal: number[], colour: THREE.Color): void {
  tile.position.push(x, y, z)
  tile.normal.push(normal[0]!, normal[1]!, normal[2]!)
  tile.uv.push(0, 0)
  tile.colour.push(colour.r, colour.g, colour.b)
}

/**
 * A gabled roof on a rectangle: a ridge down its long axis, a slope either side of it and a
 * triangular wall closing each end.
 *
 * The ridge runs between the middles of the two short edges, which is what makes it the long axis
 * without having to measure an angle. The eaves reach past the long walls — across the ridge only,
 * so the gable ends stay flush with the wall below them and there is nothing to close up.
 */
function gable(tile: Tile, ring: number[], wallTop: number, ridgeHeight: number, colour: THREE.Color, gableWall: THREE.Color): void {
  const at = (index: number): [number, number] => [ring[(index % 4) * 2]!, ring[(index % 4) * 2 + 1]!]
  const [x0, z0] = at(0)
  const [x1, z1] = at(1)
  const [x2, z2] = at(2)
  const [x3, z3] = at(3)

  // Whichever pair of opposite edges is longer carries the eaves; the ridge runs between the others.
  const alongFirst = Math.hypot(x1 - x0, z1 - z0) >= Math.hypot(x2 - x1, z2 - z1)
  const eaveA = alongFirst ? [[x0, z0], [x1, z1]] : [[x1, z1], [x2, z2]]
  const eaveB = alongFirst ? [[x2, z2], [x3, z3]] : [[x3, z3], [x0, z0]]

  const midAx = (eaveA[0]![0]! + eaveA[1]![0]!) / 2
  const midAz = (eaveA[0]![1]! + eaveA[1]![1]!) / 2
  const midBx = (eaveB[0]![0]! + eaveB[1]![0]!) / 2
  const midBz = (eaveB[0]![1]! + eaveB[1]![1]!) / 2
  // Across the ridge: from one eave toward the other, which is the direction the eaves reach out in.
  const acrossLength = Math.hypot(midAx - midBx, midAz - midBz) || 1
  const acrossX = ((midAx - midBx) / acrossLength) * EAVES
  const acrossZ = ((midAz - midBz) / acrossLength) * EAVES

  const a0 = [eaveA[0]![0]! + acrossX, eaveA[0]![1]! + acrossZ]
  const a1 = [eaveA[1]![0]! + acrossX, eaveA[1]![1]! + acrossZ]
  const b0 = [eaveB[0]![0]! - acrossX, eaveB[0]![1]! - acrossZ]
  const b1 = [eaveB[1]![0]! - acrossX, eaveB[1]![1]! - acrossZ]
  // The ridge sits over the middle of the two short edges.
  const ridge0 = [(a1[0]! + b0[0]!) / 2, (a1[1]! + b0[1]!) / 2]
  const ridge1 = [(b1[0]! + a0[0]!) / 2, (b1[1]! + a0[1]!) / 2]

  const slope = (eave0: number[], eave1: number[], top0: number[], top1: number[]): void => {
    const normal = faceNormal(
      [eave0[0]!, wallTop, eave0[1]!],
      [eave1[0]!, wallTop, eave1[1]!],
      [top1[0]!, ridgeHeight, top1[1]!],
    )
    const vertex = tile.position.length / 3
    pushSloped(tile, eave0[0]!, wallTop, eave0[1]!, normal, colour)
    pushSloped(tile, eave1[0]!, wallTop, eave1[1]!, normal, colour)
    pushSloped(tile, top0[0]!, ridgeHeight, top0[1]!, normal, colour)
    pushSloped(tile, top1[0]!, ridgeHeight, top1[1]!, normal, colour)
    tile.roofIndex.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
  }

  slope(a0, a1, ridge0, ridge1)
  slope(b0, b1, ridge1, ridge0)

  /*
   * Die beiden Giebelwände, die unter dem First schließen — **und eine Giebelwand ist eine Wand.**
   *
   * Sie bekamen die Dachfarbe, und damit verschmolz jedes Satteldachhaus zu einem einzigen Farbklotz
   * von der Sohlbank bis zum First: ein grünes Haus mit grünem Dach, ein rotes mit rotem. Nichts
   * sieht so sehr nach Computer aus, und es war der eigentliche Grund, aus dem die Häuser auch mit
   * breiten Paletten noch komisch aussahen. Ein Klinkerbau hat ein Schieferdach, ein weißes Haus hat
   * rote Ziegel — die Trennung zwischen Wand und Dach ist das, was ein Haus als gebautes Ding lesbar
   * macht.
   */
  const end = (left: number[], right: number[], apex: number[]): void => {
    const normal = faceNormal([left[0]!, wallTop, left[1]!], [right[0]!, wallTop, right[1]!], [apex[0]!, ridgeHeight, apex[1]!])
    const vertex = tile.position.length / 3
    pushSloped(tile, left[0]!, wallTop, left[1]!, normal, gableWall)
    pushSloped(tile, right[0]!, wallTop, right[1]!, normal, gableWall)
    pushSloped(tile, apex[0]!, ridgeHeight, apex[1]!, normal, gableWall)
    tile.roofIndex.push(vertex, vertex + 2, vertex + 1)
  }

  /*
   * Auf der **Wand**, nicht auf der Traufe.
   *
   * `a1` und `b0` sind die um `EAVES` nach außen geschobenen Traufpunkte — der Giebel stand damit auf
   * jeder Seite einen halben Meter neben der Wand unter ihm, und genau das sah man: eine Stufe
   * zwischen Wandkante und Dachfläche, mal als Überstand, mal als Loch. Ein Ortgang kragt über die
   * Giebelwand aus, die Giebelwand selbst steht in der Flucht der Wand. Der First liegt ohnehin
   * richtig: die beiden Versätze heben sich in seiner Mitte gegenseitig auf.
   */
  end(eaveA[1]!, eaveB[0]!, ridge0)
  end(eaveB[1]!, eaveA[0]!, ridge1)
}

/**
 * Eine Freitreppe vor dem Hauseingang.
 *
 * Jede Stufe ist ein Kasten ohne Boden. Sie stehen ineinander geschachtelt, die unterste am weitesten
 * vom Haus weg, sodass die Kanten die Schattenlinien werfen, an denen man eine Treppe als Treppe
 * erkennt. Alles in der Dachgruppe — kein Fenstergitter darauf, kein zusätzlicher Draw.
 */
function entrance(
  tile: Tile,
  ring: number[],
  street: number,
  corners: number,
  floor: number,
  relief: Relief,
  rng: { next: () => number },
): void {
  const j = (street + 1) % corners
  const ax = ring[street * 2]!
  const az = ring[street * 2 + 1]!
  const bx = ring[j * 2]!
  const bz = ring[j * 2 + 1]!
  const span = Math.hypot(bx - ax, bz - az)
  if (span < STOOP_CLEARANCE)
    return

  // Die Mitte der Straßenwand, und die Richtung, in die sie zeigt.
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  /*
   * **Nach außen, und zwar nachweislich.**
   *
   * Die Normale wird aus der Umlaufrichtung des Umrisses abgeleitet, und die stimmt nicht bei jedem
   * Grundriss: wo sie kippt, wuchs die Freitreppe ins Haus hinein — ein Klotz, der aus der Fassade
   * ragt und im Erdgeschoss steckt. Statt sich auf die Umlaufrichtung zu verlassen, wird hier
   * gefragt: liegt ein Punkt einen halben Meter in dieser Richtung *im* Gebäude? Dann ist es die
   * falsche. Das kostet einen Punkt-im-Polygon-Test je Haus, einmal beim Aufbau.
   */
  const facing = pointInside(mx - (bz - az) / span * 0.5, mz + (bx - ax) / span * 0.5, ring) ? -1 : 1
  const nx = (-(bz - az) / span) * facing
  const nz = ((bx - ax) / span) * facing
  // Längs der Wand. Die Händigkeit spielt keine Rolle mehr — `buildStoop` wickelt nach der eigenen
  // Geometrie, und das Türblatt unten tut dasselbe.
  const tx = (bx - ax) / span
  const tz = (bz - az) / span

  /*
   * Der Boden vor der Tür — nicht der unter dem Haus, denn genau darum geht es. Ein Gebäude steht
   * auf dem höchsten Boden, den sein Umriss überdeckt; am Hang liegt sein Fußboden deshalb über dem
   * Gehweg davor, und zusammen mit dem Hochparterre ist das, was die Treppe zu überwinden hat.
   */
  const outside = relief.height(mx + nx * 1.4, mz + nz * 1.4)
  const stone = STOOP_STONE_COLOURS[Math.floor(rng.next() * STOOP_STONE_COLOURS.length)]!
  buildStoop(sinkOf(tile), {
    centre: [mx, mz],
    along: [tx, tz],
    outward: [nx, nz],
    ground: outside,
    floor,
    riser: stone[0],
    tread: stone[1],
  })

  /*
   * Und die Tür oben drauf — **einmal je Haus, und deshalb Geometrie.**
   *
   * In der Erdgeschosskachel stand sie vorher, und weil die sich alle zwei Achsen wiederholt, hatte
   * ein dreißig Meter langer Block vier Haustüren. Was genau einmal an einem Gebäude vorkommt, kann
   * keine gekachelte Textur leisten. Hier sind es zwei Flächen — Rahmen und Türblatt, sechs Dreiecke
   * — und sie stehen ein paar Zentimeter vor der Wand, damit sie eine eigene Schattenkante haben und
   * nicht mit der Fassade um dieselbe Tiefe streiten.
   */
  const sink = sinkOf(tile)
  const panel = (halfWidth: number, height: number, out: number, shade: THREE.Color): void => {
    const foot = floor - 0.02
    const left: [number, number] = [mx - tx * halfWidth + nx * out, mz - tz * halfWidth + nz * out]
    const right: [number, number] = [mx + tx * halfWidth + nx * out, mz + tz * halfWidth + nz * out]
    // Gewickelt nach der eigenen Geometrie, nicht nach der Umlaufrichtung des Grundrisses — dieselbe
    // Annahme hatte die Freitreppe unsichtbar gemacht.
    facet(sink, [
      [left[0], foot, left[1]],
      [right[0], foot, right[1]],
      [right[0], foot + height, right[1]],
      [left[0], foot + height, left[1]],
    ], [nx, 0, nz], shade)
  }
  panel(DOOR_WIDTH / 2 + 0.16, DOOR_HEIGHT + 0.18, DOOR_PROUD * 0.5, DOOR_FRAME)
  panel(DOOR_WIDTH / 2, DOOR_HEIGHT, DOOR_PROUD, DOOR_LEAF)
}

/**
 * Was auf einem Dach steht.
 *
 * Man schaut von schräg oben auf Lindenhafen, also ist die Dachfläche die *wichtigste* Fläche der
 * Stadt — und sie war vollkommen leer. Kein Schornstein, keine Gaube, kein Lüfteraufbau, keine
 * Aufzugsüberfahrt. Eine leere Dachfläche ist der Grund, aus dem ein Haus wie ein Volumen aussieht
 * und nicht wie ein Gebäude, und zu zwölftausend davon addiert sie sich zu einem Stadtmodell aus
 * Bauklötzen.
 *
 * Es ist außerdem der billigste Detailgrad, den es gibt. Ein Kasten sind zehn Dreiecke, er geht in
 * die Dachgruppe (**kein zusätzlicher Draw, kein zweites Material**), und er steht auf einer Fläche,
 * die von dieser Kamera aus immer zu sehen ist — anders als jede Fassadenverfeinerung, die nur an
 * einer von vier Seiten und nur aus der Nähe etwas bringt.
 *
 * Was daraufkommt, folgt der Dachform: auf ein geneigtes Dach Schornsteine, auf ein Flachdach die
 * Technik. Beides ist an `condition` und Viertel gebunden — auf einer gepflegten Gründerzeitzeile
 * stehen gemauerte Schornsteine, auf der Halle im Hafen steht ein Lüfterblock.
 */
const CHIMNEY_SHARE = 0.72
const PLANT_SHARE = 0.66
/** Wie weit ein Aufbau über die Dachfläche ragt, in Metern. */
const CHIMNEY_RISE = 1.4
/** Ziegel, aus denen ein Schornstein gemauert ist — dunkler als jedes Dach, auf dem er steht. */
const CHIMNEY_BRICK = ['#6d3a29', '#5a3024', '#7a4632', '#4a352d', '#63453a']
const PLANT_RISE = 2.6

function roofFurniture(
  tile: Tile,
  ring: number[],
  wallTop: number,
  capHeight: number,
  wall: THREE.Color,
  roof: THREE.Color,
  rng: { next: () => number },
): void {
  /*
   * **Alles hier kommt aus dem Umriss, nichts aus dem Datensatz.**
   *
   * Es stand vorher auf `building.x/z/rotation/width/depth` — also auf einer gedachten Kiste um das
   * Haus herum. Für ein Rechteck geht das gut, und elf von vierzehntausend Häusern in Lindenhafen
   * sind Rechtecke. Die anderen sind L-Formen, Ecken, Fünfecke auf einer Kurve, und bei denen liegt
   * der Mittelpunkt dieser Kiste außerhalb des Gebäudes: der Schornstein stand neben dem Dach, der
   * Lüfterkasten hing halb über der Traufe, und beides sah genau so aus, wie es war.
   *
   * Der Umriss ist zur Hand, er ist bereits trianguliert, und der Mittelpunkt eines seiner Dreiecke
   * liegt garantiert im Gebäude — auch bei einem L. Das ist die ganze Korrektur.
   */
  const spot = (margin: number): [number, number] | null => {
    const shrunk = inset(ring, margin)
    const parts = triangulate(shrunk)
    if (parts.length === 0)
      return null
    const part = parts[Math.min(parts.length - 1, Math.floor(rng.next() * parts.length))]!
    const x = (shrunk[part[0] * 2]! + shrunk[part[1] * 2]! + shrunk[part[2] * 2]!) / 3
    const z = (shrunk[part[0] * 2 + 1]! + shrunk[part[1] * 2 + 1]! + shrunk[part[2] * 2 + 1]!) / 3
    return pointInside(x, z, ring) ? [x, z] : null
  }

  if (capHeight - wallTop > 0.4) {
    if (rng.next() > CHIMNEY_SHARE)
      return
    /*
     * Der Schornstein ist gemauert — also roter oder dunkler Ziegel, ganz gleich, welche Farbe das
     * Dach hat. Sein Fuß steht auf der Traufhöhe und steckt damit unter der Dachfläche; nach oben
     * muss er über den First hinaus, sonst verschwindet er im Dach. Beides ist hier garantiert,
     * ohne die Dachhöhe an seiner Stelle ausrechnen zu müssen.
     */
    const brick = pick(CHIMNEY_BRICK, rng)
    const half = 0.45 + rng.next() * 0.3
    const place = spot(half + 1.2)
    if (!place)
      return
    box(tile, place, half, wallTop, capHeight + CHIMNEY_RISE * (0.7 + rng.next() * 0.8), brick)
    const second = rng.next() < 0.45 ? spot(half + 1.2) : null
    if (second)
      box(tile, second, half * 0.9, wallTop, capHeight + CHIMNEY_RISE, brick)
    return
  }

  if (capHeight - wallTop > 0.4 || rng.next() > PLANT_SHARE)
    return
  /*
   * Auf dem Flachdach die Technik: Aufzugsüberfahrt, Lüftung, Treppenhauskopf. Sie steht in der Farbe
   * des Hauses, weil sie aus demselben Beton ist — und sie steht **auf** der Dachfläche, nicht auf
   * der Traufe: bei einem Flachdach sind beide dasselbe, bei allem anderen wäre sie eingegraben.
   *
   * Der Rand ist großzügig. Ein Aufbau, der die Attika berührt, sieht aus wie ein Fehler, auch wenn
   * er innerhalb des Umrisses liegt.
   */
  const half = 1.4 + rng.next() * 1.2
  const place = spot(half + 2.5)
  if (!place)
    return
  box(tile, place, half, capHeight, capHeight + PLANT_RISE * (0.6 + rng.next() * 0.7), wall)
  const second = rng.next() < 0.5 ? spot(half + 2.5) : null
  if (second)
    box(tile, second, half * 0.55, capHeight, capHeight + PLANT_RISE * 0.5, roof)
}

/**
 * Liegt ein Punkt im Grundriss? Strahlensatz, wie er seit jeher aussieht.
 *
 * Gebraucht, weil ein Umriss weder konvex noch um seinen Datensatzmittelpunkt zentriert sein muss:
 * der Schwerpunkt eines L liegt im Hof davor, und alles, was dort platziert wird, steht neben dem
 * Haus statt darauf.
 */
export function pointInside(x: number, z: number, ring: number[]): boolean {
  const corners = ring.length / 2
  let inside = false
  for (let i = 0, j = corners - 1; i < corners; j = i, i += 1) {
    const xi = ring[i * 2]!
    const zi = ring[i * 2 + 1]!
    const xj = ring[j * 2]!
    const zj = ring[j * 2 + 1]!
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside
  }
  return inside
}

/**
 * Ein achsenparalleler Kasten auf dem Dach: vier Wände und ein Deckel, zehn Dreiecke.
 *
 * Er hat keinen Boden — der steckt unter der Dachfläche und wäre von keiner erreichbaren Kamera aus
 * zu sehen. Das spart zwei Dreiecke je Aufbau, also bei zehntausend Aufbauten zwanzigtausend.
 *
 * **Und er wickelt nach seiner eigenen Geometrie.** Er tat es nicht: die Reihenfolge war von den
 * Wänden abgeschrieben, und die funktioniert nur, weil die Grundrisse aus dem Kartenmaterial im
 * Uhrzeigersinn laufen. Sein eigener Ring läuft andersherum, also zeigten alle vier Seiten nach
 * innen und wurden weggeschnitten: übrig blieb ein Deckel, der frei über dem Dach schwebte, mit
 * einer einzigen Wange daran. Dieselbe Annahme, an der auch die Freitreppe zerbrochen ist, und
 * dieselbe Antwort — `facet` fragt nicht, sondern rechnet nach.
 */
function box(tile: Tile, centre: [number, number], half: number, base: number, top: number, colour: THREE.Color): void {
  const [cx, cz] = centre
  const sink = sinkOf(tile)
  const ring: [number, number][] = [
    [cx - half, cz - half],
    [cx - half, cz + half],
    [cx + half, cz + half],
    [cx + half, cz - half],
  ]
  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = ring[i]!
    const [bx, bz] = ring[(i + 1) % 4]!
    const span = Math.hypot(bx - ax, bz - az) || 1
    // Aus dem Kasten heraus: die Kantennormale, die vom Mittelpunkt weg zeigt.
    let nx = -(bz - az) / span
    let nz = (bx - ax) / span
    if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) {
      nx = -nx
      nz = -nz
    }
    facet(sink, [
      [ax, base, az],
      [bx, base, bz],
      [bx, top, bz],
      [ax, top, az],
    ], [nx, 0, nz], colour)
  }
  facet(sink, ring.map(([x, z]) => [x, top, z] as [number, number, number]), [0, 1, 0], colour)
}

/** The outward normal of a triangle, wound the way the roof indices are. */
function faceNormal(a: number[], b: number[], c: number[]): number[] {
  const ux = b[0]! - a[0]!
  const uy = b[1]! - a[1]!
  const uz = b[2]! - a[2]!
  const vx = c[0]! - a[0]!
  const vy = c[1]! - a[1]!
  const vz = c[2]! - a[2]!
  const nx = uz * vy - uy * vz
  const ny = ux * vz - uz * vx
  const nz = uy * vx - ux * vy
  const length = Math.hypot(nx, ny, nz) || 1
  return [nx / length, ny / length, nz / length]
}

/** Move every corner in toward the ring's centre, which is enough of a roof at this scale. */
export function inset(ring: number[], amount: number): number[] {
  const corners = ring.length / 2
  let cx = 0
  let cz = 0
  for (let i = 0; i < ring.length; i += 2) {
    cx += ring[i]!
    cz += ring[i + 1]!
  }
  cx /= corners
  cz /= corners

  const out: number[] = []
  for (let i = 0; i < corners; i += 1) {
    const x = ring[i * 2]!
    const z = ring[i * 2 + 1]!
    const distance = Math.hypot(x - cx, z - cz) || 1
    const pull = Math.min(amount, distance * 0.42) / distance
    out.push(x + (cx - x) * pull, z + (cz - z) * pull)
  }
  return out
}

function triangulate(ring: number[]): [number, number, number][] {
  const contour: THREE.Vector2[] = []
  for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
  return THREE.ShapeUtils.triangulateShape(contour, []) as [number, number, number][]
}

/** A lookup from triangle index to the building it belongs to, built once for the picker. */
function triangleOwners(tile: Tile): Uint16Array {
  const total = (tile.wallIndex.length + tile.roofIndex.length) / 3
  const owners = new Uint16Array(total)
  const index = [...tile.wallIndex, ...tile.roofIndex]
  for (let triangle = 0; triangle < total; triangle += 1) {
    const vertex = index[triangle * 3]!
    // The ranges are in order, so the owning building is the last one that starts at or before it.
    let low = 0
    let high = tile.ranges.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (tile.ranges[middle]!.start <= vertex)
        low = middle
      else high = middle - 1
    }
    owners[triangle] = low
  }
  return owners
}

function pick(palette: string[] | undefined, rng: { next: () => number }): THREE.Color {
  const list = palette ?? ['#c8c4b8']
  return new THREE.Color(list[Math.floor(rng.next() * list.length)] ?? list[0]!)
}
