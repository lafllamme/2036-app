<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { policiesFor } from '~/content/policies'
import { useGameStore } from '~/stores/game'
import { CATEGORY_LABELS, formatNumber, POLICY_CATEGORY_LABELS, targetLabel } from '~/utils/labels'

const game = useGameStore()
const { snapshot, pendingDecisions, decisionsOpen } = storeToRefs(game)

const openMotions = computed(() =>
  pendingDecisions.value
    .map(entry => ({ entry, definition: game.decisionDefinition(entry.eventId) }))
    .filter((item): item is { entry: typeof item.entry, definition: NonNullable<typeof item.definition> } => Boolean(item.definition)))

// Nur, was die eigene Fraktion auch einbringen würde. Siehe `policiesFor`.
const standingMotions = computed(() =>
  policiesFor(game.selectedPartyId).filter(policy => !snapshot.value?.activePolicyIds.includes(policy.id)))

const measures = computed(() => snapshot.value?.activeMeasures.filter(measure => measure.monthlyCost !== 0) ?? [])
const monthlyCost = computed(() => measures.value.reduce((sum, measure) => sum + measure.monthlyCost, 0))

const deadline = (expiresMonth: number): number => Math.max(0, expiresMonth - (snapshot.value?.month ?? 0))

/**
 * Open itself when the council actually has something to decide, and otherwise stay out of the way.
 *
 * The panel covered a third of the city for the whole campaign, most of the time to say that no
 * motion had been raised. A month with a real motion in it should look different from a quiet one
 * before the player has read a word — so a new motion opens the panel, and the player folding it
 * again is respected until the next one arrives.
 */
watch(() => openMotions.value.length, (now, before) => {
  if (now > (before ?? 0))
    game.decisionsOpen = true
}, { immediate: true })
</script>

<template>
  <aside class="policy-panel panel" :class="{ 'is-folded': !decisionsOpen }" aria-label="Ratsvorlagen und Entscheidungen">
    <header class="section-heading">
      <div>
        <small>Stadtrat Lindenhafen</small>
        <span>Entscheidungen</span>
      </div>
      <span v-if="openMotions.length > 0" class="seats pending">{{ openMotions.length }} offen</span>
      <span v-else class="seats">{{ snapshot?.coalitionSupport ?? 0 }} / 60</span>
      <button
        type="button"
        class="fold-toggle"
        :aria-expanded="decisionsOpen"
        :title="decisionsOpen ? 'Entscheidungen einklappen' : 'Entscheidungen ausklappen'"
        :aria-label="decisionsOpen ? 'Entscheidungen einklappen' : 'Entscheidungen ausklappen'"
        @click="game.decisionsOpen = !decisionsOpen"
      >
        {{ decisionsOpen ? '−' : '+' }}
      </button>
    </header>

    <p v-if="openMotions.length === 0 && standingMotions.length === 0" class="panel-intro">
      Zurzeit liegt keine Vorlage vor. Lass die Zeit laufen – Ereignisse erreichen den Rat von selbst.
    </p>

    <template v-if="openMotions.length > 0">
      <h3 class="group-title">
        Offene Vorlagen
      </h3>
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
          <!-- Die Formregel bis in die Beschriftung: zu einer Vorlage nimmt man Stellung,
               eine Weggabelung prüft man. „1 Optionen prüfen“ war beides nicht. -->
          {{ item.entry.tabledOptionId || item.definition.options.length === 1
            ? 'Stellung nehmen'
            : `${item.definition.options.length} Wege prüfen` }}
        </button>
      </article>
    </template>

    <template v-if="standingMotions.length > 0">
      <h3 class="group-title">
        Eigene Vorlagen
      </h3>
      <article v-for="policy in standingMotions" :key="policy.id" class="policy-card">
        <div class="policy-card__top">
          <span class="policy-category">{{ POLICY_CATEGORY_LABELS[policy.category] ?? policy.category }}</span>
          <!-- Eine Vorlage, die der Stadt Geld bringt, darf nicht wie eine Ausgabe aussehen. -->
          <span>{{ formatNumber(policy.implementationCost) }} Mio. €
            · {{ policy.monthlyCost < 0 ? '+' : '' }}{{ formatNumber(Math.abs(policy.monthlyCost), 1) }} Mio. €/Monat{{ policy.monthlyCost < 0 ? ' Ertrag' : '' }}</span>
        </div>
        <h2>{{ policy.name }}</h2>
        <p>{{ policy.summary }}</p>
        <div class="effect-row">
          <span v-for="effect in policy.effects" :key="effect.target" :class="{ positive: effect.expected > 0, caution: effect.expected < 0 }">
            {{ effect.expected > 0 ? '+' : '−' }} {{ targetLabel(effect.target) }}
          </span>
        </div>
        <button type="button" @click="game.openDecisionSheet(policy.id)">
          Zur Abstimmung
        </button>
      </article>
    </template>

    <template v-if="measures.length > 0">
      <h3 class="group-title">
        Laufende Maßnahmen · {{ monthlyCost > 0 ? '−' : '+' }}{{ formatNumber(Math.abs(monthlyCost), 1) }} Mio. €/Monat
      </h3>
      <ul class="measure-list">
        <li v-for="measure in measures" :key="measure.id">
          <span>{{ measure.label }}<small v-if="measure.costUntilMonth !== null"> · noch {{ measure.costUntilMonth - (snapshot?.month ?? 0) }} Monate</small></span>
          <b :class="{ negative: measure.monthlyCost > 0 }">{{ measure.monthlyCost > 0 ? '−' : '+' }}{{ formatNumber(Math.abs(measure.monthlyCost), 2) }}</b>
        </li>
      </ul>
    </template>

    <p class="source-note">
      Vertical Slice: Werte sind gekennzeichnete Modellannahmen, keine reale Prognose.
    </p>
  </aside>
</template>
