import type { CityBlueprint } from '../../../core/contracts'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../../core/rng'
import { AXIS_Y } from '../../shared'
import { WATER_LEVEL } from '../terrain/water'
import { merge, paint } from './handBuilt'

/**
 * Das Heizkraftwerk am Stadtrand, und die Trasse, die von dort weggeht.
 *
 * Windräder haben dem Horizont eine Silhouette gegeben, aber sie sind alle gleich hoch und alle
 * gleich weiß. Eine Landschaft braucht **eine** Sache, an der das Auge hängen bleibt und an der es
 * sich orientiert — ein Ding, von dem es nur eines gibt. Das ist hier das Kraftwerk: zwei Kühltürme
 * von hundertzwanzig Metern, ein Schornstein von hundertsechzig, eine Maschinenhalle und ein
 * Schaltfeld. Von jedem Punkt der Karte aus weiß man danach, wo Norden ist.
 *
 * Die Trasse ist der zweite Teil und fast der wichtigere. Ein Kraftwerk allein steht in der
 * Landschaft wie hingestellt; eine Reihe Masten, die von ihm weg zur Stadt marschiert, **verbindet**
 * es mit ihr. Masten sind außerdem das billigste Silhouettenmaterial, das es gibt — 44 Dreiecke, und
 * die ganze Trasse ist ein Draw.
 *
 * Keine Leiterseile. Ein Seil ist auf zweihundert Metern schon dünner als ein Pixel, und was
 * schmaler als ein Pixel ist, flimmert, statt zu zeichnen. Die Masten tragen die Linie allein.
 */

/**
 * Maße einer Kraftwerksanlage, wie man sie aus zwei Kilometern liest.
 *
 * Erst waren die Kühltürme 118 m hoch und das Werk 170 m breit. Danebengestellt war das kleiner als
 * ein Dorf, und aus der Stadt blieb ein Punkt am Horizont. Ein Kraftwerksblock dieser Bauart nimmt in
 * Wirklichkeit einen halben Quadratkilometer ein — also nimmt er ihn hier auch: Türme auf 152 m, ein
 * Schornstein auf 198 m, und das Gelände spannt über gut vierhundert Meter.
 */
const COOLING_HEIGHT = 152
const COOLING_FOOT = 58
const COOLING_WAIST = 35
const COOLING_LIP = 42
const STACK_HEIGHT = 198
const STACK_RADIUS = 8.5

/**
 * Wo die Anlagen stehen dürfen, und wie viele es sind.
 *
 * Zwei, und zwar einander gegenüber. Ein einzelner Fixpunkt sagt dem Auge nur „dort" — zwei sagen
 * ihm „dort und dort", und dazwischen liegt eine Achse, an der sich die ganze Karte aufziehen lässt.
 */
const SITE_COUNT = 2
const SITE_INNER = 2_400
const SITE_OUTER = 3_800
const CLEAR_OF_BUILDINGS = 340

/** Die Trasse: Abstand der Masten und wie hoch sie sind. */
const PYLON_SPAN = 340
const PYLON_HEIGHT = 46
const PYLON_COUNT = 26

export interface PowerPlant {
  works: THREE.InstancedMesh
  pylons: THREE.InstancedMesh
}

