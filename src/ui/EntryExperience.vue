<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  CAMPAIGN_PRIORITIES,
  PARTIES,
  getParty,
  getPartyEvidence,
} from '../content/parties'
import { getPolicy } from '../content/policies'
import type { PartyDefinition, PartyPolicyPosition } from '../core/contracts'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const {
  experienceStage,
  ready,
  rendererStats,
  selectedPartyId,
  selectedPriorityIds,
} = storeToRefs(game)

const cityReady = computed(() => ready.value && Boolean(rendererStats.value))
const selectedParty = computed<PartyDefinition | null>(() => (
  selectedPartyId.value ? getParty(selectedPartyId.value) : null
))
const selectedEvidence = computed(() => (
  selectedParty.value ? getPartyEvidence(selectedParty.value.sourceIds) : []
))
const selectedPriorities = computed(() => CAMPAIGN_PRIORITIES.filter(({ id }) => selectedPriorityIds.value.includes(id)))

const stanceLabel: Record<PartyPolicyPosition['stance'], string> = {
  support: 'Unterstützt',
  conditional: 'Bedingt',
  oppose: 'Lehnt ab',
}

const policyName = (policyId: string): string => getPolicy(policyId)?.name ?? policyId

function moveBannerFocus(event: KeyboardEvent, index: number): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const row = (event.currentTarget as HTMLElement).closest('.party-banner-row')
  const buttons = Array.from(row?.querySelectorAll<HTMLButtonElement>('.party-banner') ?? [])
  if (buttons.length === 0) return
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
  buttons[nextIndex]?.focus()
}
</script>

