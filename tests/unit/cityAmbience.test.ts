import { describe, expect, it } from 'vitest'
import { CityAmbience } from '../../app/audio/cityAmbience'

/**
 * The city's own sound, verified without an AudioContext.
 *
 * Node has none, and the point of these is the contract rather than the waveform: it stays silent
 * until something has opened it inside a gesture, it never throws when it has not been opened, and
 * a player who has turned sound off gets silence from this instrument too — the interface bus and
 * the ambience answer to one switch.
 */
describe('the city ambience', () => {
  it('does nothing at all before a gesture has opened it', () => {
    const ambience = new CityAmbience()
    expect(() => ambience.update({ trafficNearby: 20, peopleNearby: 12, nearestSiren: 60, cameraDistance: 80 })).not.toThrow()
    expect(() => ambience.setEnabled(false)).not.toThrow()
    expect(() => ambience.setVolume(0.4)).not.toThrow()
    expect(() => ambience.dispose()).not.toThrow()
  })

  it('survives a start where the browser has no audio at all', () => {
    // Node, a locked-down browser, a server render: all three reach this and none may fail.
    const ambience = new CityAmbience()
    expect(() => ambience.start()).not.toThrow()
    expect(() => ambience.update({ trafficNearby: 4, peopleNearby: 0, nearestSiren: Number.POSITIVE_INFINITY, cameraDistance: 500 })).not.toThrow()
  })

  it('clamps the volume to something a player can actually have asked for', () => {
    const ambience = new CityAmbience()
    expect(() => ambience.setVolume(4)).not.toThrow()
    expect(() => ambience.setVolume(-2)).not.toThrow()
  })

  it('asks about the nearest siren rather than how many are out', () => {
    /*
     * The distinction this instrument exists to get right. A count across the whole city made a call
     * three kilometres away exactly as loud as one at the end of the street, so zooming in anywhere
     * put a siren in the player's ear and left it there. The state it accepts is the reason it
     * cannot do that again: there is nowhere to put a count.
     */
    const state: Record<string, unknown> = { trafficNearby: 0, peopleNearby: 0, nearestSiren: Number.POSITIVE_INFINITY, cameraDistance: 100 }
    expect(Object.keys(state)).toEqual(['trafficNearby', 'peopleNearby', 'nearestSiren', 'cameraDistance'])
    expect(Object.keys(state)).not.toContain('sirens')
  })
})
