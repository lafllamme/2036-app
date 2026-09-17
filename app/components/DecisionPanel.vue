<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { policiesFor } from '~/content/policies'
import { useGameStore } from '~/stores/game'
import { CATEGORY_LABELS, effectTone, formatNumber, targetLabel } from '~/utils/labels'

const game = useGameStore()
const { snapshot, pendingDecisions, decisionsOpen } = storeToRefs(game)

const openMotions = computed(() =>
  pendingDecisions.value
    .map(entry => ({ entry, definition: game.decisionDefinition(entry.eventId) }))
    .filter((item): item is { entry: typeof item.entry, definition: NonNullable<typeof item.definition> } => Boolean(item.definition)))

const agenda = computed(() => snapshot.value?.agenda ?? [])

/*
 * Nur, was die eigene Fraktion auch einbringen würde — und was nicht schon oben steht.
 *
 * Ohne den zweiten Teil stand eine gerade eingebrachte Vorlage zweimal da: einmal auf der
 * Tagesordnung und einmal gesperrt in der Liste darunter, weil sie neben sich selbst keine
 * Verwaltung mehr findet. Das sieht aus wie ein Fehler und ist einer.
 */
const standingMotions = computed(() =>
  policiesFor(game.selectedPartyId).filter(policy =>
    !snapshot.value?.activePolicyIds.includes(policy.id)
    && !agenda.value.some(item => item.sourceId === policy.id)))

/**
 * Was die Verwaltung trägt — und was davon frei ist.
 *
 * Die Zahl, die aus der Vorlagenliste eine Wahl macht: das Wohnungsbauprogramm bindet
 * zweiundzwanzig von sechsundzwanzig Punkten, und zwei Jahre lang geht daneben fast nichts mehr.
 */
const admin = computed(() => snapshot.value?.administration ?? { used: 0, booked: 0, capacity: 26 })
const adminFree = computed(() => admin.value.capacity - admin.value.used - admin.value.booked)

/** Ob dieses Vorhaben überhaupt noch hineinpasst. Sonst ist der Knopf eine Falle. */
function fits(load: number): boolean {
  return load <= adminFree.value
}

/** Wie die eigene Haltung zu einem Punkt heißt, wenn sie neben ihm steht. */
const STANCE = { yes: 'dafür', no: 'dagegen', abstain: 'Enthaltung' } as const

const measures = computed(() => snapshot.value?.activeMeasures.filter(measure => measure.monthlyCost !== 0) ?? [])
const monthlyCost = computed(() => measures.value.reduce((sum, measure) => sum + measure.monthlyCost, 0))

const deadline = (expiresMonth: number): number => Math.max(0, expiresMonth - (snapshot.value?.month ?? 0))

/**
 * Open itself when the council actually has something to decide, and otherwise stay out of the way.
 *
 * The panel covered a third of the city for the whole campaign, most of the time to say that no
 * motion had been raised. A month with a real motion in it should look different from a quiet one
 * before the player has read a word — so a new motion opens the panel, and the player folding it
 * again is respected until the next one arrives.
 */
watch(() => openMotions.value.length, (now, before) => {
  if (now > (before ?? 0))
    game.decisionsOpen = true
}, { immediate: true })
</script>

