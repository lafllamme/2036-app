<script setup lang="ts">
import type { EventOption, PartyId, PartyVote, PolicyEffect } from '~/core/contracts'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useSound } from '~/composables/useSound'
import { getParty, PARTIES } from '~/content/parties'
import { useGameStore } from '~/stores/game'
import { CATEGORY_LABELS, CONFIDENCE_LABELS, effectTone, formatNumber, targetLabel } from '~/utils/labels'

const game = useGameStore()
const { openDecision, forecasts, snapshot } = storeToRefs(game)
const sound = useSound()

watch(openDecision, (next) => {
  if (next)
    game.requestForecasts(next.definition.id)
}, { immediate: true })

const capital = computed(() => snapshot.value?.metrics.politicalCapital ?? 0)
const budget = computed(() => snapshot.value?.metrics.cityBudget ?? 0)

const COUNCIL_SEATS = 60

function forecastOf(optionId: string) {
  return forecasts.value[optionId]
}

/** Expected seat split, rounded for display but always summing to the full council. */
function seatSplit(optionId: string): { yes: number, no: number, abstain: number } {
  const forecast = forecastOf(optionId)
  if (!forecast)
    return { yes: 0, no: 0, abstain: COUNCIL_SEATS }
  const yes = Math.round(forecast.expectedYesSeats)
  const no = Math.round(forecast.expectedNoSeats)
  return { yes, no, abstain: Math.max(0, COUNCIL_SEATS - yes - no) }
}

function chance(optionId: string): number {
  return Math.round((forecastOf(optionId)?.majorityProbability ?? 0) * 100)
}

function outlook(optionId: string): { word: string, tone: 'positive' | 'pending' | 'negative' } {
  const value = chance(optionId)
  if (value >= 70)
    return { word: 'geht durch', tone: 'positive' }
  if (value >= 40)
    return { word: 'offener Ausgang', tone: 'pending' }
  return { word: 'scheitert vermutlich', tone: 'negative' }
}

function stance(optionId: string, partyId: PartyId): { label: string, tone: string } {
  const party = forecastOf(optionId)?.parties.find(entry => entry.partyId === partyId)
  if (!party)
    return { label: '–', tone: 'open' }
  if (party.probabilities.yes > 0.6)
    return { label: 'dafür', tone: 'yes' }
  if (party.probabilities.no > 0.6)
    return { label: 'dagegen', tone: 'no' }
  return { label: 'offen', tone: 'open' }
}

/** Who is blocking, and by how much — the one sentence that tells the player what to do next. */
function blockers(optionId: string): string | null {
  const forecast = forecastOf(optionId)
  if (!forecast || chance(optionId) >= 70)
    return null
  const opposed = forecast.parties
    .filter(party => party.probabilities.no > 0.4)
    .sort((a, b) => b.seats - a.seats)
  if (opposed.length === 0)
    return null

  const names = opposed
    .map(party => `${PARTIES.find(entry => entry.id === party.partyId)?.abbreviation ?? party.partyId} (${party.seats})`)
    .join(', ')
  const gap = Math.max(1, Math.round(forecast.expectedNoSeats - forecast.expectedYesSeats))
  return `${names} stehen dagegen – rund ${gap} Stimmen fehlen. Verhandeln bringt eine Fraktion meist nur zur Enthaltung, und Enthaltungen zählen nicht mit.`
}

function gains(option: EventOption): PolicyEffect[] {
  return option.effects.filter(effect => effectTone(effect.target, effect.expected) === 'gain')
}

function losses(option: EventOption): PolicyEffect[] {
  return option.effects.filter(effect => effectTone(effect.target, effect.expected) === 'loss')
}

