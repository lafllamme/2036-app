/**
 * The music the city is played over.
 *
 * Four versions of this file were a piece of music: a tempo, a bar, a chord progression and a figure
 * over the top. Each was better than the last and every one of them had the same fault underneath,
 * which only became obvious once the sound itself stopped being the problem — a piece of music asks
 * to be listened to. It has a downbeat you count without meaning to, a phrase you learn, and a point
 * where it comes round again. That is exactly right for three minutes and exactly wrong for the
 * eight hours somebody might leave this running while they govern a city.
 *
 * So this is not a piece of music. It is the Music for Airports trick, which is the only honest
 * answer to "must be interesting for hours and never irritating": several voices, each repeating on
 * its own, with periods that do not divide into each other. Nothing is synchronised to anything. The
 * combination of six voices at twenty-three, twenty-nine, thirty-seven, forty-one, fifty-three and
 * sixty-one seconds comes back to where it started once every eighteen hours or so, and in between
 * it is never quite the same texture twice — not because anything is random, but because that is
 * what numbers with no common factor do.
 *
 * Three rules fall out of that, and they are what the earlier versions kept breaking:
 *
 * - **no meter.** There is no bar and no beat, so there is nothing to anticipate and nothing lands
 *   on a downbeat. Every complaint about a clunk at the top of a part was a complaint about a grid;
 * - **no wrong combination.** Every voice draws from one pentatonic collection — five notes with no
 *   semitone and no tritone between any of them — so any two, or all six, are consonant. The
 *   question "does this note fit the chord underneath" cannot be asked, because there is no chord
 *   and no note that would not fit one;
 * - **nothing has an attack.** Every note swells in over seconds and falls away over more. A sound
 *   that arrives is an event; a sound that is simply there when you next notice it is weather.
 *
 * What is left to compose is timbre and register, and both are the same all the way through: soft
 * detuned saw pads in the middle, a drone underneath, and one small bell voice far above for a point
 * of light. The pad was the one part of every earlier version that worked.
 */

/** How far ahead the score is written, and how often the writer wakes up. */
const HORIZON = 6
const TICK = 2

/**
 * The collection: D minor pentatonic, as frequencies.
 *
 * Five notes, no semitone between any pair and no tritone anywhere, which is what makes every
 * possible combination of them consonant. Everything the piece plays is one of these five in one of
 * three octaves, and that is the whole of the harmony — which is why there is no moment where two
 * voices disagree, and no way for one to arrive.
 */
const PENTATONIC = [146.83, 174.61, 196.00, 220.00, 261.63]

/**
 * The voices, and this is the composition.
 *
 * Each is a note, a register, and a period: how long from one entry of that voice to the next. The
 * periods share no common factor, so the pattern of which voices are sounding together changes every
 * time round and does not repeat inside any session anyone will ever play.
 *
 * `spread` is how much the period is allowed to wander from entry to entry. A little, so that even
 * the individual voice is not a metronome, but not so much that the layering thins out.
 */
interface Voice {
  /** Which of the five, and how many octaves above the written one. */
  note: number
  octave: number
  /** Seconds from one entry to the next, and how far that may drift. */
  period: number
  spread: number
  /** How long the note takes to arrive, to hold, and to leave. */
  rise: number
  hold: number
  fall: number
  gain: number
  /** A bell rather than a pad: the one voice with any edge to it at all. */
  bell?: boolean
  /** Only heard when the city is busy. */
  busy?: boolean
}