<template>
  <div class="entry-experience" :class="{ 'is-ready': cityReady }">
    <Transition name="entry-fade" mode="out-in">
      <section v-if="experienceStage === 'title'" key="title" class="entry-screen title-screen" aria-labelledby="game-title">
        <div class="title-lockup">
          <h1 id="game-title" class="entry-logo">20<span>36</span></h1>
          <p class="entry-city">Lindenhafen</p>
          <p class="entry-claim">Eine Stadt. Viele Zukünfte.</p>
        </div>

        <div class="title-actions">
          <button class="entry-primary" type="button" :disabled="!cityReady" @click="game.startNewCampaign">
            {{ cityReady ? 'Neue Kampagne' : 'Lindenhafen wird aufgebaut' }}
          </button>
          <div class="title-secondary" aria-label="Weitere Optionen">
            <button type="button" disabled>Fortsetzen</button>
            <button type="button" disabled>Einstellungen</button>
          </div>
        </div>

        <div class="entry-loading" :class="{ complete: cityReady }" aria-live="polite">
          <span>{{ cityReady ? 'Stadtmodell bereit' : 'Stadtmodell wird synchronisiert' }}</span>
          <i><b></b></i>
          <span>{{ cityReady ? '100 %' : 'Lädt …' }}</span>
        </div>
      </section>

      <section v-else-if="experienceStage === 'partyHall'" key="party-hall" class="entry-screen party-hall" aria-labelledby="party-hall-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showTitle">← Titel</button>
          <div>
            <small>01 · Politische Kraft</small>
            <h1 id="party-hall-title">Welche Richtung für Lindenhafen?</h1>
          </div>
          <span class="entry-step">1 / 3</span>
        </header>

        <div class="party-banner-row" aria-label="Spielbare fiktive Parteien">
          <button
            v-for="(party, index) in PARTIES"
            :key="party.id"
            class="party-banner"
            type="button"
            :style="{ '--party-color': party.color, '--party-text': party.textColor }"
            :aria-label="`${party.abbreviation}: ${party.name} auswählen`"
            @click="game.selectParty(party.id)"
            @keydown="moveBannerFocus($event, index)"
          >
            <span class="banner-emblem" aria-hidden="true">{{ party.emblem }}</span>
            <strong>{{ party.abbreviation }}</strong>
            <span class="banner-name">{{ party.name }}</span>
            <span class="banner-action">Profil öffnen</span>
          </button>
        </div>

        <p class="fiction-note">
          Fiktive Parteien und Ratswerte. Kürzel und Farbfamilien greifen die deutsche Parteienlandschaft auf; Namen und Symbole sind eigenständig.
        </p>
      </section>

      <section v-else-if="experienceStage === 'partyProfile' && selectedParty" key="party-profile" class="entry-screen profile-screen" aria-labelledby="party-profile-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showPartyHall">← Parteien</button>
          <div><small>02 · Politisches Profil</small><h1 id="party-profile-title">{{ selectedParty.abbreviation }} prüfen</h1></div>
          <span class="entry-step">2 / 3</span>
        </header>

        <div class="profile-layout">
          <div class="profile-banner" :style="{ '--party-color': selectedParty.color, '--party-text': selectedParty.textColor }">
            <span class="profile-emblem" aria-hidden="true">{{ selectedParty.emblem }}</span>
            <strong>{{ selectedParty.abbreviation }}</strong>
            <span>{{ selectedParty.name }}</span>
          </div>

          <article class="profile-sheet">
            <div class="profile-intro">
              <div><small>Fiktive Partei · Quellenstand {{ selectedParty.asOf }}</small><h2>{{ selectedParty.name }}</h2></div>
              <p>{{ selectedParty.summary }}</p>
            </div>

            <dl class="party-stats" aria-label="Fiktive Ausgangswerte">
              <div><dt>Ratsmandate</dt><dd>{{ selectedParty.stats.councilSeats }} / 60</dd></div>
              <div><dt>Zustimmung</dt><dd>{{ selectedParty.stats.publicSupport }} %</dd></div>
              <div><dt>Organisation</dt><dd>{{ selectedParty.stats.organization }}</dd></div>
              <div><dt>Verhandlung</dt><dd>{{ selectedParty.stats.negotiation }}</dd></div>
            </dl>

            <div class="profile-columns">
              <section><small>Spielerische Stärken</small><ul><li v-for="item in selectedParty.strengths" :key="item">{{ item }}</li></ul></section>
              <section><small>Politische Zielkonflikte</small><ul><li v-for="item in selectedParty.tradeoffs" :key="item">{{ item }}</li></ul></section>
            </div>

            <section class="position-list" aria-label="Positionen zu den vorhandenen Ratsvorlagen">
              <header><small>Aktuelle Ratsvorlagen</small><span>Programmbasierte Einordnung</span></header>
              <details v-for="position in selectedParty.policyPositions" :key="position.policyId">
                <summary><span>{{ policyName(position.policyId) }}</span><b :class="`stance-${position.stance}`">{{ stanceLabel[position.stance] }}</b></summary>
                <p>{{ position.rationale }}</p>
              </details>
            </section>

            <div class="profile-sources">
              <small>Quellen und Einordnung</small>
              <a v-for="source in selectedEvidence" :key="source.id" :href="source.url" target="_blank" rel="noreferrer">{{ source.publisher }} ↗</a>
              <p>Parteipositionen und Spielwirkungen sind getrennt. Die Ausgangswerte sind Modellannahmen für Lindenhafen, keine reale Prognose.</p>
            </div>

            <button class="entry-primary profile-confirm" type="button" @click="game.confirmParty">Diese Partei wählen</button>
          </article>
        </div>
      </section>

      <section v-else-if="experienceStage === 'manifesto' && selectedParty" key="manifesto" class="entry-screen manifesto-screen" aria-labelledby="manifesto-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showPartyProfile">← Profil</button>
          <div><small>03 · Mandat 2026</small><h1 id="manifesto-title">Drei Prioritäten festlegen</h1></div>
          <span class="entry-step">{{ selectedPriorityIds.length }} / 3</span>
        </header>

        <div class="manifesto-layout">
          <div class="manifesto-party" :style="{ '--party-color': selectedParty.color }">
            <span>{{ selectedParty.abbreviation }}</span>
            <strong>{{ selectedParty.name }}</strong>
            <p>Die drei gewählten Ziele bestimmen später 40 % der Kampagnenwertung.</p>
          </div>
          <div class="priority-grid" aria-label="Kampagnenprioritäten">
            <button
              v-for="priority in CAMPAIGN_PRIORITIES"
              :key="priority.id"
              type="button"
              :class="{ selected: selectedPriorityIds.includes(priority.id) }"
              :aria-pressed="selectedPriorityIds.includes(priority.id)"
              @click="game.togglePriority(priority.id)"
            >
              <span>{{ selectedPriorityIds.includes(priority.id) ? 'Ausgewählt' : 'Priorität' }}</span>
              <strong>{{ priority.name }}</strong>
              <small>{{ priority.description }}</small>
            </button>
          </div>
        </div>

        <button class="entry-primary manifesto-confirm" type="button" :disabled="selectedPriorityIds.length !== 3" @click="game.reviewCampaign">
          {{ selectedPriorityIds.length === 3 ? 'Mandat bestätigen' : `Noch ${3 - selectedPriorityIds.length} auswählen` }}
        </button>
      </section>

      <section v-else-if="experienceStage === 'intro' && selectedParty" key="intro" class="entry-screen intro-screen" aria-labelledby="intro-title">
        <div class="intro-card" :style="{ '--party-color': selectedParty.color }">
          <small>Januar 2026 · Lindenhafen</small>
          <h1 id="intro-title">Das Jahrzehnt beginnt.</h1>
          <p>Du führst die {{ selectedParty.abbreviation }} in einen Stadtrat ohne sichere Mehrheit. Jede Entscheidung verändert Haushalt, Koalition und sichtbare Stadtentwicklung.</p>
          <div class="intro-priorities"><span v-for="priority in selectedPriorities" :key="priority.id">{{ priority.name }}</span></div>
          <button class="entry-primary" type="button" @click="game.enterCity">Lindenhafen übernehmen</button>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.entry-experience {
  position: absolute;
  inset: 0;
  z-index: 30;
  overflow: auto;
  color: var(--ink);
  background: rgba(7, 14, 19, 0.96);
  transition: background-color 800ms ease;
}

