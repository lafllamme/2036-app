<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const { snapshot } = storeToRefs(game)
const metrics = computed(() => snapshot.value?.metrics)

const compact = (value: number): string => new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
</script>

<template>
  <aside class="metric-rail panel" aria-label="Stadtkennzahlen">
    <header class="section-heading">
      <span>Lagebild</span>
      <span class="live-dot">LIVE</span>
    </header>
    <dl v-if="metrics" class="metric-list">
      <div>
        <dt>Einwohner</dt>
        <dd>{{ compact(metrics.population) }}</dd>
      </div>
      <div>
        <dt>Beschäftigung</dt>
        <dd>{{ metrics.employment.toFixed(1) }} %</dd>
      </div>
      <div>
        <dt>Ø Angebotsmiete</dt>
        <dd>{{ metrics.averageRent.toFixed(2) }} €/m²</dd>
      </div>
      <div>
        <dt>ÖPNV-Abdeckung</dt>
        <dd>{{ metrics.transitCoverage.toFixed(1) }} %</dd>
      </div>
      <div>
        <dt>Haushaltsspielraum</dt>
        <dd :class="{ negative: metrics.cityBudget < 0 }">{{ metrics.cityBudget.toFixed(0) }} Mio. €</dd>
      </div>
    </dl>
    <div v-if="snapshot" class="health-block">
      <div class="health-title"><span>Stadtgesundheit</span><strong>{{ snapshot.health.satisfaction.toFixed(0) }}</strong></div>
      <div v-for="item in [
        ['Wohnen', snapshot.health.housing],
        ['Arbeit', snapshot.health.employment],
        ['Infrastruktur', snapshot.health.infrastructure],
        ['Umwelt', snapshot.health.environment],
      ]" :key="String(item[0])" class="health-row">
        <span>{{ item[0] }}</span>
        <div class="health-track"><i :style="{ width: `${item[1]}%` }"></i></div>
        <b>{{ Number(item[1]).toFixed(0) }}</b>
      </div>
    </div>
  </aside>
</template>
