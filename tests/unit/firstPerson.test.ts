import type { CityBuildings } from '../../app/rendering/world/structures/buildings'
import type { Relief } from '../../app/world/relief'
import * as THREE from 'three/webgpu'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Wie sich das Gehen **anfühlt**, als Zahl.
 *
 * Vier Meldungen hintereinander zu diesem Modus, und alle vier waren Gefühl: „kann mich kaum
 * bewegen", „fühlt sich nicht smooth an", „der Sprung ist zu niedrig", „mit Shift immer noch lame".
 * Jede davon hat eine Größe dahinter — Endgeschwindigkeit, Anlaufzeit, Sprunghöhe —, und jede davon
 * lässt sich messen, statt sie im Browser zu erfahren. Genau das tut diese Datei: sie lässt eine
 * Person zwei Sekunden lang geradeaus laufen und springen und schaut nach, wie weit sie kommt.
 *
 * Die zweite Hälfte prüft das Umsehen, und die hat einen anderen Grund: die Zeigersperre war die
 * einzige Art, den Kopf zu drehen, und wenn der Browser sie nicht gibt, stand man bewegungsunfähig
 * in der Stadt. Der gezogene Knopf ist der Ausweg, und er ist nur dann einer, wenn er ohne Sperre
 * funktioniert — hier steht die Sperre deshalb nie zur Verfügung.
 */

interface Listeners { [type: string]: ((event: unknown) => void)[] }

function bus(): { listeners: Listeners, addEventListener: (type: string, handler: (event: unknown) => void) => void, removeEventListener: () => void } {
  const listeners: Listeners = {}
  return {
    listeners,
    addEventListener: (type, handler) => {
      (listeners[type] ??= []).push(handler)
    },
    removeEventListener: () => {},
  }
}

function fire(listeners: Listeners, type: string, event: Record<string, unknown>): void {
  for (const handler of listeners[type] ?? [])
    handler(event)
}

/** Eine Stadt ohne ein einziges Haus. Kollision wird woanders geprüft; hier geht es um das Tempo. */
const EMPTY: CityBuildings = {
  buildingMeshes: [],
  buildingRecords: new Map(),
  buildingRanges: new Map(),
  buildingOfTriangle: new Map(),
  buildingBoxes: new Map(),
  shopSeats: [],
  buildingColors: new Map(),
  buildingMaterials: [],
}

/** Ebenes Gelände auf null. Ein Hang würde die Sprunghöhe verfälschen, und darum geht es hier. */
const FLAT = { height: () => 0 } as unknown as Relief

const FRAME = 1 / 120

async function walker(): Promise<{
  walk: import('../../app/rendering/firstPerson').WalkAbout
  camera: THREE.PerspectiveCamera
  keys: Listeners
  pointer: Listeners
  run: (seconds: number) => void
}> {
  const keyboard = bus()
  const pointer = bus()
  const canvas = {
    ...pointer,
    requestPointerLock: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  }

  Object.assign(globalThis, {
    window: keyboard,
    document: { ...bus(), pointerLockElement: null, exitPointerLock: () => {} },
  })

  const { WalkAbout } = await import('../../app/rendering/firstPerson')
  const camera = new THREE.PerspectiveCamera()
  const walk = new WalkAbout(canvas as unknown as HTMLCanvasElement, camera, FLAT, EMPTY)
  walk.enter(new THREE.Vector3(0, 0, 0))

  return {
    walk,
    camera,
    keys: keyboard.listeners,
    pointer: pointer.listeners,
    run: (seconds: number) => {
      for (let frame = 0; frame < Math.round(seconds / FRAME); frame += 1)
        walk.update(FRAME)
    },
  }
}