.entry-experience.is-ready {
  background: rgba(7, 14, 19, 0.42);
}

.entry-experience::before,
.entry-experience::after {
  position: fixed;
  inset: 0;
  content: "";
  pointer-events: none;
}

.entry-experience::before {
  z-index: -1;
  background: linear-gradient(180deg, rgba(4, 9, 13, 0.28), rgba(4, 9, 13, 0.06) 46%, rgba(4, 9, 13, 0.82));
}

.entry-experience::after {
  z-index: 20;
  box-shadow: inset 0 0 220px 42px rgba(2, 6, 9, 0.55);
}

.entry-screen {
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 100%;
  padding: clamp(26px, 3vw, 48px);
}

.title-screen {
  display: grid;
  grid-template-rows: 1fr auto auto;
  place-items: center;
  min-height: 100dvh;
  text-align: center;
}

.title-lockup {
  align-self: end;
  margin-bottom: 5vh;
  text-shadow: 0 12px 44px rgba(0, 0, 0, 0.58);
}

.entry-logo {
  margin: 0;
  font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
  font-size: clamp(94px, 14vw, 210px);
  line-height: 0.8;
  letter-spacing: -0.075em;
}

.entry-logo span {
  color: var(--red);
}

.entry-city {
  margin: 28px 0 0;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: clamp(16px, 2vw, 27px);
  font-weight: 750;
  letter-spacing: 0.38em;
  text-transform: uppercase;
}

