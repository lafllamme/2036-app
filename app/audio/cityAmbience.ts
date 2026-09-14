import type { CitySound, CitySoundId } from './citySounds'
import { BEDS, CITY_SOUNDS, loadSound } from './citySounds'

/**
 * The sound the city itself makes.
 *
 * Separate from the interface bus on purpose. `AudioBus` plays cues — short, discrete, one per thing
 * the player did. A city does not make cues. It makes a continuous noise that changes with what is
 * near the listener, and "near the listener" is the only thing that matters: the first version of
 * this drove a siren off a city-wide count, so a call three kilometres away was as loud as one at
 * the end of the street.
 *
 * Three beds and two one-shots, all recorded, all CC0 — see `citySounds.ts` for what each is for and
 * `public/audio/city/LICENSE.md` for where it came from. The beds run continuously and are faded
 * against each other: the road rises with the traffic within earshot, the crowd with the people, and
 * what is left where there is neither is birds.
 *
 * Two versions of this were built out of filtered noise before that was given up on, and the reason
 * is worth keeping. Noise through a filter is a texture, and a texture that sits still is heard as a
 * machine within seconds — so it has to be modulated, and every modulation has a period, and
 * anything periodic in a sound that never stops is the first thing an ear finds. The last one was a
 * resonant band sliding up and down every five seconds for as long as anybody played.
 *
 * The siren is still synthesised, and always will be: it steps between two notes and is placed by
 * how far the nearest call is from the camera, which is a thing the game computes and not a thing
 * anyone recorded.
 */

/** The two notes of a German emergency siren, and how long it holds each. */
const SIREN_LOW = 435
const SIREN_HIGH = 580
const SIREN_STEP = 0.65
const SIREN_GAIN = 0.03
/**
 * How close a siren has to be before it can be heard, and where it fades out entirely.
 *
 * Distance to the nearest one, never a count. A siren is the loudest thing in a city and it still
 * cannot be heard from four streets away — and once the crews started actually arriving at their
 * calls they started driving past the player, which turned a rare sound into a constant one.
 */
const SIREN_NEAR = 40
const SIREN_FAR = 200

/** Traffic is a street-level sound: from the strategic camera a city is quiet. */
const TRAFFIC_NEAR = 200
const TRAFFIC_FAR = 1_600
/** How many of each within earshot counts as a street at its busiest. */
const TRAFFIC_FULL = 26
const PEOPLE_FULL = 30
/** How quickly a level follows what it is being asked for, in seconds to close the gap. */
const SMOOTHING = 0.7

/** How often a vehicle goes past, at its busiest and at its quietest, in seconds. */
const PASS_BUSY = 1.4
const PASS_CALM = 7
/** A horn is rare and only where there is traffic to be annoyed by. */
const HORN_CHANCE = 0.055
const HORN_WAIT = 9
/** At most this many one-off sounds at once, so a busy street cannot turn into a wall. */
const VOICE_LIMIT = 5

export interface CityAmbienceState {
  /** How many vehicles are moving within earshot of the camera. */
  trafficNearby: number
  /** How many people are walking within earshot. */
  peopleNearby: number
  /** How far the nearest siren is from the camera in metres, or Infinity when none is out. */
  nearestSiren: number
  /** How far the camera is from what it is looking at, in metres. */
  cameraDistance: number
}

/** One bed: its own source, its own level, running from the moment the sound is opened. */
interface Bed {
  sound: CitySound
  gain: GainNode
}

export class CityAmbience {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private beds = new Map<CitySoundId, Bed>()
  private buffers = new Map<CitySoundId, AudioBuffer>()
  private siren: GainNode | null = null
  private sirenOscillator: OscillatorNode | null = null
  private enabled = true
  private volume = 1
  private started = false
  private voices = 0
  private nextPass = 0
  private nextHorn = 0

  /**
   * Build the graph. Must be called from inside a trusted gesture, exactly like the interface bus:
   * a browser will not open an `AudioContext` before the player has touched something.
   *
   * The recordings are fetched after that, and the city is silent until they land. That is the right
   * way round — a game that waits for two megabytes of ambience before it will start is worse than
   * one that is quiet for a second.
   */
  start(): void {
    if (this.started || typeof window === 'undefined')
      return
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Constructor)
      return

    this.started = true
    const context = new Constructor()
    this.context = context

    const master = context.createGain()
    master.gain.value = this.enabled ? this.volume : 0
    master.connect(context.destination)
    this.master = master

    /*
     * The siren. One oscillator held for the whole session and stepped between two notes, rather
     * than started and stopped per call: starting an oscillator costs a node allocation and a click
     * at the attack, and a siren that clicks is worse than no siren.
     *
     * A triangle rather than a square. A square is every odd harmonic at full strength, which is why
     * a real siren carries across a city and why this one was unbearable in headphones.
     */
    const oscillator = context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = SIREN_LOW

    const shaped = context.createBiquadFilter()
    shaped.type = 'lowpass'
    shaped.frequency.value = 1_100

    const siren = context.createGain()
    siren.gain.value = 0
    oscillator.connect(shaped).connect(siren).connect(master)
    oscillator.start()
    this.sirenOscillator = oscillator
    this.siren = siren

