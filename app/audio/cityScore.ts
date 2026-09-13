/**
 * The music the city is played over.
 *
 * Generated rather than played back. A loop that fits in a download is two minutes long and a
 * campaign is hours: however good the two minutes are, the fourth time round the player hears the
 * seam and after that they hear nothing else. This has no seam because it has no loop.
 *
 * Four versions of this file are worth recording, because each was wrong in its own way and the
 * fourth is the one that says what this should sound like.
 *
 * Sine and triangle oscillators through a gentle filter sound like a signal generator, and no amount
 * of rewriting the harmony fixed that. A sawtooth bass with the filter swept down on every note and
 * a kick on one and three is a good sound and a *dance* sound, and a city to sit and think in does
 * not want a floor thumping under it. And plucked strings by Karplus–Strong, which is the obvious
 * way to get a harp, are excited by a burst of raw noise — which is why they twang: the attack is
 * a rubber band, and past a certain brightness that is all you hear.
 *
 * What survived every version was the pad. So this is built around it: everything is a synthesiser
 * and everything is warm, rather than a chamber group pretending to be in a room.
 *
 * - the **bells** that carry the figure are two sines, one modulating the other, with the depth of
 *   the modulation falling away over the first fraction of a second. That is all FM is, and it is
 *   the whole of why a Rhodes and a tubular bell and a marimba can be the same four lines: what
 *   decides which is how fast the modulation dies and how far apart the two frequencies are;
 * - the **bass** is a sine with a triangle folded under it, plucked with a soft attack and a slow
 *   release, and filtered so the top never arrives at all;
 * - the **strings** are three sawtooths a few cents apart through a lowpass, swelling in and out.
 *   Three, because two beat against each other and three shimmer. This is the part that worked from
 *   the beginning and it has not been touched since;
 * - the **lead** is a bell held long, with a vibrato that arrives after the note has, because a
 *   player's does too.
 *
 * The harmony is the one thing carried over from the chamber version: sevenths and ninths rather
 * than triads, and a progression that opens from minor into major and goes round rather than
 * arriving.
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
 * again is the only thing that could happen next.
 */
const CHANGES = [
  [5, 7, 9, 11, 13],
  [3, 5, 7, 9],
  [0, 2, 4, 6],
  [4, 6, 8, 12],
]
const BARS_PER_CHANGE = 2

/**
 * How the figure runs through a chord: which note of it, on each eighth of the bar.
 *
 * Up, over the top, and back through the middle. Indices into whatever chord is current, so the
 * shape survives the changes and the colour does not.
 */
const FIGURE = [0, 1, 2, 3, 4, 3, 2, 1]

/** Which notes of the chord the lead reaches for, and how long it holds them. */
const PHRASE: (number | null)[] = [2, null, null, 3, null, 1, null, null]
const LEAD_LENGTH = BEAT * 1.8

const BELL_GAIN = 0.07
const BASS_GAIN = 0.12
const LEAD_GAIN = 0.05
const STRING_GAIN = 0.018

/**
 * What the bells are made of.
 *
 * `ratio` is the modulator's frequency against the carrier's, and it decides the character: a whole
 * number gives a tone with harmonics where a tone should have them, and anything else gives a bell,
 * because a bell's partials are not whole multiples of anything. Two is a soft electric piano; the
 * lead sits a little below it, which sweetens it without making it glassy.
 *
 * `index` is how far the modulation pushes the carrier at the start of the note, and `decay` is how
 * fast that falls away. The fall is the entire sound: a bright attack collapsing to a near-sine is
 * what a struck thing does, and holding the index steady instead is what makes FM sound like 1985.
 */
