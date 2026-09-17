<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFirstSteps } from '~/composables/useFirstSteps'
import { FIRST_STEPS, stepCleared } from '~/content/firstSteps'
import { getParty } from '~/content/parties'
import { useGameStore } from '~/stores/game'

/**
 * Die Einarbeitung, als Ring um die echte Fläche.
 *
 * Kein eigener Bildschirm, keine Attrappe: die Karte zeigt auf das Element, um das es geht, und
 * lässt es anfassbar. Zwei der acht Schritte warten darauf, dass der Spieler wirklich etwas tut —
 * eine Vorlage öffnen und sie einbringen —, und das ist keine Inszenierung: es ist dieselbe Vorlage,
 * dieselbe Abstimmung und dasselbe Ergebnis, das er auch ohne die Einarbeitung bekommen hätte.
 *
 * ## Warum das Loch aus einem Schatten besteht
 *
 * Ein abgedunkelter Bildschirm mit einem hellen Fenster darin baut man normalerweise aus vier
 * Flächen oder einer Maske. Hier ist es **ein** Element mit `box-shadow: 0 0 0 9999px`: der Schatten
 * deckt alles außerhalb des Rechtecks ab, das Rechteck selbst bleibt frei, und es gibt weder einen
 * Filter noch eine zweite Ebene, die der Compositor jeden Frame neu zusammensetzen müsste. Im
 * laufenden Spiel liegt eine Stadt bei 120 Bildern je Sekunde darunter, und `docs/DESIGN.md` hält
 * fest, was sechs weichgezeichnete Flächen hier einmal gekostet haben: achtzehn davon.
 *
 * Gemessen wird das Rechteck beim Schrittwechsel und danach nur noch, wenn sich das Fenster ändert.
 * Ein `getBoundingClientRect()` je Bild wäre ein Layout-Durchlauf je Bild.
 */

const game = useGameStore()
const { openDecisionId, lastVoteResult, selectedPartyId, experienceStage, leaderName, railOpen, decisionsOpen, snapshot } = storeToRefs(game)
const coach = useFirstSteps()

const box = ref<{ top: number, left: number, width: number, height: number } | null>(null)
const card = ref<HTMLElement | null>(null)

const step = computed(() => coach.step.value)
const position = computed(() => (coach.at.value >= 0 ? `${coach.at.value + 1} / ${FIRST_STEPS.length}` : ''))

/**
 * Das Kürzel der eigenen Fraktion und der eigene Name in den Text.
 *
 * Der erste Satz soll von **dir** handeln und der letzte dich verabschieden. Beides ist eine
 * Ersetzung und keine zweite Textquelle: das Drehbuch bleibt lesbar, auch wenn man es ohne das Spiel
 * liest.
 */
const label = computed(() => (selectedPartyId.value ? getParty(selectedPartyId.value)?.abbreviation ?? 'Fraktion' : 'Fraktion'))
const title = computed(() => {
  const written = (step.value?.title ?? '').replace('{partei}', label.value)
  const person = leaderName.value.trim()
  // Ohne Namen fällt die Anrede ganz weg, statt eine Lücke zu hinterlassen: „Viel Erfolg.“
  return person ? written.replace('{name}', person) : written.replace(', {name}', '')
})

/*
 * Während ein Abstimmungsergebnis auf dem Schirm liegt, tritt die Einarbeitung zur Seite.
 *
 * Das Ergebnis ist der Moment, auf den die letzten beiden Schritte hingearbeitet haben — es ist
 * bildschirmfüllend, es will gelesen werden, und eine Karte darüber, die „Weiter" sagt, nähme ihm
 * genau das. Der nächste Schritt wartet, bis der Spieler es weggeklickt hat.
 */
const hidden = computed(() => Boolean(lastVoteResult.value))

function measure(): void {
  const anchor = step.value?.anchor
  if (!anchor || anchor === 'none') {
    box.value = null
    return
  }
  const element = document.querySelector(`[data-first-step="${anchor}"]`)
  if (!element) {
    box.value = null
    return
  }
  /*
   * Erst in den sichtbaren Bereich holen, dann messen.
   *
   * Das Blatt einer Vorlage scrollt, und der Knopf, der sie einbringt, steht unten darin. Ohne das
   * lag der Ring dort, wo der Knopf ist — unterhalb des Bildschirmrands —, und die Einarbeitung
   * zeigte auf etwas, das man nicht sieht. `block: 'nearest'` scrollt nur, wenn es nötig ist, und
   * dann so wenig wie möglich.
   */
  let rect = element.getBoundingClientRect()
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    element.scrollIntoView({ block: 'nearest' })
    rect = element.getBoundingClientRect()
  }
  const pad = 10
  box.value = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

