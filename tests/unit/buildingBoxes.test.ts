import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { boxesOf } from '../../app/rendering/world/structures/buildings'

/**
 * Der Kasten je Haus, und warum er einen eigenen Test verdient hat.
 *
 * Diese Kästen sind die Vorauswahl für zwei Dinge: welches Haus unter dem Zeiger liegt, und welche
 * Wand einen im Begehen-Modus aufhält. Sie entstehen aus `ranges`, und `ranges` zählt **Eckpunkte** —
 * die Werte kommen aus `position.length / 3`.
 *
 * Die erste Fassung ist trotzdem durch den Indexpuffer gegangen und hat eine Eckpunktnummer als
 * Indexnummer gelesen. Das Ergebnis war tückisch: es sah funktionierend aus. Der Zeiger traf
 * irgendeinen Kasten, der Cursor wurde zum Zeigefinger, und eingefärbt wurde ein Haus am anderen
 * Ende der Stadt — also dort, wo niemand hinsieht. Vier Wochen lang war die Markierung „irgendwie
 * kaputt", ohne dass ein Test etwas gemerkt hätte.
 *
 * Der Index ist hier deshalb **absichtlich verdreht**: er zeigt in umgekehrter Reihenfolge auf die
 * Eckpunkte. Eine Umsetzung, die ihn benutzt, bekommt damit garantiert die Kiste des anderen Hauses.
 */

/** Zwei Häuser mit bekannten Ecken und einem Indexpuffer, der absichtlich in die Irre führt. */
function twoHouses(): THREE.BufferGeometry {
  /** Haus A um den Ursprung, Haus B hundert Meter weiter — weit genug, dass eine Verwechslung schreit. */
  const corners = [
    [-1, 0, -1],
    [1, 0, -1],
    [1, 8, 1],
    [-1, 8, 1],
    [99, 0, 99],
    [101, 0, 99],
    [101, 4, 101],
    [99, 4, 101],
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3))
  // Verdreht: Indexplatz 0 zeigt auf Eckpunkt 7, Indexplatz 7 auf Eckpunkt 0.
  geometry.setIndex([7, 6, 5, 4, 3, 2, 1, 0])
  return geometry
}

const RANGES = [
  { start: 0, count: 4 },
  { start: 4, count: 4 },
]

describe('gebäudekästen', () => {
  it('umschließt jedes Haus mit seinen eigenen Eckpunkten', () => {
    const [a, b] = boxesOf(twoHouses(), RANGES)

    expect(a!.min.toArray()).toEqual([-1, 0, -1])
    expect(a!.max.toArray()).toEqual([1, 8, 1])
    expect(b!.min.toArray()).toEqual([99, 0, 99])
    expect(b!.max.toArray()).toEqual([101, 4, 101])
  })

  /** Die Probe aufs Exempel: der Punkt mitten in A darf nur in A liegen und nirgends sonst. */
  it('verwechselt die beiden Häuser nicht', () => {
    const [a, b] = boxesOf(twoHouses(), RANGES)
    const inA = new THREE.Vector3(0, 4, 0)
    const inB = new THREE.Vector3(100, 2, 100)

    expect(a!.containsPoint(inA)).toBe(true)
    expect(a!.containsPoint(inB)).toBe(false)
    expect(b!.containsPoint(inB)).toBe(true)
    expect(b!.containsPoint(inA)).toBe(false)
  })

  it('kommt auch ohne Indexpuffer zum selben Ergebnis', () => {
    const geometry = twoHouses()
    const withIndex = boxesOf(geometry, RANGES)
    geometry.setIndex(null)
    const without = boxesOf(geometry, RANGES)

    expect(without[0]!.min.toArray()).toEqual(withIndex[0]!.min.toArray())
    expect(without[1]!.max.toArray()).toEqual(withIndex[1]!.max.toArray())
  })
})
