import { useEventListener } from '@vueuse/core'
import { useAudioBus } from '~/audio/AudioBus'
import { bindInteractionSounds } from '~/audio/interactionSounds'
import { bindStoreSounds } from '~/audio/storeSounds'
import { connectSoundSettings } from '~/composables/useSoundSettings'

/**
 * Wires both sound layers once, on the client only. The bus stays locked until the player's first
 * gesture, so nothing here makes a sound on its own.
 */
export default defineNuxtPlugin(() => {
  const bus = useAudioBus()
  // Applies the stored mute and volume before the first cue can fire.
  const unbindSettings = connectSoundSettings()

  const unbindInteraction = bindInteractionSounds(bus)
  const unbindStore = bindStoreSounds(bus)

  useEventListener(window, 'pagehide', () => bus.stopAll())

  /*
   * Verification hook. The end-to-end suite reads the emitted cue sequence rather than the audio
   * device, so a headless browser without a sound card still proves the interface said the right
   * thing at the right moment.
   */
  if (import.meta.dev)
    Reflect.set(window, '__sound', { trace: () => bus.trace, unlocked: () => bus.isUnlocked })

  return {
    provide: {
      sound: {
        bus,
        unbind: () => {
          unbindInteraction()
          unbindStore()
          unbindSettings()
        },
      },
    },
  }
})
