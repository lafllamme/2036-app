<script setup lang="ts">
import { computed } from 'vue'
import { useFirstSteps } from '~/composables/useFirstSteps'
import { useSound } from '~/composables/useSound'
import { useSoundSettings } from '~/composables/useSoundSettings'

const { settingsOpen, soundEnabled, soundVolume, closeSettings, toggleSound: toggleSettingsSound } = useSoundSettings()
const sound = useSound()
const coach = useFirstSteps()

/** Die Einarbeitung noch einmal, und dann aus dem Weg: sie zeigt auf Flächen hinter diesem Blatt. */
function showFirstSteps(): void {
  closeSettings()
  coach.restart()
}

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
    <article class="pod sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="top">
        <div>
          <span class="kick">Einstellungen</span>
          <h2 id="settings-title">
            Spiel
          </h2>
        </div>
        <button type="button" class="close-button" aria-label="Einstellungen schließen" @click="closeSettings()">
          <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="row">
        <div class="label">
          <strong>Einarbeitung</strong>
          <p>Acht Schritte durch die erste Vorlage – von den Sitzen bis zur Abstimmung. Läuft beim ersten Spiel von selbst.</p>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" @click="showFirstSteps">
          Nochmal zeigen
        </button>
      </div>

      <div class="row">
        <div class="label">
          <strong>Oberflächenklang</strong>
          <p>Kurze Rückmeldungen für Bedienung, Ratsvorlagen, Abstimmungen und den Haushalt.</p>
        </div>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          role="switch"
          :aria-checked="soundEnabled"
          @click="toggleSound"
        >
          {{ soundEnabled ? 'An' : 'Aus' }}
        </button>
      </div>

      <div class="row">
        <div class="label">
          <label for="sound-volume"><strong>Lautstärke</strong></label>
          <p>Gilt für alle Oberflächenklänge. Die Systemlautstärke bleibt unberührt.</p>
        </div>
        <div class="slider">
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

      <p class="note">
        Der Ton ergänzt die Anzeige und ersetzt sie nie. Jede Rückmeldung – angenommen, abgelehnt, Frist,
        Haushaltsdefizit – steht zusätzlich als Text oder Zahl im Bild.
      </p>
    </article>
  </div>
</template>

<style scoped>
.sheet { width: min(460px, 100%); padding: 26px 28px 22px; border-radius: var(--r-card); }
.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.kick { color: var(--ink-3); font-size: 12.5px; }
h2 {
  margin: 10px 0 0; font-family: var(--display); font-size: 27px; font-weight: 700;
  letter-spacing: -0.032em; line-height: 1.08;
}

.row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 22px;
  padding: 17px 0; border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.row:first-of-type { margin-top: 18px; }
.label strong { display: block; font-size: 14px; font-weight: 500; }
.label p { margin: 5px 0 0; max-width: 34ch; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }

.slider { display: flex; flex: none; align-items: center; gap: 13px; }
.slider b {
  min-width: 46px; font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right;
}
/*
 * Auch der Schieber gehört zum Entwurf. Ein Browser-Standardregler ist ein graues Plattform-Widget
 * auf einer Oberfläche, die sonst aus Licht und Schatten besteht — und das Lauteste im Dialog.
 */
.slider input[type="range"] {
  width: 128px; height: 6px; appearance: none; border-radius: 999px; cursor: pointer;
  background: rgba(0, 0, 0, 0.42);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}
.slider input[type="range"]:disabled { cursor: not-allowed; opacity: 0.32; }
.slider input[type="range"]::-webkit-slider-thumb {
  width: 16px; height: 16px; appearance: none; border: 0; border-radius: 50%; cursor: pointer;
  background: linear-gradient(180deg, #fbf9f4 0%, #e6e2d8 100%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.slider input[type="range"]::-moz-range-thumb {
  width: 16px; height: 16px; border: 0; border-radius: 50%; cursor: pointer;
  background: linear-gradient(180deg, #fbf9f4 0%, #e6e2d8 100%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.note {
  margin: 18px 0 0; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--ink-3); font-size: 11.5px; line-height: 1.55;
}
</style>