.entry-claim {
  margin: 18px 0 0;
  color: rgba(244, 240, 230, 0.74);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.title-actions {
  display: grid;
  justify-items: center;
  gap: 16px;
}

.entry-primary {
  min-width: 230px;
  min-height: 48px;
  padding: 0 24px;
  border: 1px solid rgba(239, 78, 61, 0.72);
  border-radius: 16px;
  color: var(--ink);
  background: rgba(9, 17, 23, 0.76);
  box-shadow: 0 15px 42px rgba(0, 0, 0, 0.28);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  cursor: pointer;
  backdrop-filter: blur(14px);
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;
}

.entry-primary:hover:not(:disabled) {
  border-color: var(--red);
  background: rgba(239, 78, 61, 0.88);
  transform: translateY(-2px);
}

.entry-primary:disabled {
  border-color: rgba(244, 240, 230, 0.16);
  color: rgba(244, 240, 230, 0.5);
  cursor: wait;
}

.title-secondary {
  display: flex;
  gap: 22px;
}

.title-secondary button,
.entry-back {
  border: 0;
  color: rgba(244, 240, 230, 0.58);
  background: transparent;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.entry-loading {
  align-self: end;
  width: min(520px, 80vw);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  color: rgba(244, 240, 230, 0.64);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 8px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.entry-loading i {
  overflow: hidden;
  height: 2px;
  background: rgba(244, 240, 230, 0.18);
}

.entry-loading b {
  display: block;
  width: 44%;
  height: 100%;
  background: var(--red);
  animation: entry-load 1.2s ease-in-out infinite alternate;
}

.entry-loading.complete b {
  width: 100%;
  animation: none;
}

.entry-header {
  position: relative;
  z-index: 4;
  display: grid;
  grid-template-columns: 1fr minmax(0, 2fr) 1fr;
  align-items: start;
  text-align: center;
}

.entry-header h1 {
  margin: 8px 0 0;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: clamp(28px, 3vw, 48px);
  letter-spacing: -0.025em;
}

.entry-header small,
.entry-step,
.profile-sheet small,
.manifesto-party span,
.intro-card > small {
  color: rgba(244, 240, 230, 0.62);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.entry-back {
  justify-self: start;
  min-height: 40px;
  cursor: pointer;
}

.entry-step {
  justify-self: end;
  padding-top: 13px;
}

.party-hall {
  display: grid;
  grid-template-rows: auto minmax(520px, 1fr) auto;
  min-height: 100dvh;
}

.party-banner-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: clamp(10px, 1.5vw, 24px);
  width: min(1220px, 94vw);
  margin: clamp(42px, 6vh, 76px) auto 16px;
}

.party-banner {
  position: relative;
  width: min(170px, 14vw);
  min-width: 112px;
  height: clamp(390px, 54vh, 590px);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 58px 14px 68px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--party-color) 70%, white 30%);
  clip-path: polygon(0 0, 100% 0, 100% 88%, 50% 100%, 0 88%);
  color: var(--party-text);
  background: linear-gradient(180deg, color-mix(in srgb, var(--party-color) 92%, white 8%), color-mix(in srgb, var(--party-color) 72%, black 28%));
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.38);
  cursor: pointer;
  transition: transform 220ms ease, filter 220ms ease, box-shadow 220ms ease;
}

.party-banner::before {
  position: absolute;
  inset: 9px;
  border: 1px solid color-mix(in srgb, var(--party-text) 24%, transparent);
  clip-path: inherit;
  content: "";
}

.party-banner:hover,
.party-banner:focus-visible {
  z-index: 3;
  filter: saturate(1.1) brightness(1.08);
  transform: translateY(-14px) scale(1.035);
  box-shadow: 0 38px 78px rgba(0, 0, 0, 0.52);
}

.banner-emblem,
.profile-emblem {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--party-text) 55%, transparent);
  border-radius: 50%;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: 34px;
  font-weight: 900;
}

.party-banner strong {
  margin-top: 27px;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: clamp(21px, 2vw, 32px);
  letter-spacing: 0.04em;
}

