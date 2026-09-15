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

/**
 * The train, and why it is synthesised like the siren rather than played like the traffic.
 *
 * What a train sounds like from a distance is almost entirely *where it is*: a rumble that arrives
 * before you see it, a beat under it at the speed of the wheels, and nothing at all four streets
 * away. All three are things the game computes and nothing anybody recorded — the same reason the
 * Martinshorn is built rather than fetched.
 *
 * Noise through a narrow band is the rumble; the same noise gated by a slow oscillator is the beat
 * of the bogies over the joints. It carries further than a siren because a train does.
 */
const TRAIN_NEAR = 90
const TRAIN_FAR = 620
const TRAIN_GAIN = 0.16
const TRAIN_BAND = 165
const TRAIN_BEAT = 2.6

/**
 * How the city fades with height, and how much of it is left from the top.
 *
 * It used to fade to nothing by sixteen hundred metres, and the campaign opens at twenty-seven
 * hundred — so a player who loaded the game and did not zoom in heard no city at all, decided the
 * sound was broken, and was right to. A city seen from a hill is not silent. It is a hum with no
 * detail in it, which is what the floor and the filter below are between them.
 */
const TRAFFIC_NEAR = 200
const TRAFFIC_FAR = 2_400
const FAR_FLOOR = 0.24

/**
 * And how dull it gets.
 *
 * Distance eats the top of a sound long before it eats the level — which is why a motorway a mile
 * off is a hum and the same motorway from the verge is a hiss. One filter across all three beds,
 * opening as the camera comes down.
 */
const FAR_CUTOFF = 620
const NEAR_CUTOFF = 16_000
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
  /** How far the nearest train is, in metres, or Infinity when none is on the map. */
  nearestTrain: number
  /** How far the camera is from what it is looking at, in metres. */
  cameraDistance: number
}

/**
 * A second of noise, looped.
 *
 * Pink rather than white — a running average of white noise, which takes the hiss off the top and
 * leaves the low end a train actually has. One buffer, built once, shared by everything that needs
 * a rumble.
 */
function noiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1
    last = (last * 0.96 + white * 0.04)
    data[i] = last * 6
  }
  return buffer
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
  private distant: BiquadFilterNode | null = null
  private siren: GainNode | null = null
  private sirenOscillator: OscillatorNode | null = null
  private train: GainNode | null = null
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
     * One filter for the three beds together, so distance takes the top off the whole city at once.
     * The one-shots and the siren go straight to the master: a horn heard from far away is already
     * rare, and the siren has its own distance of its own.
     */
    const distant = context.createBiquadFilter()
    distant.type = 'lowpass'
    distant.frequency.value = NEAR_CUTOFF
    distant.Q.value = 0.4
    distant.connect(master)
    this.distant = distant

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

    /*
     * The train. One noise source held for the session, banded down to a rumble and pulsed by a slow
     * oscillator for the beat of the wheels — started and stopped nowhere, gated only by how far the
     * nearest train is, exactly like the siren above it.
     */
    const rumble = context.createBufferSource()
    rumble.buffer = noiseBuffer(context)
    rumble.loop = true

    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = TRAIN_BAND
    band.Q.value = 0.9

    const beat = context.createGain()
    beat.gain.value = 1
    const wheels = context.createOscillator()
    wheels.type = 'sine'
    wheels.frequency.value = TRAIN_BEAT
    const depth = context.createGain()
    depth.gain.value = 0.35
    wheels.connect(depth).connect(beat.gain)
    wheels.start()

    const train = context.createGain()
    train.gain.value = 0
    rumble.connect(band).connect(beat).connect(train).connect(master)
    rumble.start()
    this.train = train

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
      source.connect(gain).connect(this.distant ?? master)
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
    /*
     * How close the listener is to the street, and how much city is left at that height.
     *
     * `near` is one down in it and nought from the map. `carry` is what actually reaches the ear:
     * never nothing, because a city is audible from a hill, and the filter takes the detail out of
     * it rather than the level.
     */
    const near = 1 - clamp01((state.cameraDistance - TRAFFIC_NEAR) / (TRAFFIC_FAR - TRAFFIC_NEAR))
    const carry = FAR_FLOOR + (1 - FAR_FLOOR) * near
    const traffic = clamp01(state.trafficNearby / TRAFFIC_FULL)
    const crowd = clamp01(state.peopleNearby / PEOPLE_FULL)

    this.distant?.frequency.setTargetAtTime(FAR_CUTOFF + (NEAR_CUTOFF - FAR_CUTOFF) * near ** 1.6, now, SMOOTHING)

    /*
     * The three beds against each other.
     *
     * Traffic and crowd each follow their own count. The park is what is left: it comes up where
     * there is neither, which is what a side street off the centre actually sounds like, and it is
     * the reason a quiet part of the city is quiet rather than silent.
     */
    this.level('traffic', carry * traffic, now)
    // Voices do not carry. A crowd is a street-level sound and it goes with the street.
    this.level('crowd', near * crowd * crowd, now)
    this.level('park', carry * (1 - Math.max(traffic, crowd)) ** 1.5, now)

    /*
     * One siren, and only the nearest one. However many are out across the city, what a listener
     * hears is the closest — and beyond a few streets, nothing at all.
     */
    if (this.siren && this.sirenOscillator) {
      const close = 1 - smoothstep(SIREN_NEAR, SIREN_FAR, state.nearestSiren)
      this.siren.gain.setTargetAtTime(SIREN_GAIN * near * close, now, SMOOTHING)
      // Two notes a fourth apart, stepped rather than swept, which is what a Martinshorn does.
      const high = Math.floor(now / SIREN_STEP) % 2 === 0
      this.sirenOscillator.frequency.setTargetAtTime(high ? SIREN_HIGH : SIREN_LOW, now, 0.01)
    }

    /*
     * The train, on its own distance and nothing else. It carries further than a siren because a
     * train does, and it is not tied to `near`: a goods train heard from the hill above the city is
     * exactly the sound of a city with a railway in it.
     */
    if (this.train) {
      const close = 1 - smoothstep(TRAIN_NEAR, TRAIN_FAR, state.nearestTrain)
      this.train.gain.setTargetAtTime(TRAIN_GAIN * close, now, SMOOTHING)
    }

    /*
     * The one-shots follow `near` rather than `carry`. A bed is a hum you can hear from anywhere; a
     * single car going past is not something you pick out of a city from two kilometres up.
     */
    this.maybe('pass', now, near * traffic, PASS_CALM, PASS_BUSY)
    this.maybeHorn(now, near * traffic)
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
    this.distant = null
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
