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
 * Slow enough to live under a city, fast enough to pull. The first version of this was chords and
 * nothing else, and a pad with no pulse under it is not music you can play to for hours — it is a
 * drone, which is the exact thing the city already has in its traffic.
 */
const BPM = 76
const BEAT = 60 / BPM
const BAR = BEAT * 4

/**
 * The mode: D dorian, which is minor without the leading note that would pull it anywhere.
 *
 * As semitones over the root, across three octaves. Dorian rather than natural minor for the raised
 * sixth: it is the one note that keeps a minor key from sounding sad rather than serious, and the
 * difference between mystical and miserable is almost entirely that note.
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
/** How long a melody note rings, and how much of the bar carries one at all. */
const NOTE_DECAY = 3.4
const NOTE_CHANCE = 0.45

/**
 * The arpeggio: the thing that makes it move.
 *
 * A figure running through the chord at a steady eighth, quiet, plucked rather than bowed. This is
 * the whole difference between a score you play along to and one you notice and turn off — chords
 * and a bass give a piece a floor, but nothing in it is going anywhere until something repeats fast
 * enough to be felt as motion.
 *
 * Its density follows the city: an empty street gets half the figure, a busy one gets all of it and
 * the filter opens. See `setIntensity`.
 */
const ARP_STEP = 0.5
const ARP_GAIN = 0.028
const ARP_DECAY = 0.85

const PAD_GAIN = 0.032
const NOTE_GAIN = 0.032
const BASS_GAIN = 0.08
const TICK_GAIN = 0.012
/** Where the arpeggio's filter sits at rest and how far the city can open it. */
const ARP_CUTOFF: [number, number] = [1_100, 4_200]

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
  /** Where the arpeggio has got to, so it walks on rather than restarting every bar. */
  private arp = 0
  /** Which note of the current chord the line is sitting on. */
  private melody = 2
  /**
   * How much is going on in the city, 0 … 1.
   *
   * The one thing outside the music that the music listens to. It thickens the arpeggio and opens
   * its filter, so a quiet night is sparse and a busy street has something driving under it — the
   * score is part of the game rather than something playing next to it.
   */
  private intensity = 0.3
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
      const drive = this.intensity

      /*
       * The pad is written once per change and held across both its bars, so it breathes over the
       * progression rather than restarting every four beats.
       */
      if (fresh) {
        const held = BAR * BARS_PER_CHANGE
        for (const step of chord)
          this.voice('triangle', this.pitch(step + 7), at, held, PAD_GAIN, held * SWELL, 900, 6)
        // A fifth held under the whole change, two octaves down. This is the mystical part: an open
        // interval that never moves is what makes a minor chord read as old rather than as sad.
        this.voice('sine', this.pitch(chord[0]!) / 4, at, held, PAD_GAIN * 1.3, held * SWELL, 320, 0)
      }

      /*
       * The pulse, slightly syncopated: one, the back half of two, and three.
       *
       * Dead on one and three is a metronome. Pushing the middle one late is the difference between
       * a piece that keeps time and a piece that has a gait.
       */
      this.voice('sine', this.pitch(chord[0]!) / 2, at, BEAT * 1.3, BASS_GAIN, 0.035, 220, 0)
      this.voice('sine', this.pitch(chord[0]!) / 2, at + BEAT * 1.5, BEAT * 0.7, BASS_GAIN * 0.55, 0.03, 220, 0)
      this.voice('sine', this.pitch(chord[0]!) / 2, at + BEAT * 2.5, BEAT * 1.2, BASS_GAIN * 0.75, 0.035, 220, 0)

      /*
       * The arpeggio. Up the chord and back down, an eighth at a time, skipping steps when the city
       * is quiet so the figure thins out rather than stopping.
       */
      const ladder = [...chord, ...chord.slice(1, -1).reverse()]
      for (let step = 0; step * ARP_STEP < 4; step += 1) {
        if (Math.random() > 0.45 + drive * 0.55)
          continue
        const degree = ladder[(this.arp + step) % ladder.length]!
        this.voice(
          'triangle',
          this.pitch(degree + 14),
          at + step * ARP_STEP * BEAT,
          ARP_DECAY,
          ARP_GAIN * (0.7 + drive * 0.5),
          0.008,
          ARP_CUTOFF[0] + (ARP_CUTOFF[1] - ARP_CUTOFF[0]) * drive,
          0,
        )
      }
      this.arp += 3

      // And a brush on the off-beats, barely there: what keeps the bar from feeling empty.
      this.brush(at + BEAT * 1.5)
      this.brush(at + BEAT * 3.5, 0.7)

      /*
       * A line over the top, and only on notes that belong to the chord under it.
       *
       * It used to walk the scale freely, which is where the wrongness came from: a free walk lands
       * on the second and the seventh as often as on anything else, and against a chord that does
       * not contain them it is simply out of tune. It steps between chord tones now, with the odd
       * passing note in between, so it is still a line rather than an arpeggio but it is never at
       * odds with what is underneath it.
       */
      for (const beat of [0.5, 1.75, 3]) {
        if (Math.random() > NOTE_CHANCE)
          continue
        const move = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : 0
        this.melody = Math.max(0, Math.min(chord.length - 1, this.melody + move))
        const degree = chord[this.melody]! + (Math.random() < 0.25 ? 1 : 0)
        this.voice('triangle', this.pitch(degree + 14), at + BEAT * beat, NOTE_DECAY, NOTE_GAIN, 0.08, 3_000, 0)
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
  private voice(shape: OscillatorType, frequency: number, at: number, length: number, peak: number, swell: number, cutoff: number, detune: number): void {
    const context = this.context
    if (!context || !this.reverb)
      return

    const oscillator = context.createOscillator()
    oscillator.type = shape
    oscillator.frequency.value = frequency
    /*
     * A cent or two off, but only where it belongs.
     *
     * Two pad voices at exactly the same frequency are one voice; a little apart they beat against
     * each other, which is most of what makes a pad sound like more than one thing. The same trick
     * on a single exposed note is not warmth, it is being out of tune — which is what it sounded
     * like, because that is what it was.
     */
    oscillator.detune.value = (Math.random() - 0.5) * detune

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
