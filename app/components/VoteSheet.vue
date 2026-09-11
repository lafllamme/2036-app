<script setup lang="ts">
import type { EventOption, PartyId, PolicyEffect } from '~/core/contracts'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { PARTIES } from '~/content/parties'
import { useGameStore } from '~/stores/game'
import { CATEGORY_LABELS, CONFIDENCE_LABELS, effectTone, formatNumber, targetLabel } from '~/utils/labels'

const game = useGameStore()
const { openDecision, forecasts, snapshot } = storeToRefs(game)

watch(openDecision, (next) => {
  if (next)
    game.requestForecasts(next.definition.id)
}, { immediate: true })

const capital = computed(() => snapshot.value?.metrics.politicalCapital ?? 0)
const budget = computed(() => snapshot.value?.metrics.cityBudget ?? 0)

const COUNCIL_SEATS = 60

function forecastOf(optionId: string) {
  return forecasts.value[optionId]
}

/** Expected seat split, rounded for display but always summing to the full council. */
function seatSplit(optionId: string): { yes: number, no: number, abstain: number } {
  const forecast = forecastOf(optionId)
  if (!forecast)
    return { yes: 0, no: 0, abstain: COUNCIL_SEATS }
  const yes = Math.round(forecast.expectedYesSeats)
  const no = Math.round(forecast.expectedNoSeats)
  return { yes, no, abstain: Math.max(0, COUNCIL_SEATS - yes - no) }
}

function chance(optionId: string): number {
  return Math.round((forecastOf(optionId)?.majorityProbability ?? 0) * 100)
}

function outlook(optionId: string): { word: string, tone: 'positive' | 'pending' | 'negative' } {
  const value = chance(optionId)
  if (value >= 70)
    return { word: 'geht durch', tone: 'positive' }
  if (value >= 40)
    return { word: 'offener Ausgang', tone: 'pending' }
  return { word: 'scheitert vermutlich', tone: 'negative' }
}

function stance(optionId: string, partyId: PartyId): { label: string, tone: string } {
  const party = forecastOf(optionId)?.parties.find(entry => entry.partyId === partyId)
  if (!party)
    return { label: '–', tone: 'open' }
  if (party.probabilities.yes > 0.6)
    return { label: 'dafür', tone: 'yes' }
  if (party.probabilities.no > 0.6)
    return { label: 'dagegen', tone: 'no' }
  return { label: 'offen', tone: 'open' }
}

/** Who is blocking, and by how much — the one sentence that tells the player what to do next. */
function blockers(optionId: string): string | null {
  const forecast = forecastOf(optionId)
  if (!forecast || chance(optionId) >= 70)
    return null
  const opposed = forecast.parties
    .filter(party => party.probabilities.no > 0.4)
    .sort((a, b) => b.seats - a.seats)
  if (opposed.length === 0)
    return null

  const names = opposed
    .map(party => `${PARTIES.find(entry => entry.id === party.partyId)?.abbreviation ?? party.partyId} (${party.seats})`)
    .join(', ')
  const gap = Math.max(1, Math.round(forecast.expectedNoSeats - forecast.expectedYesSeats))
  return `${names} stehen dagegen – rund ${gap} Stimmen fehlen. Verhandeln bringt eine Fraktion meist nur zur Enthaltung, und Enthaltungen zählen nicht mit.`
}

function gains(option: EventOption): PolicyEffect[] {
  return option.effects.filter(effect => effectTone(effect.target, effect.expected) === 'gain')
}

function losses(option: EventOption): PolicyEffect[] {
  return option.effects.filter(effect => effectTone(effect.target, effect.expected) === 'loss')
}

