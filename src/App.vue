<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGameStore } from './stores/game'
import CityCanvas from './ui/CityCanvas.vue'
import MetricRail from './ui/MetricRail.vue'
import NewsTicker from './ui/NewsTicker.vue'
import PolicyPanel from './ui/PolicyPanel.vue'

const game = useGameStore()
const { snapshot, currentDate, campaignProgress, speed, selectedBuilding, selectedNews, rendererStats } = storeToRefs(game)

const buildingLabels = {
  altbau: 'Gründerzeit-Wohnhaus',
  modern: 'Modernes Quartier',
  residential: 'Wohngebäude',
  commercial: 'Gewerbeimmobilie',
  industrial: 'Industriebetrieb',
  civic: 'Öffentliche Einrichtung',
}
</script>

<template>
  <main class="game-shell">
    <CityCanvas />
    <div class="atmosphere-vignette" aria-hidden="true"></div>

    <header class="top-command panel">
      <div class="brand-block">
        <strong>20<span>36</span></strong>
        <div><b>LINDENHAFEN</b><small>Politische Stadtsimulation</small></div>
      </div>
      <div class="date-block">
        <span>{{ currentDate }}</span>
        <div class="campaign-track"><i :style="{ width: `${campaignProgress}%` }"></i></div>
        <small>2026 <b>→</b> 2036</small>
      </div>
      <div class="coalition-block" v-if="snapshot">
        <small>KOALITIONSHALT</small>
        <strong>{{ snapshot.coalitionSupport.toFixed(0) }} %</strong>
      </div>
      <button class="quiet-button" type="button" @click="game.save">
        {{ game.saveStatus.startsWith('Gespeichert') ? 'Gespeichert' : 'Speichern' }}
      </button>
    </header>

    <MetricRail />
    <PolicyPanel />

    <section v-if="selectedBuilding" class="selection-card panel">
      <button type="button" aria-label="Auswahl schließen" @click="game.selectedBuilding = null">×</button>
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
      <span></span>
      <button type="button" class="advance" @click="game.advanceMonth">Nächster Monat</button>
    </section>

    <div class="render-badge" v-if="rendererStats">
      {{ rendererStats.backend }} · {{ rendererStats.fps }} FPS · {{ rendererStats.drawCalls }} Draws · {{ rendererStats.buildings }} Gebäude
    </div>

    <NewsTicker />

    <div v-if="!game.ready || !rendererStats" class="loading-state">
      <strong>2036</strong><span>Lindenhafen wird aufgebaut</span>
    </div>

    <div v-if="game.error" class="error-state panel" role="alert">
      <strong>Simulation angehalten</strong><p>{{ game.error }}</p><button type="button" @click="game.reset">Neu laden</button>
    </div>

    <div v-if="selectedNews" class="modal-backdrop" @click.self="game.selectedNews = null">
      <article class="news-dialog panel" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <button type="button" class="close-button" aria-label="Meldung schließen" @click="game.selectedNews = null">×</button>
        <small>{{ selectedNews.scope.toUpperCase() }} · MONAT {{ selectedNews.month }}</small>
        <h2 id="news-title">{{ selectedNews.headline }}</h2>
        <p>Diese Meldung wurde aus dem deterministischen Stadtmodell erzeugt. Zugehörige Ursachen erscheinen im monatlichen Kausalprotokoll.</p>
      </article>
    </div>
  </main>
</template>
