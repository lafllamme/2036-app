<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useGameStore } from '~/stores/game'

const game = useGameStore()
const { snapshot, cityReports } = storeToRefs(game)

const SCOPE_LABELS = { city: 'LINDENHAFEN', national: 'DEUTSCHLAND', world: 'WELT' } as const

/**
 * What a call is announced as.
 *
 * Plain and specific: a player should be able to tell a break-in from a collision without looking
 * up from the panel they are reading. The service is named because that is what the blue light on
 * the street belongs to, and it is the thing their staffing decisions change.
 */
const CALL_HEADLINES = {
  burglary: 'Polizeieinsatz: Einbruch gemeldet',
  assault: 'Polizeieinsatz: Körperverletzung',
  accident: 'Rettungsdienst: Verkehrsunfall',
  fire: 'Feuerwehr: Gebäudebrand',
} as const

/**
 * The two streams in one bar.
 *
 * Calls first, because they are what just happened; the council's own news behind them. They stay
 * separate all the way here — see `cityReports` in the store for why one may never become the other.
 */
/** What is happening with it right now, in the two words a bar has room for. */
const STATUS_WORDS = {
  open: 'Kräfte unterwegs',
  onScene: 'Kräfte vor Ort',
  cleared: 'abgeschlossen',
} as const

/**
 * The colour a call is marked in, by what kind it is rather than by which service turned out.
 *
 * The same four values the ring on the tarmac is drawn in, so a call read here and the same call
 * seen from the camera are recognisably one thing. They were defined as design tokens, documented
 * as being used for exactly this, and used by nothing — the tarmac had its own copy of the four hex
 * values and the bar had none. `tests/unit/callColours.test.ts` now holds the two copies together.
 */
const CALL_COLOURS = {
  burglary: 'var(--call-theft)',
  assault: 'var(--call-police)',
  accident: 'var(--call-medical)',
  fire: 'var(--call-fire)',
} as const

const items = computed(() => [
  ...cityReports.value.map(report => ({
    id: `call-${report.id}`,
    label: report.status === 'cleared' ? 'ERLEDIGT' : 'EINSATZ',
    urgent: report.status !== 'cleared',
    done: report.status === 'cleared',
    tone: CALL_COLOURS[report.kind],
    headline: [
      CALL_HEADLINES[report.kind],
      report.district,
      STATUS_WORDS[report.status],
    ].filter(Boolean).join(' · '),
    open: () => { game.selectedReport = report },
  })),
  ...(snapshot.value?.news ?? []).map(item => ({
    id: item.id,
    label: SCOPE_LABELS[item.scope],
    urgent: false,
    headline: item.headline,
    done: false,
    tone: undefined,
    open: () => { game.selectedNews = item },
  })),
])

const windowRef = ref<HTMLElement | null>(null)
const cycleRef = ref<HTMLElement | null>(null)
/** True only once the headlines are genuinely wider than the bar. */
const scrolls = ref(false)

/**
 * The marquee duplicates one cycle and slides by half its width, which only reads as a loop while a
 * single cycle is wider than the bar. In January 2026 there is one headline, so the old ticker left
 * half the bar empty and looked broken. Now short news simply sits still.
 */
function measure(): void {
  const bar = windowRef.value
  const cycle = cycleRef.value
  if (!bar || !cycle)
    return
  scrolls.value = cycle.scrollWidth > bar.clientWidth + 8
}

useResizeObserver(windowRef, () => measure())
watch(items, () => void nextTick(measure))

/** Constant reading speed regardless of how much history is in the loop. */
const duration = computed(() => `${Math.max(38, items.value.length * 8)}s`)
</script>

<template>
  <section class="news-ticker" aria-label="Aktuelle Meldungen">
    <div class="news-label">
      <span /> STADTFUNK
    </div>
    <div ref="windowRef" class="ticker-window">
      <span class="ticker-track" :class="{ 'is-static': !scrolls }" :style="{ '--ticker-duration': duration }">
        <span ref="cycleRef" class="ticker-cycle">
          <button v-for="item in items" :key="item.id" type="button" class="ticker-item" :class="{ 'is-call': item.urgent, 'is-done': item.done }" :style="item.tone ? { '--call-tone': item.tone } : undefined" @click="item.open()">
            <b>{{ item.label }}</b>{{ item.headline }}
          </button>
        </span>
        <!--
          The second cycle is what makes the loop read as a loop. It used to be inert text, so the
          moment the first cycle slid off the bar the only headlines on screen could not be clicked
          — the bar looked interactive and was not. Same buttons, hidden from assistive technology
          and out of the tab order, because to a screen reader they are the same headlines twice.
        -->
        <span v-if="scrolls" class="ticker-cycle" aria-hidden="true">
          <button
            v-for="item in items"
            :key="`echo-${item.id}`"
            type="button"
            tabindex="-1"
            class="ticker-item"
            :class="{ 'is-call': item.urgent, 'is-done': item.done }"
            :style="item.tone ? { '--call-tone': item.tone } : undefined"
            @click="item.open()"
          >
            <b>{{ item.label }}</b>{{ item.headline }}
          </button>
        </span>
      </span>
    </div>
  </section>
</template>
