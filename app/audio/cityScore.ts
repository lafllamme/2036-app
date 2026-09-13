/**
 * The music the city is played over.
 *
 * Generated rather than played back. A loop that fits in a download is two or three minutes long and
 * a campaign is hours: however good the two minutes are, the fourth time round the player hears the
 * seam and after that they hear nothing else. This has no seam because it has no loop — the piece is
 * written a bar at a time, a few seconds ahead of itself, and never plays the same sequence twice.
 *
 * It is also, for the same reason as the rest of the sound in this project, nobody else's: no file,
 * no licence, no attribution page. A pad, a bass pulse, a brushed off-beat and a line over the top,
 * which is not much of an orchestra and is the entire point — the city already has traffic, crowds
 * and sirens, and a score that competes with them is a score the player turns off.
 *
 * The one rule it follows: it never resolves. It keeps time, so there is something to sit on, but
 * the progression goes round rather than arriving — no cadence, no final bar. A piece that arrives
 * somewhere asks to be listened to, and this is meant to be lived in for ten in-game years.
 */

/** How far ahead the score is written, and how often the writer wakes up. */
const HORIZON = 4
const TICK = 1.5

/**
 * The tempo.
 *
 * Slow, but a tempo. The first version of this was chords and nothing else, and a pad with no pulse
 * under it is not music you can play to for hours — it is a drone, which is the exact thing the city
 * already has in its traffic and the exact thing this was meant to be the opposite of. What makes
 * something you can leave running is that it keeps time: a bar goes past, another one starts, and
 * the ear has something to sit on without having to listen.
 */
const BPM = 68
const BEAT = 60 / BPM
const BAR = BEAT * 4

/**
 * The mode: D dorian, which is minor without the leading note that would pull it anywhere.
 *
 * As semitones over the root, across three octaves.
 */
const ROOT = 146.83
const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24]

/**
 * The changes: four chords, two bars each, and it never resolves.
 *
 * i — VII — III — iv, which is the progression half the world's ambient music is built on because it
 * goes round for ever without arriving. Each is a seventh rather than a triad: a triad states
 * something and a seventh leaves it open.
 */
const CHANGES = [
  [0, 2, 4, 6],
  [6, 8, 10, 12],
  [2, 4, 6, 8],
  [3, 5, 7, 9],
]
const BARS_PER_CHANGE = 2

/** How long the pad takes to come in and go out, as a share of the chord. */
const SWELL = 0.35
/** How often a single note is placed over the bar, and how long it rings. */
const NOTE_CHANCE = 0.5
const NOTE_DECAY = 3.2

