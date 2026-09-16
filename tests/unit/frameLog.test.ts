import { describe, expect, it } from 'vitest'
import { FrameLog, LONG_FRAME_MS } from '../../app/rendering/frameLog'

/**
 * Was dieser Test festhält, ist der Grund, warum es das Ding überhaupt gibt: **der Durchschnitt
 * verbirgt den Ruckler.** Sechzig kurze Frames und ein langer ergeben zusammen eine gute Bildrate
 * und ein schlechtes Spielgefühl, und nur die Verteilung sagt das.
 */

describe('frame-protokoll', () => {
  it('nennt den Ausreißer, den der Durchschnitt verschluckt', () => {
    const log = new FrameLog()
    for (let i = 0; i < 60; i += 1) log.add(1.4, 1)
    log.add(87, 86.5)

    const stats = log.stats()
    expect(stats.frames).toBe(61)
    expect(stats.median).toBe(1.4)
    expect(stats.longest).toBe(87)
    expect(stats.long).toBe(1)
    // Der Mittelwert läge bei 2,8 ms — also bei über 350 Bildern je Sekunde. Sagt nichts.
    expect(stats.median).toBeLessThan(2)
  })

  it('trennt, was wir rechnen, von dem, was der Renderer tut', () => {
    const log = new FrameLog()
    log.add(10, 8)
    log.add(10, 8)
    const stats = log.stats()
    expect(stats.render).toBe(8)
    expect(stats.update).toBe(2)
  })

  it('vergisst die ältesten Frames, statt den Speicher zu füllen', () => {
    const log = new FrameLog(4)
    for (const value of [1, 1, 1, 1, 50, 50, 50, 50]) log.add(value, 0)
    const stats = log.stats()
    expect(stats.frames).toBe(4)
    // Nur noch die vier neuen; die vier alten sind überschrieben.
    expect(stats.median).toBe(50)
  })

  it('antwortet auf ein leeres Protokoll mit Nullen statt mit NaN', () => {
    expect(new FrameLog().stats()).toMatchObject({ frames: 0, median: 0, longest: 0, long: 0 })
  })

  it('zählt einen Frage-Frame erst ab der Ruckelgrenze', () => {
    const log = new FrameLog()
    log.add(LONG_FRAME_MS, 0)
    log.add(LONG_FRAME_MS + 0.1, 0)
    expect(log.stats().long).toBe(1)
  })
})
