import type { CityBlueprint } from '../../../core/contracts'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../../core/rng'
import { AXIS_Y } from '../../shared'
import { WATER_LEVEL } from '../terrain/water'
import { merge, paint } from './handBuilt'

/**
 * Windparks im Umland.
 *
 * Das offene Land um Lindenhafen war leer, und der Reflex dagegen ist, mehr Kleinzeug hineinzulegen.
 * Das ist der falsche Reflex: aus zweitausend Metern liest man keine Grasbüschel, keine Zäune und
 * keine Ackerfarben. Was man aus dieser Entfernung liest, ist **Silhouette**, und dafür muss ein
 * Ding dreißig bis zweihundert Meter hoch sein. Davon stand dort nichts.
 *
 * Ein Windrad ist genau das, und es ist für diese Gegend auch das Richtige — Mecklenburg-Vorpommern
 * hat die höchste Windkraftdichte Deutschlands, und kein Blick über diese Landschaft kommt ohne aus.
 * Es kostet fast nichts: ein sich verjüngendes Rohr, eine Gondel, drei Flügel, zusammen 76 Dreiecke,
 * und der ganze Park ist **zwei Draws**.
 *
 * Getrennt in Turm und Rotor, weil sich nur der Rotor dreht. Der Turm steht in einer Instanzmatrix,
 * die nie wieder angefasst wird; der Rotor bekommt seine im langsamen Takt, fünfmal die Sekunde. Bei
 * knapp sechzig Rädern sind das dreihundert Matrizen je Sekunde, und das ist nichts.
 */

/** Wie viele Parks, und wie viele Räder in einem. Ein einzelnes Windrad steht nirgends allein. */
const FARM_COUNT = 9
const TURBINES_MIN = 5
const TURBINES_MAX = 9
/** Abstand innerhalb eines Parks. Real stehen sie vier bis sieben Rotordurchmesser auseinander. */
const SPACING = 430

/**
 * Wo ein Park stehen darf: draußen, aber nicht jenseits des Dunstes.
 *
 * Innen ist die Stadt, außen frisst der Nebel (`FogExp2` mit 0,00021 — bei acht Kilometern sind
 * sechs Prozent übrig). Ein Park hinter dieser Grenze wäre Geometrie, die niemand je sieht.
 */
const RING_INNER = 2_300
const RING_OUTER = 5_200
/** Abstand zum nächsten Gebäude. Niemand stellt ein Windrad in den Vorgarten. */
const CLEAR_OF_BUILDINGS = 190

/** Maße eines heutigen Binnenland-Rades: Nabe auf 112 m, Flügel 54 m, Spitze also knapp unter 170 m. */
export const HUB_HEIGHT = 112
export const BLADE_LENGTH = 54
const TOWER_FOOT = 2.3
const TOWER_HEAD = 1.35

/** Wie schnell sich der Rotor dreht, in Umdrehungen je Sekunde, bei Flaute und bei Sturm. */
const SPIN_CALM = 0.035
const SPIN_GALE = 0.16

export interface WindFarm {
  towers: THREE.InstancedMesh
  rotors: THREE.InstancedMesh
  /** Je Rad: wo die Nabe sitzt, wohin es schaut und mit welchem Versatz sein Rotor steht. */
  hubs: { x: number, y: number, z: number, yaw: number, phase: number }[]
}