.banner-name {
  margin-top: 13px;
  font-size: 10px;
  line-height: 1.45;
  text-align: center;
}

.banner-action {
  position: absolute;
  bottom: 52px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 7px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fiction-note {
  position: relative;
  z-index: 3;
  justify-self: center;
  max-width: 760px;
  margin: 0;
  color: rgba(244, 240, 230, 0.58);
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

.profile-screen,
.manifesto-screen {
  min-height: 100dvh;
}

.profile-layout {
  width: min(1180px, 94vw);
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(560px, 1.7fr);
  gap: 28px;
  margin: 36px auto 0;
}

.profile-banner {
  min-height: 650px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 76px 28px;
  border: 1px solid color-mix(in srgb, var(--party-color) 72%, white 28%);
  border-radius: 28px 28px 90px 28px;
  color: var(--party-text);
  background: linear-gradient(180deg, color-mix(in srgb, var(--party-color) 92%, white 8%), color-mix(in srgb, var(--party-color) 70%, black 30%));
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.42);
  text-align: center;
}

.profile-banner strong {
  margin-top: 32px;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: clamp(42px, 6vw, 76px);
}

.profile-banner > span:last-child {
  max-width: 220px;
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.4;
}

.profile-sheet {
  align-self: start;
  padding: clamp(24px, 3vw, 42px);
  border: 1px solid rgba(244, 240, 230, 0.2);
  border-radius: 34px 12px 34px 34px;
  background: rgba(7, 14, 19, 0.84);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(18px);
}

.profile-intro {
  display: grid;
  grid-template-columns: 1fr 0.9fr;
  gap: 30px;
  align-items: end;
}

.profile-intro h2 {
  margin: 8px 0 0;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: clamp(28px, 3vw, 44px);
  line-height: 1;
}

.profile-intro p,
.profile-sources p,
.intro-card p {
  margin: 0;
  color: rgba(244, 240, 230, 0.7);
  font-size: 12px;
  line-height: 1.6;
}

.party-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
  margin: 26px 0;
}

.party-stats div {
  padding: 14px;
  border: 1px solid rgba(244, 240, 230, 0.13);
  border-radius: 15px;
  background: rgba(244, 240, 230, 0.035);
}

.party-stats dt {
  color: rgba(244, 240, 230, 0.52);
  font-size: 8px;
  text-transform: uppercase;
}

.party-stats dd {
  margin: 9px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 17px;
  font-weight: 800;
}

.profile-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.profile-columns section {
  padding: 18px;
  border: 1px solid rgba(244, 240, 230, 0.13);
  border-radius: 18px;
}

.profile-columns ul {
  display: grid;
  gap: 9px;
  margin: 13px 0 0;
  padding-left: 18px;
  color: rgba(244, 240, 230, 0.82);
  font-size: 11px;
}

.position-list {
  margin-top: 22px;
}

.position-list header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 8px;
  color: rgba(244, 240, 230, 0.52);
  font-size: 9px;
}

.position-list details {
  border-top: 1px solid rgba(244, 240, 230, 0.12);
}

.position-list summary {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
}

.position-list summary span {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  text-transform: uppercase;
}

.position-list summary b {
  font-size: 9px;
}

.stance-support { color: var(--teal); }
.stance-conditional { color: var(--amber); }
.stance-oppose { color: #e49283; }

.position-list details p {
  margin: 0 0 13px;
  color: rgba(244, 240, 230, 0.68);
  font-size: 10px;
  line-height: 1.55;
}

.profile-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px 13px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(244, 240, 230, 0.14);
}

.profile-sources a {
  color: rgba(244, 240, 230, 0.78);
  font-size: 9px;
}

.profile-sources p {
  flex-basis: 100%;
  font-size: 9px;
}

.profile-confirm {
  width: 100%;
  margin-top: 20px;
}