/** Everything that can go wrong, stated plainly rather than left implicit in a range. */
function risks(option: EventOption, optionId: string): string[] {
  const entries: string[] = []

  for (const effect of losses(option)) {
    entries.push(`Verschlechtert ${targetLabel(effect.target)} um ${formatNumber(Math.abs(effect.expected))}.`)
  }
  for (const effect of option.effects.filter(candidate => candidate.confidence === 'low')) {
    entries.push(`Wirkung auf ${targetLabel(effect.target)} ist unsicher – das Modell hält ${formatNumber(effect.min)} bis ${formatNumber(effect.max)} für möglich.`)
  }
  if (option.monthlyCost > 0) {
    entries.push(option.costMonths
      ? `Bindet ${formatNumber(option.monthlyCost, 2)} Mio. € im Monat, ${option.costMonths} Monate lang. Was bis dahin entstanden ist, bleibt.`
      : `Bindet dauerhaft ${formatNumber(option.monthlyCost, 2)} Mio. € im Monat, auch in schlechten Haushaltsjahren.`)
  }
  if (option.oneOffCost > budget.value * 0.2 && option.oneOffCost > 0) {
    entries.push(`Verbraucht ${Math.round((option.oneOffCost / Math.max(1, budget.value)) * 100)} % des aktuellen Haushaltsspielraums.`)
  }
  if (chance(optionId) < 50) {
    entries.push('Eine Niederlage im Rat kostet Vertrauen und macht dieselbe Vorlage später teurer.')
  }
  if (option.effects.length === 0) {
    entries.push('Verändert keine Kapazität der Stadt – das Problem bleibt bestehen und kann erneut auftreten.')
  }
  return entries
}

const negotiable = computed(() => PARTIES.filter(party => party.id !== game.selectedPartyId))

/**
 * A standing motion is a single option carrying the motion's own name and summary. Repeating both
 * inside the option card is pure noise, so the card drops its header in that case.
 */
const singleOption = computed(() => {
  const definition = openDecision.value?.definition
  return definition?.options.length === 1 && definition.options[0]?.label === definition.title
})

/**
 * Calling a vote on a motion that costs money is the moment the city commits its budget, so it
 * gets the commerce cue rather than the neutral one. Only the sheet knows the option's price.
 */
function callVote(option: EventOption): void {
  const definitionId = openDecision.value?.definition.id
  if (!definitionId)
    return
  sound.play(option.oneOffCost > 0 || option.monthlyCost > 0 ? 'budget.committed' : 'vote.called')
  game.resolveDecision(definitionId, option.id)
}

/**
 * Who tabled this, when it was not the player.
 *
 * The one thing that changes everything else on the sheet. A motion of the player's own is a choice
 * between options, with a campaign and a negotiation to shift the odds; somebody else's motion is
 * already worded, already on the agenda, and the only thing left is which way the seats go.
 */
const tabledBy = computed(() => {
  const partyId = openDecision.value?.entry.tabledBy
  return partyId ? getParty(partyId) : null
})

/** The one option the proposer put on the agenda. */
const tabledOption = computed(() => {
  const id = openDecision.value?.entry.tabledOptionId
  return openDecision.value?.definition.options.find(option => option.id === id) ?? null
})

/**
 * Ob diese Sache überhaupt schon auf der Tagesordnung steht.
 *
 * Eine **stehende Vorlage** aus dem eigenen Programm steht dort nicht: sie liegt herum, bis man sie
 * einbringt, und genau das ist die Handlung. Zu ihr nimmt man keine Haltung ein — Einbringen *ist*
 * die Haltung.
 *
 * Ohne diese Unterscheidung zeigte das Blatt seit der Formregel auch auf dem eigenen Programm
 * „Dafür · Enthalten · Dagegen": eine Option heißt Vorlage, und eine Vorlage heißt abstimmen. Der
 * Knopf rief dann `voteOnMotion`, das nach einem Eintrag in `pending` sucht, für eine stehende
 * Vorlage keinen findet und nichts tut. Das Blatt schloss sich, und die Vorlage lag weiter da.
 */
const onTheAgenda = computed(() => Number.isFinite(openDecision.value?.entry.expiresMonth ?? Number.POSITIVE_INFINITY))