const PAD_GAIN = 0.035
const NOTE_GAIN = 0.03
const BASS_GAIN = 0.085
const TICK_GAIN = 0.014

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
  /** Which bar of the piece is being written. The progression is read off it. */
  private bar = 0
  /** Where the last note was in the scale, so the next one is a step and not a leap. */
  private last = 7

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
     * A room to play it in.
     *
     * Three and a half seconds of decaying noise as an impulse response — not a real room, but the
     * difference between notes that stop and notes that hang, and that difference is most of what
     * makes this sound like music rather than like a synthesiser test.
     */
    const reverb = context.createConvolver()
    reverb.buffer = room(context, 3.4)
    const wet = context.createGain()
    wet.gain.value = 0.5
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
   * Write whatever the next few seconds need.
   *
   * A bar at a time. Everything is scheduled against the audio clock rather than played when the
   * timer fires, so a busy frame cannot make the music stutter — the browser has already been told
   * what to play and when, and a late timer only means the horizon gets a little shorter.
   */
  private write(): void {
    const context = this.context
    if (!context || !this.enabled)
      return

    while (this.written < context.currentTime + HORIZON) {
      const at = Math.max(this.written, context.currentTime + 0.05)
      const chord = CHANGES[Math.floor(this.bar / BARS_PER_CHANGE) % CHANGES.length]!
      const fresh = this.bar % BARS_PER_CHANGE === 0

      /*
       * The pad is written once per change and held across both its bars, so it breathes over the
       * progression rather than restarting every four beats.
       */
      if (fresh) {
        const held = BAR * BARS_PER_CHANGE
        for (const step of chord)
          this.voice('triangle', this.pitch(step + 7), at, held, PAD_GAIN, held * SWELL, 900)
      }

      /*
       * The pulse: the root of the chord, low, on the first and third beat.
       *
       * This is the whole difference between music and a drone. It is not loud and it is not a
       * drum — a short filtered note with a soft edge — but it is what the ear sits on, and it is
       * why this can run for an hour without becoming the thing you turn off.
       */
      this.voice('sine', this.pitch(chord[0]!) / 2, at, BEAT * 1.6, BASS_GAIN, 0.04, 220)
      this.voice('sine', this.pitch(chord[0]!) / 2, at + BEAT * 2, BEAT * 1.2, BASS_GAIN * 0.7, 0.04, 220)

      // And a brush on the off-beats, barely there: what keeps the bar from feeling empty.
      this.brush(at + BEAT * 1.5)
      this.brush(at + BEAT * 3.5, 0.7)

      /*
       * A line over the top. Each note steps from wherever the last one was, which is what makes a
       * sequence of choices sound like a melody rather than like a list, and it lands off the beat
       * as often as on it.
       */
      for (const beat of [0.5, 1.5, 2.25, 3]) {
        if (Math.random() > NOTE_CHANCE)
          continue
        this.last = Math.max(4, Math.min(SCALE.length - 1, this.last + Math.floor(Math.random() * 5) - 2))
        this.voice('triangle', this.pitch(this.last), at + BEAT * beat, NOTE_DECAY, NOTE_GAIN, 0.1, 2_600)
      }

      this.bar += 1
      this.written = at + BAR
    }
  }

  /** A step of the scale, as a frequency. Steps past the end of it simply go up an octave. */
  private pitch(step: number): number {
    const semitones = SCALE[step % SCALE.length]! + 12 * Math.floor(step / SCALE.length)
    return ROOT * 2 ** (semitones / 12)
  }

  /**
   * One note: an oscillator through a lowpass, fading in, holding and fading out.
   *
   * The filter is not decoration. A bare oscillator is a test tone however nice the notes are —
   * taking the top off it is most of the difference between a synthesiser and an instrument.
   */
  private voice(shape: OscillatorType, frequency: number, at: number, length: number, peak: number, swell: number, cutoff: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const oscillator = context.createOscillator()
    oscillator.type = shape
    oscillator.frequency.value = frequency
    /*
     * A cent or two off, chosen once per note. Two voices at exactly the same frequency are one
     * voice; a little apart they beat against each other, which is the whole of what makes a pad
     * sound like more than one thing.
     */
    oscillator.detune.value = (Math.random() - 0.5) * 9

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = 0.7

    const gain = context.createGain()
    const hold = Math.max(swell, length - swell)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + swell)
    gain.gain.setValueAtTime(peak, at + hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.reverb)
    oscillator.start(at)
    oscillator.stop(at + length + 0.1)
  }

  /** A brushed off-beat: a short band of noise, quiet enough to be felt rather than heard. */
  private brush(at: number, level = 1): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const source = context.createBufferSource()
    source.buffer = room(context, 0.25)

    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 5_200
    filter.Q.value = 1.1

    const gain = context.createGain()
    gain.gain.setValueAtTime(TICK_GAIN * level, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.reverb)
    source.start(at)
    source.stop(at + 0.3)
  }
}

/**
 * Decaying noise, used both as the reverb's impulse response and as the brush on the off-beat.
 *
 * Cached per context and per length: building three seconds of noise is a hundred and thirty
 * thousand random numbers, and doing it every chord would be the only expensive thing in the sound.
 */
const rooms = new WeakMap<AudioContext, Map<number, AudioBuffer>>()

function room(context: AudioContext, seconds: number): AudioBuffer {
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
      data[sample] = (Math.random() * 2 - 1) * (1 - sample / length) ** 2.6
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