/**
 * Zweimal messen, und das zweite Mal nach dem Bild.
 *
 * Die Flächen, auf die gezeigt wird, fahren herein: das Blatt steigt in 380 ms auf, die Schubladen
 * klappen auf. Sofort gemessen sitzt der Ring dort, wo das Element **war**. Ein Nachmessen nach dem
 * Übergang setzt ihn dorthin, wo es ist.
 */
let settle = 0
function remeasure(): void {
  measure()
  window.clearTimeout(settle)
  settle = window.setTimeout(measure, 420)
}

watch(() => step.value?.id, remeasure, { immediate: true })
watch(openDecisionId, remeasure)
watch(hidden, remeasure)
// Eine Schublade, die gerade aufgeht, ist der nächste Anker — und den gibt es vorher noch nicht.
watch([railOpen, decisionsOpen], remeasure)

/*
 * Die zwei Schritte, die auf eine Handlung warten. Was das Spiel meldet, entscheidet das Drehbuch —
 * hier wird nur nachgesehen, ob es eingetreten ist.
 */
const world = computed(() => ({
  railOpen: railOpen.value,
  decisionsOpen: decisionsOpen.value,
  sheetOpen: openDecisionId.value !== null,
  tabled: (snapshot.value?.agenda.length ?? 0) > 0,
}))

/*
 * Geprüft wird bei jeder Änderung **und** bei jedem Schrittwechsel.
 *
 * Nur auf die Änderung zu hören sah richtig aus und hing: wer die Vorlage schon aufgemacht hatte,
 * bevor der Schritt danach fragte, wartete auf ein Ereignis, das bereits eingetreten war — die
 * Einarbeitung stand für immer bei „Wartet auf deinen Klick". Ein Tor fragt nach einem Zustand, nicht
 * nach einem Übergang.
 */
watch([world, () => step.value?.id], () => {
  const current = step.value
  if (current && stepCleared(current, world.value))
    coach.advance()
}, { immediate: true, deep: true })

/*
 * Und der Start: einmal, beim ersten Betreten der Stadt.
 *
 * Die Uhr steht dabei ohnehin — `enterCity` lässt sie stehen, bis der Spieler sie in Gang setzt.
 * Die Einarbeitung hält sie deshalb nicht extra an; sie soll den Zustand nicht verändern, den sie
 * erklärt.
 */
watch(experienceStage, (stage) => {
  if (stage === 'gameplay')
    coach.beginOnce()
}, { immediate: true })

function onKey(event: KeyboardEvent): void {
  if (!coach.running.value || hidden.value)
    return
  if (event.key === 'Escape')
    coach.finish()
  if ((event.key === 'Enter' || event.key === ' ') && step.value?.gate === 'hand')
    coach.advance()
}

onMounted(() => {
  window.addEventListener('resize', remeasure)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', remeasure)
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(settle)
})

/**
 * Wie groß die Karte wirklich ist.
 *
 * Gebraucht, weil „drüber oder drunter" ohne die Höhe geraten ist: das Lagebild reicht über fast die
 * ganze Bildhöhe, unter ihm war zu wenig Platz, über ihm auch — und die Karte stand mit ihrer
 * Überschrift oberhalb des Bildschirmrands. Eine Platzierung, die die eigene Größe nicht kennt, hat
 * keine Wahl, sondern eine Vermutung.
 */
const size = ref({ width: 384, height: 216 })

watch([() => step.value?.id, box], async () => {
  await nextTick()
  const element = card.value
  if (element)
    size.value = { width: element.offsetWidth, height: element.offsetHeight }
})

const GAP = 14
const EDGE = 16

/**
 * Wo die Karte steht: dort, wo das Loch nicht ist — und wo sie ganz hinpasst.
 *
 * Vier Kandidaten in der Reihenfolge, in der sie sich am natürlichsten lesen: unter dem Ring, über
 * ihm, rechts, links. Der erste, der vollständig auf den Schirm passt, gewinnt; die Querachse wird
 * dabei an den Rand geklemmt, damit eine Karte an einem Element am Bildrand nicht halb daneben
 * steht. Passt keiner, steht sie unten rechts — das ist besser als abgeschnitten.
 */