/**
 * Die Formregel: **die Zahl der Optionen bestimmt die Form.**
 *
 * Eine Vorlage — ein konkreter Vorschlag — bekommt Dafür · Enthalten · Dagegen. Eine Weggabelung
 * bekommt Karten zum Auswählen. Vorher hing das daran, *wer* gefragt hatte: eine fremde Vorlage
 * hieß Ja/Nein, eine eigene hieß Optionen wählen, eine Krise wieder Optionen. Das war nicht zu
 * lernen, weil es nichts zu lernen gab.
 */
const isVorlage = computed(() =>
  Boolean(tabledOption.value) || (onTheAgenda.value && openDecision.value?.definition.options.length === 1))

const VOTE_LABELS: Record<PartyVote, string> = { yes: 'Dafür stimmen', abstain: 'Enthalten', no: 'Dagegen stimmen' }

function vote(choice: PartyVote): void {
  const definitionId = openDecision.value?.definition.id
  if (!definitionId)
    return
  sound.play(choice === 'yes' ? 'vote.called' : 'hud.railCollapsed')
  game.voteOnMotion(definitionId, choice)
}

/**
 * Am Kalender vorbei abstimmen lassen.
 *
 * Nimmt die Vorlage zugleich von der Tagesordnung, falls sie schon drauflag — sonst stünde sie nach
 * der Abstimmung immer noch dort und käme am Monatsende ein zweites Mal dran.
 */
function urgent(option: EventOption): void {
  const definitionId = openDecision.value?.definition.id
  if (!definitionId)
    return
  sound.play('vote.called')
  game.callUrgent(definitionId, option.id, isVorlage.value ? 'yes' : undefined)
}

function startCampaign(optionId: string): void {
  const definitionId = openDecision.value?.definition.id
  if (!definitionId)
    return
  sound.play('vote.campaignSent')
  game.campaignFor(definitionId, optionId)
}

function startNegotiation(partyId: PartyId): void {
  const definitionId = openDecision.value?.definition.id
  if (!definitionId)
    return
  sound.play('vote.negotiationSent')
  game.negotiate(definitionId, partyId)
}

function negotiationHint(partyId: PartyId): string {
  const option = openDecision.value?.definition.options[0]
  if (!option)
    return ''
  const party = forecastOf(option.id)?.parties.find(entry => entry.partyId === partyId)
  return party ? `Zustimmungswert ${(party.support * 100).toFixed(0)} %` : ''
}
/*
 * Welcher Weg gerade offen liegt.
 *
 * Eine Weggabelung hat man nebeneinander zu zeigen, nicht untereinander: vorher standen alle drei
 * Optionen als volle Abschnitte in einem Blatt, und wer den dritten lesen wollte, hatte den ersten
 * nicht mehr im Bild. Jetzt stehen die Wege als Liste links, und rechts steht genau der, den man
 * gerade prüft — mit seinen Zahlen, seiner Sitzprognose und seinen Knöpfen.
 */
const optionList = computed<EventOption[]>(() => {
  const tabled = tabledOption.value
  return tabled ? [tabled] : (openDecision.value?.definition.options ?? [])
})
const chosenId = ref<string | null>(null)
const chosen = computed<EventOption | null>(() =>
  optionList.value.find(option => option.id === chosenId.value) ?? optionList.value[0] ?? null)

/** Eine neue Vorlage beginnt immer bei ihrem ersten Weg, nie bei dem, der zuletzt offen war. */
watch(() => openDecision.value?.definition.id, () => {
  chosenId.value = null
})
</script>