export function addWindFarms(scene: THREE.Scene, blueprint: CityBlueprint): WindFarm | null {
  const rng = createRandomStream(blueprint.definition.seed, 'windfarm')
  const near = buildingGrid(blueprint)
  const hubs: WindFarm['hubs'] = []

  for (let farm = 0; farm < FARM_COUNT; farm += 1) {
    const anchor = findSite(rng, blueprint, near)
    if (!anchor)
      continue
    /*
     * Zwei versetzte Reihen quer zur Windrichtung, nicht ein Haufen. Ein Windpark wird so geplant,
     * dass kein Rad im Windschatten des anderen steht, und aus der Ferne ist genau diese Ordnung
     * das, was ihn als Anlage und nicht als Zufall lesen lässt.
     */
    const count = Math.floor(rng.between(TURBINES_MIN, TURBINES_MAX + 1))
    const bearing = rng.next() * Math.PI * 2
    const yaw = bearing + Math.PI / 2 + rng.between(-0.3, 0.3)

    for (let index = 0; index < count; index += 1) {
      const row = index % 2
      const along = (Math.floor(index / 2) - count / 4) * SPACING + row * SPACING * 0.5
      const x = anchor.x + Math.cos(bearing) * along + Math.sin(bearing) * row * SPACING * 0.75
      const z = anchor.z + Math.sin(bearing) * along - Math.cos(bearing) * row * SPACING * 0.75
      const ground = blueprint.relief.height(x, z)
      if (ground < WATER_LEVEL + 0.5 || near(x, z, CLEAR_OF_BUILDINGS))
        continue
      hubs.push({ x, y: ground + HUB_HEIGHT, z, yaw, phase: rng.next() * Math.PI * 2 })
    }
  }

  if (hubs.length === 0)
    return null

  const skin = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.06 })
  const towers = new THREE.InstancedMesh(tower(), skin(), hubs.length)
  const rotors = new THREE.InstancedMesh(rotor(), skin(), hubs.length)
  for (const mesh of [towers, rotors]) {
    /*
     * Kein Schatten. Ein Turm von 112 Metern wirft einen Schatten über den halben Schattenatlas und
     * verliert dem Rest der Stadt die Auflösung, die er dort gewinnt — und er steht ohnehin so weit
     * draußen, dass sein Schatten auf leeres Feld fiele.
     */
    mesh.castShadow = false
    mesh.receiveShadow = false
    scene.add(mesh)
  }
  /*
   * Der Rotor wird nie weggeschnitten. Seine Instanzmatrizen stehen beim ersten Bild noch auf Null,
   * three berechnet die Hüllkugel daraus — und schneidet den ganzen Park danach überall weg, wo der
   * Kartenmittelpunkt nicht im Bild ist. Gemessen: nackte Masten ohne Rotor, aus jeder Richtung.
   */
  rotors.frustumCulled = false

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  hubs.forEach((hub, index) => {
    quaternion.setFromAxisAngle(AXIS_Y, hub.yaw)
    matrix.compose(position.set(hub.x, hub.y - HUB_HEIGHT, hub.z), quaternion, scale)
    towers.setMatrixAt(index, matrix)
  })
  towers.instanceMatrix.needsUpdate = true
  towers.computeBoundingSphere()

  return { towers, rotors, hubs }
}

/** Scratch, wie überall in den Platzierungsschleifen: ein Vektor je Rad wäre ein Vektor je Rad. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const spinQuaternion = /* @__PURE__ */ new THREE.Quaternion()
const yawQuaternion = /* @__PURE__ */ new THREE.Quaternion()
const hubPosition = /* @__PURE__ */ new THREE.Vector3()
const unitScale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
/** Die Achse, um die sich ein Rotor dreht: nach dem Gieren die eigene Blickrichtung des Rades. */
const SPIN_AXIS = /* @__PURE__ */ new THREE.Vector3(0, 0, 1)

/**
 * Die Rotoren weiterdrehen.
 *
 * Läuft im langsamen Takt mit, nicht je Frame: ein Rotor braucht bei Flaute fast dreißig Sekunden je
 * Umdrehung, und fünf Stützstellen in der Sekunde sind dafür mehr als genug.
 */
export function updateWindFarms(farm: WindFarm | null, elapsed: number, wind: number): void {
  if (!farm)
    return
  const turns = SPIN_CALM + (SPIN_GALE - SPIN_CALM) * Math.min(1, Math.max(0, wind))
  const angle = elapsed * turns * Math.PI * 2

  farm.hubs.forEach((hub, index) => {
    yawQuaternion.setFromAxisAngle(AXIS_Y, hub.yaw)
    spinQuaternion.setFromAxisAngle(SPIN_AXIS, angle + hub.phase)
    matrix.compose(hubPosition.set(hub.x, hub.y, hub.z), yawQuaternion.multiply(spinQuaternion), unitScale)
    farm.rotors.setMatrixAt(index, matrix)
  })
  farm.rotors.instanceMatrix.needsUpdate = true
}