export function addPowerPlant(scene: THREE.Scene, blueprint: CityBlueprint): PowerPlant | null {
  const rng = createRandomStream(blueprint.definition.seed, 'powerplant')
  const near = buildingProximity(blueprint)

  const sites: { x: number, z: number, facing: number }[] = []
  for (let index = 0; index < SITE_COUNT; index += 1) {
    // Das zweite Werk gegenüber dem ersten, mit etwas Spiel, damit es keine gespiegelte Karte wird.
    const opposite = sites[0] ? Math.atan2(sites[0].z, sites[0].x) + Math.PI + rng.between(-0.7, 0.7) : null
    const site = findSite(rng, blueprint, near, opposite)
    if (site)
      sites.push(site)
  }
  if (sites.length === 0)
    return null

  /*
   * Beidseitig. Ein Kühlturm ist oben **offen** — das ist keine Nachlässigkeit, sondern was ein
   * Kühlturm ist —, und eine einseitige Schale zeigt von schräg oben ihre weggeschnittene Rückwand:
   * im Bild ein gebogenes Blech statt eines Bauwerks. Die Kästen daneben sind geschlossen und kostet
   * es nichts, weil ihre Rückseiten ohnehin von ihren eigenen Vorderseiten verdeckt werden.
   */
  const skin = (double: boolean): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.74,
    metalness: 0.05,
    side: double ? THREE.DoubleSide : THREE.FrontSide,
  })

  const works = new THREE.InstancedMesh(plant(), skin(true), sites.length)
  /*
   * Kein Schatten, aus demselben Grund wie beim Windrad: ein Bauwerk von zweihundert Metern zieht
   * die Schattenkarte über die halbe Karte auf und nimmt der Stadt die Auflösung, in der ihre
   * eigenen Schatten stecken.
   */
  works.castShadow = false
  works.receiveShadow = false
  scene.add(works)

  const pylons = new THREE.InstancedMesh(pylon(), skin(false), PYLON_COUNT * sites.length)
  pylons.castShadow = false
  pylons.receiveShadow = false
  scene.add(pylons)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  let standing = 0

  sites.forEach((site, index) => {
    quaternion.setFromAxisAngle(AXIS_Y, site.facing)
    matrix.compose(position.set(site.x, blueprint.relief.height(site.x, site.z), site.z), quaternion, scale)
    works.setMatrixAt(index, matrix)

    /*
     * Die Trasse läuft **an der Stadt vorbei**, nicht in sie hinein.
     *
     * Der erste Versuch schickte sie vom Werk aus geradewegs zur Stadtmitte, und das ist gleich
     * zweimal falsch: eine 380-kV-Leitung wird um eine Altstadt herumgeführt und nicht über sie
     * hinweg, und gemessen standen von sechsundzwanzig Masten nur zehn, weil die anderen in Häusern
     * landeten und verworfen wurden. Jetzt läuft sie tangential — quer zur Richtung, in der das Werk
     * von der Stadt aus liegt —, also über die ganze Länge durch offenes Land, und zwar in beide
     * Richtungen vom Werk weg. Gerade, weil eine Hochspannungsleitung gerade läuft; das ist aus der
     * Ferne genau das, woran man sie erkennt.
     */
    const run = Math.atan2(site.z, site.x) + Math.PI / 2
    const half = Math.ceil(PYLON_COUNT / 2)
    let placed = 0
    for (let step = -half; step <= half && placed < PYLON_COUNT; step += 1) {
      if (step === 0)
        continue
      const x = site.x + Math.cos(run) * step * PYLON_SPAN
      const z = site.z + Math.sin(run) * step * PYLON_SPAN
      const ground = blueprint.relief.height(x, z)
      // Nicht ins Wasser und nicht in ein Dorf; eine Lücke ist richtiger als ein Mast im Hof.
      if (ground < WATER_LEVEL + 0.5 || near(x, z, 70))
        continue
      quaternion.setFromAxisAngle(AXIS_Y, run)
      matrix.compose(position.set(x, ground, z), quaternion, scale)
      pylons.setMatrixAt(standing, matrix)
      placed += 1
      standing += 1
    }
  })

  works.count = sites.length
  works.instanceMatrix.needsUpdate = true
  works.computeBoundingSphere()
  pylons.count = standing
  pylons.instanceMatrix.needsUpdate = true
  pylons.computeBoundingSphere()

  return { works, pylons }
}

