import type { PlayingSFX, UISFXPlayer } from 'uisfx'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { cueNames } from 'uisfx'
import { describe, expect, it, vi } from 'vitest'
import { AudioBus } from '~/audio/AudioBus'
import { SILENT_BY_DESIGN, SOUND_CUES } from '~/audio/cues'

const projectRoot = resolve(import.meta.dirname, '../..')

function fakePlayer(unlockResults: boolean[] = []): { player: UISFXPlayer, played: string[] } {
  const played: string[] = []
  let attempt = 0
  const handle: PlayingSFX = { stop: vi.fn(), ended: Promise.resolve() }
  const player: UISFXPlayer = {
    unlock: async () => unlockResults[attempt++] ?? true,
    play: (cue) => {
      played.push(cue)
      return handle
    },
    preload: async () => {},
    setPack: vi.fn(),
    getPack: () => 'zen',
    setVolume: vi.fn(),
    getVolume: () => 1,
    setEnabled: vi.fn(),
    isEnabled: () => true,
    stopAll: vi.fn(),
    destroy: async () => {},
  }
  return { player, played }
}

function appSources(): string[] {
  const walk = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
      const path = resolve(directory, entry)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
  return walk(resolve(projectRoot, 'app'))
    .filter(path => /\.(?:ts|vue)$/.test(path) && !path.endsWith('cues.ts'))
    .map(path => readFileSync(path, 'utf8'))
}

describe('sound contract', () => {
  it('maps every domain event to a cue the library actually ships', () => {
    const known = new Set<string>(cueNames)

    for (const [event, binding] of Object.entries(SOUND_CUES)) {
      expect(known, `${event} maps to unknown cue "${binding.cue}"`).toContain(binding.cue)
      expect(binding.reason, `${event} has no reason`).toMatch(/^.{12,}\.$/s)
    }
  })

  it('rate-limits the two cues that fire on every control', () => {
    // Hover and press are heard thousands of times. Without a cooldown, dragging the pointer
    // across a dense panel machine-guns the player.
    expect(SOUND_CUES['ui.hover'].options?.cooldownMs).toBeGreaterThan(0)
    expect(SOUND_CUES['ui.press'].options?.cooldownMs).toBeGreaterThan(0)
  })

  it('never attenuates a cue into inaudibility', () => {
    /*
     * Measured in Chrome, not assumed: at full volume the zen cues peak at about 0.018 for hover
     * and 0.064 for an outcome — roughly -35 and -24 dBFS. The pack already encodes that balance,
     * so a second attenuation is what silenced the interface once before. A cue may sit under the
     * others, but never by more than half.
     */
    for (const [event, binding] of Object.entries(SOUND_CUES)) {
      const volume = binding.options?.volume
      if (volume !== undefined)
        expect(volume, `${event} is attenuated to ${volume}`).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('never sounds a lost vote as a system error', () => {
    /*
     * docs/GAME_DESIGN.md: "Passing is not guaranteed; failing is a legitimate and consequential
     * outcome." An error tone would tell the player the game broke rather than that the council
     * said no, so `error` stays reserved for genuine faults.
     */
    expect(SOUND_CUES['vote.failed'].cue).not.toBe('error')
    const errorEvents = Object.entries(SOUND_CUES).filter(([, binding]) => binding.cue === 'error')
    expect(errorEvents.map(([event]) => event).sort()).toEqual(['hud.saveFailed', 'hud.simulationFailed'])
  })

  it('keeps the silent-by-design list disjoint from the mapped events', () => {
    for (const event of Object.keys(SILENT_BY_DESIGN))
      expect(SOUND_CUES, `${event} is both mapped and documented as silent`).not.toHaveProperty(event)
  })

  it('has no cue that nothing in the product ever emits', () => {
    const sources = appSources().join('\n')

    for (const event of Object.keys(SOUND_CUES))
      expect(sources, `nothing emits ${event}`).toContain(`'${event}'`)
  })
})

describe('audioBus', () => {
  it('stays silent until a trusted gesture has unlocked it', async () => {
    const { player, played } = fakePlayer()
    const bus = new AudioBus({ createPlayer: () => player })

    bus.play('vote.passed')
    expect(played).toEqual([])

    await bus.unlock()
    bus.play('vote.passed')
    expect(played).toEqual(['success'])
  })

  it('keeps a cue raised during the unlock handshake instead of losing it', async () => {
    /*
     * Regression: the click that opens the party hall raises `stage.forward` a tick before the
     * AudioContext finishes resuming, so the first navigation of every session was silent.
     */
    const { player, played } = fakePlayer()
    const bus = new AudioBus({ createPlayer: () => player })

    const opening = bus.unlock()
    bus.play('stage.forward')
    expect(played).toEqual([])

    await opening
    await Promise.resolve()
    expect(played).toEqual(['forward'])
  })

  it('stays silent while the player has sound switched off', async () => {
    const { player, played } = fakePlayer()
    const bus = new AudioBus({ createPlayer: () => player })
    await bus.unlock()

    bus.setEnabled(false)
    bus.play('vote.passed')
    expect(played).toEqual([])

    bus.setEnabled(true)
    bus.play('vote.passed')
    expect(played).toEqual(['success'])
  })

  it('retries after a browser refuses the context instead of staying dead', async () => {
    /*
     * Regression, and the reason the interface was silent in a real browser. A refused context
     * resolves false rather than throwing; caching that promise made every later gesture reuse
     * the same refusal. A hover reached a button before the first click, spent the one attempt
     * with no user activation behind it, and no click afterwards could ever open audio again.
     */
    const { player, played } = fakePlayer([false])
    const bus = new AudioBus({ createPlayer: () => player })

    expect(await bus.unlock()).toBe(false)
    bus.play('vote.passed')
    expect(played).toEqual([])

    expect(await bus.unlock()).toBe(true)
    bus.play('vote.passed')
    expect(played).toEqual(['success'])
  })

  it('collapses concurrent unlock attempts onto one context', async () => {
    const createPlayer = vi.fn(() => fakePlayer().player)
    const bus = new AudioBus({ createPlayer })

    await Promise.all([bus.unlock(), bus.unlock(), bus.unlock()])
    expect(createPlayer).toHaveBeenCalledTimes(1)
  })

  it('survives a browser that refuses an audio context', async () => {
    const refuse = (): never => {
      throw new Error('blocked')
    }
    const bus = new AudioBus({ createPlayer: refuse })

    await expect(bus.unlock()).resolves.toBe(false)
    expect(() => bus.play('vote.passed')).not.toThrow()
  })

  it('runs one loop at a time and only answers a loop that was audible', async () => {
    const { player, played } = fakePlayer()
    const bus = new AudioBus({ createPlayer: () => player })
    await bus.unlock()

    bus.startLoop('work.started')
    bus.startLoop('work.started')
    expect(played).toEqual(['processing'])

    bus.stopLoop('work.started', 'work.finished')
    expect(played).toEqual(['processing', 'complete'])

    // A computation that never became audible must not announce its own end.
    bus.stopLoop('work.started', 'work.finished')
    expect(played).toEqual(['processing', 'complete'])
  })
})