<template>
  <!--
    Das Blatt.

    Es ersetzt die Stadt nicht mehr. Vorher war das ein zentrierter Kasten über einem abgedunkelten
    Bild — man entschied über vierzehn Hektar, ohne sie zu sehen. Jetzt schwebt es als weiterer
    Körper über dem unteren Bild, die Stadt läuft darüber weiter, und der Ort, um den es geht,
    bleibt sichtbar.
  -->
  <article
    v-if="openDecision && chosen"
    class="pod paper"
    role="dialog"
    aria-modal="false"
    aria-labelledby="vote-title"
  >
    <div class="top">
      <div>
        <div class="kick">
          <span v-if="tabledBy">{{ CATEGORY_LABELS[openDecision.definition.category] }} · Antrag der {{ tabledBy.abbreviation }}</span>
          <span v-else>{{ CATEGORY_LABELS[openDecision.definition.category] }} · eigene Vorlage</span>
          <span v-if="onTheAgenda" class="due">
            Entscheidung in {{ Math.max(0, openDecision.entry.expiresMonth - (snapshot?.month ?? 0)) }} Monaten
          </span>
        </div>
        <h2 id="vote-title">
          {{ openDecision.definition.title }}
        </h2>
      </div>
      <button type="button" class="close-button" aria-label="Vorlage schließen" @click="game.openDecisionSheet(null)">
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>

    <p class="brief">
      {{ openDecision.definition.briefing }}
    </p>

    <div class="split">
      <section data-first-step="ways" class="ways">
        <!--
          Die Überschrift zählt, was zur Wahl steht — sie fragt nicht, ob der Weg so heißt wie die
          Vorlage. An `singleOption` gehängt stand über einer Vorlage mit genau einem Weg, der anders
          heißt als sie, wörtlich „1 Wege".
        -->
        <h3>{{ optionList.length === 1 ? 'Beschlussvorschlag' : `${optionList.length} Wege` }}</h3>
        <button
          v-for="option in optionList"
          :key="option.id"
          type="button"
          class="way"
          :class="{ 'is-on': option.id === chosen.id }"
          :aria-pressed="option.id === chosen.id"
          @click="chosenId = option.id"
        >
          <span class="tick" aria-hidden="true" />
          <span class="label">{{ singleOption ? openDecision.definition.title : option.label }}</span>
          <span class="odds" :class="outlook(option.id).tone">{{ outlook(option.id).word }}</span>
          <span class="money">
            <template v-if="option.oneOffCost !== 0">{{ formatNumber(option.oneOffCost, 1) }} Mio. € einmalig</template>
            <template v-else>keine Einmalkosten</template>
            <template v-if="option.monthlyCost !== 0">
              · {{ option.monthlyCost < 0 ? '+' : '' }}{{ formatNumber(Math.abs(option.monthlyCost), 2) }} Mio. €/Monat
            </template>
          </span>
        </button>

        <p v-if="optionList.length > 1" class="rationale">
          {{ chosen.rationale }}
        </p>

        <!-- Verhandeln ist ein Hebel auf die ganze Vorlage, nicht auf einen Weg. -->
        <section v-if="!tabledBy" class="deal">
          <h3>Verhandeln · 12 Kapital je Fraktion</h3>
          <div class="deal-row">
            <button
              v-for="party in negotiable"
              :key="party.id"
              type="button"
              class="chip"
              :class="{ 'is-done': openDecision.prepared.negotiatedPartyIds.includes(party.id) }"
              :title="negotiationHint(party.id)"
              :disabled="capital < 12 || openDecision.prepared.negotiatedPartyIds.includes(party.id)"
              @click="startNegotiation(party.id)"
            >
              <i class="party-dot" :style="{ background: party.color }" />{{ party.abbreviation }}
            </button>
          </div>
        </section>
      </section>

      <section class="detail">
        <div class="ledger">
          <div class="column">
            <h3>Was es bringt</h3>
            <ul v-if="gains(chosen).length > 0">
              <li v-for="effect in gains(chosen)" :key="effect.target">
                <span class="v good">{{ effect.expected > 0 ? '+' : '' }}{{ formatNumber(effect.expected) }}<em>{{ targetLabel(effect.target) }}</em></span>
                <small>ab Monat {{ effect.delayMonths }}, volle Wirkung nach {{ effect.delayMonths + effect.rampMonths }} · {{ CONFIDENCE_LABELS[effect.confidence] }}</small>
              </li>
            </ul>
            <p v-else class="none">
              Nichts – dieser Weg baut keine Kapazität auf.
            </p>
          </div>

          <div class="column">
            <h3>Was es kostet</h3>
            <ul>
              <li v-if="chosen.oneOffCost !== 0">
                <span class="v">{{ formatNumber(chosen.oneOffCost, 1) }}<em>Mio. € einmalig</em></span>
                <small>sofort aus dem Haushalt · {{ formatNumber(budget) }} Mio. € frei</small>
              </li>
              <li v-if="chosen.monthlyCost > 0">
                <span class="v">{{ formatNumber(chosen.monthlyCost, 2) }}<em>Mio. € im Monat</em></span>
                <small>{{ chosen.costMonths ? `befristet auf ${chosen.costMonths} Monate` : 'dauerhaft, bis die Maßnahme endet' }}</small>
              </li>
              <li v-if="chosen.monthlyCost < 0">
                <span class="v">+{{ formatNumber(-chosen.monthlyCost, 2) }}<em>Mio. € im Monat</em></span>
                <small>Mehreinnahme statt Ausgabe</small>
              </li>
              <li v-if="chosen.oneOffCost === 0 && chosen.monthlyCost === 0">
                <span class="v">Nichts</span><small>keine Haushaltswirkung</small>
              </li>
            </ul>
          </div>

          <div class="column">
            <h3>Womit du rechnen musst</h3>
            <ul v-if="risks(chosen, chosen.id).length > 0">
              <li v-for="entry in risks(chosen, chosen.id)" :key="entry">
                <small class="wide">{{ entry }}</small>
              </li>
            </ul>
            <p v-else class="none">
              Keine erkennbaren Nebenwirkungen.
            </p>
          </div>
        </div>

        <div class="forecast">
          <div class="head">
            <h3>Sitzprognose</h3>
            <span class="tally">
              <b>{{ seatSplit(chosen.id).yes }}</b> Ja
              <b>{{ seatSplit(chosen.id).abstain }}</b> Enthaltung
              <b>{{ seatSplit(chosen.id).no }}</b> Nein
              <i>Mehrheit <b>{{ chance(chosen.id) }} %</b></i>
            </span>
          </div>
          <div
            class="bar groove"
            role="img"
            :aria-label="`${seatSplit(chosen.id).yes} Ja, ${seatSplit(chosen.id).abstain} Enthaltungen, ${seatSplit(chosen.id).no} Nein von 60 Sitzen`"
          >
            <i class="yes" :style="{ width: `${(seatSplit(chosen.id).yes / 60) * 100}%` }" />
            <i class="abstain" :style="{ width: `${(seatSplit(chosen.id).abstain / 60) * 100}%` }" />
            <i class="no" :style="{ width: `${(seatSplit(chosen.id).no / 60) * 100}%` }" />
          </div>
          <p v-if="blockers(chosen.id)" class="blockers">
            {{ blockers(chosen.id) }}
          </p>
          <div class="parties">
            <span v-for="party in PARTIES" :key="party.id" class="party" :class="stance(chosen.id, party.id).tone">
              <i class="party-dot" :style="{ background: party.color }" />
              <b>{{ party.abbreviation }}</b>
              <em>{{ stance(chosen.id, party.id).label }}</em>
            </span>
          </div>
        </div>

        <!-- Genau eine gefüllte Aktion. Alles andere ist dieselbe Pille in leise. -->
        <div class="actions">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="capital < 18 || openDecision.prepared.campaignedOptionIds.includes(chosen.id) || Boolean(tabledBy)"
            @click="startCampaign(chosen.id)"
          >
            {{ openDecision.prepared.campaignedOptionIds.includes(chosen.id) ? 'Kampagne läuft' : 'Kampagne · 18 Kapital' }}
          </button>
          <span class="spacer" />
          <!--
            Dringlich: am Kalender vorbei, sofort. Steht links und leise, weil es die Ausnahme ist —
            fast so teuer wie eine Kampagne, und man ärgert sich, wenn man muss.
          -->
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="capital < 15"
            title="Übergeht die Tagesordnung und stimmt sofort ab"
            @click="urgent(chosen)"
          >
            Dringlich · 15 Kapital
          </button>
          <template v-if="isVorlage">
            <button type="button" class="btn btn--ghost btn--sm" @click="vote('no')">
              {{ VOTE_LABELS.no }}
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="vote('abstain')">
              {{ VOTE_LABELS.abstain }}
            </button>
            <button type="button" class="btn" @click="vote('yes')">
              {{ VOTE_LABELS.yes }}
            </button>
          </template>
          <button v-else data-first-step="submit" type="button" class="btn" @click="callVote(chosen)">
            Auf die Tagesordnung
          </button>
        </div>
      </section>
    </div>

    <p class="source">
      Eine Vorlage ist angenommen, wenn mehr Ja- als Nein-Stimmen abgegeben werden – Enthaltungen zählen nicht mit.
      Die Wahrscheinlichkeit ist exakt über alle 729 Fraktionskombinationen berechnet; der Würfel hängt an Spielstand,
      Monat und Vorlage, Neuladen wiederholt also dasselbe Ergebnis.
    </p>
  </article>
