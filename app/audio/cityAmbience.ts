/**
 * The sound the city itself makes.
 *
 * Separate from the interface bus on purpose. `AudioBus` plays cues — short, discrete, one per thing
 * the player did. A city does not make cues. It makes a continuous noise that changes with what is
 * near the listener, and the whole difficulty is that "near the listener" is the only thing that
 * matters: the first version drove a siren off a city-wide count, so a call three kilometres away
 * was as loud as one at the end of the street.
 *
 * Five layers, all synthesised, no file fetched and nothing bundled:
 *
 * - a **traffic bed**, two bands rather than one — a low rumble under a mid-range tyre roar — with a
 *   slow drift over both, because a single filtered hiss is a fan and not a city;
 * - **passing vehicles**, a short band-passed burst swept downward, which is what a car going past
 *   actually sounds like and what turns a bed into traffic;
 * - a **crowd murmur**, noise pushed through two resonant bands near the formants of speech, so it
 *   reads as people talking without a word being intelligible;
 * - occasional **horns**, because a city has an edge to it;
 * - and the **siren**, a German two-tone, from the nearest call and nothing else.
 *
 * Silent until something has opened it inside a gesture, and silent whenever the player has turned
 * sound off: a browser refuses the first and a player deserves the second.
 */

/** The two notes of a German emergency siren, and how long it holds each. */
const SIREN_LOW = 435
const SIREN_HIGH = 580
const SIREN_STEP = 0.65
/** How loud each layer is at its fullest, against the interface's own cues. */
const RUMBLE_GAIN = 0.1
const ROAR_GAIN = 0.075
const MURMUR_GAIN = 0.085
const SIREN_GAIN = 0.03
const PASS_GAIN = 0.13
const HORN_GAIN = 0.05
/** Traffic is a street-level sound: from the strategic camera a city is quiet. */
const TRAFFIC_NEAR = 200
const TRAFFIC_FAR = 1_600
/**
 * How close a siren has to be before it can be heard, and where it fades out entirely.
 *
 * Cut back hard once the crews started actually arriving at their calls. Before that a responder
 * drove at random and mostly never got anywhere near the camera, so the siren was rare by accident;
 * once they drove to the scene they drove past the player, and a two-tone horn every couple of
 * minutes at three hundred metres is not atmosphere, it is a fault.
 *
 * Distance to the nearest one, never a count. A siren is the loudest thing in a city and it still
 * cannot be heard from four streets away.
 */
const SIREN_NEAR = 40
const SIREN_FAR = 200
/** How many of each within earshot counts as a street at its busiest. */
const TRAFFIC_FULL = 26
const PEOPLE_FULL = 30
/** How quickly a level follows what it is being asked for, in seconds to close the gap. */
const SMOOTHING = 0.7
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

export class CityAmbience {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private rumble: GainNode | null = null
  private roar: GainNode | null = null
  private murmur: GainNode | null = null
  private siren: GainNode | null = null
  private sirenOscillator: OscillatorNode | null = null
  private noise: AudioBuffer | null = null
  private enabled = true
  private volume = 1
  private started = false
  private voices = 0
  private nextPass = 0
  private nextHorn = 0
  private nearness = 0

  /**
   * Build the graph. Must be called from inside a trusted gesture, exactly like the interface bus:
   * a browser will not open an `AudioContext` before the player has touched something.
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

    this.noise = makeNoise(context, 3)

    /*
     * The bed, in two bands. The low one is engines and the ground carrying them; the high one is
     * tyres on tarmac. Together they read as traffic, where either alone reads as ventilation — and
     * each gets a slow drift so the bed breathes instead of sitting still.
     */
    this.rumble = this.layer(context, master, 'lowpass', 150, 0.8, 0.055)
    this.roar = this.layer(context, master, 'bandpass', 900, 0.7, 0.037)
    /*
     * The crowd. Two resonant bands sitting roughly where the first two formants of a speaking voice
     * are, with a faster drift on top: close enough to a room full of people that the ear stops
     * asking, and far enough that no word is ever there to be misheard.
     */
    this.murmur = this.layer(context, master, 'bandpass', 480, 3.2, 0.19)