const VOICES: Voice[] = [
  { note: 0, octave: 1, period: 23, spread: 2.5, rise: 5, hold: 5, fall: 8, gain: 0.05 },
  { note: 2, octave: 1, period: 29, spread: 3, rise: 6, hold: 4, fall: 9, gain: 0.045 },
  { note: 4, octave: 1, period: 37, spread: 3.5, rise: 7, hold: 6, fall: 10, gain: 0.04 },
  { note: 1, octave: 2, period: 41, spread: 4, rise: 8, hold: 5, fall: 11, gain: 0.032 },
  { note: 3, octave: 2, period: 53, spread: 4.5, rise: 9, hold: 6, fall: 12, gain: 0.028 },
  /*
   * The one voice with a shape to it, three octaves up and rare. It is the only thing in the piece a
   * listener could point at, which is why it comes round once a minute and not more.
   */
  { note: 0, octave: 3, period: 61, spread: 7, rise: 0.01, hold: 1.5, fall: 4, gain: 0.03, bell: true },
  /*
   * And two more that only appear when there is something going on outside, so a busy city is a
   * fuller texture rather than a louder one. Same collection, so they cannot clash with anything.
   */
  { note: 3, octave: 1, period: 31, spread: 3, rise: 6, hold: 4, fall: 9, gain: 0.035, busy: true },
  { note: 2, octave: 2, period: 47, spread: 4, rise: 8, hold: 5, fall: 10, gain: 0.025, busy: true },
]

/**
 * The drone: the bottom of the piece, and the only thing that never stops.
 *
 * It crossfades between the root and the fifth over minutes. Nothing else in the piece changes key,
 * because there is no key to change — but the ground under it shifting every few minutes is what
 * keeps the whole thing from being one chord for eight hours.
 */
const DRONE_NOTES = [0, 2, 0, 4]
const DRONE_LENGTH = 96
const DRONE_GAIN = 0.05

/** How bright the pads are, and how far the city may open them. */
const PAD_CUTOFF = 760
const DRIVE_LIFT = 900

export class CityScore {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private enabled = true
  private volume = 1
  private started = false
  /** When each voice is next due, in context time. Independent of every other voice. */
  private due: number[] = []
  private droneDue = 0
  private droneStep = 0
  /**
   * How much is going on in the city, 0 … 1.
   *
   * The one thing outside the music that the music listens to. It brings in two more voices and
   * opens the filter a little; it never makes anything louder or faster, because a score that
   * reacts is a score you notice.
   */
  private intensity = 0.3

  /**
   * Open the graph. Inside a trusted gesture, like everything else that makes a sound: a browser
   * will not start an `AudioContext` before the player has touched something.
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
     * A large room. Five seconds of decaying noise as an impulse response, which is longer than any
     * real room and is the point: it is what stops each note having an end you can hear.
     */
    const reverb = context.createConvolver()
    reverb.buffer = noise(context, 5, 2.2)
    const wet = context.createGain()
    wet.gain.value = 0.6
    reverb.connect(wet)
    wet.connect(master)
    this.reverb = reverb

    /*
     * Stagger the first entry of every voice across its own period, so the piece fades up out of
     * nothing rather than all eight voices starting together on the first frame.
     */
    const now = context.currentTime + 0.5
    this.due = VOICES.map(voice => now + Math.random() * voice.period)
    this.droneDue = now

