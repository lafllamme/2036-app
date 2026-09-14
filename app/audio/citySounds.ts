/**
 * Every recorded sound the city makes, and what each one is for.
 *
 * One table, in one place. Everything else in the audio layer names a sound from here rather than a
 * path, so adding a sound is one entry and replacing one is one line — and so that the question
 * "what does the city actually play, and when?" has an answer you can read in under a minute rather
 * than assembling out of five files.
 *
 * Why recordings at all, when everything else in this project is synthesised. A city bed is the one
 * thing synthesis reliably loses at, and the reason is structural rather than a matter of effort: a
 * real street is thousands of overlapping transients — tyres, footsteps, a door, a distant voice —
 * and filtered noise can only ever be a texture. Any modulation put on that texture to stop it
 * sitting still has a period, and anything periodic in a sound that never stops is the first thing
 * an ear finds and the last thing it lets go of. Two versions of this were repaired for exactly that
 * before the conclusion was accepted.
 *
 * What stays synthesised is what has to answer to the game: the siren steps between two notes and is
 * placed by how far the nearest call is, and the score is written as it plays. See `cityScore.ts`.
 *
 * Licences and sources: `public/audio/city/LICENSE.md`. All CC0, each verified individually.
 */

/** How a sound is used, which decides how it is loaded and played. */
export type SoundRole
  /** A bed: loops for ever, faded in and out against the others by what is near the listener. */
  = | 'bed'
  /** A one-shot: started when something happens and left to finish. */
    | 'event'

export interface CitySound {
  /** What it is, in the words the rest of the code uses. */
  id: CitySoundId
  file: string
  role: SoundRole
  /** Its level at full strength, before any fading. Measured by ear against the interface cues. */
  gain: number
  /** What it is for, in one line. This is documentation that cannot drift from the table. */
  purpose: string
}

export type CitySoundId = 'traffic' | 'crowd' | 'park' | 'pass' | 'horn'

const BASE = '/audio/city'

export const CITY_SOUNDS: Record<CitySoundId, CitySound> = {
  traffic: {
    id: 'traffic',
    file: `${BASE}/traffic.ogg`,
    role: 'bed',
    gain: 0.5,
    purpose: 'The road. Rises with how many vehicles are moving within earshot of the camera.',
  },
  crowd: {
    id: 'crowd',
    file: `${BASE}/crowd.ogg`,
    role: 'bed',
    gain: 0.34,
    purpose: 'People. Rises with how many are walking within earshot, which is a much shorter one.',
  },
  park: {
    id: 'park',
    file: `${BASE}/park.ogg`,
    role: 'bed',
    gain: 0.3,
    purpose: 'Birds and leaves. What is left when a street has neither traffic nor people on it.',
  },
  pass: {
    id: 'pass',
    file: `${BASE}/pass.ogg`,
    role: 'event',
    gain: 0.42,
    purpose: 'A single vehicle going by. Fired at intervals that shorten as the street gets busier.',
  },
  horn: {
    id: 'horn',
    file: `${BASE}/horn.ogg`,
    role: 'event',
    gain: 0.3,
    purpose: 'A horn. Rare, and only where there is enough traffic for somebody to be annoyed.',
  },
}

/** Every bed, in the order they are layered. */
export const BEDS: CitySoundId[] = ['park', 'traffic', 'crowd']

/**
 * Fetch and decode one sound.
 *
 * Decoded into the context that will play it, because an `AudioBuffer` belongs to its context. The
 * whole set is under two megabytes and is fetched once, after the player has opened the sound —
 * which is also the first moment a context exists to decode into.
 */
export async function loadSound(context: AudioContext, sound: CitySound): Promise<AudioBuffer> {
  const response = await fetch(sound.file)
  if (!response.ok)
    throw new Error(`${sound.file}: HTTP ${response.status}`)
  return context.decodeAudioData(await response.arrayBuffer())
}
