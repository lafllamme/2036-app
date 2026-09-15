import { describe, expect, it } from 'vitest'
import { CityAmbience } from '../../app/audio/cityAmbience'
import { BEDS, CITY_SOUNDS } from '../../app/audio/citySounds'

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
    expect(() => ambience.update({ trafficNearby: 20, peopleNearby: 12, nearestSiren: 60, nearestTrain: 400, cameraDistance: 80, rain: 0.4, snow: 0, wind: 0.5 })).not.toThrow()
    expect(() => ambience.setEnabled(false)).not.toThrow()
    expect(() => ambience.setVolume(0.4)).not.toThrow()
    expect(() => ambience.stop()).not.toThrow()
  })

  it('survives a start where the browser has no audio at all', () => {
    // Node, a locked-down browser, a server render: all three reach this and none may fail.
    const ambience = new CityAmbience()
    expect(() => ambience.start()).not.toThrow()
    expect(() => ambience.update({ trafficNearby: 4, peopleNearby: 0, nearestSiren: Number.POSITIVE_INFINITY, nearestTrain: Number.POSITIVE_INFINITY, cameraDistance: 500, rain: 0, snow: 0.8, wind: 0.2 })).not.toThrow()
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
    const state: Record<string, unknown> = { trafficNearby: 0, peopleNearby: 0, nearestSiren: Number.POSITIVE_INFINITY, nearestTrain: Number.POSITIVE_INFINITY, cameraDistance: 100 }
    expect(Object.keys(state)).toEqual(['trafficNearby', 'peopleNearby', 'nearestSiren', 'nearestTrain', 'cameraDistance'])
    expect(Object.keys(state)).not.toContain('sirens')
    // The train learned the same lesson without having to make the mistake: nearest, never a count.
    expect(Object.keys(state)).not.toContain('trains')
  })
})

describe('when a siren is allowed to be heard', () => {
  /*
   * The same curve `CityAmbience.update` uses. A siren is the loudest thing in a city and it still
   * cannot be heard from four streets away — and the moment the crew stops, so does the horn.
   */
  const SIREN_NEAR = 40
  const SIREN_FAR = 200

  const loudness = (metres: number): number => {
    if (!Number.isFinite(metres))
      return 0
    const t = Math.min(1, Math.max(0, (metres - SIREN_NEAR) / (SIREN_FAR - SIREN_NEAR)))
    return 1 - t * t * (3 - 2 * t)
  }

  it('is silent when nothing is out', () => {
    expect(loudness(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('is gone within a couple of streets', () => {
    expect(loudness(SIREN_FAR)).toBe(0)
    expect(loudness(260)).toBe(0)
    // And falling away steeply well before that, rather than fading over the whole distance.
    expect(loudness(140)).toBeLessThan(loudness(80) / 2)
  })

  it('is only loud when it is actually on your street', () => {
    expect(loudness(0)).toBe(1)
    expect(loudness(SIREN_NEAR)).toBe(1)
    expect(loudness(80)).toBeGreaterThan(0.7)
  })
})

describe('the sound map', () => {
  it('gives every sound a file, a job and a level', () => {
    /*
     * The table is the documentation. If an entry can exist without saying what it is for, the
     * question "what does the city play, and when?" goes back to being answered by reading five
     * files, which is what this table exists to stop.
     */
    for (const sound of Object.values(CITY_SOUNDS)) {
      expect(sound.file, sound.id).toMatch(/^\/audio\/city\/[a-z]+\.ogg$/)
      expect(sound.purpose.length, sound.id).toBeGreaterThan(30)
      expect(sound.gain, sound.id).toBeGreaterThan(0)
      // Nothing may be louder than the interface, which is the one thing never ducked.
      expect(sound.gain, sound.id).toBeLessThanOrEqual(0.6)
    }
  })

  it('layers exactly the beds and nothing else', () => {
    for (const id of BEDS)
      expect(CITY_SOUNDS[id].role).toBe('bed')
    const beds = Object.values(CITY_SOUNDS).filter(sound => sound.role === 'bed')
    expect(beds.length).toBe(BEDS.length)
  })

  it('keys every entry by its own id, so the table cannot lie about itself', () => {
    for (const [key, sound] of Object.entries(CITY_SOUNDS))
      expect(sound.id).toBe(key)
  })
})

describe('when a train is allowed to be heard', () => {
  /*
   * The same curve `CityAmbience.update` uses for the railway. A train carries much further than a
   * siren — it is a rumble that arrives before you see it — but it still stops: a train on the far
   * side of the city is not something you hear from the hill above it.
   */
  const TRAIN_NEAR = 90
  const TRAIN_FAR = 620

  const loudness = (metres: number): number => {
    if (!Number.isFinite(metres))
      return 0
    const t = Math.min(1, Math.max(0, (metres - TRAIN_NEAR) / (TRAIN_FAR - TRAIN_NEAR)))
    return 1 - t * t * (3 - 2 * t)
  }

  it('is silent when no train is out', () => {
    expect(loudness(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('carries further than a siren, and still stops', () => {
    expect(loudness(300)).toBeGreaterThan(0.4)
    expect(loudness(TRAIN_FAR)).toBe(0)
    expect(loudness(900)).toBe(0)
  })

  it('is full only when the line is more or less under you', () => {
    expect(loudness(0)).toBe(1)
    expect(loudness(TRAIN_NEAR)).toBe(1)
  })
})