    this.timer = setInterval(() => this.write(), TICK * 1_000)
    this.write()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.apply()
  }

  setVolume(volume: number): void {
    this.volume = volume
    this.apply()
  }

  /** How busy the city is, 0 … 1. Followed slowly: music that lurches with the camera is worse. */
  setIntensity(value: number): void {
    const wanted = Math.min(1, Math.max(0, value))
    this.intensity += (wanted - this.intensity) * 0.2
  }

  stop(): void {
    if (this.timer)
      clearInterval(this.timer)
    this.timer = null
    void this.context?.close()
    this.context = null
    this.started = false
  }

  private apply(): void {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.6)
  }

  /**
   * Schedule whatever is due in the next few seconds.
   *
   * There is no bar to write, only voices that are each overdue or not. Everything is scheduled
   * against the audio clock rather than played when the timer fires, so a busy frame cannot make
   * the music stutter.
   */
  private write(): void {
    const context = this.context
    if (!context || !this.enabled)
      return
    const until = context.currentTime + HORIZON

    VOICES.forEach((voice, index) => {
      while (this.due[index]! < until) {
        const at = Math.max(this.due[index]!, context.currentTime + 0.05)
        // A voice that only belongs to a busy city simply does not play when the city is quiet.
        if (!voice.busy || this.intensity > 0.4)
          this.play(voice, at)
        this.due[index] = at + voice.period + (Math.random() - 0.5) * voice.spread
      }
    })

    while (this.droneDue < until) {
      const at = Math.max(this.droneDue, context.currentTime + 0.05)
      this.drone(PENTATONIC[DRONE_NOTES[this.droneStep % DRONE_NOTES.length]!]! / 2, at)
      this.droneStep += 1
      /*
       * Each drone overlaps the one before it by a third of its length, so the ground moves under
       * the piece without there ever being a moment where it changes.
       */
      this.droneDue = at + DRONE_LENGTH * 0.66
    }
  }

  /** One entry of one voice: a note that arrives, stays a while and leaves. */
  private play(voice: Voice, at: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const frequency = PENTATONIC[voice.note]! * 2 ** voice.octave
    const length = voice.rise + voice.hold + voice.fall

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(voice.gain, at + voice.rise)
    gain.gain.setValueAtTime(voice.gain, at + voice.rise + voice.hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    gain.connect(this.reverb)

    if (voice.bell) {
      /*
       * The bell: two sines, one modulating the other, with the depth of the modulation collapsing
       * over a tenth of a second. A bright edge that is gone before you can name it, and a near-sine
       * after it.
       */
      const carrier = context.createOscillator()
      carrier.type = 'sine'
      carrier.frequency.value = frequency

      const modulator = context.createOscillator()
      modulator.type = 'sine'
      modulator.frequency.value = frequency * 2

      const depth = context.createGain()
      depth.gain.setValueAtTime(frequency * 2.4, at)
      depth.gain.exponentialRampToValueAtTime(frequency * 0.001, at + 0.12)
      modulator.connect(depth).connect(carrier.frequency)

      carrier.connect(gain)
      carrier.start(at)
      carrier.stop(at + length + 0.1)
      modulator.start(at)
      modulator.stop(at + length + 0.1)
      return
    }

    /*
     * A pad: three sawtooths a few cents apart through a lowpass. Three, because two beat against
     * each other and three shimmer — and the filter is most of it, because a sawtooth with its top
     * left on is a buzz and with its top taken off is a string section.
     */
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = PAD_CUTOFF + DRIVE_LIFT * this.intensity
    filter.Q.value = 0.5
    filter.connect(gain)

    for (const cents of [-6, 0, 6]) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sawtooth'
      oscillator.frequency.value = frequency
      oscillator.detune.value = cents
      oscillator.connect(filter)
      oscillator.start(at)
      oscillator.stop(at + length + 0.1)
    }
  }

  /** The bottom: two sines an octave apart, in and out over a minute and a half. */
  private drone(frequency: number, at: number): void {
    const context = this.context
    if (!context || !this.master)
      return

    const gain = context.createGain()
    const swell = DRONE_LENGTH * 0.35
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(DRONE_GAIN, at + swell)
    gain.gain.setValueAtTime(DRONE_GAIN, at + DRONE_LENGTH - swell)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + DRONE_LENGTH)
    gain.connect(this.master)

    for (const [ratio, level] of [[1, 1], [2, 0.3]] as const) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency * ratio
      const mix = context.createGain()
      mix.gain.value = level
      oscillator.connect(mix).connect(gain)
      oscillator.start(at)
      oscillator.stop(at + DRONE_LENGTH + 0.2)
    }
  }
}

/** Decaying noise, for the reverb's impulse response. Cached per context. */
const rooms = new WeakMap<AudioContext, Map<number, AudioBuffer>>()

function noise(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  let cache = rooms.get(context)
  if (!cache) {
    cache = new Map()
    rooms.set(context, cache)
  }
  const key = seconds * 1_000 + decay
  const known = cache.get(key)
  if (known)
    return known

  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let sample = 0; sample < length; sample += 1)
      data[sample] = (Math.random() * 2 - 1) * (1 - sample / length) ** decay
  }
  cache.set(key, buffer)
  return buffer
}

let score: CityScore | null = null

/** One score for the session, like the ambience and the interface bus. */
export function useCityScore(): CityScore {
  score ??= new CityScore()
  return score
}