</template>

<style scoped>
/*
 * Das Blatt ist als einziger Körper undurchsichtig.
 *
 * Alle anderen lassen die Stadt leicht durchscheinen, was über der Stadt richtig ist — über einem
 * anderen Körper aber nicht: mit 7 % Durchlass stand die Stadtgesundheit aus dem Lagebild mitten in
 * der Sitzprognose. Ein Blatt, auf dem man abstimmt, ist Papier.
 */
.paper {
  position: absolute; bottom: 152px; left: 34px; z-index: 12;
  background: linear-gradient(180deg, #1a2126 0%, #0a0e12 100%);
  width: min(1118px, calc(100% - 68px)); max-height: calc(100% - 210px);
  padding: 28px 34px 26px; overflow-y: auto;
  border-radius: var(--r-card);
  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
  animation: paper-rise 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.paper::-webkit-scrollbar { width: 6px; }
.paper::-webkit-scrollbar-track { background: transparent; }
.paper::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }

/* Ein einziger gestalteter Moment: das Blatt steigt einmal herein, aus einem sichtbaren Zustand. */
@keyframes paper-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.kick { display: flex; align-items: center; gap: 12px; color: var(--ink-3); font-size: 12.5px; }
.kick .due {
  display: inline-flex; align-items: center; height: 26px; padding: 0 12px; border-radius: 999px;
  background: rgba(255, 143, 107, 0.12); color: #ffbca4; font-size: 12px;
  box-shadow: inset 0 0 0 1px rgba(255, 143, 107, 0.28);
}
h2 {
  margin: 12px 0 0; font-family: var(--display); font-size: 36px; font-weight: 700;
  letter-spacing: -0.035em; line-height: 1.02;
}
.brief { margin: 12px 0 0; max-width: 78ch; color: var(--ink-2); font-size: 14px; line-height: 1.55; }

.split { display: grid; grid-template-columns: 382px 1fr; gap: 40px; align-items: start; margin-top: 26px; }
h3 { margin: 0 0 12px; color: var(--ink-3); font-family: var(--text); font-size: 12.5px; font-weight: 400; }

/* --- Die Wege, als Auswahl statt als Liste ------------------------------- */

.way {
  display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 4px 13px;
  width: 100%; padding: 13px 16px; border: 0; border-radius: var(--r-inner);
  background: none; color: inherit; text-align: left; cursor: pointer;
  transition: background 140ms ease;
}
.way + .way { margin-top: 6px; }
.way:hover { background: rgba(255, 255, 255, 0.04); }
.tick { width: 18px; height: 18px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(244, 242, 236, 0.24); }
.way .label { color: var(--ink-2); font-size: 14.5px; letter-spacing: -0.005em; }
.way .odds { color: var(--ink-3); font-size: 11.5px; white-space: nowrap; }
.way .odds.positive { color: var(--positive); }
.way .odds.negative { color: var(--negative); }
.way .money {
  grid-column: 2 / -1; margin-top: 3px; color: var(--ink-3);
  font-family: var(--mono); font-size: 11.5px; font-variant-numeric: tabular-nums;
}

.way.is-on {
  background: rgba(255, 255, 255, 0.065);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}
.way.is-on .tick { position: relative; background: var(--positive); box-shadow: none; }
.way.is-on .tick::after {
  content: ""; position: absolute; top: 5.5px; left: 5px; width: 8px; height: 5px;
  border-bottom: 1.6px solid #0c1c17; border-left: 1.6px solid #0c1c17; transform: rotate(-45deg);
}
.way.is-on .label {
  color: var(--ink); font-family: var(--display); font-size: 17px; font-weight: 700; letter-spacing: -0.025em;
}
.way.is-on .money { color: var(--ink-2); }

.rationale { margin: 14px 0 0; color: var(--ink-2); font-size: 13px; line-height: 1.55; }

.deal { margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.deal-row { display: flex; flex-wrap: wrap; gap: 7px; }
.chip {
  display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px;
  border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.05); color: var(--ink);
  font-family: var(--text); font-size: 12.5px; cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.055);
  transition: background 140ms ease;
}
.chip:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
.chip:disabled { cursor: default; opacity: 0.45; }
.chip.is-done { opacity: 0.85; box-shadow: inset 0 0 0 1px rgba(134, 216, 184, 0.4); }