/** Ein Platz für die Anlage, oder nichts. Feste Versuchszahl, damit der Aufbau nie hängen bleibt. */
function findSite(
  rng: ReturnType<typeof createRandomStream>,
  blueprint: CityBlueprint,
  near: (x: number, z: number, radius: number) => boolean,
  toward: number | null,
): { x: number, z: number, facing: number } | null {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    /*
     * „Gegenüber" wird mit jedem Fehlversuch großzügiger ausgelegt.
     *
     * Eng gefasst (±0,25 rad) hat der zweite Standort gemessen **keinen** von neunzig Versuchen
     * gefunden: in diesem Keil lagen Dörfer und Wasser. Ein zweites Werk, das dann gar nicht steht,
     * ist schlechter als eines, das dreißig Grad neben der Ideallinie steht — also wird der Keil
     * über die Versuche hinweg auf ±1,5 rad aufgemacht, statt aufzugeben.
     */
    const spread = 0.25 + (attempt / 120) * 1.3
    const bearing = toward === null ? rng.next() * Math.PI * 2 : toward + rng.between(-spread, spread)
    const away = SITE_INNER + rng.next() * (SITE_OUTER - SITE_INNER)
    const x = Math.cos(bearing) * away
    const z = Math.sin(bearing) * away
    if (blueprint.relief.height(x, z) < WATER_LEVEL + 1.2)
      continue
    if (near(x, z, CLEAR_OF_BUILDINGS))
      continue
    // Die Halle quer zur Blickrichtung aus der Stadt, damit man sie als Halle und nicht als Kante sieht.
    return { x, z, facing: bearing + Math.PI / 2 + rng.between(-0.4, 0.4) }
  }
  return null
}

/** „Steht hier in der Nähe ein Haus?" über eine Zellkarte statt über achttausend Gebäude. */
function buildingProximity(blueprint: CityBlueprint): (x: number, z: number, radius: number) => boolean {
  const CELL = 200
  const cells = new Map<string, { x: number, z: number }[]>()
  for (const building of blueprint.buildings) {
    const key = `${Math.floor(building.x / CELL)},${Math.floor(building.z / CELL)}`
    const bucket = cells.get(key)
    if (bucket)
      bucket.push(building)
    else cells.set(key, [building])
  }

  return (x, z, radius) => {
    const reach = Math.ceil(radius / CELL)
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (const building of cells.get(`${cx + dx},${cz + dz}`) ?? []) {
          if ((building.x - x) ** 2 + (building.z - z) ** 2 < radius * radius)
            return true
        }
      }
    }
    return false
  }
}

/**
 * Ein Kühlturm: die gedrehte Hyperbel, die jeder kennt.
 *
 * Als `LatheGeometry` über sieben Stützpunkte, also nicht als Näherung an eine Hyperbel, sondern als
 * die Silhouette, die man davon im Kopf hat — unten weit, in zwei Dritteln Höhe eingeschnürt, oben
 * wieder etwas auf. Sechzehn Segmente, weil ein Ding mit vierzig Metern Radius auf zwei Kilometern
 * etwa zwanzig Pixel breit ist und kein Auge dort die siebzehnte Kante findet.
 */
function coolingTower(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(COOLING_FOOT, 0),
    new THREE.Vector2(COOLING_FOOT * 0.82, COOLING_HEIGHT * 0.1),
    new THREE.Vector2(COOLING_WAIST * 1.3, COOLING_HEIGHT * 0.34),
    new THREE.Vector2(COOLING_WAIST * 1.06, COOLING_HEIGHT * 0.58),
    new THREE.Vector2(COOLING_WAIST, COOLING_HEIGHT * 0.76),
    new THREE.Vector2(COOLING_LIP * 0.96, COOLING_HEIGHT * 0.93),
    new THREE.Vector2(COOLING_LIP, COOLING_HEIGHT),
  ]
  const shell = new THREE.LatheGeometry(profile, 16)
  shell.computeVertexNormals()
  return paint(shell, '#b9b6ae')
}

/**
 * Die ganze Anlage als ein Stück.
 *
 * Alles in einer Geometrie und einem Material: acht Bauteile wären sonst acht Draws für ein Ding,
 * das aus der Entfernung ohnehin eine Form ist.
 */
