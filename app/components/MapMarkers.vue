<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { screenPoint } from '~/rendering/screen'
import { useGameStore } from '~/stores/game'

/**
 * Was in der Stadt passiert, dort beschriftet, wo es passiert.
 *
 * Bis hierher lief der Stadtfunk als Liste am unteren Rand: „Polizeieinsatz: Einbruch gemeldet ·
 * Innenstadt / Altstadt". Jeder Eintrag trägt seit jeher eine **Koordinate** — sie wurde nur nie
 * benutzt, außer um beim Anklicken hinzufliegen. Die Stadt war damit eine Kulisse, über der ein
 * Nachrichtenband lief, und nicht ein Ort, an dem etwas geschieht.
 *
 * Jetzt steht die Marke über dem Einsatz. Das ist der kleinste Schritt, der aus der Karte eine
 * Bedienfläche macht, und die Vorarbeit für alles Weitere: Lagen, Bezirke, Vorlagen mit Ort.
 *
 * ## Warum das nicht durch Vue läuft
 *
 * Eine Marke muss der Kamera **jedes Bild** folgen. Über reaktive Werte wären das bei zwanzig Marken
 * und 120 Bildern 2.400 Store-Schreibvorgänge je Sekunde, jeder mit Abhängigkeitsverfolgung und
 * einem Render-Durchlauf am Ende. Die Liste der Marken ist reaktiv — sie ändert sich alle paar
 * Sekunden —, ihre **Position** nicht: die schreibt eine eigene Bildschleife direkt als
 * `transform` ins Element. Vue erfährt davon nichts, und das ist der Punkt.
 *
 * `translate3d` und nicht `left/top`, damit der Browser die Marke schiebt, ohne das Layout neu zu
 * rechnen.
 */

const game = useGameStore()
const { cityReports, project, walking, experienceStage } = storeToRefs(game)

/** Wie ein Einsatz heißt, wenn er über der Straße steht. Kurz — es ist eine Marke, keine Meldung. */
const LABELS = {
  burglary: 'Einbruch',
  assault: 'Körperverletzung',
  accident: 'Unfall',
  fire: 'Brand',
} as const

/**
 * Dieselben vier Farben wie im Stadtfunk und wie der Ring auf der Fahrbahn.
 *
 * Ein Einsatz muss an allen drei Stellen erkennbar dieselbe Sache sein, sonst sind es drei Sachen.
 * `tests/unit/callColours.test.ts` hält die Kopien zusammen.
 */
const COLOURS = {
  burglary: 'var(--call-theft)',
  assault: 'var(--call-police)',
  accident: 'var(--call-medical)',
  fire: 'var(--call-fire)',
} as const

/*
 * Nur laufende Einsätze. Ein abgeschlossener bleibt im Funk noch ein paar Sekunden stehen, damit man
 * ihn enden sieht — über der Straße wäre er eine Marke für etwas, das dort nicht mehr ist.
 */
const marks = computed(() =>
  experienceStage.value === 'gameplay' && !walking.value
    ? cityReports.value.filter(report => report.status !== 'cleared')
    : [])

const layer = ref<HTMLElement | null>(null)
const spots = new Map<number, HTMLElement>()
let frame = 0

function bind(element: Element | null, id: number): void {
  if (element instanceof HTMLElement)
    spots.set(id, element)
  else spots.delete(id)
}

/**
 * Einmal je Bild: jede Marke dorthin schieben, wo ihr Ort gerade steht.
 *
 * Die Höhe ist nicht die des Bodens, sondern ein Stück darüber — eine Marke auf der Fahrbahn steht
 * mitten im Geschehen und wird von den Fahrzeugen verdeckt, um die es geht.
 */
const HOVER_HEIGHT = 14

const point = screenPoint()

function place(): void {
  frame = requestAnimationFrame(place)
  const projector = project.value
  if (!projector)
    return

  for (const mark of marks.value) {
    const element = spots.get(mark.id)
    if (!element)
      continue
    projector(mark.x, HOVER_HEIGHT, mark.z, point)
    if (!point.onScreen) {
      element.style.visibility = 'hidden'
      continue
    }
    /*
     * Weiter weg heißt kleiner, aber nie unlesbar: zwischen 300 m und 1.600 m schrumpft die Marke
     * auf zwei Drittel und bleibt dann so. Ohne die Grenze wäre ein Einsatz am anderen Ende der
     * Stadt ein Punkt, und mit einer Marke in voller Größe stünde die halbe Karte voller Schilder.
     */
    const scale = point.away < 300 ? 1 : Math.max(0.66, 1 - (point.away - 300) / 3900)
    element.style.visibility = 'visible'
    element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -100%) scale(${scale})`
    // Was näher steht, liegt oben. 10.000 minus Metern, damit die Zahl fällt, wenn der Abstand wächst.
    element.style.zIndex = String(Math.max(1, Math.round(10_000 - point.away)))
  }
}

onMounted(() => {
  frame = requestAnimationFrame(place)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))

// Eine Marke, die gerade erst entstanden ist, hat noch keine Position — bis sie eine hat, bleibt sie weg.
watch(marks, () => {
  for (const [id, element] of spots) {
    if (!marks.value.some(mark => mark.id === id)) {
      spots.delete(id)
      continue
    }
    element.style.visibility = 'hidden'
  }
})
</script>

<template>
  <div v-if="marks.length > 0" ref="layer" class="map-marks" aria-hidden="true">
    <button
      v-for="mark in marks"
      :key="mark.id"
      :ref="element => bind(element as Element | null, mark.id)"
      type="button"
      class="mark"
      :style="{ '--tone': COLOURS[mark.kind] }"
      :title="`${LABELS[mark.kind]} · ${mark.district ?? 'Umland'}`"
      @click="game.selectedReport = mark"
    >
      <span class="dot" />
      <span class="name">{{ LABELS[mark.kind] }}</span>
      <span class="stem" />
    </button>
  </div>
</template>

<style scoped>
/*
 * Die Ebene selbst fängt nichts ab — sie liegt über der ganzen Stadt, und ein Layer, der Klicks
 * schluckt, nähme dem Ziehen und Drehen der Karte die Fläche. Nur die Marken selbst sind anfassbar.
 */
.map-marks {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  overflow: hidden;
}

.mark {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px 5px 8px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  pointer-events: auto;
  visibility: hidden;
  transform-origin: 50% 100%;
  background: rgba(10, 14, 18, 0.88);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.10),
    0 8px 18px -8px rgba(0, 0, 0, 0.9);
  font-family: var(--text);
  font-size: 12px;
  color: var(--ink);
  white-space: nowrap;
  transition: background 140ms ease;
}

.mark:hover { background: rgba(18, 24, 29, 0.96); }

.dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--tone);
  /* Ein Einsatz läuft noch — also pulst er. Ruhende Marken gibt es hier nicht. */
  animation: mark-pulse 1.8s ease-in-out infinite;
}

/*
 * Der Stiel zeigt auf den Ort. Ohne ihn schwebt die Marke über der Stadt und man weiß nicht, zu
 * welcher Kreuzung sie gehört — mit ihm ist es ein Zeigefinger.
 */
.stem {
  position: absolute;
  top: 100%;
  left: 50%;
  width: 1px;
  height: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0));
}

@keyframes mark-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .dot { animation: none; opacity: 0.9; }
}
</style>
