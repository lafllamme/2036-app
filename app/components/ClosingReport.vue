<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { getBackground } from '~/content/leaders'
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
const panel = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)

const over = computed(() =>
  !!snapshot.value && (!!snapshot.value.defeat || isCampaignComplete(snapshot.value.month)))

const report = computed(() =>
  snapshot.value && over.value ? closingReport(snapshot.value, selectedPartyId.value) : null)

const years = computed(() => Math.floor((report.value?.months ?? 0) / 12))

/** A share of the value it started at, with the sign it actually moved in. */
const backgroundName = computed(() => {
  const id = snapshot.value?.leader?.backgroundId
  return id ? getBackground(id)?.name ?? '' : ''
})

/** Wie weit sich eine Zeile der Bilanz bewegt hat, in Prozent ihres Ausgangswerts. */
function share(value: number): string {
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value) * 100, 1)} %`
}

/** Eine Zielzahl mit der Genauigkeit, die das Ziel selbst nennt. */
function number(value: number, decimals: number): string {
  return formatNumber(value, decimals)
}

function seats(partyId: string): number {
  return snapshot.value?.councilSeatsByParty[partyId as keyof typeof snapshot.value.councilSeatsByParty] ?? 0
}

/*
 * The report takes the keyboard when it arrives and gives it back on Escape.
 *
 * It is the only modal in the game a player did not ask for — it opens on its own at the end of a
 * decade — so it has to be dismissible without hunting for the close button, and a reader who never
 * touches the mouse has to be able to reach the two actions at the bottom.
 */
/*
 * Watching `over` rather than `report`, and immediately.
 *
 * `report` is recomputed on every snapshot, so listening to it would yank the reader back to the top
 * whenever anything moved. And without `immediate` the watcher never fired at all on a save that was
 * already finished when the page loaded — which is how a campaign restored from disk opened three
 * hundred and fifty pixels down, with the first thing the report has to say scrolled off.
 */
watch(over, async (open) => {
  if (!open)
    return
  await nextTick()
  /*
   * `preventScroll`, and the top set by hand.
   *
   * Without both, the report opened three hundred and fifty pixels down — in the middle of the list
   * of decisions, with the first thing it has to say scrolled off. Taking focus is what moves a
   * scroll container, and the browser is right to do it; this is the one place where it is wrong.
   */
  panel.value?.focus({ preventScroll: true })
  if (body.value)
    body.value.scrollTop = 0
}, { immediate: true })

onKeyStroke('Escape', () => {
  if (report.value && !dismissed.value)
    dismissed.value = true
})
</script>

<template>
  <div v-if="report && !dismissed" class="modal-backdrop closing">
    <article
      ref="panel"
      class="closing-report panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="closing-title"
      tabindex="-1"
    >
      <button type="button" class="close-button" aria-label="Bericht schließen" @click="dismissed = true">
        ×
      </button>

      <header>
        <!-- Wer das war. Der Bericht redete zehn Jahre lang von „der eigenen Fraktion". -->
        <small>
          <template v-if="snapshot?.leader">{{ snapshot.leader.name }} · {{ backgroundName }} · </template>Januar 2026 – {{ snapshot?.year }} · {{ report.months }} Monate im Amt
        </small>
        <h2 id="closing-title" :class="report.ending.kind">
          {{ report.ending.headline }}
        </h2>
        <p class="because">
          {{ report.ending.because }}
        </p>
      </header>

      <div ref="body" class="closing-report__body">
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
                <!-- Short enough to hold its column: the long form clipped on the first row. -->
                <small>{{ line.good ? 'gewollte Richtung' : 'Gegenrichtung' }}</small>
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

          <section v-if="report.goals.length">
            <h3>Worauf du angetreten bist — {{ report.goals.filter(goal => goal.met).length }} von {{ report.goals.length }}</h3>
            <ul class="promises">
              <li v-for="goal in report.goals" :key="goal.id" :class="goal.met ? 'good' : 'bad'">
                <b>{{ goal.name }}</b>
                <!-- Die Schwelle und der erreichte Wert, dazu der Startwert: „unter 900" sagt nichts,
                     solange man nicht weiß, dass es bei 480 losging. -->
                <span>{{ goal.direction === 'above' ? 'über' : 'unter' }} {{ number(goal.threshold, goal.decimals) }}{{ goal.unit }}</span>
                <i>{{ number(goal.started, goal.decimals) }} → {{ number(goal.value, goal.decimals) }}</i>
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
      </div>

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