const BELL = { ratio: 2, index: 3.2, decay: 0.13, length: 1.9 }
const LEAD = { ratio: 1.5, index: 1.4, decay: 0.35 }

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
       * The figure, an eighth at a time, right through the bar.
       *
       * This is what makes the piece move, and it is the reason there are no drums: something
       * running underneath is a pulse the listener feels without being told where the bar is.
       */
      FIGURE.forEach((index, eighth) => {
        const step = chord[index % chord.length]!
        // The second bar of a change is an octave up, so two bars of one chord are not one bar twice.
        this.bell(this.pitch(step + (second ? 21 : 14)), at + eighth * BEAT * 0.5, BELL_GAIN, BELL)
      })

      // The bass: the root on the first beat, and the fifth on the third when the city is awake.
      this.bass(this.pitch(chord[0]!) / 2, at, BEAT * 1.8)
      if (drive > 0.3)
        this.bass(this.pitch(chord[2]!) / 2, at + BEAT * 2, BEAT * 1.4)

      /*
       * The lead over the top, and only in the second bar of each change.
       *
       * A lead that plays every bar is not a melody, it is a texture. Leaving it out of the first
       * bar gives the figure somewhere to be heard and gives the phrase somewhere to arrive.
       */
      if (second) {
        PHRASE.forEach((index, eighth) => {
          if (index === null)
            return
          this.lead(this.pitch(chord[index % chord.length]! + 14), at + eighth * BEAT * 0.5)
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
   * A bell, by frequency modulation: one sine pushing another one about.
   *
   * The modulator's output is added to the carrier's frequency, so as the modulator swings the
   * carrier goes sharp and flat hundreds of times a second — far too fast to hear as a wobble, and
   * what the ear makes of it instead is harmonics. How far it swings decides how many; how fast that
   * collapses decides what the thing is.
   *
   * `decay` is the whole instrument. Falling away in a tenth of a second gives a struck sound with a
   * bright edge that is gone before you can name it, which is what makes this sit next to a pad
   * instead of on top of it. This is what replaced the plucked strings: Karplus–Strong is excited by
   * a burst of raw noise, and that noise is audible as a twang at the front of every note.
   */
  private bell(
    frequency: number,
    at: number,
    peak: number,
    voice: { ratio: number, index: number, decay: number, length?: number },
    hold = 0,
    vibrato?: { rate: number, cents: number, onset: number },
  ): void {
    const context = this.context
    if (!context || !this.reverb || !this.master)
      return

    const carrier = context.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = frequency

    const modulator = context.createOscillator()
    modulator.type = 'sine'
    modulator.frequency.value = frequency * voice.ratio

    // The modulator's depth in hertz, falling from `index` times the carrier to nothing.
    const depth = context.createGain()
    depth.gain.setValueAtTime(frequency * voice.index, at)
    depth.gain.exponentialRampToValueAtTime(frequency * 0.001, at + voice.decay)
    modulator.connect(depth).connect(carrier.frequency)

    const length = voice.length ?? 1.4
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    // Six milliseconds to speak: struck, but without the click that no attack at all would give.
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.006)
    if (hold > 0)
      gain.gain.setValueAtTime(peak * 0.6, at + hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length + hold)

    // Most of it in the room, a little of it dry, or the attack is lost and it stops being struck.
    const dry = context.createGain()
    dry.gain.value = 0.45
    gain.connect(this.reverb)
    gain.connect(dry)
    dry.connect(this.master)

    /*
     * The vibrato, where the voice asks for one, on the carrier's detune rather than its frequency.
     *
     * It has to be built in here, because this is the only place the carrier exists. It was written
     * outside for one draft and connected to nothing at all: two oscillators a note, running, doing
     * nothing, and a lead with no vibrato on it.
     */
    if (vibrato) {
      const wobble = context.createOscillator()
      wobble.frequency.value = vibrato.rate
      const depth = context.createGain()
      depth.gain.setValueAtTime(0, at)
      depth.gain.setValueAtTime(0, at + vibrato.onset)
      depth.gain.linearRampToValueAtTime(vibrato.cents, at + length + hold)
      wobble.connect(depth).connect(carrier.detune)
      wobble.start(at)
      wobble.stop(at + length + hold + 0.1)
    }

    carrier.connect(gain)
    carrier.start(at)
    carrier.stop(at + length + hold + 0.1)
    modulator.start(at)
    modulator.stop(at + length + hold + 0.1)
  }

  /**
   * The lead: the same bell held long, with a vibrato that arrives after the note has.
   *
   * The late vibrato is the trick. A tone that wobbles from the first instant is a synthesiser
   * setting; a player leans into it a moment after the note has spoken, and copying that is most of
   * the difference between a lead and an oscillator with an LFO on it.
   */
  private lead(frequency: number, at: number): void {
    this.bell(
      frequency,
      at,
      LEAD_GAIN,
      { ...LEAD, length: LEAD_LENGTH },
      LEAD_LENGTH * 0.5,
      { rate: 5, cents: 6, onset: LEAD_LENGTH * 0.35 },
    )
  }

  /**
   * The bass: a sine with a triangle folded under it, plucked soft and filtered dark.
   *
   * Not a plucked string and not a filter sweep. Both of those have an edge at the front of the
   * note, and this one is meant to be felt rather than heard — a low note that arrives without
   * announcing itself and leaves without being switched off.
   */
  private bass(frequency: number, at: number, length: number): void {
    const context = this.context
    if (!context || !this.master)
      return

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.4

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    // Twenty-five milliseconds: enough of an attack to be a note, soft enough not to be a pluck.
    gain.gain.exponentialRampToValueAtTime(BASS_GAIN, at + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    filter.connect(gain)
    gain.connect(this.master)

    for (const [shape, ratio, level] of [['sine', 1, 1], ['triangle', 2, 0.28]] as const) {
      const oscillator = context.createOscillator()
      oscillator.type = shape
      oscillator.frequency.value = frequency * ratio
      const mix = context.createGain()
      mix.gain.value = level
      oscillator.connect(mix).connect(filter)
      oscillator.start(at)
      oscillator.stop(at + length + 0.05)
    }
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
