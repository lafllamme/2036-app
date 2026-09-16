<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { getParty } from '~/content/parties'
import { useGameStore } from '~/stores/game'

const game = useGameStore()
const { lastVoteResult } = storeToRefs(game)

const VOTE_LABELS = { yes: 'Ja', no: 'Nein', abstain: 'Enthaltung' } as const

const rows = computed(() =>
  (lastVoteResult.value?.votes ?? []).map(record => ({
    partyId: record.partyId,
    party: getParty(record.partyId),
    vote: record.vote,
    seats: record.seats,
    label: VOTE_LABELS[record.vote],
  })))

const surprise = computed(() => {
  const result = lastVoteResult.value
  if (!result)
    return null
  const chance = result.forecast.majorityProbability
  if (result.passed && chance < 0.4)
    return 'Das war enger als prognostiziert – die Vorlage ist trotz schwacher Aussicht durchgekommen.'
  if (!result.passed && chance > 0.6)
    return 'Trotz guter Prognose gescheitert: einzelne Fraktionen sind abgesprungen.'
  return null
})
</script>

<template>
  <div v-if="lastVoteResult" class="modal-backdrop" @click.self="game.dismissVoteResult()">
    <article class="vote-result panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <button type="button" class="close-button" aria-label="Ergebnis schließen" @click="game.dismissVoteResult()">
        ×
      </button>
      <small>Namentliche Abstimmung</small>
      <h2 id="result-title" :class="lastVoteResult.passed ? 'passed' : 'failed'">
        {{ lastVoteResult.passed ? 'Angenommen' : 'Abgelehnt' }}
      </h2>
      <p class="tally">
        {{ lastVoteResult.yesSeats }} Ja · {{ lastVoteResult.noSeats }} Nein · {{ lastVoteResult.abstainSeats }} Enthaltungen
        <small>Prognose war {{ Math.round(lastVoteResult.forecast.majorityProbability * 100) }} %</small>
      </p>
      <p v-if="surprise" class="surprise">
        {{ surprise }}
      </p>
      <ul class="vote-rows">
        <li v-for="row in rows" :key="row.partyId" :class="row.vote">
          <i :style="{ background: row.party?.color }" />
          <span>{{ row.party?.abbreviation }} · {{ row.seats }}</span>
          <b>{{ row.label }}</b>
        </li>
      </ul>
      <button type="button" class="primary" @click="game.dismissVoteResult()">
        Weiter
      </button>
    </article>
  </div>
</template>
