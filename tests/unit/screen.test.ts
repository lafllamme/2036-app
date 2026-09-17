import * as THREE from 'three/webgpu'
import { beforeEach, describe, expect, it } from 'vitest'
import { project, screenPoint } from '../../app/rendering/screen'

/**
 * Die Projektion von der Stadt auf den Schirm.
 *
 * Der eine Fall, an dem eine solche Funktion fast immer scheitert, ist der Punkt **hinter** der
 * Kamera: er projiziert auf Koordinaten, die vollkommen gültig aussehen, nur am Bildmittelpunkt
 * gespiegelt. Wer das nicht prüft, bekommt eine Marke für ein Haus im Rücken, die vorn im Bild steht,
 * auf der falschen Seite, und beim Drehen in die verkehrte Richtung wandert — und zwar nur manchmal,
 * weshalb man es im Betrieb ewig für ein Gespenst hält.
 */

const WIDTH = 1000
const HEIGHT = 800

describe('projektion', () => {
  let camera: THREE.PerspectiveCamera
  const out = screenPoint()

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 5000)
    // Hundert Meter über dem Ursprung, mit Blick nach unten auf ihn.
    camera.position.set(0, 100, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  })

  it('setzt den Blickpunkt in die Mitte des Bildes', () => {
    project(camera, 0, 0, 0, WIDTH, HEIGHT, out)
    expect(out.onScreen).toBe(true)
    /*
     * Auf ein halbes Pixel genau und nicht auf ein Tausendstel: die Kamera schaut hier senkrecht nach
     * unten, und damit liegt ihre Aufrichtung parallel zur Blickrichtung. `lookAt` löst das über eine
     * winzige Störung auf, die als Rundungsrest im Bild landet — gemessen ein Zwölftelpixel, und
     * nichts, wovon eine Marke wackelt.
     */
    expect(out.x).toBeCloseTo(WIDTH / 2, 0)
    expect(out.y).toBeCloseTo(HEIGHT / 2, 0)
    expect(out.away).toBeCloseTo(100, 3)
  })

  /** Von oben herab ist +x rechts im Bild und −z oben. Wer das dreht, dreht die ganze Karte. */
  it('legt die Richtungen richtig herum', () => {
    project(camera, 20, 0, 0, WIDTH, HEIGHT, out)
    const right = out.x
    project(camera, -20, 0, 0, WIDTH, HEIGHT, out)
    expect(right).toBeGreaterThan(out.x)

    project(camera, 0, 0, -20, WIDTH, HEIGHT, out)
    const far = out.y
    project(camera, 0, 0, 20, WIDTH, HEIGHT, out)
    expect(far).toBeLessThan(out.y)
  })

  it('meldet einen Punkt hinter der Kamera als nicht sichtbar', () => {
    // Kamera auf Augenhöhe, Blick nach −z. Ein Punkt bei +z liegt dann im Rücken.
    camera.position.set(0, 2, 0)
    camera.lookAt(0, 2, -10)
    camera.updateMatrixWorld()
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()

    project(camera, 0, 2, -50, WIDTH, HEIGHT, out)
    expect(out.onScreen).toBe(true)

    project(camera, 0, 2, 50, WIDTH, HEIGHT, out)
    expect(out.onScreen).toBe(false)
  })

  it('meldet einen Punkt weit neben dem Bild als nicht sichtbar', () => {
    project(camera, 4000, 0, 0, WIDTH, HEIGHT, out)
    expect(out.onScreen).toBe(false)
  })

  /** Läuft je Marke und Bild. Ein eigenes Objekt je Aufruf wäre Müll im Renderpfad. */
  it('schreibt in das übergebene Objekt und gibt es zurück', () => {
    const mine = screenPoint()
    expect(project(camera, 0, 0, 0, WIDTH, HEIGHT, mine)).toBe(mine)
    expect(mine.x).toBeCloseTo(WIDTH / 2, 3)
  })
})