<template>
  <!--
    Die Tagesordnung, gerufen statt ausgehalten.

    Vorher war das eine bildschirmhohe Platte mit drei bis vier gleich schweren Karten darin — also
    genau das Muster, das jede Oberfläche baut, die nicht entworfen wurde. Jetzt ist es eine Liste
    in einem Körper: die Vorlage, über die der Rat entscheiden muss, groß und mit der einen
    gefüllten Aktion; alles, was du selbst einbringen könntest, als Zeile darunter.
  -->
  <aside v-if="decisionsOpen" class="pod agenda" aria-label="Ratsvorlagen und Entscheidungen">
    <header>
      <h2>Entscheidungen</h2>
      <span v-if="openMotions.length > 0" data-first-step="seats" class="count is-open">{{ openMotions.length }} offen</span>
      <span v-else data-first-step="seats" class="count">{{ snapshot?.coalitionSupport ?? 0 }} von 60 Sitzen</span>
      <button type="button" class="close-button" aria-label="Entscheidungen schließen" @click="game.decisionsOpen = false">
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </header>

    <div class="body">
      <p v-if="openMotions.length === 0 && standingMotions.length === 0" class="empty">
        Zurzeit liegt keine Vorlage vor. Lass die Zeit laufen – Ereignisse erreichen den Rat von selbst.
      </p>

      <article v-for="item in openMotions" :key="item.entry.eventId" class="motion">
        <div class="meta">
          <span>{{ CATEGORY_LABELS[item.definition.category] }}</span>
          <span class="due" :class="{ 'is-urgent': deadline(item.entry.expiresMonth) <= 1 }">
            {{ deadline(item.entry.expiresMonth) === 0 ? 'läuft ab' : `noch ${deadline(item.entry.expiresMonth)} Monate` }}
          </span>
        </div>
        <h3>{{ item.definition.title }}</h3>
        <p>{{ item.definition.briefing }}</p>
        <button type="button" class="btn btn--sm" @click="game.openDecisionSheet(item.entry.eventId)">
          <!-- Die Formregel bis in die Beschriftung: zu einer Vorlage nimmt man Stellung,
               eine Weggabelung prüft man. „1 Optionen prüfen“ war beides nicht. -->
          {{ item.entry.tabledOptionId || item.definition.options.length === 1
            ? 'Stellung nehmen'
            : `${item.definition.options.length} Wege prüfen` }}
        </button>
      </article>

      <!--
        Die Tagesordnung der nächsten Sitzung.
        Steht ganz oben, weil sie das ist, was als Nächstes passiert — und weil man in dem Monat
        dazwischen noch etwas tun kann: verhandeln, Kampagne machen, oder es wieder herunternehmen.
      -->
      <section v-if="agenda.length > 0" class="group agenda-list">
        <h4>Tagesordnung · {{ agenda.length }} von {{ snapshot?.agendaSeats ?? 3 }}</h4>
        <div v-for="item in agenda" :key="item.sourceId" class="tabled">
          <span class="name">{{ item.title }}</span>
          <span class="stance">{{ STANCE[item.vote] }}</span>
          <button type="button" class="drop" title="Von der Tagesordnung nehmen" @click="game.withdrawMotion(item.sourceId)">
            entfernen
          </button>
        </div>
        <p class="hint">
          Abgestimmt wird am Monatsende. Bis dahin zählt, wen du überzeugst.
        </p>
      </section>

      <section v-if="standingMotions.length > 0" data-first-step="motions" class="group">
        <h4>Was du einbringen kannst</h4>
        <!--
          Die Verwaltung als Riegel. Ohne diese Zeile sieht ein gesperrter Knopf nach einem Fehler
          aus; mit ihr ist er eine Auskunft über die Stadt.
        -->
        <p class="capacity" :class="{ 'is-tight': adminFree <= 6 }">
          Verwaltung: {{ admin.used + admin.booked }} von {{ admin.capacity }} gebunden
        </p>
        <button
          v-for="policy in standingMotions"
          :key="policy.id"
          type="button"
          class="own"
          :class="{ 'is-blocked': !fits(policy.administrativeLoad) }"
          :disabled="!fits(policy.administrativeLoad)"
          :title="fits(policy.administrativeLoad) ? undefined : `Bindet ${policy.administrativeLoad} Punkte Verwaltung — frei sind ${adminFree}`"
          @click="game.openDecisionSheet(policy.id)"
        >
          <span class="name">{{ policy.name }}</span>
          <!-- Eine Vorlage, die der Stadt Geld bringt, darf nicht wie eine Ausgabe aussehen. -->
          <span class="cost">{{ formatNumber(policy.implementationCost) }} Mio. €
            · {{ policy.monthlyCost < 0 ? '+' : '' }}{{ formatNumber(Math.abs(policy.monthlyCost), 1) }}/Monat</span>
          <!--
            Woran man sie auseinanderhält.

            Die Zeile trug einen Namen, einen Preis und eine Kategorie — also dreimal, *was* das ist,
            und keinmal, *was es tut*. Zwischen vier Vorlagen wählt aber niemand nach dem Preis,
            sondern danach, worauf sie wirken; ohne das musste man jede einzeln aufmachen, um
            überhaupt eine Wahl treffen zu können. Der Ton kommt aus `effectTone`, das auch weiß,
            welche Kennzahlen das Modell bewusst nicht wertet — die bleiben grau.
          -->
          <span class="does">
            <b v-for="effect in policy.effects" :key="effect.target" :class="effectTone(effect.target, effect.expected)">
              {{ effect.expected > 0 ? '+' : '−' }} {{ targetLabel(effect.target) }}
            </b>
          </span>
        </button>
      </section>

      <section v-if="measures.length > 0" class="group">
        <h4>Läuft · {{ monthlyCost > 0 ? '−' : '+' }}{{ formatNumber(Math.abs(monthlyCost), 1) }} Mio. € im Monat</h4>
        <div v-for="measure in measures" :key="measure.id" class="running">
          <span>{{ measure.label }}<small v-if="measure.costUntilMonth !== null"> · noch {{ measure.costUntilMonth - (snapshot?.month ?? 0) }} Monate</small></span>
          <b :class="{ 'is-cost': measure.monthlyCost > 0 }">{{ measure.monthlyCost > 0 ? '−' : '+' }}{{ formatNumber(Math.abs(measure.monthlyCost), 2) }}</b>
        </div>
      </section>

      <p class="source">
        Vertical Slice: Werte sind gekennzeichnete Modellannahmen, keine reale Prognose.
      </p>
    </div>
  </aside>
</template>

<style scoped>
/*
 * Die Tagesordnung sieht anders aus als die Liste darunter: was darauf steht, ist entschieden
 * eingebracht und wartet nur noch auf den Termin. Eine Zeile, eine Haltung, ein Ausweg.
 */