const place = computed(() => {
  const at = box.value
  if (!at)
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }

  const { width, height } = size.value
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight
  const clamp = (value: number, span: number, limit: number): number =>
    Math.min(Math.max(EDGE, value), Math.max(EDGE, limit - span - EDGE))

  const acrossX = clamp(at.left + at.width / 2 - width / 2, width, screenWidth)
  const acrossY = clamp(at.top + at.height / 2 - height / 2, height, screenHeight)

  const candidates = [
    { left: acrossX, top: at.top + at.height + GAP },
    { left: acrossX, top: at.top - GAP - height },
    { left: at.left + at.width + GAP, top: acrossY },
    { left: at.left - GAP - width, top: acrossY },
  ]

  const fits = candidates.find(spot =>
    spot.top >= EDGE && spot.top + height <= screenHeight - EDGE
    && spot.left >= EDGE && spot.left + width <= screenWidth - EDGE)

  const spot = fits ?? { left: screenWidth - width - EDGE, top: screenHeight - height - EDGE }
  return { left: `${spot.left}px`, top: `${spot.top}px`, transform: 'none' }
})
</script>

<template>
  <div v-if="coach.running.value && step && !hidden" class="first-steps">
    <!--
      Der Ring. `pointer-events: none` ist der ganze Punkt: was hervorgehoben wird, bleibt
      benutzbar — sonst wäre ein Schritt, der auf einen Klick wartet, ein Schritt, der ihn verbietet.
    -->
    <div v-if="box" class="cut" :style="{ top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` }" />
    <div v-else class="veil" />

    <aside ref="card" class="pod card" :style="place" role="dialog" aria-live="polite" :aria-label="`Einarbeitung, Schritt ${position}`">
      <header>
        <span class="count">Einarbeitung · {{ position }}</span>
        <button type="button" class="skip" @click="coach.finish()">
          Überspringen
        </button>
      </header>
      <h2>{{ title }}</h2>
      <p>{{ step.body }}</p>
      <footer>
        <span v-if="step.gate !== 'hand'" class="waiting">
          <i />{{ step.waiting }}
        </span>
        <button v-else type="button" class="btn btn--sm" @click="coach.advance()">
          {{ coach.at.value === FIRST_STEPS.length - 1 ? 'Alles klar' : 'Weiter' }}
        </button>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.first-steps {
  position: absolute;
  inset: 0;
  /* Über dem Blatt (12), unter dem Ergebnisdialog (20) — der bekommt den Schirm für sich. */
  z-index: 14;
  pointer-events: none;
}

/*
 * Ein Element, ein Schatten, kein Filter.
 *
 * Der Schatten mit 9.999 px Streuung deckt den ganzen Schirm außerhalb des Rechtecks ab. Die
 * Alternativen — vier Flächen, eine SVG-Maske, `backdrop-filter` — kosten entweder mehr Elemente
 * oder einen Durchgang über das Bild, und darunter läuft eine Stadt.
 */
.cut {
  position: absolute;
  border-radius: var(--r-inner);
  box-shadow: 0 0 0 9999px rgba(4, 7, 10, 0.62), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  transition: top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease;
}

.veil {
  position: absolute;
  inset: 0;
  background: rgba(4, 7, 10, 0.62);
}

.card {
  position: fixed;
  width: 384px;
  padding: 20px 22px 18px;
  pointer-events: auto;
  animation: step-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes step-in {
  from { opacity: 0; transform: translateY(8px); }
}

.card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.count {
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.skip {
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--text);
  font-size: 12.5px;
  color: var(--ink-3);
  transition: color 140ms ease;
}
.skip:hover { color: var(--ink-2); }

.card h2 {
  margin: 0 0 8px;
  font-family: var(--display);
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -0.012em;
  color: var(--ink);
}

.card p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.52;
  color: var(--ink-2);
}

.card footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* Warten ist ein Zustand und keine Aktion, also sieht es auch nicht aus wie eine. */
.waiting {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  color: var(--ink-3);
}

.waiting i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ink-2);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .cut { transition: none; }
  .card { animation: none; }
  .waiting i { animation: none; opacity: 0.7; }
}

@media (max-width: 720px) {
  .card { width: min(384px, calc(100vw - 32px)); }
}
</style>
