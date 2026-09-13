/**
 * The music the city is played over.
 *
 * Generated rather than played back. A loop that fits in a download is two minutes long and a
 * campaign is hours: however good the two minutes are, the fourth time round the player hears the
 * seam and after that they hear nothing else. This has no seam because it has no loop.
 *
 * Two earlier versions of this file were built out of sine and triangle oscillators through gentle
 * filters, and both sounded like what they were: a synthesiser test. That is not a matter of writing
 * better notes, and no amount of rewriting the harmony fixed it — a bare oscillator has one
 * harmonic, or a handful falling away fast, and nothing with a body sounds like that. So the notes
 * are not the interesting part of this file; the way they are made is.
 *
 * Three instruments, none of them an oscillator playing a note:
 *
 * - **plucked strings**, by Karplus–Strong: a burst of noise pushed round a short delay line that
 *   loses its high end a little on every pass. It is fifteen lines of arithmetic and it is the
 *   oldest trick in physical modelling, and it sounds like a string because it is doing roughly what
 *   a string does. This carries the tune;
 * - a **resonant bass**, a sawtooth through a lowpass with its cutoff swept down on every note. Every
 *   driving electronic record ever made is this sound, and it is what gives the piece a floor you
 *   can feel rather than one you can only hear;
 * - and a **drum**, a sine dropped from a hundred and ten hertz to forty in a twentieth of a second.
 *   Barely a drum. Enough that the bar has a body.
 *
 * The tune itself is an ostinato — a fixed eight-note figure, transposed onto whatever chord is
 * underneath it — rather than notes chosen at random. That was the other half of what was wrong: a
 * random walk has no shape to recognise, so there is nothing to get used to and nothing to look
 * forward to, which is most of what makes music something you want playing.
 */

/** How far ahead the score is written, and how often the writer wakes up. */
const HORIZON = 4
const TICK = 1.5

/** The tempo. Slow enough to live under a city, fast enough to pull. */
const BPM = 84
const BEAT = 60 / BPM
const BAR = BEAT * 4

/**
 * D dorian, as semitones over the root, across three octaves.
 *
 * Dorian for the raised sixth: it is the one note that keeps a minor key serious rather than sad,
 * and the difference between mystical and miserable is almost entirely that note.
 */
const ROOT = 146.83
const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24]

/** Four chords, two bars each, going round without arriving. Roots as steps into the scale. */
const CHANGES = [0, 6, 2, 3]
const BARS_PER_CHANGE = 2

/**
 * The figure, as steps above the chord's own root, in eighths.
 *
 * Up through the chord, a reach above it, and back down through the fifth — the shape of every
 * ostinato that has ever held a piece together. `null` is a rest, and the rests are what stop it
 * sounding like an exercise.
 */
const FIGURE: (number | null)[] = [0, 4, 2, 7, null, 4, 2, null]
/** A second voice a third up, on the beats the first one rests. Only when the city is busy. */
const ANSWER: (number | null)[] = [null, null, null, null, 9, null, null, 7]

/** Where the bass lands in the bar, as beats, and how long each note holds. */
const BASS_PATTERN = [0, 1.5, 2.5]
const DRUM_PATTERN = [0, 2]

const PLUCK_GAIN = 0.09
const ANSWER_GAIN = 0.05
const BASS_GAIN = 0.055
const SUB_GAIN = 0.07
const DRUM_GAIN = 0.16
const PAD_GAIN = 0.022

/** Where the bass filter starts and ends its sweep, and how far the city opens the top of it. */
const BASS_CUTOFF: [number, number] = [1_900, 260]
const DRIVE_LIFT = 1_500

export class CityScore {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private enabled = true
  private volume = 1
  private started = false
  /** How far into the piece the writer has got, in context time. */
  private written = 0
  /** Which bar is being written. The progression and the figure are both read off it. */
  private bar = 0
  /**
   * How much is going on in the city, 0 … 1.
   *
   * The one thing outside the music that the music listens to. It brings in the second voice and
   * opens the bass filter, so a quiet night is a figure and a bass and a busy street has weight.
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
     * A room to play it in. Two and a half seconds of decaying noise as an impulse response — not a
     * real room, but the difference between notes that stop and notes that hang.
     */
    const reverb = context.createConvolver()
    reverb.buffer = noise(context, 2.5, 2.6)
    const wet = context.createGain()
    wet.gain.value = 0.42
    reverb.connect(wet)
    wet.connect(master)
    this.reverb = reverb