.agenda-list .tabled {
  display: flex; align-items: baseline; gap: 10px;
  padding: 7px 0; border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.agenda-list .tabled:first-of-type { border-top: 0; }
.agenda-list .name { flex: 1; font-size: 13.5px; color: var(--ink); }
.agenda-list .stance { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.agenda-list .drop {
  border: 0; background: none; padding: 0; cursor: pointer;
  font-family: var(--text); font-size: 11.5px; color: var(--ink-3);
}
.agenda-list .drop:hover { color: var(--negative); }
/* Was die Verwaltung trägt, steht über der Liste — es ist die Bedingung für alles darunter. */
.capacity { margin: 0 0 8px; font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.capacity.is-tight { color: var(--negative); }
.own.is-blocked { opacity: 0.4; cursor: default; }

.agenda-list .hint { margin: 9px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

.agenda {
  /*
   * Höher als das Deck, aber nie bis an die Oberkante. Ein Körper hat Luft über sich; eine Wand
   * nicht — und bis 620 px hoch las die Schublade als Wand neben der Stadt.
   */
  position: absolute; right: 34px; bottom: 152px; z-index: 5;
  display: flex; flex-direction: column;
  width: 392px; max-height: min(524px, calc(100% - 320px));
  padding: 24px 0 18px;
}

header { display: flex; align-items: center; gap: 12px; padding: 0 24px 16px; }
h2 { margin: 0; font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -0.03em; }
.count { margin-left: auto; color: var(--ink-3); font-size: 12.5px; white-space: nowrap; }
.count.is-open { color: var(--negative); }
header .close-button { width: 32px; height: 32px; }
header .close-button svg { width: 14px; height: 14px; }

.body {
  flex: 1; min-height: 0; padding: 0 24px; overflow-y: auto;
  mask-image: linear-gradient(to bottom, #000 calc(100% - 20px), transparent 100%);
  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
}
.body::-webkit-scrollbar { width: 5px; }
.body::-webkit-scrollbar-track { background: transparent; }
.body::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }

.empty { margin: 0; color: var(--ink-3); font-size: 13px; line-height: 1.55; }

/* Die Vorlage, über die entschieden werden muss: das Einzige hier mit einer gefüllten Aktion. */
.motion { padding-bottom: 18px; }
.motion + .motion { padding-top: 18px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.meta { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; color: var(--ink-3); font-size: 11.5px; }
.meta .due.is-urgent { color: var(--negative); }
.motion h3 {
  margin: 9px 0 0; font-family: var(--display); font-size: 21px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1.08;
}
.motion p { margin: 8px 0 14px; color: var(--ink-2); font-size: 12.5px; line-height: 1.55; }

.group { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
h4 { margin: 0 0 8px; color: var(--ink-3); font-family: var(--text); font-size: 12.5px; font-weight: 400; }

/* Eigene Vorlagen sind eine Liste von Zeilen, kein Stapel gleich schwerer Karten. */
.own {
  display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; align-items: baseline;
  width: 100%; padding: 11px 14px; margin: 0 -14px; border: 0; border-radius: var(--r-inner);
  background: none; color: inherit; text-align: left; cursor: pointer;
  transition: background 140ms ease;
}
.own:hover { background: rgba(255, 255, 255, 0.06); }
.own .name { font-size: 14px; font-weight: 500; letter-spacing: -0.005em; }
.own .cost {
  color: var(--ink-3); font-family: var(--mono); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap;
}
/*
 * Was sie tut, als Zeile darunter — zusammenhängend, damit vier Vorlagen untereinander lesbar
 * bleiben. Kein Kasten je Wirkung: das wären zwölf Kästchen in einer Liste, in der man gerade
 * überfliegen will.
 */
.own .does {
  display: flex; flex-wrap: wrap; grid-column: 1 / -1; gap: 3px 12px;
  color: var(--ink-3); font-size: 11.5px;
}
.own .does b { font-weight: 400; }
.own .does .gain { color: var(--positive); }
.own .does .loss { color: var(--negative); }

.running {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 6px 0; color: var(--ink-2); font-size: 12.5px;
}
.running small { color: var(--ink-3); }
.running b {
  font-family: var(--mono); font-size: 11.5px; font-weight: 400; font-variant-numeric: tabular-nums;
}
/* Kosten stehen nie in der Ablehnungsfarbe: „teuer" und „wird scheitern" sind verschiedene Tatsachen. */
.running b.is-cost { color: var(--ink); }

.source { margin: 18px 0 0; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); color: var(--ink-3); font-size: 11px; line-height: 1.5; }

/*
 * Keine eigene Regel für niedrige Fenster mehr.
 *
 * Es gab eine, die dort `calc(100% - 210px)` erlaubte — also **mehr** Höhe, je enger es wird, und
 * auf einem 900 px hohen Fenster lief die Schublade damit bis 58 px unter den Bildrand. Die
 * Obergrenze oben macht das überflüssig: 524 px, solange sie passen, sonst was nach dem Deck übrig
 * bleibt. Eine Regel, beide Richtungen.
 */
</style>