/**
 * Ein freier Platz im Ring, oder nichts.
 *
 * Bewusst mit fester Versuchszahl statt mit einer Schleife, die so lange sucht, bis sie etwas
 * findet: wenn der Ring eines Tages zugebaut ist, soll der Weltaufbau nicht hängen, sondern einen
 * Park weniger haben.
 */
function findSite(
  rng: ReturnType<typeof createRandomStream>,
  blueprint: CityBlueprint,
  near: (x: number, z: number, radius: number) => boolean,
): { x: number, z: number } | null {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const bearing = rng.next() * Math.PI * 2
    const away = RING_INNER + Math.sqrt(rng.next()) * (RING_OUTER - RING_INNER)
    const x = Math.cos(bearing) * away
    const z = Math.sin(bearing) * away
    if (blueprint.relief.height(x, z) < WATER_LEVEL + 0.5)
      continue
    // Der ganze Park braucht Luft, nicht nur sein Mittelpunkt.
    if (near(x, z, CLEAR_OF_BUILDINGS + SPACING))
      continue
    return { x, z }
  }
  return null
}

/**
 * „Steht hier in der Nähe ein Haus?", ohne über alle Häuser zu laufen.
 *
 * Es sind rund achttausend, und die Frage wird ein paar hundert Mal gestellt. Über eine
 * Zweihundert-Meter-Zellkarte ist sie ein Blick in neun Zellen.
 */
function buildingGrid(blueprint: CityBlueprint): (x: number, z: number, radius: number) => boolean {
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
 * Der Turm, mit dem Fuß im Boden und der Gondel obendrauf.
 *
 * Acht Seiten, offen an beiden Enden: ein Rohr, das man nie von oben und nie von unten sieht,
 * braucht weder Deckel noch Boden. Das sind 16 Dreiecke für 112 Meter Höhe.
 */
export function tower(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const shaft = new THREE.CylinderGeometry(TOWER_HEAD, TOWER_FOOT, HUB_HEIGHT, 8, 1, true)
  shaft.translate(0, HUB_HEIGHT / 2, 0)
  parts.push(paint(shaft, '#e4e6e2'))

  // Die Gondel: ein Kasten hinter der Nabe, in dem Getriebe und Generator sitzen.
  const nacelle = new THREE.BoxGeometry(2.6, 2.8, 9.5)
  nacelle.translate(0, HUB_HEIGHT, -2.2)
  parts.push(paint(nacelle, '#d8dad6'))

  return merge(parts)
}

/**
 * Der Rotor: Nabe und drei Flügel, mit dem Nullpunkt in der Nabe.
 *
 * Der Nullpunkt ist der Punkt: er ist die Drehachse, und deshalb ist das Drehen eine Quaternion und
 * keine Rechnung. Ein Flügel ist ein Kasten, der nach außen schmal und dünn wird — was ein
 * Rotorblatt aus mehr als hundert Metern ist.
 */
export function rotor(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const hub = new THREE.ConeGeometry(1.5, 3, 8)
  hub.rotateX(Math.PI / 2)
  hub.translate(0, 0, 1.5)
  parts.push(paint(hub, '#d8dad6'))

  for (let blade = 0; blade < 3; blade += 1) {
    /*
     * Lang in X, nicht in Z. Die Drehachse ist Z, also muss ein Blatt **quer** dazu liegen — beim
     * ersten Versuch lag seine lange Kante auf der Achse, und drei Blätter zeigten geradeaus nach
     * vorn statt nach außen. Gezeichnet wurde das als drei nackte Masten ohne Rotor.
     */
    const geometry = new THREE.BoxGeometry(BLADE_LENGTH, 3.4, 0.9)
    const position = geometry.attributes.position as THREE.BufferAttribute
    for (let index = 0; index < position.count; index += 1) {
      // Zur Spitze hin schmal und dünn, und dabei leicht verwunden — ein Blatt ist kein Brett.
      if (position.getX(index) > 0) {
        position.setY(index, position.getY(index) * 0.22)
        position.setZ(index, position.getZ(index) * 0.3 + position.getY(index) * 0.35)
      }
    }
    geometry.computeVertexNormals()
    geometry.translate(BLADE_LENGTH / 2 + 1.2, 0, 0)
    geometry.rotateZ((blade * Math.PI * 2) / 3)
    parts.push(paint(geometry, '#eceeea'))
  }

  return merge(parts)
}