    this.written = context.currentTime + 0.3
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
    this.intensity += (wanted - this.intensity) * 0.25
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
      this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.4)
  }

  /**
   * Write whatever the next few seconds need, a bar at a time.
   *
   * Everything is scheduled against the audio clock rather than played when the timer fires, so a
   * busy frame cannot make the music stutter: the browser has already been told what to play and
   * when, and a late timer only means the horizon gets a little shorter.
   */
  private write(): void {
    const context = this.context
    if (!context || !this.enabled)
      return

    while (this.written < context.currentTime + HORIZON) {
      const at = Math.max(this.written, context.currentTime + 0.05)
      const root = CHANGES[Math.floor(this.bar / BARS_PER_CHANGE) % CHANGES.length]!
      const drive = this.intensity

      // The figure, an eighth at a time, transposed onto this chord and two octaves up.
      FIGURE.forEach((step, eighth) => {
        if (step === null)
          return
        this.pluck(this.pitch(root + step + 14), at + eighth * BEAT * 0.5, PLUCK_GAIN)
      })

      // And the answer above it, which only comes in when there is something going on outside.
      if (drive > 0.35) {
        ANSWER.forEach((step, eighth) => {
          if (step === null)
            return
          this.pluck(this.pitch(root + step + 14), at + eighth * BEAT * 0.5, ANSWER_GAIN * drive)
        })
      }

      /*
       * The bass, syncopated rather than on one and three: dead on the beat is a metronome, and the
       * back half of the second beat is a gait.
       */
      for (const beat of BASS_PATTERN)
        this.bass(this.pitch(root) / 2, at + beat * BEAT, BEAT * 0.9, drive)

      for (const beat of DRUM_PATTERN)
        this.drum(at + beat * BEAT)

      /*
       * A held chord under all of it, two sawtooths a fifth apart with the top taken off. Quiet
       * enough that it is the room the rest is played in rather than a part.
       */
      if (this.bar % BARS_PER_CHANGE === 0) {
        const held = BAR * BARS_PER_CHANGE
        this.drone(this.pitch(root) / 2, at, held)
        this.drone(this.pitch(root + 4) / 2, at, held)
      }

      this.bar += 1
      this.written = at + BAR
    }
  }

  /** A step of the scale, as a frequency. Steps past the end of it simply go up an octave. */
  private pitch(step: number): number {
    const semitones = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length]!
      + 12 * Math.floor(step / SCALE.length)
    return ROOT * 2 ** (semitones / 12)
  }

  /**
   * A plucked string, by Karplus–Strong.
   *
   * Fill a delay line one wavelength long with noise, then walk it round averaging each sample with
   * the one before it. The averaging is a lowpass, so every pass loses a little more of the top and
   * the note decays from a bright attack into a soft tail — which is what a plucked string does, and
   * why this sounds like an instrument where an oscillator sounds like a signal generator.
   *
   * Rendered into a buffer rather than built out of nodes: a delay line with feedback is four nodes
   * and a scheduling problem, and this is fifteen lines and a cache.
   */
  private pluck(frequency: number, at: number, gain: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const source = context.createBufferSource()
    /*
     * The string is built at whatever pitch a whole number of samples gives, and then played back at
     * the rate that corrects it.
     *
     * A delay line is an integer number of samples long, so the pitch it produces is the sample rate
     * over that integer — and at the top of the figure the nearest whole number is as much as
     * seventeen cents out. On a repeating phrase that is not character, it is out of tune, and it is
     * most of what was wrong with the version before this one. Resampling fixes it exactly and costs
     * nothing, because the browser is resampling the buffer either way.
     */
    const built = string(context, frequency)
    source.buffer = built.buffer
    source.playbackRate.value = frequency / built.frequency

    const level = context.createGain()
    level.gain.value = gain

    source.connect(level)
    level.connect(this.reverb)
    // A little dry as well, or the attack is lost in the room and it stops sounding plucked.
    if (this.master) {
      const dry = context.createGain()
      dry.gain.value = gain * 0.55
      source.connect(dry)
      dry.connect(this.master)
    }
    source.start(at)
  }

  /**
   * The bass: a sawtooth through a resonant lowpass whose cutoff falls across the note.
   *
   * The sweep is the sound. A sawtooth is every harmonic at once, and pulling a resonant filter down
   * through them is what turns a buzz into a note that moves — it is the oldest gesture in
   * electronic music and there is no substitute for it.
   */
  private bass(frequency: number, at: number, length: number, drive: number): void {
    const context = this.context
    if (!context || !this.master)
      return

    const oscillator = context.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = frequency

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 7
    filter.frequency.setValueAtTime(BASS_CUTOFF[0] + DRIVE_LIFT * drive, at)
    filter.frequency.exponentialRampToValueAtTime(BASS_CUTOFF[1], at + length)

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(BASS_GAIN, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)

    // A sine an octave below it, so there is something under the note on a small speaker.
    const sub = context.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = frequency / 2
    const subGain = context.createGain()
    subGain.gain.setValueAtTime(0.0001, at)
    subGain.gain.exponentialRampToValueAtTime(SUB_GAIN, at + 0.03)
    subGain.gain.exponentialRampToValueAtTime(0.0001, at + length)

    oscillator.connect(filter).connect(gain).connect(this.master)
    sub.connect(subGain).connect(this.master)
    oscillator.start(at)
    oscillator.stop(at + length + 0.05)
    sub.start(at)
    sub.stop(at + length + 0.05)
  }

  /** A sine dropped from a hundred and ten hertz to forty in a twentieth of a second. */
  private drum(at: number): void {
    const context = this.context
    if (!context || !this.master)
      return

    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(110, at)
    oscillator.frequency.exponentialRampToValueAtTime(40, at + 0.05)

    const gain = context.createGain()
    gain.gain.setValueAtTime(DRUM_GAIN, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)

    oscillator.connect(gain).connect(this.master)
    oscillator.start(at)
    oscillator.stop(at + 0.35)
  }

  /** The room the rest is played in: a sawtooth with almost all of the top taken off. */
  private drone(frequency: number, at: number, length: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const oscillator = context.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = frequency
    oscillator.detune.value = (Math.random() - 0.5) * 8

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.6

    const gain = context.createGain()
    const swell = length * 0.3
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(PAD_GAIN, at + swell)
    gain.gain.setValueAtTime(PAD_GAIN, at + length - swell)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)

    oscillator.connect(filter).connect(gain).connect(this.reverb)
    oscillator.start(at)
    oscillator.stop(at + length + 0.1)
  }
}

