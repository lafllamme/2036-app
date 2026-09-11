import { createGlobalState, useLocalStorage, watchImmediate } from '@vueuse/core'
import { ref } from 'vue'
import { DEFAULT_VOLUME, useAudioBus } from '~/audio/AudioBus'

/**
 * Player sound preferences, deliberately outside Pinia.
 *
 * A Pinia setup store serialises its refs into the server payload and restores them during
 * hydration, which overwrote the values just read from localStorage: a player who muted the game
 * heard it again on the next load. Global state keeps the stored value authoritative.
 */
export const useSoundSettings = createGlobalState(() => {
  // useLocalStorage degrades to its initial value during server rendering and when site data is
  // blocked, so the game starts either way and the preference simply does not persist.
  const soundEnabled = useLocalStorage('2036-sound-enabled', true)
  /*
   * Key bumped once, deliberately. An earlier build stored a 0.6 master that was calibrated wrong
   * and left the interface near-inaudible; a stored preference outranks a changed default, so
   * everyone who had already opened the game would have kept the broken level forever.
   */
  const soundVolume = useLocalStorage('2036-sound-volume-v2', DEFAULT_VOLUME)
  const settingsOpen = ref(false)

  function openSettings(): void {
    settingsOpen.value = true
  }

  function closeSettings(): void {
    settingsOpen.value = false
  }

  function toggleSound(): void {
    soundEnabled.value = !soundEnabled.value
  }

  return { soundEnabled, soundVolume, settingsOpen, openSettings, closeSettings, toggleSound }
})

/** Applies the stored preferences to the bus and keeps them in sync. Client-side only. */
export function connectSoundSettings(): () => void {
  const bus = useAudioBus()
  const { soundEnabled, soundVolume } = useSoundSettings()
  return watchImmediate([soundEnabled, soundVolume], ([enabled, volume]) => {
    bus.setEnabled(enabled)
    bus.setVolume(volume)
  })
}
