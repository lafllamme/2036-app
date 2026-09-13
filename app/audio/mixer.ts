/**
 * Who is allowed to be heard, and how loudly, at any given moment.
 *
 * There are three instruments in this game and until now there was no mixer: the interface cues, the
 * city's own noise and the score each took the player's volume setting and played at it. That is not
 * a mix, it is three things shouting, and it gets worse exactly where the game is most interesting —
 * down in the street at rush hour with a siren going past, which is the moment all three are at
 * their loudest at once.
 *
 * So one place decides, and it decides from where the listener is standing:
 *
 * - **at street level the city wins.** Traffic, footsteps and horns are what being down there is,
 *   and the score steps back to make room for them. It does not stop — it becomes the thing under
 *   the noise rather than the thing over it;
 * - **from the strategic camera the score wins**, because there is nothing else up there. The city
 *   already fades its own traffic out with distance; without the music the overview is silence;
 * - **a siren beats everything.** It is the one sound in the city that is supposed to cut through,
 *   and it only works if the things around it get out of its way;
 * - **the interface is never ducked.** A cue is the sound of something the player just did, and a
 *   confirmation you cannot hear is worse than no confirmation.
 *
 * The balance itself is a pure function of what the listener can see and hear, which is what makes
 * it something that can be reasoned about and tested rather than tuned by ear until it stops being
 * annoying in the one place it was tested.
 */

import { useAudioBus } from './AudioBus'
import { useCityAmbience } from './cityAmbience'
import { useCityScore } from './cityScore'

/** What the listener's situation is. Everything the balance is decided from. */
export interface Listening {
  /** How far the camera is from what it is looking at, in metres. */
  cameraDistance: number
  /** How far the nearest siren is, in metres, or Infinity when none is out. */
  nearestSiren: number
}

/** What each instrument may play at, as a share of the player's own volume. */
export interface Balance {
  cues: number
  ambience: number
  score: number
}

/**
 * Where the street ends and the map begins.
 *
 * Below the first the player is in the city; above the second they are looking at it. The crossfade
 * between the two is the whole mix, and it is deliberately long — a balance that switches at a
 * threshold is something the player hears happening every time they zoom.
 */
const STREET = 260
const MAP = 1_500

/** How far a siren has to be to stop mattering. Matches the range the ambience can be heard over. */
const SIREN_RANGE = 200

/**
 * How much of itself each instrument keeps at its worst.
 *
 * The score is never silenced, only moved underneath: a mix where something disappears entirely is
 * one the player notices, and the point of all of this is that they should not.
 */
const SCORE_IN_STREET = 0.42
const SCORE_UNDER_SIREN = 0.35
const AMBIENCE_FLOOR = 1

/** The score is quieter than the city in general, because it is the thing that never stops. */
const SCORE_SHARE = 0.55

export function balanceFor(listening: Listening): Balance {
  /*
   * How much the listener is *in* the city rather than looking at it. One at street level, nought
   * from the map, and a smooth curve between — smoothstep rather than a straight line so neither end
   * has a corner in it.
   */
  const presence = 1 - smoothstep(STREET, MAP, listening.cameraDistance)

  /*
   * How close the nearest siren is, on the same scale. A siren beyond the range the ambience can
   * carry it is not a siren the player can hear, and ducking for one would be ducking for nothing.
   */
  const siren = Number.isFinite(listening.nearestSiren)
    ? 1 - smoothstep(0, SIREN_RANGE, listening.nearestSiren)
    : 0

  return {
    // Never touched. The player pressed something and has to hear that they did.
    cues: 1,
    ambience: AMBIENCE_FLOOR,
    /*
     * Down in the street, and further down under a siren. The two multiply rather than adding,
     * because a siren in the street should not take the score below where either alone would.
     */
    score: SCORE_SHARE
      * (1 - (1 - SCORE_IN_STREET) * presence)
      * (1 - (1 - SCORE_UNDER_SIREN) * siren),
  }
}

/** A curve from nought to one between two bounds, flat at both ends. */
function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/**
 * The mixer itself: the one thing that talks to all three instruments.
 *
 * It holds two numbers that are deliberately kept apart. The player's volume is theirs and is never
 * touched by anything here; the balance is the game's and changes several times a second. Each
 * instrument is told the product, which is the only number it has ever needed to know.
 *
 * Nothing is applied unless it has actually changed by enough to hear, because every one of these
 * calls schedules a ramp on an audio parameter and doing that thirty times a second for a value that
 * has not moved is work for nothing.
 */
export class CityMixer {
  private enabled = true
  private volume = 1
  private applied: Balance = { cues: -1, ambience: -1, score: -1 }

  constructor(
    private readonly instruments: {
      cues: { setEnabled: (on: boolean) => void, setVolume: (level: number) => void }
      ambience: { setEnabled: (on: boolean) => void, setVolume: (level: number) => void }
      score: { setEnabled: (on: boolean) => void, setVolume: (level: number) => void }
    },
  ) {}

  /** The player's own switch and slider. Everything else is the game's business. */
  setPreference(enabled: boolean, volume: number): void {
    this.enabled = enabled
    this.volume = volume
    for (const instrument of Object.values(this.instruments)) instrument.setEnabled(enabled)
    this.applied = { cues: -1, ambience: -1, score: -1 }
    this.listen({ cameraDistance: MAP, nearestSiren: Number.POSITIVE_INFINITY })
  }

  /** Where the listener is, and so who gets to be heard. Called on the renderer's slow clock. */
  listen(listening: Listening): void {
    const balance = balanceFor(listening)
    this.set('cues', balance.cues)
    this.set('ambience', balance.ambience)
    this.set('score', balance.score)
  }

  private set(which: keyof Balance, share: number): void {
    // A twentieth is below what anyone can hear as a change; anything smaller is a wasted ramp.
    if (Math.abs(share - this.applied[which]) < 0.02)
      return
    this.applied[which] = share
    this.instruments[which].setVolume(this.enabled ? this.volume * share : 0)
  }
}

let mixer: CityMixer | null = null

/**
 * One mixer for the session, holding the three instruments the game actually has.
 *
 * This is the only place that knows there are three of them, which is the point: everything else
 * either makes a sound or says where the listener is standing, and nothing else has to hold both
 * facts at once.
 */
export function useCityMixer(): CityMixer {
  mixer ??= new CityMixer({
    cues: useAudioBus(),
    ambience: useCityAmbience(),
    score: useCityScore(),
  })
  return mixer
}