    void this.fetchAll(context, master)
  }

  /** Fetch every sound and start the beds looping. A failure leaves the city quiet, never broken. */
  private async fetchAll(context: AudioContext, master: GainNode): Promise<void> {
    await Promise.all(Object.values(CITY_SOUNDS).map(async (sound) => {
      try {
        this.buffers.set(sound.id, await loadSound(context, sound))
      }
      catch {
        // One missing sound is one layer missing, not a broken city.
      }
    }))

    for (const id of BEDS) {
      const buffer = this.buffers.get(id)
      if (!buffer || this.context !== context)
        continue
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      // Each bed starts at its own point in its own loop, so two of them never breathe together.
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(gain).connect(master)
      source.start(context.currentTime, Math.random() * buffer.duration)
      this.beds.set(id, { sound: CITY_SOUNDS[id], gain })
    }
  }

  /**
   * Follow the city. Called on the renderer's slow clock, not on the frame: a gain ramp of a second
   * does not need to be rewritten a hundred and twenty times inside it.
   */
  update(state: CityAmbienceState): void {
    const context = this.context
    if (!context)
      return

    const now = context.currentTime
    // Loud in the street, gone from the strategic camera — the city is a place, not a menu.
    const height = 1 - clamp01((state.cameraDistance - TRAFFIC_NEAR) / (TRAFFIC_FAR - TRAFFIC_NEAR))
    const traffic = clamp01(state.trafficNearby / TRAFFIC_FULL)
    const crowd = clamp01(state.peopleNearby / PEOPLE_FULL)

    /*
     * The three beds against each other.
     *
     * Traffic and crowd each follow their own count. The park is what is left: it comes up where
     * there is neither, which is what a side street off the centre actually sounds like, and it is
     * the reason a quiet part of the city is quiet rather than silent.
     */
    this.level('traffic', height * traffic, now)
    this.level('crowd', height * crowd * crowd, now)
    this.level('park', height * (1 - Math.max(traffic, crowd)) ** 1.5, now)

    /*
     * One siren, and only the nearest one. However many are out across the city, what a listener
     * hears is the closest — and beyond a few streets, nothing at all.
     */
    if (this.siren && this.sirenOscillator) {
      const close = 1 - smoothstep(SIREN_NEAR, SIREN_FAR, state.nearestSiren)
      this.siren.gain.setTargetAtTime(SIREN_GAIN * height * close, now, SMOOTHING)
      // Two notes a fourth apart, stepped rather than swept, which is what a Martinshorn does.
      const high = Math.floor(now / SIREN_STEP) % 2 === 0
      this.sirenOscillator.frequency.setTargetAtTime(high ? SIREN_HIGH : SIREN_LOW, now, 0.01)
    }

    this.maybe('pass', now, height * traffic, PASS_CALM, PASS_BUSY)
    this.maybeHorn(now, height * traffic)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.apply()
  }

  setVolume(volume: number): void {
    this.volume = volume
    this.apply()
  }

  stop(): void {
    this.sirenOscillator?.stop()
    void this.context?.close()
    this.context = null
    this.master = null
    this.siren = null
    this.sirenOscillator = null
    this.beds.clear()
    this.buffers.clear()
    this.started = false
  }

  private apply(): void {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.4)
  }

  /** Move one bed toward where it should be. Its own gain from the table decides how loud that is. */
  private level(id: CitySoundId, share: number, now: number): void {
    const bed = this.beds.get(id)
    if (bed)
      bed.gain.gain.setTargetAtTime(bed.sound.gain * clamp01(share), now, SMOOTHING)
  }

  /**
   * Fire a one-shot when it is due, and decide when the next one is.
   *
   * The wait runs from `calm` to `busy` as the street fills up, and is then jittered — a sound that
   * arrives on a schedule is a metronome however good the sample is.
   */
  private maybe(id: CitySoundId, now: number, intensity: number, calm: number, busy: number): void {
    if (intensity < 0.05 || now < this.nextPass || this.voices >= VOICE_LIMIT)
      return
    this.nextPass = now + (busy + (calm - busy) * (1 - intensity)) * (0.6 + Math.random() * 0.9)
    this.play(id, 0.6 + Math.random() * 0.5, intensity)
  }

  private maybeHorn(now: number, intensity: number): void {
    if (intensity < 0.3 || now < this.nextHorn)
      return
    this.nextHorn = now + HORN_WAIT * (0.5 + Math.random())
    if (Math.random() < HORN_CHANCE * intensity * 10)
      this.play('horn', 0.7 + Math.random() * 0.5, intensity)
  }

  /**
   * Play one sound once.
   *
   * `rate` is both pitch and length, which is the cheapest way to make one recording of a car sound
   * like several cars: a passing vehicle heard a little faster is a smaller one in more of a hurry,
   * and nobody has ever noticed it is the same car.
   */
  private play(id: CitySoundId, rate: number, level: number): void {
    const context = this.context
    const master = this.master
    const buffer = this.buffers.get(id)
    if (!context || !master || !buffer)
      return

    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate

    const gain = context.createGain()
    gain.gain.value = CITY_SOUNDS[id].gain * clamp01(level)
    source.connect(gain).connect(master)
    source.start()

    this.voices += 1
    source.onended = () => {
      this.voices -= 1
    }
  }
}

function smoothstep(from: number, to: number, value: number): number {
  if (!Number.isFinite(value))
    return 1
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

let ambience: CityAmbience | null = null

/** One city, one ambience, like the interface bus and the score. */
export function useCityAmbience(): CityAmbience {
  ambience ??= new CityAmbience()
  return ambience
}
