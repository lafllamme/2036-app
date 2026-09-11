import type { PackName, PlayingSFX, UISFXPlayer } from 'uisfx'
import type { SoundEvent } from './cues'
import { SOUND_CUES } from './cues'

/** The pack chosen for 2036: paper folds, soft brush, warm wood, quiet chimes. */
export const DEFAULT_PACK: PackName = 'zen'
/*
 * Full scale. The pack's own cues peak around -24 dBFS, so there is no headroom to reclaim here,
 * and anything below this puts hover under the noise floor of a laptop speaker. The slider exists
 * to go quieter; 100 % is the calibrated top.
 */
export const DEFAULT_VOLUME = 1

export interface SoundTrace {
  event: SoundEvent
  /** False when the bus was locked or muted, so a test can tell intent from audibility. */
  played: boolean
}

/** Enough history for one player flow; the trace exists for verification, not for playback. */
const TRACE_LIMIT = 120

export interface AudioBusOptions {
  /**
   * How the underlying player is built. Injected so the bus can be exercised in a Node test
   * without an AudioContext, and so a future music bus can share one AudioContext with it.
   */
  createPlayer?: () => UISFXPlayer | Promise<UISFXPlayer>
}

/**
 * One gate for every sound the product makes.
 *
 * The bus is silent until `unlock()` has run inside a trusted gesture — browsers refuse audio
 * before that, and a queued backlog firing at once on the first click is worse than silence. It
 * stays silent whenever the player has switched sound off. Callers never check either condition;
 * they emit their domain event and the bus decides.
 */
export class AudioBus {
  private player: UISFXPlayer | null = null
  private unlocking: Promise<boolean> | null = null
  private unlocked = false
  private enabled = true
  private volume = DEFAULT_VOLUME
  private pack: PackName = DEFAULT_PACK
  private readonly loops = new Map<SoundEvent, PlayingSFX>()
  private readonly recent: SoundTrace[] = []
  private readonly createPlayer: () => UISFXPlayer | Promise<UISFXPlayer>

  constructor(options: AudioBusOptions = {}) {
    this.createPlayer = options.createPlayer ?? (async () => {
      const { createUISFX } = await import('uisfx')
      return createUISFX({ pack: this.pack, volume: this.volume, enabled: this.enabled, maxVoices: 8 })
    })
  }

  get isUnlocked(): boolean {
    return this.unlocked
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Call from a trusted pointer or keyboard event. Concurrent calls collapse onto the attempt in
   * flight, so every listener may call it without coordinating — but a *failed* attempt is never
   * cached, because the next real gesture deserves a fresh try.
   */
  async unlock(): Promise<boolean> {
    if (this.unlocked)
      return true
    this.unlocking ??= this.openContext()
    return this.unlocking
  }

  private async openContext(): Promise<boolean> {
    try {
      const player = await this.createPlayer()
      player.setVolume(this.volume)
      player.setEnabled(this.enabled)
      player.setPack(this.pack)
      const opened = await player.unlock()
      this.player = player
      this.unlocked = opened
      /*
       * A browser that refuses the context resolves false rather than throwing. Keeping that
       * promise would make `??=` hand the same false to every later gesture and leave the bus
       * permanently silent — which is exactly what happened when a hover raced ahead of the
       * first click and spent the one attempt before any user activation existed.
       */
      if (!opened)
        this.unlocking = null
      return opened
    }
    catch {
      // A blocked or unavailable AudioContext must never take the interface down with it.
      this.unlocking = null
      return false
    }
  }

  play(event: SoundEvent): PlayingSFX | null {
    if (!this.enabled) {
      this.record(event, false)
      return null
    }
    /*
     * A cue emitted while the unlock handshake is still in flight belongs to the gesture that
     * started it — the click that opens the party hall raises `stage.forward` a tick before the
     * AudioContext finishes resuming. Dropping it silenced the first navigation of every session.
     * This defers those few milliseconds; it does not queue anything from before the gesture.
     */
    if (!this.unlocked) {
      if (!this.unlocking) {
        this.record(event, false)
        return null
      }
      void this.unlocking.then(opened => opened ? this.emit(event) : this.record(event, false))
      return null
    }
    return this.emit(event)
  }

  private emit(event: SoundEvent): PlayingSFX | null {
    const player = this.enabled ? this.player : null
    this.record(event, player !== null)
    if (!player)
      return null
    const binding = SOUND_CUES[event]
    return player.play(binding.cue, binding.options)
  }

  private record(event: SoundEvent, played: boolean): void {
    this.recent.push({ event, played })
    if (this.recent.length > TRACE_LIMIT)
      this.recent.shift()
  }

  /**
   * What the product has tried to say, most recent last. An end-to-end test reads this instead of
   * a waveform: it proves the interface emitted the right event at the right moment, which is the
   * part worth guarding. Whether the speaker was on is the browser's business.
   */
  get trace(): readonly SoundTrace[] {
    return this.recent
  }

  /** Starts a looping cue, or does nothing if that loop is already running. */
  startLoop(event: SoundEvent): void {
    if (this.loops.has(event))
      return
    const handle = this.play(event)
    if (handle)
      this.loops.set(event, handle)
  }

  /**
   * Stops a loop and optionally answers it. The answer only sounds when the loop was actually
   * audible, so a computation that finished in twelve milliseconds stays silent from end to end.
   */
  stopLoop(event: SoundEvent, resolvedWith?: SoundEvent): void {
    const handle = this.loops.get(event)
    if (!handle)
      return
    handle.stop()
    this.loops.delete(event)
    if (resolvedWith)
      this.play(resolvedWith)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.player?.setEnabled(enabled)
    if (!enabled)
      this.stopAll()
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    this.player?.setVolume(this.volume)
  }

  getVolume(): number {
    return this.volume
  }

  setPack(pack: PackName): void {
    this.pack = pack
    this.player?.setPack(pack)
  }

  getPack(): PackName {
    return this.pack
  }

  stopAll(): void {
    for (const handle of this.loops.values()) handle.stop()
    this.loops.clear()
    this.player?.stopAll()
  }

  async destroy(): Promise<void> {
    this.stopAll()
    await this.player?.destroy()
    this.player = null
    this.unlocked = false
    this.unlocking = null
  }
}

let shared: AudioBus | null = null

/** The application-wide bus. Created on first use so server rendering never touches it. */
export function useAudioBus(): AudioBus {
  shared ??= new AudioBus()
  return shared
}

/** Test seam: replaces the shared instance and returns it. */
export function setAudioBus(bus: AudioBus | null): AudioBus | null {
  shared = bus
  return shared
}