describe('zu Fuß durch Lindenhafen', () => {
  let stage: Awaited<ReturnType<typeof walker>>

  beforeEach(async () => {
    stage = await walker()
  })

  it('geht schneller, als ein Mensch geht — eine Straße ist sechzig Meter lang', () => {
    const from = stage.camera.position.clone()
    fire(stage.keys, 'keydown', { code: 'KeyW', repeat: false, preventDefault: () => {} })
    stage.run(2)
    const far = Math.hypot(stage.camera.position.x - from.x, stage.camera.position.z - from.z)
    // Zwei Sekunden Gehen: gut zwölf Meter, also ein knappes Viertel einer Straße.
    expect(far).toBeGreaterThan(11)
  })

  it('rennt mit Shift deutlich schneller, und nicht nur ein bisschen', () => {
    const from = stage.camera.position.clone()
    fire(stage.keys, 'keydown', { code: 'KeyW', repeat: false, preventDefault: () => {} })
    fire(stage.keys, 'keydown', { code: 'ShiftLeft', repeat: false, preventDefault: () => {} })
    stage.run(2)
    const far = Math.hypot(stage.camera.position.x - from.x, stage.camera.position.z - from.z)
    // Über dreißig Meter in zwei Sekunden: vom Rathaus zum Hafen dauert dann keine zwei Minuten.
    expect(far).toBeGreaterThan(31)
  })

  /**
   * Die eigentliche Meldung war „fühlt sich nicht smooth an", und die sitzt hier: nicht in der
   * Endgeschwindigkeit, sondern darin, wie lange es dauert, bis sie da ist.
   */
  it('ist nach einer Zehntelsekunde schon fast auf Tempo', () => {
    fire(stage.keys, 'keydown', { code: 'KeyW', repeat: false, preventDefault: () => {} })
    stage.run(0.1)
    const start = stage.camera.position.clone()
    stage.run(0.1)
    const speed = Math.hypot(stage.camera.position.x - start.x, stage.camera.position.z - start.z) / 0.1
    expect(speed).toBeGreaterThan(6)
  })

  it('springt auf eine Freitreppe und nicht über einen Bordstein', () => {
    const floor = stage.camera.position.y
    fire(stage.keys, 'keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
    let highest = floor
    for (let frame = 0; frame < 120; frame += 1) {
      stage.walk.update(FRAME)
      highest = Math.max(highest, stage.camera.position.y)
    }
    expect(highest - floor).toBeGreaterThan(1.5)
  })

  it('kommt mit dem zweiten Sprung an eine Kaimauer heran', () => {
    const floor = stage.camera.position.y
    fire(stage.keys, 'keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
    let highest = floor
    for (let frame = 0; frame < 200; frame += 1) {
      stage.walk.update(FRAME)
      // Am Scheitel des ersten Sprungs noch einmal, so wie man es auch spielen würde.
      if (frame === 48)
        fire(stage.keys, 'keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
      highest = Math.max(highest, stage.camera.position.y)
    }
    expect(highest - floor).toBeGreaterThan(2.6)
  })

  /** Zwei Sprünge und kein dritter, auch wenn jemand die Taste hämmert — sonst ist das ein Flug. */
  it('lässt sich nicht in den Himmel hämmern', () => {
    const floor = stage.camera.position.y
    let highest = floor
    for (let frame = 0; frame < 200; frame += 1) {
      fire(stage.keys, 'keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
      fire(stage.keys, 'keyup', { code: 'Space' })
      stage.walk.update(FRAME)
      highest = Math.max(highest, stage.camera.position.y)
    }
    expect(highest - floor).toBeLessThan(3.6)
  })

  /**
   * Und die gehaltene Taste ist ein Sprung und kein Trampolin.
   *
   * Vorher stand dort `held.has('Space')`, also der **Zustand** statt der Flanke: wer die Taste
   * liegen ließ, hüpfte bei jeder Bodenberührung sofort wieder los. Mit dem zweiten Sprung wäre
   * daraus ein Aufstieg geworden.
   */
  it('hüpft nicht weiter, solange die Taste gehalten wird', () => {
    const floor = stage.camera.position.y
    fire(stage.keys, 'keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
    for (let frame = 0; frame < 300; frame += 1) {
      fire(stage.keys, 'keydown', { code: 'Space', repeat: true, preventDefault: () => {} })
      stage.walk.update(FRAME)
    }
    expect(stage.camera.position.y).toBeCloseTo(floor, 5)
  })

  it('kommt wieder auf dem Boden an', () => {
    const floor = stage.camera.position.y
    fire(stage.keys, 'keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
    fire(stage.keys, 'keyup', { code: 'Space' })
    for (let frame = 0; frame < 300; frame += 1)
      stage.walk.update(FRAME)
    expect(stage.camera.position.y).toBeCloseTo(floor, 5)
  })

  /**
   * Ohne Zeigersperre — genau der Fall, in dem der Modus vorher blind war.
   */
  it('dreht den Kopf beim Ziehen, auch ohne Zeigersperre', () => {
    const before = stage.walk.state.yaw
    fire(stage.pointer, 'pointermove', { pointerId: 1, movementX: 100, movementY: 0, clientX: 100, clientY: 0 })
    expect(stage.walk.state.yaw).toBe(before)

    fire(stage.pointer, 'pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fire(stage.pointer, 'pointermove', { pointerId: 1, movementX: 100, movementY: 0, clientX: 100, clientY: 0 })
    expect(stage.walk.state.yaw).not.toBe(before)

    const turned = stage.walk.state.yaw
    fire(stage.pointer, 'pointerup', { pointerId: 1, button: 0, clientX: 100, clientY: 0 })
    fire(stage.pointer, 'pointermove', { pointerId: 1, movementX: 100, movementY: 0, clientX: 200, clientY: 0 })
    expect(stage.walk.state.yaw).toBe(turned)
  })

  it('kippt den Blick nicht über den Scheitel', () => {
    fire(stage.pointer, 'pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fire(stage.pointer, 'pointermove', { pointerId: 1, movementX: 0, movementY: -100_000, clientX: 0, clientY: 0 })
    expect(stage.walk.state.pitch).toBeLessThan(Math.PI / 2)
    fire(stage.pointer, 'pointermove', { pointerId: 1, movementX: 0, movementY: 200_000, clientX: 0, clientY: 0 })
    expect(stage.walk.state.pitch).toBeGreaterThan(-Math.PI / 2)
  })
})
