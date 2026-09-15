<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { getParty } from '~/content/parties'
import { isCampaignComplete } from '~/core/campaign'
import { closingReport } from '~/simulation/report'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'

/**
 * Ten years, on one screen.
 *
 * The campaign used to end with a disabled button. Everything here had been in the snapshot for
 * weeks and was shown to nobody: what the city looked like the day the player took office, which of
 * their own decisions moved which number, how the street shifted under them, and which roads they
 * closed behind themselves.
 *
 * It renders and does not decide. Every number comes from `simulation/report.ts`, which is pure and
 * tested — a closing screen that works out its own verdict is a second model, and a second model is
 * one that can disagree with the first in front of the player at the worst possible moment.
 *
 * It can be dismissed. A player who wants to look at the city they left should be able to, and a
 * report that cannot be closed is a wall rather than an ending.
 */

const game = useGameStore()
const { snapshot, selectedPartyId } = storeToRefs(game)
const dismissed = ref(false)

const over = computed(() =>
  !!snapshot.value && (!!snapshot.value.defeat || isCampaignComplete(snapshot.value.month)))

const report = computed(() =>
  snapshot.value && over.value ? closingReport(snapshot.value, selectedPartyId.value) : null)

const years = computed(() => Math.floor((report.value?.months ?? 0) / 12))

/** A share of the value it started at, with the sign it actually moved in. */
function share(value: number): string {
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value) * 100, 1)} %`
}

function seats(partyId: string): number {
  return snapshot.value?.councilSeatsByParty[partyId as keyof typeof snapshot.value.councilSeatsByParty] ?? 0
}
</script>

<template>
  <div v-if="report && !dismissed" class="modal-backdrop closing" role="dialog" aria-modal="true" aria-labelledby="closing-title">
    <article class="closing-report panel">
      <button type="button" class="close-button" aria-label="Bericht schließen" @click="dismissed = true">
        ×
      </button>

      <header>
        <small>Januar 2026 – {{ snapshot?.year }} · {{ report.months }} Monate im Amt</small>
        <h2 id="closing-title" :class="report.ending.kind">
          {{ report.ending.headline }}
        </h2>
        <p class="because">
          {{ report.ending.because }}
        </p>
      </header>

      <section>
        <h3>Was du vorgefunden hast, was du hinterlässt</h3>
        <ul class="closing-ledger">
          <li v-for="line in report.ledger" :key="line.label">
            <span class="closing-ledger__label">{{ line.label }}</span>
            <span class="closing-ledger__values">
              {{ formatNumber(line.before, 2) }}<small>{{ line.unit }}</small>
              <i aria-hidden="true">→</i>
              <b>{{ formatNumber(line.after, 2) }}<small>{{ line.unit }}</small></b>
            </span>
            <span v-if="line.unchanged" class="closing-ledger__verdict flat">unverändert</span>
            <span v-else class="closing-ledger__verdict" :class="line.good ? 'good' : 'bad'">
              {{ share(line.change) }}
              <small>{{ line.good ? 'die Richtung, die du wolltest' : 'die Gegenrichtung' }}</small>
            </span>
          </li>
        </ul>
      </section>

      <section v-if="report.decisions.length">
        <h3>Die Entscheidungen, die es getan haben</h3>
        <ul class="deeds">
          <li v-for="deed in report.decisions" :key="deed.label">
            <b>{{ deed.label }}</b>
            <span>{{ deed.on }}</span>
            <i :class="deed.good ? 'good' : 'bad'">{{ deed.delta > 0 ? '+' : '−' }}{{ formatNumber(Math.abs(deed.delta), 1) }}</i>
          </li>
        </ul>
      </section>

      <div class="closing-columns">
        <section>
          <h3>Der Rückhalt</h3>
          <ul class="standing">
            <li v-for="party in report.support" :key="party.partyId" :class="{ own: party.own }">
              <i :style="{ background: getParty(party.partyId)?.color }" aria-hidden="true" />
              <span>{{ party.name }}</span>
              <small>{{ formatNumber(party.before * 100, 1) }} %</small>
              <i class="arrow" aria-hidden="true">→</i>
              <b>{{ formatNumber(party.after * 100, 1) }} %</b>
              <em>{{ seats(party.partyId) }} Sitze</em>
            </li>
          </ul>
        </section>

        <section v-if="report.promises.length">
          <h3>Worauf du angetreten bist</h3>
          <ul class="promises">
            <li v-for="promise in report.promises" :key="promise.id" :class="promise.kept ? 'good' : 'bad'">
              <b>{{ promise.name }}</b>
              <span>{{ promise.kept ? 'gehalten' : 'nicht gehalten' }}</span>
              <i>{{ share(promise.score) }}</i>
            </li>
          </ul>
        </section>
      </div>

      <section class="roads">
        <h3>Der Weg, den du genommen hast</h3>
        <p>
          <b>{{ report.doors.taken }}</b> Entscheidungen hat der Rat in {{ years }} Jahren getragen.
        </p>
        <template v-if="report.doors.closed.length">
          <p class="roads__note">
            Und das hier hat Lindenhafen deshalb nie erlebt:
          </p>
          <ul class="roads__list">
            <li v-for="road in report.doors.closed" :key="road">
              {{ road }}
            </li>
          </ul>
        </template>
        <p v-else class="roads__note">
          Keine dieser Entscheidungen hat eine Tür hinter sich zugezogen.
        </p>
      </section>

      <footer>
        <p class="disclaimer">
          Vertical Slice: alle Werte sind gekennzeichnete Modellannahmen, keine reale Prognose.
        </p>
        <div class="closing-actions">
          <button type="button" class="quiet-button" @click="dismissed = true">
            Stadt ansehen
          </button>
          <button type="button" class="primary" @click="game.startNewCampaign()">
            Neue Kampagne
          </button>
        </div>
      </footer>
    </article>
  </div>
</template>
