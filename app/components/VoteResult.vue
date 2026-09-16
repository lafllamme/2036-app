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
    <article class="pod result" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div class="top">
        <span class="kick">Namentliche Abstimmung</span>
        <button type="button" class="close-button" aria-label="Ergebnis schließen" @click="game.dismissVoteResult()">
          <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <h2 id="result-title" :class="lastVoteResult.passed ? 'passed' : 'failed'">
        {{ lastVoteResult.passed ? 'Angenommen' : 'Abgelehnt' }}
      </h2>
      <p class="tally">
        <b>{{ lastVoteResult.yesSeats }}</b> Ja <b>{{ lastVoteResult.noSeats }}</b> Nein <b>{{ lastVoteResult.abstainSeats }}</b> Enthaltungen
      </p>
      <p class="against">
        Prognose war {{ Math.round(lastVoteResult.forecast.majorityProbability * 100) }} %
      </p>
      <p v-if="surprise" class="surprise">
        {{ surprise }}
      </p>
      <ul class="rows">
        <li v-for="row in rows" :key="row.partyId" :class="row.vote">
          <i class="party-dot" :style="{ background: row.party?.color }" />
          <span>{{ row.party?.abbreviation }} · {{ row.seats }} Sitze</span>
          <b>{{ row.label }}</b>
        </li>
      </ul>
      <div class="actions">
        <button type="button" class="btn" @click="game.dismissVoteResult()">
          Weiter
        </button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.result { width: min(460px, 100%); padding: 26px 28px 22px; border-radius: var(--r-card); }
.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.kick { color: var(--ink-3); font-size: 12.5px; }
h2 {
  margin: 12px 0 0; font-family: var(--display); font-size: 34px; font-weight: 700;
  letter-spacing: -0.035em; line-height: 1.02;
}
h2.passed { color: var(--positive); }
h2.failed { color: var(--negative); }

.tally { margin: 14px 0 0; color: var(--ink-3); font-size: 13px; }
.tally b {
  margin-right: 3px; color: var(--ink); font-family: var(--mono); font-size: 16px; font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.tally b + b { margin-left: 12px; }
.against { margin: 6px 0 0; color: var(--ink-3); font-size: 12px; }

.surprise {
  margin: 14px 0 0; padding: 12px 16px; border-radius: var(--r-inner);
  background: rgba(255, 255, 255, 0.05); color: var(--ink-2); font-size: 12.5px; line-height: 1.55;
}

.rows { margin: 18px 0 0; padding: 0; list-style: none; }
.rows li {
  display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 12px;
  padding: 9px 0; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px;
}
.rows span { color: var(--ink-2); }
.rows b { font-family: var(--mono); font-size: 12px; font-weight: 400; }
.rows li.yes b { color: var(--positive); }
.rows li.no b { color: var(--negative); }
.rows li.abstain b { color: var(--ink-3); }

.actions { display: flex; justify-content: flex-end; margin-top: 20px; }
</style>
