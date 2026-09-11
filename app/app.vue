<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useSound } from '~/composables/useSound'
import { useSoundSettings } from '~/composables/useSoundSettings'
import { getParty } from '~/content/parties'
import { useGameStore } from '~/stores/game'

const game = useGameStore()
const settings = useSoundSettings()
const sound = useSound()
const {
  snapshot,
  currentDate,
  campaignProgress,
  canAdvance,
  experienceStage,
  selectedPartyId,
  speed,
  selectedBuilding,
  selectedNews,
  rendererStats,
} = storeToRefs(game)
const selectedParty = computed(() => selectedPartyId.value ? getParty(selectedPartyId.value) : null)

const coalitionStanding = computed(() => (snapshot.value?.coalitionSupport ?? 0) > 30 ? 'Mehrheit' : 'Minderheit')

const buildingLabels = {
  altbau: 'Gründerzeit-Wohnhaus',
  modern: 'Modernes Quartier',
  residential: 'Wohngebäude',
  commercial: 'Gewerbeimmobilie',
  industrial: 'Industriebetrieb',
  civic: 'Öffentliche Einrichtung',
}

function restart(): void {
  sound.play('hud.reset')
  game.reset()
}
</script>

<template>
  <main class="game-shell" :class="{ 'entry-active': experienceStage !== 'gameplay' }">
    <ClientOnly>
      <CityCanvas />
    </ClientOnly>
    <div class="atmosphere-vignette" aria-hidden="true" />

    <ClientOnly>
      <template v-if="experienceStage === 'gameplay'">
        <header class="top-command panel">
          <div class="brand-block">
            <strong>20<span>36</span></strong>
            <div>
              <b>LINDENHAFEN</b>
              <small>{{ selectedParty ? `${selectedParty.abbreviation} · ${coalitionStanding}` : 'Politische Stadtsimulation' }}</small>
            </div>
          </div>
          <div class="date-block">
            <span>{{ currentDate }}</span>
            <div class="campaign-track">
              <i :style="{ width: `${campaignProgress}%` }" />
            </div>
          </div>
          <div v-if="snapshot" class="coalition-block">
            <small>Koalition</small>
            <div class="seatline" role="img" :aria-label="`${snapshot.coalitionSupport} von 60 Sitzen`">
              <i :style="{ width: `${(snapshot.coalitionSupport / 60) * 100}%` }" />
            </div>
            <strong>{{ snapshot.coalitionSupport }}<i>/60</i></strong>
          </div>
          <button class="quiet-button" type="button" @click="game.save">
            {{ game.saveStatus.startsWith('Gespeichert') ? 'Gespeichert' : 'Speichern' }}
          </button>
          <button class="icon-button" type="button" aria-label="Einstellungen" @click="settings.openSettings()">
            <Icon name="lucide:settings" />
          </button>
        </header>

        <MetricRail />
        <DecisionPanel />

        <section v-if="selectedBuilding" class="selection-card panel">
          <button type="button" aria-label="Auswahl schließen" @click="game.selectedBuilding = null">
            ×
          </button>
          <small>{{ selectedBuilding.districtId.replaceAll('-', ' ') }}</small>
          <h2>{{ buildingLabels[selectedBuilding.type] }}</h2>
          <dl>
            <div><dt>Objekt</dt><dd>{{ selectedBuilding.id.toUpperCase() }}</dd></div>
            <div><dt>Zustand</dt><dd>{{ (selectedBuilding.condition * 100).toFixed(0) }} %</dd></div>
            <div><dt>Auslastung</dt><dd>{{ (selectedBuilding.occupancy * 100).toFixed(0) }} %</dd></div>
          </dl>
        </section>

        <section class="camera-help panel" aria-label="Kamerasteuerung">
          <span><b>LINKS</b> verschieben</span><span><b>RECHTS</b> drehen</span><span><b>RAD</b> zoomen</span>
        </section>

        <section class="time-controls panel" aria-label="Zeitsteuerung">
          <button v-for="value in [0, 1, 2, 4] as const" :key="value" type="button" :class="{ active: speed === value }" @click="game.setSpeed(value)">
            {{ value === 0 ? 'Ⅱ' : `${value}×` }}
          </button>
          <span />
          <button type="button" class="advance" :disabled="!canAdvance" @click="game.advanceMonth">
            {{ canAdvance ? 'Nächster Monat' : 'Kampagne abgeschlossen' }}
          </button>
        </section>

        <div v-if="rendererStats" class="render-badge">
          {{ rendererStats.backend }} · {{ rendererStats.fps }} FPS · {{ rendererStats.drawCalls }} Draws · {{ rendererStats.buildings }} Gebäude
        </div>

        <NewsTicker />
        <VoteSheet />
        <VoteResult />
      </template>
    </ClientOnly>

    <EntryExperience v-if="experienceStage !== 'gameplay'" />

    <SettingsSheet />

    <div v-if="game.error" class="error-state panel" role="alert">
      <strong>Simulation angehalten</strong><p>{{ game.error }}</p><button type="button" @click="restart">
        Neu laden
      </button>
    </div>

    <div v-if="selectedNews" class="modal-backdrop" @click.self="game.selectedNews = null">
      <article class="news-dialog panel" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <button type="button" class="close-button" aria-label="Meldung schließen" @click="game.selectedNews = null">
          ×
        </button>
        <small>{{ selectedNews.scope.toUpperCase() }} · MONAT {{ selectedNews.month }}</small>
        <h2 id="news-title">
          {{ selectedNews.headline }}
        </h2>
        <p>Diese Meldung wurde aus dem deterministischen Stadtmodell erzeugt. Zugehörige Ursachen erscheinen im monatlichen Kausalprotokoll.</p>
      </article>
    </div>
  </main>
</template>