/** Everything that can go wrong, stated plainly rather than left implicit in a range. */
function risks(option: EventOption, optionId: string): string[] {
  const entries: string[] = []

  for (const effect of losses(option)) {
    entries.push(`Verschlechtert ${targetLabel(effect.target)} um ${formatNumber(Math.abs(effect.expected))}.`)
  }
  for (const effect of option.effects.filter(candidate => candidate.confidence === 'low')) {
    entries.push(`Wirkung auf ${targetLabel(effect.target)} ist unsicher – das Modell hält ${formatNumber(effect.min)} bis ${formatNumber(effect.max)} für möglich.`)
  }
  if (option.monthlyCost > 0) {
    entries.push(`Bindet dauerhaft ${formatNumber(option.monthlyCost, 2)} Mio. € im Monat, auch in schlechten Haushaltsjahren.`)
  }
  if (option.oneOffCost > budget.value * 0.2 && option.oneOffCost > 0) {
    entries.push(`Verbraucht ${Math.round((option.oneOffCost / Math.max(1, budget.value)) * 100)} % des aktuellen Haushaltsspielraums.`)
  }
  if (chance(optionId) < 50) {
    entries.push('Eine Niederlage im Rat kostet Vertrauen und macht dieselbe Vorlage später teurer.')
  }
  if (option.effects.length === 0) {
    entries.push('Verändert keine Kapazität der Stadt – das Problem bleibt bestehen und kann erneut auftreten.')
  }
  return entries
}

const negotiable = computed(() => PARTIES.filter(party => party.id !== game.selectedPartyId))

/**
 * A standing motion is a single option carrying the motion's own name and summary. Repeating both
 * inside the option card is pure noise, so the card drops its header in that case.
 */
const singleOption = computed(() => {
  const definition = openDecision.value?.definition
  return definition?.options.length === 1 && definition.options[0]?.label === definition.title
})

function negotiationHint(partyId: PartyId): string {
  const option = openDecision.value?.definition.options[0]
  if (!option)
    return ''
  const party = forecastOf(option.id)?.parties.find(entry => entry.partyId === partyId)
  return party ? `Zustimmungswert ${(party.support * 100).toFixed(0)} %` : ''
}
</script>

