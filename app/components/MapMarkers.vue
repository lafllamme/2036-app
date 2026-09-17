<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
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
const { cityReports, project, walking, experienceStage, snapshot, openDecisionId, openHotspotId } = storeToRefs(game)

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

/**
 * Die zweite Uhr, als Marke am Ort.
 *
 * Ein Brennpunkt gehört auf die Karte und nicht in eine Liste: er hat einen Bezirk, und die Antwort
 * darauf ist eine Handlung dort. Während ein Standort gesucht wird, treten sie zurück — zwei Fragen
 * gleichzeitig auf einer Karte sind eine zu viel.
 */
const spots = computed(() => (siting.value
  ? []
  : (snapshot.value?.hotspots ?? []).map(spot => ({
      ...spot,
      at: CENTRES.get(spot.districtId) ?? { x: 0, z: 0 },
    }))))

/**
 * Welcher Brennpunkt gerade offen ist — die Marke ist der Griff, die Karte darunter die Antwort.
 *
 * Der Wert liegt im Store, weil zwei Stellen ihn setzen: diese Marke und die Gebäudekarte, die sagt,
 * was man an einem Ort tun kann. Ein Ort hat eine Lage, und beide Wege zeigen auf dieselbe.
 */
const open = computed(() => spots.value.find(spot => spot.id === openHotspotId.value) ?? null)

/**
 * Beim ersten Mal steht dabei, dass die Karte gemeint ist.
 *
 * Drei helle Kissen über der Stadt sind für den, der sie gebaut hat, offensichtlich. Für jemanden,
 * der gerade eine Vorlage durchgebracht hat und auf ein Panel wartet, sind sie Dekoration — gemeldet
 * als „man checkt nicht, dass man mit der Karte interagieren muss“. Also einmal ausgeschrieben, und
 * danach nie wieder: wer es einmal getan hat, weiß es.
 *
 * Im `localStorage` und nicht im Spielstand, aus demselben Grund wie die Einarbeitung: es ist eine
 * Eigenschaft des Spielers und nicht der Kampagne.
 */
const sitedOnce = useLocalStorage('2036-siting-seen', false)
watch(siting, (now) => {
  if (!now)
    sitedOnce.value = true
})

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
/** Die Elemente aller Marken, nach ihrem Schlüssel. Ein Topf für Einsätze, Standorte und Brennpunkte. */
const elements = new Map<string, HTMLElement>()
let frame = 0

