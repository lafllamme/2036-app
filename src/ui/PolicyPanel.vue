<script setup lang="ts">
import { POLICIES } from '../content/policies'
import { useGameStore } from '../stores/game'

const game = useGameStore()

const metricLabel: Record<string, string> = {
  housingUnits: 'Wohnraum',
  averageRent: 'Mietdruck',
  satisfaction: 'Zufriedenheit',
  transitCoverage: 'ÖPNV',
  emissions: 'Emissionen',
  employment: 'Beschäftigung',
}
</script>

<template>
  <aside class="policy-panel panel" aria-label="Politische Vorhaben">
    <header class="section-heading">
      <div>
        <small>Ratsvorlage 01/26</small>
        <span>Entscheidungen</span>
      </div>
      <span class="seats">37 / 60</span>
    </header>
    <p class="panel-intro">Beschlüsse wirken verzögert. Jede Zahl bleibt als Modellannahme nachvollziehbar.</p>
    <article v-for="policy in POLICIES" :key="policy.id" class="policy-card" :class="{ active: game.snapshot?.activePolicyIds.includes(policy.id) }">
      <div class="policy-card__top">
        <span class="policy-category">{{ policy.category }}</span>
        <span>{{ policy.implementationCost }} Mio. €</span>
      </div>
      <h2>{{ policy.name }}</h2>
      <p>{{ policy.summary }}</p>
      <div class="effect-row">
        <span v-for="effect in policy.effects" :key="effect.metric" :class="{ positive: effect.expected > 0, caution: effect.expected < 0 }">
          {{ effect.expected > 0 ? '+' : '−' }} {{ metricLabel[effect.metric] }}
        </span>
      </div>
      <button type="button" :disabled="game.snapshot?.activePolicyIds.includes(policy.id)" @click="game.applyPolicy(policy.id)">
        {{ game.snapshot?.activePolicyIds.includes(policy.id) ? 'Beschlossen' : 'Zur Abstimmung' }}
      </button>
    </article>
    <p class="source-note">Vertical Slice: Werte sind gekennzeichnete Modellannahmen, keine reale Prognose.</p>
  </aside>
</template>