/* --- Der gewählte Weg, ausgeschrieben ------------------------------------ */

.ledger { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }
.column ul { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.v {
  display: block; font-family: var(--mono); font-size: 19px; font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
}
.v.good { color: var(--positive); }
.v em {
  margin-left: 7px; color: var(--ink-2); font-family: var(--text); font-size: 13.5px; font-style: normal; letter-spacing: 0;
}
.column small { display: block; margin-top: 7px; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }
.column small.wide { margin-top: 0; }
.none { margin: 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }

.forecast { margin-top: 26px; }
.forecast .head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; margin-bottom: 11px; }
.forecast .head h3 { margin: 0; }
.tally { color: var(--ink-3); font-size: 13px; }
.tally b {
  margin-right: 3px; color: var(--ink); font-family: var(--mono); font-size: 14.5px; font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.tally b + b { margin-left: 12px; }
/* Die Mehrheit ist die Schlussfolgerung aus den drei Zahlen davor, nicht die vierte davon. */
.tally i {
  margin-left: 16px; padding-left: 16px; font-style: normal;
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.12);
}
.tally i b { margin-left: 3px; }

.bar { display: flex; height: 9px; overflow: hidden; }
.bar i { display: block; height: 100%; }
.bar i.yes { background: linear-gradient(180deg, #9ce0c6, #6cc9a7); }
.bar i.abstain { background: rgba(244, 242, 236, 0.2); }
.bar i.no { background: linear-gradient(180deg, #ffb59c, #f0805f); }

.blockers { margin: 12px 0 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.55; }

.parties { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.party {
  display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 11px;
  border-radius: 999px; background: rgba(255, 255, 255, 0.05); font-size: 12.5px; white-space: nowrap;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.055);
}
.party b { font-weight: 500; }
.party em { color: var(--ink-3); font-style: normal; }
.party.yes em { color: var(--positive); }
.party.no em { color: var(--negative); }

.actions { display: flex; align-items: center; gap: 12px; margin-top: 26px; }
.actions .spacer { flex: 1; }

.source { margin: 22px 0 0; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); color: var(--ink-3); font-size: 11.5px; line-height: 1.55; }

@media (max-width: 1240px) {
  .split { grid-template-columns: 1fr; gap: 26px; }
  .ledger { grid-template-columns: 1fr 1fr; }
}
</style>