/**
 * One plucked note, rendered once and kept.
 *
 * Cached per context and per pitch to the nearest hertz: the figure repeats every bar and the whole
 * piece only ever uses a couple of dozen notes, so after the first few bars this never runs again.
 */
const strings = new WeakMap<AudioContext, Map<number, AudioBuffer>>()

function string(context: AudioContext, frequency: number): { buffer: AudioBuffer, frequency: number } {
  let cache = strings.get(context)
  if (!cache) {
    cache = new Map()
    strings.set(context, cache)
  }
  const rate = context.sampleRate
  // Keyed by the length of the delay line, which is the only thing that actually varies.
  const period = Math.max(2, Math.round(rate / frequency))
  const known = cache.get(period)
  if (known)
    return { buffer: known, frequency: rate / period }

  const length = Math.floor(rate * 2.4)
  const buffer = context.createBuffer(1, length, rate)
  const data = buffer.getChannelData(0)

  // The delay line, filled with noise: this is the pluck, and everything after it is the string.
  const line = new Float32Array(period)
  for (let i = 0; i < period; i += 1) line[i] = Math.random() * 2 - 1

  /*
   * Round and round, averaging each sample with the one before it.
   *
   * The average is a one-pole lowpass, so the top goes first and the note darkens as it decays. The
   * damping is just short of one because a string does not ring for ever, and how far short decides
   * whether this is a harp or a woodblock.
   */
  const damping = 0.4965
  let at = 0
  for (let i = 0; i < length; i += 1) {
    const current = line[at]!
    const next = line[(at + 1) % period]!
    const mixed = (current + next) * damping
    line[at] = mixed
    data[i] = current
    at = (at + 1) % period
  }

  // And a short fade in and out, so nothing clicks at either end.
  const edge = Math.floor(rate * 0.004)
  for (let i = 0; i < edge; i += 1) {
    data[i]! *= i / edge
    data[length - 1 - i]! *= i / edge
  }

  cache.set(period, buffer)
  return { buffer, frequency: rate / period }
}

/** Decaying noise, for the reverb's impulse response. Cached per context and per length. */
const rooms = new WeakMap<AudioContext, Map<number, AudioBuffer>>()

function noise(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  let cache = rooms.get(context)
  if (!cache) {
    cache = new Map()
    rooms.set(context, cache)
  }
  const known = cache.get(seconds)
  if (known)
    return known

  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let sample = 0; sample < length; sample += 1)
      data[sample] = (Math.random() * 2 - 1) * (1 - sample / length) ** decay
  }
  cache.set(seconds, buffer)
  return buffer
}

let score: CityScore | null = null

/** One score for the session, like the ambience and the interface bus. */
export function useCityScore(): CityScore {
  score ??= new CityScore()
  return score
}
