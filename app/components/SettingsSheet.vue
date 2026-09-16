<script setup lang="ts">
import { computed } from 'vue'
import { useSound } from '~/composables/useSound'
import { useSoundSettings } from '~/composables/useSoundSettings'

const { settingsOpen, soundEnabled, soundVolume, closeSettings, toggleSound: toggleSettingsSound } = useSoundSettings()
const sound = useSound()

const volumePercent = computed({
  get: () => Math.round(soundVolume.value * 100),
  set: (value: number) => { soundVolume.value = value / 100 },
})

function toggleSound(): void {
  toggleSettingsSound()
  // Switching off is confirmed by the silence that follows; switching on needs a sample.
  if (soundEnabled.value)
    sound.play('entry.priorityAdded')
}

/** The slider is the one control where hearing the level is the point. */
function previewVolume(): void {
  sound.play('ui.press')
}
</script>

<template>
  <div v-if="settingsOpen" class="modal-backdrop" @click.self="closeSettings()">
    <article class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button type="button" class="close-button" aria-label="Einstellungen schließen" @click="closeSettings()">
        ×
      </button>
      <small>Einstellungen</small>
      <h2 id="settings-title">
        Ton
      </h2>

      <div class="settings-row">
        <div class="settings-label">
          <strong>Oberflächenklang</strong>
          <p>Kurze Rückmeldungen für Bedienung, Ratsvorlagen, Abstimmungen und den Haushalt.</p>
        </div>
        <button
          type="button"
          class="quiet-button"
          role="switch"
          :aria-checked="soundEnabled"
          @click="toggleSound"
        >
          {{ soundEnabled ? 'An' : 'Aus' }}
        </button>
      </div>

      <div class="settings-row">
        <div class="settings-label">
          <label for="sound-volume"><strong>Lautstärke</strong></label>
          <p>Gilt für alle Oberflächenklänge. Die Systemlautstärke bleibt unberührt.</p>
        </div>
        <div class="settings-slider">
          <input
            id="sound-volume"
            v-model.number="volumePercent"
            type="range"
            min="0"
            max="100"
            step="5"
            :disabled="!soundEnabled"
            @change="previewVolume"
          >
          <b>{{ volumePercent }} %</b>
        </div>
      </div>

      <p class="source-note">
        Der Ton ergänzt die Anzeige und ersetzt sie nie. Jede Rückmeldung – angenommen, abgelehnt, Frist,
        Haushaltsdefizit – steht zusätzlich als Text oder Zahl im Bild.
      </p>
    </article>
  </div>
</template>
