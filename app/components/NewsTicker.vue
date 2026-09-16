<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useGameStore } from '~/stores/game'

/*
 * Der Stadtfunk, als Meldung statt als Laufband.
 *
 * Vorher lief eine Leiste über die ganze Bildbreite, in der eine Schleife endlos nach links kroch.
 * Das kostete eine dauernd laufende Animation, eine Messung bei jeder Größenänderung und eine
 * Sonderbehandlung für den Fall, dass eine einzige Meldung die Leiste nicht füllt — im Januar 2026
 * also für den Normalfall. Und es war unlesbar: man wartet nicht, bis der Satz vorbeikommt.
 *
 * Jetzt melden sich die letzten drei Meldungen als Pillen über der Bedienung, die neueste unten.
 * Nichts bewegt sich, nichts läuft je Bild, und eine Meldung steht so lange, wie sie gilt.
 */

const game = useGameStore()
const { snapshot, cityReports, railOpen, decisionsOpen } = storeToRefs(game)

const SCOPE_LABELS = { city: 'Lindenhafen', national: 'Deutschland', world: 'Welt' } as const

/**
 * Wie ein Einsatz angesagt wird.
 *
 * Schlicht und genau: man soll einen Einbruch von einem Unfall unterscheiden können, ohne von dem
 * aufzusehen, was man gerade liest. Der Dienst wird genannt, weil ihm das Blaulicht auf der Straße
 * gehört — und weil er das ist, was die eigenen Personalentscheidungen verändern.
 */
const CALL_HEADLINES = {
  burglary: 'Polizeieinsatz: Einbruch gemeldet',
  assault: 'Polizeieinsatz: Körperverletzung',
  accident: 'Rettungsdienst: Verkehrsunfall',
  fire: 'Feuerwehr: Gebäudebrand',
} as const

/** Was gerade damit passiert, in den zwei Worten, für die eine Pille Platz hat. */
const STATUS_WORDS = {
  open: 'Kräfte unterwegs',
  onScene: 'Kräfte vor Ort',
  cleared: 'abgeschlossen',
} as const

/**
 * Die Farbe, in der ein Einsatz markiert wird — nach der Art des Einsatzes, nicht nach dem Dienst.
 *
 * Dieselben vier Werte, in denen der Ring auf der Fahrbahn gezeichnet ist, damit ein Einsatz hier
 * und derselbe Einsatz aus der Kamera erkennbar dieselbe Sache sind. `tests/unit/callColours.test.ts`
 * hält die beiden Kopien zusammen.
 */
const CALL_COLOURS = {
  burglary: 'var(--call-theft)',
  assault: 'var(--call-police)',
  accident: 'var(--call-medical)',
  fire: 'var(--call-fire)',
} as const

/*
 * Zwei Ströme in einer Spalte: Einsätze zuerst, weil sie gerade passiert sind, die Nachrichten des
 * Rats dahinter. Sie bleiben bis hierher getrennt — warum der eine nie der andere werden darf,
 * steht bei `cityReports` im Store.
 */
const items = computed(() => [
  ...cityReports.value.map(report => ({
    id: `call-${report.id}`,
    label: report.status === 'cleared' ? 'Erledigt' : 'Einsatz',
    done: report.status === 'cleared',
    tone: CALL_COLOURS[report.kind],
    headline: [CALL_HEADLINES[report.kind], report.district, STATUS_WORDS[report.status]].filter(Boolean).join(' · '),
    open: () => { game.selectedReport = report },
  })),
  ...(snapshot.value?.news ?? []).map(item => ({
    id: item.id,
    label: SCOPE_LABELS[item.scope],
    done: false,
    tone: undefined as string | undefined,
    headline: item.headline,
    open: () => { game.selectedNews = item },
  })),
])

/** Drei Pillen sind das Meiste, was über der Bedienung Platz hat, ohne das Bild zuzustellen. */
const shown = computed(() => items.value.slice(0, 3).reverse())
</script>

<template>
  <aside
    v-if="shown.length > 0"
    class="wire"
    :class="{ 'clears-rail': railOpen, 'clears-agenda': decisionsOpen }"
    aria-label="Stadtfunk"
  >
    <button
      v-for="item in shown"
      :key="item.id"
      type="button"
      class="pod note"
      :class="{ 'is-done': item.done }"
      :style="{ '--tone': item.tone ?? 'var(--ink-3)' }"
      @click="item.open()"
    >
      <span class="pulse" />
      <span class="kind">{{ item.label }}</span>
      <span class="text">{{ item.headline }}</span>
    </button>
  </aside>
</template>

<style scoped>
.wire {
  position: absolute; bottom: 152px; left: 34px; right: 34px; z-index: 5;
  display: grid; gap: 8px; justify-items: start;
  pointer-events: none;
  transition: left 220ms cubic-bezier(0.16, 1, 0.3, 1), right 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.note { pointer-events: auto; }

/*
 * Der Stadtfunk teilt sich die untere Kante mit dem Lagebild und der Tagesordnung, und beide können
 * offen sein. Statt zu überlappen weicht er aus: er beginnt rechts vom Lagebild und endet links von
 * den Entscheidungen. Fährt eine der beiden Schubladen ein, nimmt er sich den Platz zurück.
 */
.wire.clears-rail { left: 406px; }
.wire.clears-agenda { right: 446px; }

.note {
  display: flex; align-items: center; gap: 13px;
  max-width: 100%; height: 46px; padding: 0 22px 0 18px; border: 0; border-radius: 999px;
  color: var(--ink); text-align: left; cursor: pointer;
  transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1), filter 160ms ease;
}
.note:hover { transform: translateY(-1px); filter: brightness(1.12); }

/* Ein laufender Einsatz pulst; ein abgeschlossener steht still und hört auf zu rufen. */
.pulse {
  position: relative; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--tone);
}
.pulse::after {
  content: ""; position: absolute; inset: -6px; border-radius: 50%;
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--tone), transparent 66%);
  animation: wire-pulse 1.8s ease-out infinite;
}
.is-done .pulse { background: var(--ink-3); }
.is-done .pulse::after { animation: none; box-shadow: none; }
.is-done .kind, .is-done .text { color: var(--ink-3); }

@keyframes wire-pulse {
  0% { transform: scale(0.72); opacity: 0.9; }
  100% { transform: scale(1.25); opacity: 0; }
}

.kind { flex: none; color: var(--tone); font-size: 12.5px; }
.text {
  overflow: hidden; color: var(--ink-2); font-size: 13px; white-space: nowrap; text-overflow: ellipsis;
}

/* Ältere Meldungen treten zurück, damit die neueste die ist, die man liest. */
.note:not(:last-child) { opacity: 0.66; }
.note:not(:last-child):hover { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .pulse::after { animation: none; }
}

/* Auf schmalen Fenstern gewinnt die Meldung gegen die Schubladen: sie ist das Neue im Bild. */
@media (max-width: 1440px) {
  .wire.clears-agenda { right: 34px; }
}
</style>
