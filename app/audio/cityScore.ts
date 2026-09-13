/**
 * The music the city is played over.
 *
 * Generated rather than played back. A loop that fits in a download is two minutes long and a
 * campaign is hours: however good the two minutes are, the fourth time round the player hears the
 * seam and after that they hear nothing else. This has no seam because it has no loop.
 *
 * Three versions of this file are worth recording because each was wrong in a different way. The
 * first two were sine and triangle oscillators through a gentle filter, which sounds like what it
 * is — a signal generator — and no amount of rewriting the harmony fixed that. The third fixed the
 * sound and broke the register: a sawtooth bass with the filter swept down on every note and a kick
 * drum on one and three is a good sound and it is a *dance* sound, and a city you are meant to sit
 * and think in does not want a floor thumping under it.
 *
 * So this one is a chamber group, in the tradition of the Zelda field themes and Yoko Shimomura's
 * writing for Kingdom Hearts: a harp, a flute, strings and a plucked bass. No drums at all. What
 * makes it move is the harp figure rather than a beat, which is how every one of those pieces does
 * it — an arpeggio running underneath is a pulse you feel without being told where the bar is.
 *
 * How the instruments are made, since none of them is an oscillator playing a note:
 *
 * - the **harp** and the **bass** are Karplus–Strong: a burst of noise pushed round a delay line one
 *   wavelength long, averaging each sample with the one before it, so the top goes first and the
 *   note darkens as it decays. It sounds like a string because it is doing what a string does. The
 *   two differ only in how much they are damped, which is the whole difference between a harp and a
 *   pizzicato double bass;
 * - the **flute** is a triangle with a little breath noise through it and a vibrato that arrives
 *   after the note has, because a player's vibrato does too. Its attack is slow enough to be blown
 *   rather than struck;
 * - the **strings** are three sawtooths a few cents apart through a lowpass, swelling in and out.
 *   Three, because two beat against each other and three shimmer.
 *
 * The harmony is the other half of the tradition: sevenths and ninths rather than triads, and a
 * progression that opens from minor into major and goes round rather than arriving.
 */

/** How far ahead the score is written, and how often the writer wakes up. */
const HORIZON = 4
const TICK = 1.5

/** The tempo. A walking pace, not a dancing one. */
const BPM = 66
const BEAT = 60 / BPM
const BAR = BEAT * 4

/**
 * F major, as semitones over the root, across three octaves.
 *
 * The piece sits in its relative minor as often as in the major itself, which is the whole colour of
 * this kind of writing: the same seven notes, heard from two places, neither of them settled.
 */
const ROOT = 174.61
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29]

/**
 * The changes: four chords, two bars each.
 *
 * Dm9 — B♭maj7 — Fmaj7 — Cadd9. It starts in the minor, opens into the major underneath it, and
 * stays there: the last chord is an added ninth rather than a seventh on purpose. A C7 has the
 * tritone in it and pulls hard back to F, which makes the turn an arrival and the arrival a cadence
 * — and a piece that arrives asks to be listened to. The added ninth simply hangs, so going round
 * again is the only thing that could happen next and nothing about it feels like a decision.
 *
 * As steps into the scale, each with the ninth that gives it its colour.
 */
const CHANGES = [
  [5, 7, 9, 11, 13],
  [3, 5, 7, 9],
  [0, 2, 4, 6],
  [4, 6, 8, 12],
]
const BARS_PER_CHANGE = 2

/**
 * How the harp runs through a chord: which note of it, on each eighth of the bar.
 *
 * Up, over the top, and back through the middle — a harp figure rather than a scale. Indices into
 * whatever chord is current, so the shape survives the changes and the colour does not.
 */
const HARP = [0, 1, 2, 3, 4, 3, 2, 1]

/** Which notes of the chord the flute reaches for, and how long it holds them. */
const PHRASE: (number | null)[] = [2, null, null, 3, null, 1, null, null]
const FLUTE_LENGTH = BEAT * 1.4

const HARP_GAIN = 0.075
const BASS_GAIN = 0.1
const FLUTE_GAIN = 0.055
const STRING_GAIN = 0.018

/**
 * How long each plucked instrument rings, which is the only difference between them.
 *
 * Measured rather than guessed. Just short of a half is a harp: two and a half seconds low down,
 * under a second at the top, which is what a string does. The bass wanted to be much shorter — at
 * the harp's damping a low pizzicato rang for two seconds and smeared every chord into the next —
 * so it is damped to about half a second, which is a plucked bass rather than a held one.
 */