.manifesto-layout {
  width: min(1160px, 94vw);
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 26px;
  margin: 46px auto 0;
}

.manifesto-party {
  padding: 28px;
  border: 1px solid color-mix(in srgb, var(--party-color) 60%, white 40%);
  border-radius: 26px 26px 70px 26px;
  background: color-mix(in srgb, var(--party-color) 48%, rgba(7, 14, 19, 0.9));
}

.manifesto-party strong {
  display: block;
  margin-top: 12px;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: 24px;
  line-height: 1.05;
}

.manifesto-party p {
  margin: 22px 0 0;
  color: rgba(244, 240, 230, 0.68);
  font-size: 11px;
  line-height: 1.55;
}

.priority-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.priority-grid button {
  min-height: 128px;
  display: grid;
  align-content: start;
  gap: 9px;
  padding: 20px;
  border: 1px solid rgba(244, 240, 230, 0.16);
  border-radius: 21px;
  color: var(--ink);
  background: rgba(7, 14, 19, 0.76);
  text-align: left;
  cursor: pointer;
  backdrop-filter: blur(14px);
}

.priority-grid button:hover,
.priority-grid button.selected {
  border-color: var(--amber);
  background: rgba(48, 48, 39, 0.82);
}

.priority-grid button span {
  color: var(--amber);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.priority-grid button strong {
  font-size: 17px;
}

.priority-grid button small {
  color: rgba(244, 240, 230, 0.62);
  font-size: 10px;
  line-height: 1.45;
}

.manifesto-confirm {
  display: block;
  margin: 24px auto 0;
}

.intro-screen {
  min-height: 100dvh;
  display: grid;
  place-items: center;
}

.intro-card {
  width: min(680px, 92vw);
  padding: clamp(30px, 5vw, 62px);
  border: 1px solid color-mix(in srgb, var(--party-color) 58%, white 42%);
  border-radius: 38px 14px 38px 38px;
  background: rgba(7, 14, 19, 0.84);
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
}

.intro-card h1 {
  margin: 16px 0 18px;
  font-family: "Arial Narrow", "Avenir Next Condensed", sans-serif;
  font-size: clamp(42px, 6vw, 74px);
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.intro-priorities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 25px 0;
}

.intro-priorities span {
  padding: 9px 11px;
  border: 1px solid rgba(244, 240, 230, 0.18);
  border-radius: 13px;
  font-size: 10px;
}

.entry-fade-enter-active,
.entry-fade-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.entry-fade-enter-from { opacity: 0; transform: translateY(8px); }
.entry-fade-leave-to { opacity: 0; transform: translateY(-5px); }

@keyframes entry-load {
  from { transform: translateX(-30%); }
  to { transform: translateX(130%); }
}

@media (max-width: 980px) {
  .party-banner-row { overflow-x: auto; justify-content: start; padding: 14px 4vw 30px; }
  .party-banner { width: 142px; min-width: 142px; }
  .profile-layout { grid-template-columns: 190px minmax(0, 1fr); }
  .profile-intro { grid-template-columns: 1fr; }
  .party-stats { grid-template-columns: repeat(2, 1fr); }
  .manifesto-layout { grid-template-columns: 1fr; }
  .manifesto-party { min-height: 0; }
}

@media (max-width: 720px) {
  .entry-header { grid-template-columns: auto 1fr auto; gap: 10px; }
  .entry-header h1 { font-size: 24px; }
  .entry-header small { display: none; }
  .profile-layout { grid-template-columns: 1fr; }
  .profile-banner { min-height: 220px; padding: 34px; }
  .profile-columns,
  .priority-grid { grid-template-columns: 1fr; }
  .title-secondary { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .entry-experience,
  .party-banner,
  .entry-primary,
  .entry-fade-enter-active,
  .entry-fade-leave-active {
    transition-duration: 0.01ms !important;
  }

  .entry-loading b { animation: none; width: 70%; }
}
</style>
