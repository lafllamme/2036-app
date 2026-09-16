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
      class="closing-report pod"
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
          <button type="button" class="btn btn--ghost" @click="dismissed = true">
            Stadt ansehen
          </button>
          <button type="button" class="btn" @click="game.startNewCampaign()">
            Neue Kampagne
          </button>
        </div>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/*
 * Zehn Jahre auf einem Schirm. Breiter und höher als alles andere, mit Absicht: jeder andere Körper
 * im Spiel stellt eine Frage und geht aus dem Weg, und dies ist das Einzige, was gelesen werden soll.
 */
.modal-backdrop.closing { padding: 24px; }

/*
 * Der Körper rollt nicht; seine Mitte rollt. Zwei Entscheidungen am Ende eines Jahrzehnts müssen
 * erreichbar sein, ohne erst bis unten zu lesen — und ein Verlauf über den letzten Zentimeter eines
 * rollenden Bereichs kann Fußzeile nicht von Inhalt unterscheiden.
 */
.closing-report {
  position: relative; display: flex; flex-direction: column;
  width: min(780px, 100%); max-height: calc(100vh - 48px);
  padding: 30px 34px 24px; border-radius: var(--r-card);
  /* Ein einziger gestalteter Moment: er steigt einmal herein, aus einem sichtbaren Zustand. */
  animation: closing-rise 620ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.closing-report:focus { outline: none; }
.closing-report:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
@keyframes closing-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.closing-report > .close-button { position: absolute; top: 20px; right: 22px; }

/*
 * Auf einem kurzen Fenster ist der Bericht höher als das Bild. Die Maske verläuft den letzten
 * Zentimeter, damit die Kante „da ist mehr" sagt statt „hier ist Schluss" — ein Rollbalken sagt das
 * einer Maus und sonst niemandem.
 */
.closing-report__body {
  flex: 1; min-height: 0; overflow-y: auto;
  mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent 100%);
  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
}
.closing-report__body::-webkit-scrollbar { width: 6px; }
.closing-report__body::-webkit-scrollbar-track { background: transparent; }
.closing-report__body::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }

.closing-report header { flex: none; padding-bottom: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.closing-report header small { display: block; color: var(--ink-3); font-size: 12.5px; }
.closing-report h2 {
  margin: 12px 0 0; font-family: var(--display); font-size: clamp(30px, 5vw, 46px); font-weight: 700;
  letter-spacing: -0.035em; line-height: 1.02;
}
/* Drei Enden, und keines davon ist eine Punktzahl. Der Ton sagt, was passiert ist, nicht wie gut. */
.closing-report h2.voted-out, .closing-report h2.broken { color: var(--negative); }
.because { margin: 12px 0 0; max-width: 62ch; color: var(--ink-2); font-size: 14px; line-height: 1.55; }

.closing-report section { padding: 20px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.closing-report h3 { margin: 0 0 14px; color: var(--ink-3); font-family: var(--text); font-size: 12.5px; font-weight: 400; }
.closing-report ul { margin: 0; padding: 0; list-style: none; }

.closing-ledger li {
  display: grid; grid-template-columns: minmax(0, 1fr) auto 132px; gap: 14px; align-items: baseline; padding: 8px 0;
}
.closing-ledger li + li { border-top: 1px solid rgba(255, 255, 255, 0.06); }
.closing-ledger__label { font-size: 13.5px; }
.closing-ledger__values {
  color: var(--ink-3); font-family: var(--mono); font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.closing-ledger__values b { color: var(--ink); font-weight: 400; }
.closing-ledger__values i { padding: 0 6px; font-style: normal; }
.closing-ledger__values small { font-size: 10px; }
.closing-ledger__verdict {
  font-family: var(--mono); font-size: 11.5px; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap;
}
/* Nie Farbe allein: jedes Urteil trägt das Wort für das, was es ist. */
.closing-ledger__verdict small { display: block; font-family: var(--text); font-size: 11px; }
.closing-ledger__verdict.good { color: var(--positive); }
.closing-ledger__verdict.bad { color: var(--negative); }
.closing-ledger__verdict.flat { color: var(--ink-3); }

.deeds li {
  display: grid; grid-template-columns: 1fr auto 78px; gap: 14px; align-items: baseline;
  padding: 7px 0; font-size: 13px;
}
.deeds li + li { border-top: 1px solid rgba(255, 255, 255, 0.06); }
.deeds span { color: var(--ink-3); font-size: 12px; }
.deeds i {
  font-family: var(--mono); font-size: 12px; font-style: normal; font-variant-numeric: tabular-nums; text-align: right;
}
.deeds i.good { color: var(--positive); }
.deeds i.bad { color: var(--negative); }

.closing-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.closing-columns section { border-bottom: 1px solid rgba(255, 255, 255, 0.08); }

.standing li {
  display: grid; grid-template-columns: 8px 44px 1fr 16px 1fr auto; gap: 8px; align-items: center;
  padding: 6px 0; font-family: var(--mono); font-size: 11.5px; font-variant-numeric: tabular-nums;
}
/* Nie Farbe allein: die eigene Zeile ist hell *und* markiert, in der Sprache des Körpers selbst. */
.standing li.own { padding-left: 9px; color: var(--ink); box-shadow: inset 2px 0 0 rgba(255, 255, 255, 0.22); }
.standing li:not(.own) { color: var(--ink-3); }
.standing i { width: 8px; height: 8px; border-radius: 50%; }
.standing i.arrow { width: auto; height: auto; border-radius: 0; font-style: normal; }
.standing b { color: var(--ink); font-weight: 400; }
.standing em { color: var(--ink-3); font-size: 10px; font-style: normal; text-align: right; }

.promises li {
  display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: baseline; padding: 7px 0; font-size: 13px;
}
.promises li + li { border-top: 1px solid rgba(255, 255, 255, 0.06); }
.promises span { grid-column: 1; color: var(--ink-3); font-size: 11.5px; }
.promises i {
  grid-row: 1 / span 2; grid-column: 2;
  font-family: var(--mono); font-size: 12px; font-style: normal; font-variant-numeric: tabular-nums; text-align: right;
}
.promises li.good i, .promises li.good span { color: var(--positive); }
.promises li.bad i, .promises li.bad span { color: var(--negative); }

.roads p { margin: 0; font-size: 13.5px; line-height: 1.55; }
.roads b { font-family: var(--mono); font-size: 16px; font-variant-numeric: tabular-nums; }
.roads__note { margin-top: 11px !important; color: var(--ink-2); font-size: 13px; }
.roads__list { margin-top: 9px !important; }
/*
 * Eine Haarlinie und Abstand statt eines Aufzählungszeichens: die Struktur sagt schon „Liste", und
 * ein ✗ im Text wäre ein Icon aus Zeichen — das macht dieses System nirgends sonst.
 */
.roads__list li { padding: 7px 0 7px 14px; border-left: 1px solid rgba(255, 255, 255, 0.08); color: var(--ink-3); font-size: 12.5px; }

.closing-report footer { flex: none; padding-top: 18px; }
.disclaimer { margin: 0 0 16px; color: var(--ink-3); font-size: 11.5px; line-height: 1.5; }
.closing-actions { display: flex; gap: 10px; justify-content: flex-end; }

@media (max-width: 720px) {
  .closing-columns { grid-template-columns: 1fr; gap: 0; }
  .closing-ledger li { grid-template-columns: 1fr auto; }
  .closing-ledger__verdict { grid-column: 2; }
}
</style>
