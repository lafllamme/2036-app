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

/** Maße einer Kraftwerksanlage, wie man sie aus zwei Kilometern liest. */
const COOLING_HEIGHT = 118
const COOLING_FOOT = 43
const COOLING_WAIST = 26
const COOLING_LIP = 31
const STACK_HEIGHT = 162
const STACK_RADIUS = 6.5

/** Wo die Anlage stehen darf: außerhalb der Stadt, aber gut innerhalb der Sichtweite. */
const SITE_INNER = 2_100
const SITE_OUTER = 3_400
const CLEAR_OF_BUILDINGS = 260

/** Die Trasse: Abstand der Masten und wie hoch sie sind. */
const PYLON_SPAN = 340
const PYLON_HEIGHT = 46
const PYLON_COUNT = 26

export interface PowerPlant {
  works: THREE.Mesh
  pylons: THREE.InstancedMesh
}

export function addPowerPlant(scene: THREE.Scene, blueprint: CityBlueprint): PowerPlant | null {
  const rng = createRandomStream(blueprint.definition.seed, 'powerplant')
  const near = buildingProximity(blueprint)

  const site = findSite(rng, blueprint, near)
  if (!site)
    return null

  const skin = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.05 })

  const works = new THREE.Mesh(plant(), skin())
  works.position.set(site.x, blueprint.relief.height(site.x, site.z), site.z)
  works.rotation.y = site.facing
  /*
   * Kein Schatten, aus demselben Grund wie beim Windrad: ein Bauwerk von hundertsechzig Metern zieht
   * die Schattenkarte über die halbe Karte auf und nimmt der Stadt die Auflösung, in der ihre
   * eigenen Schatten stecken.
   */
  works.castShadow = false
  works.receiveShadow = false
  scene.add(works)

  const pylons = new THREE.InstancedMesh(pylon(), skin(), PYLON_COUNT)
  pylons.castShadow = false
  pylons.receiveShadow = false
  scene.add(pylons)

  /*
   * Die Trasse läuft **an der Stadt vorbei**, nicht in sie hinein.
   *
   * Der erste Versuch schickte sie vom Werk aus geradewegs zur Stadtmitte, und das ist gleich zweimal
   * falsch: eine 380-kV-Leitung wird um eine Altstadt herumgeführt und nicht über sie hinweg, und
   * gemessen standen von sechsundzwanzig Masten nur zehn, weil die anderen in Häusern landeten und
   * verworfen wurden. Jetzt läuft sie tangential — quer zur Richtung, in der das Werk von der Stadt
   * aus liegt —, also über die ganze Länge durch offenes Land, und zwar in beide Richtungen vom Werk
   * weg. Gerade, weil eine Hochspannungsleitung gerade läuft; das ist aus der Ferne genau das, woran
   * man sie erkennt.
   */
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const run = Math.atan2(site.z, site.x) + Math.PI / 2
  const half = Math.ceil(PYLON_COUNT / 2)
  let standing = 0
  for (let step = -half; step <= half && standing < PYLON_COUNT; step += 1) {
    if (step === 0)
      continue
    const x = site.x + Math.cos(run) * step * PYLON_SPAN
    const z = site.z + Math.sin(run) * step * PYLON_SPAN
    const ground = blueprint.relief.height(x, z)
    // Nicht ins Wasser und nicht in ein Dorf; eine Lücke in der Reihe ist richtiger als ein Mast im Hof.
    if (ground < WATER_LEVEL + 0.5 || near(x, z, 70))
      continue
    quaternion.setFromAxisAngle(AXIS_Y, run)
    matrix.compose(position.set(x, ground, z), quaternion, scale)
    pylons.setMatrixAt(standing, matrix)
    standing += 1
  }
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
): { x: number, z: number, facing: number } | null {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const bearing = rng.next() * Math.PI * 2
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
export function coolingTower(): THREE.BufferGeometry {
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

  for (const offset of [-52, 52]) {
    const shell = coolingTower()
    shell.translate(offset, 0, -34)
    parts.push(shell)
  }

  /*
   * Der Schornstein mit den Warnringen. Die Ringe sind kein Detail um des Details willen: sie sind
   * das Einzige, was einem Betrachter aus drei Kilometern sagt, wie hoch das Ding ist. Ein weißes
   * Rohr ohne Maßstab könnte zwanzig Meter hoch sein.
   */
  const bands = 7
  for (let band = 0; band < bands; band += 1) {
    const height = STACK_HEIGHT / bands
    const low = band * height
    const taper = (radius: number, at: number): number => radius * (1 - 0.35 * (at / STACK_HEIGHT))
    const segment = new THREE.CylinderGeometry(taper(STACK_RADIUS, low + height), taper(STACK_RADIUS, low), height, 12, 1, true)
    segment.translate(0, low + height / 2, 46)
    parts.push(paint(segment, band % 2 === 0 ? '#ded9d2' : '#8d4038'))
  }

  // Die Maschinenhalle, das Kesselhaus dahinter und das Schaltfeld daneben.
  const hall = new THREE.BoxGeometry(96, 27, 38)
  hall.translate(0, 13.5, 22)
  parts.push(paint(hall, '#7d8288'))

  const boiler = new THREE.BoxGeometry(34, 54, 30)
  boiler.translate(-26, 27, 46)
  parts.push(paint(boiler, '#6d7278'))

  const yard = new THREE.BoxGeometry(60, 7, 26)
  yard.translate(58, 3.5, 12)
  parts.push(paint(yard, '#5d6268'))

  // Und der Brennstoffberg: eine flache Halde, die sagt, womit hier geheizt wird.
  const heap = new THREE.ConeGeometry(26, 13, 7)
  heap.translate(-74, 6.5, 6)
  parts.push(paint(heap, '#4a453f'))

  return merge(parts)
}

/**
 * Ein Hochspannungsmast, so weit vereinfacht, wie er aus der Ferne aussieht.
 *
 * Ein echter Mast ist ein Fachwerk aus hunderten Winkeln. Nachgebaut wären das tausende Dreiecke je
 * Stück, und auf achthundert Metern ist davon ein graues Kreuz übrig. Also ist er gleich ein graues
 * Kreuz: ein sich verjüngender Schaft und zwei Traversen, 44 Dreiecke.
 */
export function pylon(): THREE.BufferGeometry {
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