function bind(element: Element | null, id: string): void {
  if (element instanceof HTMLElement)
    elements.set(id, element)
  else elements.delete(id)
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

/** Alles, was der Bildlauf schieben muss — Einsätze, Standorte und Brennpunkte in einer Liste. */
const placements = computed(() => [
  ...marks.value.map(mark => ({ key: `call-${mark.id}`, x: mark.x, z: mark.z, height: HOVER_HEIGHT })),
  ...choices.value.map(choice => ({ key: `site-${choice.districtId}`, x: choice.at.x, z: choice.at.z, height: SITE_HEIGHT })),
  ...spots.value.map(spot => ({ key: `spot-${spot.id}`, x: spot.at.x, z: spot.at.z, height: SITE_HEIGHT })),
])

const point = screenPoint()

function place(): void {
  frame = requestAnimationFrame(place)
  const projector = project.value
  if (!projector)
    return

  for (const mark of placements.value) {
    const element = elements.get(mark.key)
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
/*
 * Eine offene Lage teilt sich den Platz mit dem Lagebild und mit dem Abstimmungsblatt.
 *
 * Also: die Lage macht das Lagebild zu, und das Abstimmungsblatt macht die Lage zu. Die Reihenfolge
 * ist keine Geschmacksfrage — eine Vorlage hält die Uhr an und will beantwortet werden, ein
 * Brennpunkt läuft nebenher. Wer wichtiger ist, deckt den anderen zu.
 */
watch(openHotspotId, (now) => {
  if (now)
    game.railOpen = false
})

watch(openDecisionId, (now) => {
  if (now)
    openHotspotId.value = null
})

watch(siting, (now) => {
  if (now)
    game.decisionsOpen = false
  // Sofort und nicht erst beim nächsten Wechsel: wer mit offener Schublade hier ankommt, soll sie
  // nicht offen behalten, nur weil sie schon offen war.
}, { immediate: true })

watch(placements, () => {
  for (const [key, element] of elements) {
    if (!placements.value.some(mark => mark.key === key)) {
      elements.delete(key)
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
      <em v-if="!sitedOnce">Klick eine der drei Marken auf der Karte — oder ein Haus in dem Bezirk.</em>
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
      Was der Stadt gerade an einem Ort zusetzt — die zweite Uhr. Die Marke ist der Griff; was man
      tun kann, steht in der Karte, die sie aufmacht.
    -->
    <button
      v-for="spot in spots"
      :key="`spot-${spot.id}`"
      :ref="element => bind(element as Element | null, `spot-${spot.id}`)"
      type="button"
      class="mark spot"
      :class="{ 'is-urgent': spot.grace <= 1, 'is-held': Boolean(spot.running) }"
      @click="openHotspotId = openHotspotId === spot.id ? null : spot.id"
    >
      <span class="spot-name">{{ spot.label }}</span>
      <span class="spot-where">{{ spot.districtName }}</span>
      <span class="spot-level" :aria-label="`Stufe ${spot.level} von 4`">
        <i v-for="step in 4" :key="step" :class="{ 'is-on': step <= spot.level }" />
      </span>
      <span class="stem spot-stem" />
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

  <!-- Die Antwort. Ohne Rat, aus eigenen Mitteln — außer der letzten. -->
  <aside v-if="open" class="pod answers" role="dialog" :aria-label="`${open.label} in ${open.districtName}`">
    <header>
      <div>
        <span class="kick">{{ open.districtName }} · Stufe {{ open.level }} von 4</span>
        <h2>{{ open.label }}</h2>
      </div>
      <button type="button" class="close-button" aria-label="Schließen" @click="openHotspotId = null">
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </header>

    <p v-if="open.running" class="running">
      Läuft bereits: {{ open.answers.find(answer => answer.id === open!.running)?.label }}
    </p>
    <template v-else>
      <button
        v-for="answer in open.answers"
        :key="answer.id"
        type="button"
        class="answer"
        :disabled="!answer.open"
        @click="game.answerHotspot(open!.id, answer.id); openHotspotId = null"
      >
        <span class="answer-name">{{ answer.label }}</span>
        <span class="answer-detail">{{ answer.detail }}</span>
        <span class="answer-price">
          <template v-if="answer.cost > 0">{{ formatNumber(answer.cost, 1) }} Mio. € einmalig</template>
          <template v-else>ohne Einmalkosten</template>
          <template v-if="answer.monthly > 0"> · {{ formatNumber(answer.monthly, 2) }}/Monat für {{ answer.months }} Monate</template>
          <b v-if="!answer.open"> · braucht erst einen Ratsbeschluss</b>
        </span>
      </button>
    </template>

    <p class="foot">
      Die Zeit läuft weiter. Ein Brennpunkt, den niemand beantwortet, steigt jeden Monat um eine
      Stufe — und kostet dich am Ende im Rat.
    </p>
  </aside>
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

/* Nur beim ersten Mal. Danach steht hier nichts mehr, und die Zeile wird wieder schmal. */
.ask em {
  font-style: normal;
  font-size: 12.5px;
  color: var(--ink-2);
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

/*
 * Ein Brennpunkt sieht aus wie ein Einsatz, der nicht mehr aufhört: dunkel wie eine Meldung, aber mit
 * einer Stufenleiste statt eines Punktes. Die Leiste ist die Drohung — vier Striche, und der vierte
 * heißt, dass es nächsten Monat kippt.
 */
.spot {
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 14px;
  background: rgba(10, 14, 18, 0.93);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 12px 26px -10px rgba(0, 0, 0, 0.9);
}

.spot:hover { background: rgba(18, 24, 29, 0.97); }
.spot.is-urgent { box-shadow: inset 0 0 0 1px var(--negative), 0 12px 26px -10px rgba(0, 0, 0, 0.9); }
/* Eine laufende Antwort ist keine offene Frage mehr, also drängt sie auch nicht. */
.spot.is-held { opacity: 0.72; }

.spot-name {
  font-family: var(--display);
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.spot-where {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
}

.spot-level {
  display: flex;
  gap: 3px;
  margin-top: 5px;
}

.spot-level i {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.16);
}

.spot-level i.is-on { background: var(--negative); }

.spot-stem {
  height: 26px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0));
}

/* Die Antwortkarte sitzt fest unten links, nicht am Ort: sie ist Text und keine Marke. */
/*
 * Und sie steht **neben** der Markenebene, nicht darin.
 *
 * Darin lag sie bei z-index 4 und damit unter dem Stadtfunk und den Schubladen — also unter genau dem,
 * was am selben Platz steht. Ein Kind kann seinen Stapelkontext nicht verlassen, also musste sie
 * heraus. Jetzt teilt sie sich die Ebene mit dem Abstimmungsblatt, und das ist auch richtig: es ist
 * dasselbe, nur kleiner.
 */
.answers {
  position: absolute;
  z-index: 12;
  bottom: 152px;
  left: 34px;
  width: min(420px, calc(100% - 68px));
  padding: 20px 22px 16px;
  pointer-events: auto;
}

.answers header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.answers .kick {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.answers h2 {
  margin: 5px 0 0;
  font-family: var(--display);
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.014em;
  color: var(--ink);
}

.answer {
  display: block;
  width: 100%;
  padding: 11px 0;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: none;
  text-align: left;
  cursor: pointer;
}

.answer:disabled { opacity: 0.45; cursor: default; }
.answer:hover:not(:disabled) .answer-name { color: #fff; }

.answer-name {
  display: block;
  font-family: var(--text);
  font-size: 14px;
  color: var(--ink);
  transition: color 140ms ease;
}

.answer-detail {
  display: block;
  margin-top: 3px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ink-2);
}

.answer-price {
  display: block;
  margin-top: 5px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
}

.answer-price b { color: var(--negative); font-weight: 400; }

.answers .running,
.answers .foot {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ink-3);
}

.answers .running { color: var(--ink-2); }

@media (prefers-reduced-motion: reduce) {
  .dot { animation: none; opacity: 0.9; }
}
</style>