function plant(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  for (const offset of [-74, 74]) {
    const shell = coolingTower()
    shell.translate(offset, 0, -48)
    parts.push(shell)
  }

  /*
   * Der Schornstein mit den Warnringen. Die Ringe sind kein Detail um des Details willen: sie sind
   * das Einzige, was einem Betrachter aus drei Kilometern sagt, wie hoch das Ding ist. Ein weißes
   * Rohr ohne Maßstab könnte zwanzig Meter hoch sein.
   */
  const bands = 9
  for (let band = 0; band < bands; band += 1) {
    const height = STACK_HEIGHT / bands
    const low = band * height
    const taper = (radius: number, at: number): number => radius * (1 - 0.35 * (at / STACK_HEIGHT))
    const segment = new THREE.CylinderGeometry(taper(STACK_RADIUS, low + height), taper(STACK_RADIUS, low), height, 12, 1, true)
    segment.translate(0, low + height / 2, 62)
    parts.push(paint(segment, band % 2 === 0 ? '#ded9d2' : '#8d4038'))
  }

  // Die Maschinenhalle, das Kesselhaus dahinter und ein zweiter Block daneben.
  const hall = new THREE.BoxGeometry(148, 34, 52)
  hall.translate(0, 17, 30)
  parts.push(paint(hall, '#7d8288'))

  const boiler = new THREE.BoxGeometry(46, 74, 42)
  boiler.translate(-38, 37, 62)
  parts.push(paint(boiler, '#6d7278'))

  const annex = new THREE.BoxGeometry(38, 46, 34)
  annex.translate(46, 23, 62)
  parts.push(paint(annex, '#6d7278'))

  /*
   * Und dann das, was ein Kraftwerk auf der Karte wirklich groß macht: das **Gelände**. Türme und
   * Schornstein geben die Höhe, aber ein Werk, das nur aus ihnen besteht, steht wie hingestellt. Was
   * es einwachsen lässt, sind Tanks, Silos, Hallen und Halden über vierhundert Meter Breite.
   */
  for (const [at, radius, height] of [[128, 15, 22], [166, 15, 22], [204, 13, 18]] as const) {
    const tank = new THREE.CylinderGeometry(radius, radius, height, 10)
    tank.translate(at, height / 2, 12)
    parts.push(paint(tank, '#9aa0a3'))
  }

  for (const [at, height] of [[-150, 44], [-186, 44]] as const) {
    const silo = new THREE.CylinderGeometry(11, 11, height, 10)
    silo.translate(at, height / 2, 48)
    parts.push(paint(silo, '#b0aca4'))
  }

  const yard = new THREE.BoxGeometry(96, 9, 40)
  yard.translate(96, 4.5, -34)
  parts.push(paint(yard, '#5d6268'))

  const store = new THREE.BoxGeometry(74, 19, 36)
  store.translate(-118, 9.5, -22)
  parts.push(paint(store, '#6a6f74'))

  // Die Brennstoffhalde: lang statt rund, weil sie von einer Bandanlage aufgeschüttet wird.
  for (const at of [-96, -62]) {
    const heap = new THREE.ConeGeometry(30, 17, 7)
    heap.scale(1, 1, 2.1)
    heap.translate(at, 8.5, -76)
    parts.push(paint(heap, '#4a453f'))
  }

  return merge(parts)
}

/**
 * Ein Hochspannungsmast, so weit vereinfacht, wie er aus der Ferne aussieht.
 *
 * Ein echter Mast ist ein Fachwerk aus hunderten Winkeln. Nachgebaut wären das tausende Dreiecke je
 * Stück, und auf achthundert Metern ist davon ein graues Kreuz übrig. Also ist er gleich ein graues
 * Kreuz: ein sich verjüngender Schaft und zwei Traversen, 44 Dreiecke.
 */
function pylon(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const shaft = new THREE.CylinderGeometry(0.8, 3.4, PYLON_HEIGHT, 4, 1, true)
  shaft.rotateY(Math.PI / 4)
  shaft.translate(0, PYLON_HEIGHT / 2, 0)
  parts.push(paint(shaft, '#8e9298'))

  // Zwei Traversen, die obere kürzer — das ist die Form, an der man einen Mast erkennt.
  for (const [at, span] of [[PYLON_HEIGHT * 0.72, 19], [PYLON_HEIGHT * 0.93, 13]] as const) {
    const arm = new THREE.BoxGeometry(span, 1.1, 1.1)
    arm.translate(0, at, 0)
    parts.push(paint(arm, '#8e9298'))
  }

  return merge(parts)
}