    /*
     * The siren. One oscillator held for the whole session and stepped between two notes, rather
     * than started and stopped per call: starting an oscillator costs a node allocation and a click
     * at the attack, and a siren that clicks is worse than no siren.
     */
    const oscillator = context.createOscillator()
    /*
     * A triangle rather than a square.
     *
     * A square wave is every odd harmonic at full strength, which is why it carries across a city
     * and why it is unbearable in a pair of headphones for ten minutes. A triangle has the same
     * harmonics falling away as the square of their number: the same two notes, the same interval,
     * without the edge that makes a listener reach for the volume.
     */
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
  }

  /**
   * Follow the city. Called on the renderer's slow clock, not on the frame: a gain ramp of a second
   * does not need to be rewritten a hundred and twenty times inside it.
   */
  update(state: CityAmbienceState): void {
    const context = this.context
    if (!context || !this.rumble || !this.roar || !this.murmur || !this.siren || !this.sirenOscillator)
      return

    const now = context.currentTime
    // Loud in the street, gone from the strategic camera — the city is a place, not a menu.
    const height = 1 - clamp01((state.cameraDistance - TRAFFIC_NEAR) / (TRAFFIC_FAR - TRAFFIC_NEAR))
    this.nearness = height
    const traffic = clamp01(state.trafficNearby / TRAFFIC_FULL)
    const crowd = clamp01(state.peopleNearby / PEOPLE_FULL)

    this.rumble.gain.setTargetAtTime(RUMBLE_GAIN * height * traffic, now, SMOOTHING)
    // Tyre noise falls away faster with distance than engine rumble does.
    this.roar.gain.setTargetAtTime(ROAR_GAIN * height * height * traffic, now, SMOOTHING)
    this.murmur.gain.setTargetAtTime(MURMUR_GAIN * height * height * crowd, now, SMOOTHING)

    /*
     * One siren, and only the nearest one. However many are out across the city, what a listener
     * hears is the closest — and beyond a few streets, nothing at all.
     */
    const close = 1 - smoothstep(SIREN_NEAR, SIREN_FAR, state.nearestSiren)
    this.siren.gain.setTargetAtTime(SIREN_GAIN * height * close, now, SMOOTHING)
    // Two notes a fourth apart, stepped rather than swept, which is what a Martinshorn does.
    const high = Math.floor(now / SIREN_STEP) % 2 === 0
    this.sirenOscillator.frequency.setTargetAtTime(high ? SIREN_HIGH : SIREN_LOW, now, 0.01)

    this.maybePass(now, height * traffic)
    this.maybeHorn(now, height * traffic)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.applyMaster()
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume)
    this.applyMaster()
  }

  dispose(): void {
    this.sirenOscillator?.stop()
    void this.context?.close()
    this.context = null
    this.master = null
    this.rumble = null
    this.roar = null
    this.murmur = null
    this.siren = null
    this.sirenOscillator = null
    this.noise = null
    this.started = false
    this.voices = 0
  }

  /** One band of the bed: looping noise, a filter, a slow drift over it, and a gain of its own. */
  private layer(context: AudioContext, master: GainNode, type: BiquadFilterType, frequency: number, q: number, drift: number): GainNode {
    const source = context.createBufferSource()
    source.buffer = this.noise
    source.loop = true

    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q

    const gain = context.createGain()
    gain.gain.value = 0

    /*
     * The drift. Without it every band is a steady hiss and the ear locates it as a machine within a
     * few seconds; with it the bed swells and falls the way a street does as things come and go.
     */
    const wobble = context.createOscillator()
    wobble.frequency.value = drift
    const depth = context.createGain()
    depth.gain.value = frequency * 0.28
    wobble.connect(depth).connect(filter.frequency)
    wobble.start()

    source.connect(filter).connect(gain).connect(master)
    source.start()
    return gain
  }

  /**
   * A vehicle going past: a short burst of band-passed noise whose filter sweeps downward.
   *
   * The sweep is the whole trick — it is the Doppler shift of something approaching and leaving, and
   * it is what makes the difference between a bed of traffic noise and traffic.
   */
  private maybePass(now: number, intensity: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master || !this.noise || intensity < 0.05 || now < this.nextPass || this.voices >= VOICE_LIMIT)
      return
    // The busier the street, the shorter the wait until the next one goes by.
    this.nextPass = now + 0.35 + (1 - intensity) * 4.5 + Math.random() * 1.2

    const source = context.createBufferSource()
    source.buffer = this.noise
    source.loop = true

    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.6
    const start = 700 + Math.random() * 700
    filter.frequency.setValueAtTime(start, now)
    filter.frequency.exponentialRampToValueAtTime(start * 0.42, now + 1.1)

    const gain = context.createGain()
    const peak = PASS_GAIN * intensity * (0.55 + Math.random() * 0.45)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.28)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)

    source.connect(filter).connect(gain).connect(master)
    source.start(now)
    source.stop(now + 1.3)
    this.hold(source)
  }

  /** A horn, rarely. A city without one is a diorama. */
  private maybeHorn(now: number, intensity: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master || intensity < 0.35 || now < this.nextHorn || this.voices >= VOICE_LIMIT)
      return
    this.nextHorn = now + 14 + Math.random() * 40

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(HORN_GAIN * intensity, now + 0.03)
    gain.gain.setValueAtTime(HORN_GAIN * intensity, now + 0.24)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
    gain.connect(master)

    // Two tones a little apart, which is what gives a car horn its beat rather than a beep.
    const root = 380 + Math.random() * 90
    for (const ratio of [1, 1.19]) {
      const tone = context.createOscillator()
      tone.type = 'sawtooth'
      tone.frequency.value = root * ratio
      tone.connect(gain)
      tone.start(now)
      tone.stop(now + 0.45)
      this.hold(tone)
    }
  }

  /** Count a one-off sound while it lasts, so a busy street cannot pile up into a wall. */
  private hold(node: AudioScheduledSourceNode): void {
    this.voices += 1
    node.onended = () => {
      this.voices = Math.max(0, this.voices - 1)
      node.disconnect()
    }
  }

  private applyMaster(): void {
    if (!this.master || !this.context)
      return
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.12)
  }
}

/**
 * Brown noise rather than white: the low end is what carries through a city, and white noise is a
 * hiss. One buffer serves every layer and every passing car.
 */
function makeNoise(context: AudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate)
  const samples = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < samples.length; i += 1) {
    last = (last + (Math.random() * 2 - 1) * 0.06) * 0.985
    samples[i] = last * 3.2
  }
  return buffer
}

/** Nought below `from`, one above `to`, and an ease in between — no cliff edge on a fade. */
function smoothstep(from: number, to: number, value: number): number {
  if (!Number.isFinite(value))
    return 1
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

let shared: CityAmbience | null = null

/** The one city ambience. Built on first use so nothing is allocated on the server. */
export function useCityAmbience(): CityAmbience {
  shared ??= new CityAmbience()
  return shared
}

/** For tests, which need a fresh one and no AudioContext at all. */
export function setCityAmbience(next: CityAmbience | null): CityAmbience | null {
  const previous = shared
  shared = next
  return previous
}