const HARP_DAMPING = 0.4988
const BASS_DAMPING = 0.485

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
      const chord = CHANGES[Math.floor(this.bar / BARS_PER_CHANGE) % CHANGES.length]!
      const second = this.bar % BARS_PER_CHANGE === 1
      const drive = this.intensity

      /*
       * The harp, an eighth at a time, right through the bar.
       *
       * This is what makes the piece move, and it is the reason there are no drums: a figure running
       * underneath is a pulse the listener feels without being told where the bar is, which is how
       * every field theme worth the name does it.
       */
      HARP.forEach((index, eighth) => {
        const step = chord[index % chord.length]!
        // The second bar of a change is an octave up, so two bars of one chord are not one bar twice.
        this.pluck(this.pitch(step + (second ? 21 : 14)), at + eighth * BEAT * 0.5, HARP_GAIN, HARP_DAMPING)
      })

      // The bass: the root on the first beat, and the fifth on the third when the city is awake.
      this.pluck(this.pitch(chord[0]!) / 2, at, BASS_GAIN, BASS_DAMPING)
      if (drive > 0.3)
        this.pluck(this.pitch(chord[2]!) / 2, at + BEAT * 2, BASS_GAIN * 0.6, BASS_DAMPING)

      /*
       * The flute over the top, and only in the second bar of each change.
       *
       * A lead that plays every bar is not a melody, it is a texture. Leaving it out of the first
       * bar gives the harp somewhere to be heard and gives the phrase somewhere to arrive.
       */
      if (second) {
        PHRASE.forEach((index, eighth) => {
          if (index === null)
            return
          this.flute(this.pitch(chord[index % chord.length]! + 14), at + eighth * BEAT * 0.5, FLUTE_LENGTH)
        })
      }

      // And the strings under all of it, once per change, swelling across both its bars.
      if (!second) {
        const held = BAR * BARS_PER_CHANGE
        for (const step of chord.slice(0, 4))
          this.strings(this.pitch(step + 7), at, held, drive)
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
   * A plucked string, by Karplus–Strong. The damping is what it is being played on.
   *
   * Just short of a half is a harp — it rings for seconds and keeps its brightness. A little further
   * short and the top is gone almost at once, which is a pizzicato bass. One routine, two
   * instruments, and the only difference between them is the fourth decimal place.
   */
  private pluck(frequency: number, at: number, gain: number, damping: number): void {
    const context = this.context
    if (!context || !this.reverb || !this.master)
      return

    const source = context.createBufferSource()
    /*
     * The string is built at whatever pitch a whole number of samples gives, and then played back at
     * the rate that corrects it.
     *
     * A delay line is an integer number of samples long, so the pitch it produces is the sample rate
     * over that integer — and high up that is as much as seventeen cents out. On a figure that
     * repeats every bar that is not character, it is out of tune. Resampling fixes it exactly and
     * costs nothing, because the browser is resampling the buffer either way.
     */
    const built = string(context, frequency, damping)
    source.buffer = built.buffer
    source.playbackRate.value = frequency / built.frequency

    const wet = context.createGain()
    wet.gain.value = gain
    source.connect(wet)
    wet.connect(this.reverb)

    // A little dry as well, or the attack is lost in the room and it stops sounding plucked.
    const dry = context.createGain()
    dry.gain.value = gain * 0.5
    source.connect(dry)
    dry.connect(this.master)
    source.start(at)
  }

  /**
   * The flute: a triangle with breath through it, and a vibrato that arrives late.
   *
   * The late vibrato is the whole trick. A tone that wobbles from the first instant is a synthesiser
   * setting; a player leans into it a moment after the note has spoken, and copying that is most of
   * the difference between a wind instrument and an oscillator with an LFO on it.
   */
  private flute(frequency: number, at: number, length: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const oscillator = context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = frequency

    const vibrato = context.createOscillator()
    vibrato.frequency.value = 5.2
    const depth = context.createGain()
    depth.gain.setValueAtTime(0, at)
    depth.gain.setValueAtTime(0, at + length * 0.3)
    depth.gain.linearRampToValueAtTime(5, at + length * 0.7)
    vibrato.connect(depth).connect(oscillator.detune)

    // The breath: a little band of noise under the note, which is what a flute mostly is.
    const air = context.createBufferSource()
    air.buffer = noise(context, 1, 0)
    air.loop = true
    const airBand = context.createBiquadFilter()
    airBand.type = 'bandpass'
    airBand.frequency.value = frequency * 2
    airBand.Q.value = 2.2
    const airGain = context.createGain()
    airGain.gain.value = 0.05

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    // Blown, not struck: a tenth of a second to speak.
    gain.gain.exponentialRampToValueAtTime(FLUTE_GAIN, at + 0.11)
    gain.gain.setValueAtTime(FLUTE_GAIN, at + length * 0.7)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)

    oscillator.connect(gain)
    air.connect(airBand).connect(airGain).connect(gain)
    gain.connect(this.reverb)

    oscillator.start(at)
    oscillator.stop(at + length + 0.05)
    vibrato.start(at)
    vibrato.stop(at + length + 0.05)
    air.start(at)
    air.stop(at + length + 0.05)
  }

  /** Three sawtooths a few cents apart through a lowpass: two beat, three shimmer. */
  private strings(frequency: number, at: number, length: number, drive: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const gain = context.createGain()
    const swell = length * 0.35
    const peak = STRING_GAIN * (0.7 + drive * 0.6)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + swell)
    gain.gain.setValueAtTime(peak, at + length - swell)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1_500
    filter.Q.value = 0.5
    filter.connect(gain)
    gain.connect(this.reverb)

    for (const cents of [-7, 0, 7]) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sawtooth'
      oscillator.frequency.value = frequency
      oscillator.detune.value = cents
      oscillator.connect(filter)
      oscillator.start(at)
      oscillator.stop(at + length + 0.1)
    }
  }
}

/**
 * One plucked note, rendered once and kept.
 *
 * Cached per context and per pitch to the nearest hertz: the figure repeats every bar and the whole
 * piece only ever uses a couple of dozen notes, so after the first few bars this never runs again.
 */
const strings = new WeakMap<AudioContext, Map<number, AudioBuffer>>()

function string(context: AudioContext, frequency: number, damping: number): { buffer: AudioBuffer, frequency: number } {
  let cache = strings.get(context)
  if (!cache) {
    cache = new Map()
    strings.set(context, cache)
  }
  const rate = context.sampleRate
  // Keyed by the delay line and how hard it is damped: those are the only two things that vary.
  const period = Math.max(2, Math.round(rate / frequency))
  const key = period * 100 + Math.round((damping - 0.49) * 10_000)
  const known = cache.get(key)
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

  cache.set(key, buffer)
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
  // Keyed on both, or the flute's flat breath and the reverb's decaying tail collide.
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
