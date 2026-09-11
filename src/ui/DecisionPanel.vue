<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { POLICIES } from '../content/policies'
import { useGameStore } from '../stores/game'
import { CATEGORY_LABELS, targetLabel } from './labels'

const game = useGameStore()
const { snapshot, pendingDecisions } = storeToRefs(game)

const openMotions = computed(() =>
  pendingDecisions.value
    .map((entry) => ({ entry, definition: game.decisionDefinition(entry.eventId) }))
    .filter((item): item is { entry: typeof item.entry; definition: NonNullable<typeof item.definition> } => Boolean(item.definition)))

const standingMotions = computed(() =>
  POLICIES.filter((policy) => !snapshot.value?.activePolicyIds.includes(policy.id)))

const measures = computed(() => snapshot.value?.activeMeasures.filter((measure) => measure.monthlyCost !== 0) ?? [])
const monthlyCost = computed(() => measures.value.reduce((sum, measure) => sum + measure.monthlyCost, 0))

const deadline = (expiresMonth: number): number => Math.max(0, expiresMonth - (snapshot.value?.month ?? 0))
</script>

<template>
  <aside class="policy-panel panel" aria-label="Ratsvorlagen und Entscheidungen">
    <header class="section-heading">
      <div>
        <small>Stadtrat Lindenhafen</small>
        <span>Entscheidungen</span>
      </div>
      <span class="seats">{{ snapshot?.coalitionSupport ?? 0 }} / 60</span>
    </header>

    <p v-if="openMotions.length === 0 && standingMotions.length === 0" class="panel-intro">
      Zurzeit liegt keine Vorlage vor. Lass die Zeit laufen – Ereignisse erreichen den Rat von selbst.
    </p>

    <template v-if="openMotions.length > 0">
      <h3 class="group-title">Offene Vorlagen</h3>
      <article v-for="item in openMotions" :key="item.entry.eventId" class="policy-card decision-card" :class="item.definition.urgency">
        <div class="policy-card__top">
          <span class="policy-category">{{ CATEGORY_LABELS[item.definition.category] }}</span>
          <span :class="{ urgent: deadline(item.entry.expiresMonth) <= 1 }">
            {{ deadline(item.entry.expiresMonth) === 0 ? 'läuft ab' : `noch ${deadline(item.entry.expiresMonth)} Monate` }}
          </span>
        </div>
        <h2>{{ item.definition.title }}</h2>
        <p>{{ item.definition.briefing }}</p>
        <button type="button" class="primary" @click="game.openDecisionSheet(item.entry.eventId)">
          {{ item.definition.options.length }} Optionen prüfen
        </button>
      </article>
    </template>

    <template v-if="standingMotions.length > 0">
      <h3 class="group-title">Eigene Vorlagen</h3>
      <article v-for="policy in standingMotions" :key="policy.id" class="policy-card">
        <div class="policy-card__top">
          <span class="policy-category">{{ policy.category }}</span>
          <span>{{ policy.implementationCost }} Mio. € · {{ policy.monthlyCost.toFixed(1) }} Mio. €/Monat</span>
        </div>
        <h2>{{ policy.name }}</h2>
        <p>{{ policy.summary }}</p>
        <div class="effect-row">
          <span v-for="effect in policy.effects" :key="effect.target" :class="{ positive: effect.expected > 0, caution: effect.expected < 0 }">
            {{ effect.expected > 0 ? '+' : '−' }} {{ targetLabel(effect.target) }}
          </span>
        </div>
        <button type="button" @click="game.openDecisionSheet(policy.id)">Zur Abstimmung</button>
      </article>
    </template>

    <template v-if="measures.length > 0">
      <h3 class="group-title">Laufende Maßnahmen · {{ monthlyCost.toFixed(1) }} Mio. €/Monat</h3>
      <ul class="measure-list">
        <li v-for="measure in measures" :key="measure.id">
          <span>{{ measure.label }}</span>
          <b :class="{ negative: measure.monthlyCost > 0 }">{{ measure.monthlyCost > 0 ? '−' : '+' }}{{ Math.abs(measure.monthlyCost).toFixed(2) }}</b>
        </li>
      </ul>
    </template>

    <p class="source-note">Vertical Slice: Werte sind gekennzeichnete Modellannahmen, keine reale Prognose.</p>
  </aside>
</template>
