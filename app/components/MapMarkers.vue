<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { screenPoint } from '~/rendering/screen'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'
import { LINDENHAFEN } from '~/world/model/lindenhafen'

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
const { cityReports, project, walking, experienceStage, snapshot } = storeToRefs(game)

/**
 * Die drei Standorte, zwischen denen gerade zu wählen ist.
 *
 * Der Rat hat beschlossen, **was** gebaut wird; wo, steht auf der Karte zur Wahl. Deshalb liegt die
 * Entscheidung hier und nicht in einem Blatt: ein Bauplatz ist ein Ort, und einen Ort wählt man,
 * indem man hinsieht und hinzeigt — nicht, indem man drei Zeilen einer Liste vergleicht.
 *
 * Die Mitte eines Bezirks als Punkt: die Bezirksgrenzen stehen im Weltmodell, und der Mittelpunkt
 * einer Fläche ist genau genug für „dort drüben“. Genauer wäre eine Präzision, die die Entscheidung
 * gar nicht hat — gewählt wird ein Stadtteil, keine Parzelle.
 */
const CENTRES = new Map(LINDENHAFEN.districts.map(district => [
  district.id,
  { x: (district.bounds.minX + district.bounds.maxX) / 2, z: (district.bounds.minZ + district.bounds.maxZ) / 2 },
]))

const siting = computed(() => (experienceStage.value === 'gameplay' && !walking.value ? snapshot.value?.pendingSiting ?? null : null))

const choices = computed(() => (siting.value?.sites ?? []).map(site => ({
  ...site,
  at: CENTRES.get(site.districtId) ?? { x: 0, z: 0 },
})))

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
/** Einsatzmarken nach ihrer Nummer, Standortmarken nach ihrem Bezirk. Ein Topf, zwei Schlüsselarten. */
const spots = new Map<string, HTMLElement>()
let frame = 0

function bind(element: Element | null, id: string): void {
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
/** Eine Standortmarke steht höher: sie meint einen Stadtteil und keine Kreuzung. */
const SITE_HEIGHT = 90

/** Alles, was der Bildlauf schieben muss — Einsätze und Standorte in einer Liste. */
const placements = computed(() => [
  ...marks.value.map(mark => ({ key: `call-${mark.id}`, x: mark.x, z: mark.z, height: HOVER_HEIGHT })),
  ...choices.value.map(choice => ({ key: `site-${choice.districtId}`, x: choice.at.x, z: choice.at.z, height: SITE_HEIGHT })),
])

const point = screenPoint()

function place(): void {
  frame = requestAnimationFrame(place)
  const projector = project.value
  if (!projector)
    return

  for (const mark of placements.value) {
    const element = spots.get(mark.key)
    if (!element)
      continue
    projector(mark.x, mark.height, mark.z, point)
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
/*
 * Solange ein Standort gesucht wird, gehört der Schirm der Karte.
 *
 * Die Vorlagen-Schublade deckte die dritte Marke zu — also stand eine der drei Möglichkeiten hinter
 * einem Panel, und zwar diejenige, die gerade nicht gemeint war. Eine Entscheidung, die auf der Karte
 * liegt, darf nicht von einer Liste verdeckt werden, aus der sie gerade herausgekommen ist.
 */
watch(siting, (now) => {
  if (now)
    game.decisionsOpen = false
  // Sofort und nicht erst beim nächsten Wechsel: wer mit offener Schublade hier ankommt, soll sie
  // nicht offen behalten, nur weil sie schon offen war.
}, { immediate: true })

watch(placements, () => {
  for (const [key, element] of spots) {
    if (!placements.value.some(mark => mark.key === key)) {
      spots.delete(key)
      continue
    }
    element.style.visibility = 'hidden'
  }
})
</script>

<template>
  <div v-if="placements.length > 0 || siting" ref="layer" class="map-marks">
    <!--
      Drei Kissen auf einer Karte sagen nicht, worum es geht. Der Satz dazu steht oben, mittig, und
      verschwindet mit der Entscheidung — er ist die Frage, die die Marken beantworten.
    -->
    <p v-if="siting" class="ask">
      <span>Standort wählen</span>
      <b>{{ siting.title }}</b>
    </p>

    <!--
      Was gerade passiert. Nur Ansicht, deshalb für Screenreader stumm — dieselben Einsätze stehen
      als Liste im Stadtfunk, und die ist die zugängliche Fassung davon.
    -->
    <button
      v-for="mark in marks"
      :key="`call-${mark.id}`"
      :ref="element => bind(element as Element | null, `call-${mark.id}`)"
      type="button"
      class="mark"
      :style="{ '--tone': COLOURS[mark.kind] }"
      :title="`${LABELS[mark.kind]} · ${mark.district ?? 'Umland'}`"
      aria-hidden="true"
      @click="game.selectedReport = mark"
    >
      <span class="dot" />
      <span class="name">{{ LABELS[mark.kind] }}</span>
      <span class="stem" />
    </button>

    <!--
      Und wohin das Beschlossene soll. Diese hier sind **keine** Ansicht, sondern die Entscheidung
      selbst — also echte Knöpfe mit echtem Text.
    -->
    <button
      v-for="choice in choices"
      :key="`site-${choice.districtId}`"
      :ref="element => bind(element as Element | null, `site-${choice.districtId}`)"
      type="button"
      class="mark site"
      :title="choice.note"
      @click="game.chooseSite(choice.districtId)"
    >
      <span class="site-name">{{ choice.name }}</span>
      <span class="site-facts">
        {{ formatNumber(choice.cost, 1) }} Mio. € · {{ choice.months }} Monate
        <b v-if="choice.resistance >= 1.5">· Widerstand</b>
      </span>
      <span class="stem site-stem" />
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

.ask {
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0;
  padding: 10px 20px;
  border-radius: 999px;
  pointer-events: none;
  background: rgba(10, 14, 18, 0.9);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.10), 0 10px 24px -10px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}

.ask span {
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.ask b {
  font-family: var(--display);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.012em;
  color: var(--ink);
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

/*
 * Die Standortmarke ist ein Angebot und keine Meldung: heller, größer, mit zwei Zeilen — und sie
 * ist das einzige auf dem Schirm, das gerade angeklickt werden will.
 */
.site {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 9px 15px;
  background: linear-gradient(180deg, #fbf9f4 0%, #e6e2d8 100%);
  color: #0b0f12;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 12px 26px -10px rgba(0, 0, 0, 0.85);
}

.site:hover { background: #fff; }

.site-name {
  font-family: var(--display);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.site-facts {
  font-family: var(--mono);
  font-size: 11px;
  color: rgba(11, 15, 18, 0.62);
}

.site-facts b {
  font-weight: 500;
  color: #a8442c;
}

.site-stem {
  height: 26px;
  background: linear-gradient(180deg, rgba(251, 249, 244, 0.85), rgba(251, 249, 244, 0));
}

@media (prefers-reduced-motion: reduce) {
  .dot { animation: none; opacity: 0.9; }
}
</style>
