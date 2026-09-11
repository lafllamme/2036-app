import type { SoundEvent } from '~/audio/cues'
import { useAudioBus } from '~/audio/AudioBus'

/**
 * Component access to the sound contract. Components only reach for this where they hold context
 * no watcher can see — the price of the option being voted on, or the fourth priority the store
 * drops without a trace. Everything else is bound centrally in `app/audio/storeSounds.ts`.
 */
export function useSound(): { play: (event: SoundEvent) => void } {
  const bus = useAudioBus()
  return { play: (event: SoundEvent) => void bus.play(event) }
}