<template>
  <div v-if="openDecision" class="modal-backdrop" @click.self="game.openDecisionSheet(null)">
    <article class="vote-sheet panel" role="dialog" aria-modal="true" aria-labelledby="vote-title">
      <button type="button" class="close-button" aria-label="Vorlage schließen" @click="game.openDecisionSheet(null)">
        ×
      </button>

      <header>
        <small>{{ CATEGORY_LABELS[openDecision.definition.category] }} · Ratsvorlage</small>
        <h2 id="vote-title">
          {{ openDecision.definition.title }}
        </h2>
        <p>{{ openDecision.definition.briefing }}</p>
      </header>

      <section class="resource-row">
        <div>
          <small>Politisches Kapital</small>
          <div class="resource-track">
            <i :style="{ width: `${capital}%` }" />
          </div>
          <b>{{ formatNumber(capital) }}</b>
        </div>
        <div>
          <small>Haushaltsspielraum</small>
          <b class="resource-value">{{ formatNumber(budget) }} Mio. €</b>
        </div>
      </section>

      <section v-for="option in openDecision.definition.options" :key="option.id" class="vote-option">
        <div class="vote-option__head">
          <h3 v-if="!singleOption">
            {{ option.label }}
          </h3>
          <h3 v-else class="vote-option__head--implicit">
            Beschlussvorschlag
          </h3>
          <span class="outlook" :class="outlook(option.id).tone">{{ outlook(option.id).word }}</span>
        </div>
        <p v-if="!singleOption" class="rationale">
          {{ option.rationale }}
        </p>

        <div class="ledger">
          <div class="ledger__column gain">
            <h4>Was es bringt</h4>
            <ul v-if="gains(option).length > 0">
              <li v-for="effect in gains(option)" :key="effect.target">
                <b>{{ effect.expected > 0 ? '+' : '' }}{{ formatNumber(effect.expected) }}</b> {{ targetLabel(effect.target) }}
                <small>ab Monat {{ effect.delayMonths }}, volle Wirkung nach {{ effect.delayMonths + effect.rampMonths }} · {{ CONFIDENCE_LABELS[effect.confidence] }}</small>
              </li>
            </ul>
            <p v-else class="ledger__empty">
              Nichts – diese Option baut keine Kapazität auf.
            </p>
          </div>

          <div class="ledger__column cost">
            <h4>Was es kostet</h4>
            <ul>
              <li v-if="option.oneOffCost !== 0">
                <b>{{ formatNumber(option.oneOffCost, 1) }} Mio. €</b>&nbsp;einmalig<small>sofort aus dem Haushalt</small>
              </li>
              <li v-if="option.monthlyCost > 0">
                <b>{{ formatNumber(option.monthlyCost, 2) }} Mio. €</b>&nbsp;monatlich<small>dauerhaft, bis die Maßnahme endet</small>
              </li>
              <li v-if="option.monthlyCost < 0">
                <b>+{{ formatNumber(-option.monthlyCost, 2) }} Mio. €</b>&nbsp;monatlich<small>Mehreinnahme statt Ausgabe</small>
              </li>
              <li v-if="option.oneOffCost === 0 && option.monthlyCost === 0">
                <b>Nichts</b><small>keine Haushaltswirkung</small>
              </li>
            </ul>
          </div>

          <div class="ledger__column risk">
            <h4>Womit du rechnen musst</h4>
            <ul v-if="risks(option, option.id).length > 0">
              <li v-for="entry in risks(option, option.id)" :key="entry">
                <span>{{ entry }}</span>
              </li>
            </ul>
            <p v-else class="ledger__empty">
              Keine erkennbaren Nebenwirkungen.
            </p>
          </div>
        </div>

        <div class="forecast">
          <div class="forecast__head">
            <span>Sitzprognose</span>
            <strong>{{ seatSplit(option.id).yes }} Ja · {{ seatSplit(option.id).abstain }} Enthaltung · {{ seatSplit(option.id).no }} Nein</strong>
            <small>Mehrheit {{ chance(option.id) }} %</small>
          </div>
          <div class="seat-bar" role="img" :aria-label="`${seatSplit(option.id).yes} Ja, ${seatSplit(option.id).abstain} Enthaltungen, ${seatSplit(option.id).no} Nein von 60 Sitzen`">
            <i class="yes" :style="{ width: `${(seatSplit(option.id).yes / 60) * 100}%` }" />
            <i class="abstain" :style="{ width: `${(seatSplit(option.id).abstain / 60) * 100}%` }" />
            <i class="no" :style="{ width: `${(seatSplit(option.id).no / 60) * 100}%` }" />
          </div>
          <p v-if="blockers(option.id)" class="blockers">
            {{ blockers(option.id) }}
          </p>
          <div class="party-strip">
            <span v-for="party in PARTIES" :key="party.id" class="party-chip" :class="stance(option.id, party.id).tone">
              <i :style="{ background: party.color }" />
              {{ party.abbreviation }}
              <em>{{ stance(option.id, party.id).label }}</em>
            </span>
          </div>
        </div>

        <div class="vote-actions">
          <button
            type="button"
            class="quiet-button"
            :disabled="capital < 18 || openDecision.prepared.campaignedOptionIds.includes(option.id)"
            @click="game.campaignFor(openDecision.definition.id, option.id)"
          >
            {{ openDecision.prepared.campaignedOptionIds.includes(option.id) ? 'Kampagne läuft' : 'Öffentliche Kampagne · 18 Kapital' }}
          </button>
          <button type="button" class="primary" @click="game.resolveDecision(openDecision.definition.id, option.id)">
            Abstimmen lassen
          </button>
        </div>
      </section>

      <section class="negotiation">
        <h3>Verhandeln</h3>
        <p class="negotiation__intro">
          12 Kapital je Fraktion. Wirkt auf alle Optionen dieser Vorlage und hält über die nächsten Monate an.
        </p>
        <div class="negotiation__row">
          <button
            v-for="party in negotiable"
            :key="party.id"
            type="button"
            class="quiet-button"
            :title="negotiationHint(party.id)"
            :disabled="capital < 12 || openDecision.prepared.negotiatedPartyIds.includes(party.id)"
            @click="game.negotiate(openDecision.definition.id, party.id)"
          >
            <i :style="{ background: party.color }" />{{ party.abbreviation }}
            <template v-if="openDecision.prepared.negotiatedPartyIds.includes(party.id)">
              ✓
            </template>
          </button>
        </div>
      </section>

      <p class="source-note">
        Eine Vorlage ist angenommen, wenn mehr Ja- als Nein-Stimmen abgegeben werden – Enthaltungen zählen nicht mit.
        Die Wahrscheinlichkeit ist exakt über alle 729 Fraktionskombinationen berechnet; der Würfel hängt an Spielstand,
        Monat und Vorlage, Neuladen wiederholt also dasselbe Ergebnis.
      </p>
    </article>
  </div>
</template>
