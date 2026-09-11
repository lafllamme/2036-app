<script setup lang="ts">
import type { PartyDefinition, PartyPolicyPosition } from '~/core/contracts'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import {
  CAMPAIGN_PRIORITIES,
  getParty,
  getPartyEvidence,
  PARTIES,
} from '~/content/parties'
import { getPolicy } from '~/content/policies'
import { useGameStore } from '~/stores/game'

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
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
    return
  event.preventDefault()
  if (!(event.currentTarget instanceof HTMLElement))
    return
  const row = event.currentTarget.closest('.party-banner-row')
  const buttons = Array.from(row?.querySelectorAll<HTMLButtonElement>('.party-banner') ?? [])
  if (buttons.length === 0)
    return
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
          <h1 id="game-title" class="entry-logo">
            20<span>36</span>
          </h1>
          <p class="entry-city">
            Lindenhafen
          </p>
          <p class="entry-claim">
            Eine Stadt. Viele Zukünfte.
          </p>
          <div class="title-actions">
            <button class="entry-primary" type="button" :disabled="!cityReady" @click="game.startNewCampaign">
              {{ cityReady ? 'Neue Kampagne' : 'Lindenhafen wird aufgebaut' }}
              <Icon v-if="cityReady" name="lucide:arrow-right" />
            </button>
          </div>
        </div>

        <footer class="title-foot">
          <div class="title-secondary" aria-label="Weitere Optionen">
            <button type="button" disabled>
              <Icon name="lucide:play" />Fortsetzen
            </button>
            <button type="button" disabled>
              <Icon name="lucide:settings" />Einstellungen
            </button>
          </div>
          <div class="entry-loading" :class="{ complete: cityReady }" aria-live="polite">
            <span>{{ cityReady ? 'Stadtmodell bereit' : 'Stadtmodell wird synchronisiert' }}</span>
            <i><b /></i>
            <span>{{ cityReady ? '100 %' : 'Lädt …' }}</span>
          </div>
        </footer>
      </section>

      <section v-else-if="experienceStage === 'partyHall'" key="party-hall" class="entry-screen party-hall" aria-labelledby="party-hall-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showTitle">
            ← Titel
          </button>
          <div>
            <small>01 · Politische Kraft</small>
            <h1 id="party-hall-title">
              Welche Richtung für Lindenhafen?
            </h1>
          </div>
          <span class="entry-step">1 / 3</span>
        </header>

        <div class="party-banner-row" aria-label="Spielbare fiktive Parteien">
          <button
            v-for="(party, index) in PARTIES"
            :key="party.id"
            class="party-banner"
            type="button"
            :style="{ '--party-color': party.color }"
            :aria-label="`${party.abbreviation}: ${party.name} auswählen`"
            @click="game.selectParty(party.id)"
            @keydown="moveBannerFocus($event, index)"
          >
            <span class="banner-emblem" aria-hidden="true">{{ party.emblem }}</span>
            <strong>{{ party.abbreviation }}</strong>
            <span class="banner-name">{{ party.name }}</span>
            <span class="banner-seats">Mandate <b>{{ party.stats.councilSeats }}</b></span>
            <span class="banner-action">Profil öffnen <Icon name="lucide:arrow-right" /></span>
          </button>
        </div>

        <p class="fiction-note">
          Fiktive Parteien und Ratswerte. Kürzel und Farbfamilien greifen die deutsche Parteienlandschaft auf; Namen und Symbole sind eigenständig.
        </p>
      </section>

      <section v-else-if="experienceStage === 'partyProfile' && selectedParty" key="party-profile" class="entry-screen profile-screen" aria-labelledby="party-profile-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showPartyHall">
            ← Parteien
          </button>
          <div>
            <small>02 · Politisches Profil</small><h1 id="party-profile-title">
              {{ selectedParty.abbreviation }} prüfen
            </h1>
          </div>
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
              <section>
                <small>Spielerische Stärken</small><ul>
                  <li v-for="item in selectedParty.strengths" :key="item">
                    {{ item }}
                  </li>
                </ul>
              </section>
              <section>
                <small>Politische Zielkonflikte</small><ul>
                  <li v-for="item in selectedParty.tradeoffs" :key="item">
                    {{ item }}
                  </li>
                </ul>
              </section>
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

            <button class="entry-primary profile-confirm" type="button" @click="game.confirmParty">
              Diese Partei wählen
              <Icon name="lucide:arrow-right" />
            </button>
          </article>
        </div>
      </section>

      <section v-else-if="experienceStage === 'manifesto' && selectedParty" key="manifesto" class="entry-screen manifesto-screen" aria-labelledby="manifesto-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showPartyProfile">
            ← Profil
          </button>
          <div>
            <small>03 · Mandat 2026</small><h1 id="manifesto-title">
              Drei Prioritäten festlegen
            </h1>
          </div>
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
              <span>
                {{ selectedPriorityIds.includes(priority.id) ? 'Ausgewählt' : 'Priorität' }}
                <Icon :name="selectedPriorityIds.includes(priority.id) ? 'lucide:check' : 'lucide:plus'" />
              </span>
              <strong>{{ priority.name }}</strong>
              <small>{{ priority.description }}</small>
            </button>
          </div>
        </div>

        <button class="entry-primary manifesto-confirm" type="button" :disabled="selectedPriorityIds.length !== 3" @click="game.reviewCampaign">
          {{ selectedPriorityIds.length === 3 ? 'Mandat bestätigen' : `Noch ${3 - selectedPriorityIds.length} auswählen` }}
          <Icon v-if="selectedPriorityIds.length === 3" name="lucide:arrow-right" />
        </button>
      </section>

      <section v-else-if="experienceStage === 'intro' && selectedParty" key="intro" class="entry-screen intro-screen" aria-labelledby="intro-title">
        <div class="intro-card" :style="{ '--party-color': selectedParty.color }">
          <small>Januar 2026 · Lindenhafen</small>
          <h1 id="intro-title">
            Das Jahrzehnt beginnt.
          </h1>
          <p>Du führst die {{ selectedParty.abbreviation }} in einen Stadtrat ohne sichere Mehrheit. Jede Entscheidung verändert Haushalt, Koalition und sichtbare Stadtentwicklung.</p>
          <div class="intro-priorities">
            <span v-for="priority in selectedPriorities" :key="priority.id">{{ priority.name }}</span>
          </div>
          <button class="entry-primary" type="button" @click="game.enterCity">
            Lindenhafen übernehmen
          </button>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
/*
 * Entry flow on the Signal system. Every value here comes from the tokens in
 * app/assets/css/styles.css — no local colours, no second display face. See DESIGN.md.
 */

.entry-experience {
  position: absolute;
  inset: 0;
  z-index: 12;
  overflow: hidden auto;
}

/*
 * The gameplay vignette is transparent in the centre so the city stays readable. During the entry
 * flow the centre is exactly where the type sits, so it gets its own scrim — without it the claim
 * and the city name wash out over bright roofs.
 */
.entry-experience::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 44%, rgba(9, 13, 16, 0.52) 0%, rgba(6, 9, 12, 0.9) 100%);
}

.entry-screen {
  position: relative;
  min-height: 100dvh;
  padding: 34px 40px 30px;
}

.entry-fade-enter-active,
.entry-fade-leave-active { transition: opacity 360ms ease, transform 360ms ease; }
.entry-fade-enter-from { opacity: 0; transform: translateY(10px); }
.entry-fade-leave-to { opacity: 0; transform: translateY(-10px); }

/* --- Shared chrome ------------------------------------------------------ */

.entry-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 20px;
  margin-bottom: 42px;
}
.entry-header > div { text-align: center; }
.entry-header small,
.entry-step {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.entry-header h1 {
  margin: 12px 0 0;
  font-family: var(--display);
  font-size: clamp(28px, 3.4vw, 44px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.06;
}
.entry-step { justify-self: end; padding-top: 2px; }

.entry-back {
  justify-self: start;
  padding: 8px 14px;
  border: 1px solid var(--rule);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease;
}
.entry-back:hover { border-color: var(--hairline); color: var(--ink); }

/* The one filled action per screen. */
.entry-primary {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 46px;
  padding: 0 26px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--ink);
  color: #0b0f12;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  cursor: pointer;
  transition: opacity 160ms ease, transform 160ms ease;
}
.entry-primary:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.entry-primary:disabled { opacity: 0.3; cursor: not-allowed; }
.entry-primary :deep(svg) { width: 15px; height: 15px; }

/* --- Title -------------------------------------------------------------- */

.title-screen {
  display: grid;
  grid-template-rows: 1fr auto;
  place-items: center;
  padding: 0;
}

.title-lockup {
  display: grid;
  justify-items: center;
  text-align: center;
  padding: 40px;
}

.entry-logo {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(96px, 13vw, 190px);
  font-weight: 700;
  line-height: 0.84;
  letter-spacing: -0.045em;
}
.entry-logo span { opacity: 0.38; }

.entry-city {
  margin: 26px 0 0;
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: 0.42em;
  text-transform: uppercase;
}
.entry-claim {
  margin: 12px 0 0;
  color: var(--dim);
  font-size: 13px;
  letter-spacing: 0.04em;
}
.title-actions { margin-top: 46px; }

/* The footer is its own row with a rule above it: nothing overlaps the load state any more. */
.title-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  width: 100%;
  padding: 22px 40px;
  border-top: 1px solid var(--rule);
}

.title-secondary { display: flex; gap: 10px; }
.title-secondary button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 1px solid var(--rule);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  cursor: pointer;
}
.title-secondary button:disabled { opacity: 0.4; cursor: not-allowed; }
.title-secondary :deep(svg) { width: 13px; height: 13px; opacity: 0.75; }

.entry-loading {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.entry-loading i {
  display: block;
  width: 150px;
  height: 2px;
  overflow: hidden;
  background: var(--hairline);
}
.entry-loading b {
  display: block;
  width: 44%;
  height: 100%;
  background: var(--ink);
  animation: entry-load 1.2s ease-in-out infinite alternate;
}
.entry-loading.complete b { width: 100%; animation: none; }

@keyframes entry-load {
  from { transform: translateX(-70%); }
  to { transform: translateX(160%); }
}

/* --- Party hall --------------------------------------------------------- */

.party-hall { display: grid; grid-template-rows: auto 1fr auto; }

.party-banner-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  align-content: center;
}

/*
 * Party colour is identity, not judgement: a 2 px edge and the emblem ring, never the surface.
 * Six saturated full-bleed banners read as election posters and fought with the status colours.
 */
.party-banner {
  --party-accent: color-mix(in oklab, var(--party-color), var(--ink) 34%);
  position: relative;
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  gap: 12px;
  padding: 22px 18px 18px;
  border: 1px solid var(--rule);
  border-radius: var(--r-inner);
  background: var(--panel);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(1.2);
  backdrop-filter: blur(var(--blur)) saturate(1.2);
  text-align: left;
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;
}
.party-banner::before {
  content: '';
  position: absolute;
  top: 0;
  right: 18px;
  left: 18px;
  height: 2px;
  background: var(--party-accent);
}
.party-banner:hover,
.party-banner:focus-visible {
  border-color: var(--hairline);
  background: rgba(18, 24, 29, 0.78);
  transform: translateY(-2px);
}

.banner-emblem {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--party-accent);
  border-radius: 50%;
  color: var(--party-accent);
  font-family: var(--display);
  font-size: 17px;
  font-weight: 700;
}
.party-banner strong {
  font-family: var(--display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.banner-name { color: var(--dim); font-size: 11px; line-height: 1.45; }
.banner-seats {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--rule);
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.banner-seats b { color: var(--ink); font-size: 11px; font-weight: 500; }
.banner-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.party-banner :deep(svg) { width: 13px; height: 13px; }

.fiction-note {
  margin: 36px 0 0;
  color: var(--dim);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

/* --- Party profile ------------------------------------------------------ */

.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
  gap: 22px;
  max-width: 1180px;
  margin: 0 auto;
}

.profile-banner {
  --party-accent: color-mix(in oklab, var(--party-color), var(--ink) 34%);
  position: relative;
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 30px 24px;
  border: 1px solid var(--rule);
  border-radius: var(--r-panel);
  background: var(--panel);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
}
.profile-banner::before {
  content: '';
  position: absolute;
  top: 0;
  right: 24px;
  left: 24px;
  height: 2px;
  background: var(--party-accent);
}
.profile-emblem {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--party-accent);
  border-radius: 50%;
  color: var(--party-accent);
  font-family: var(--display);
  font-size: 22px;
  font-weight: 700;
}
.profile-banner strong {
  font-family: var(--display);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}
.profile-banner > span:last-child { color: var(--dim); font-size: 12px; line-height: 1.5; }

.profile-sheet {
  padding: 28px 30px 24px;
  border-radius: var(--r-panel);
  background: var(--panel);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
  box-shadow: var(--shadow);
}
.profile-intro { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: end; }
.profile-intro small {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.profile-intro h2 {
  margin: 10px 0 0;
  font-family: var(--display);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.08;
}
.profile-intro p { margin: 0; color: var(--dim); font-size: 13px; line-height: 1.6; }

.party-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 26px 0 0; }
.party-stats > div { padding: 14px 16px; border: 1px solid var(--rule); border-radius: var(--r-inner); }
.party-stats dt {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.party-stats dd { margin: 8px 0 0; font-family: var(--mono); font-size: 19px; }

.profile-columns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
.profile-columns section { padding: 16px; border: 1px solid var(--rule); border-radius: var(--r-inner); }
.profile-columns small,
.position-list header small,
.profile-sources small {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.profile-columns ul { margin: 12px 0 0; padding-left: 16px; display: grid; gap: 7px; }
.profile-columns li { font-size: 12px; line-height: 1.5; }

.position-list { margin-top: 26px; }
.position-list header {
  display: flex;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rule);
}
.position-list header span { color: var(--dim); font-size: 11px; }
.position-list details { border-bottom: 1px solid var(--rule); }
.position-list summary {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 0;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.position-list summary b { font-size: 10px; }
.position-list details p { margin: 0 0 14px; color: var(--dim); font-size: 12px; line-height: 1.6; }

/* Status colours: the only two that carry meaning, plus paper for the middle ground. */
.stance-support { color: var(--positive); }
.stance-conditional { color: var(--ink); }
.stance-oppose { color: var(--negative); }

.profile-sources { margin-top: 24px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
.profile-sources a { color: var(--dim); font-size: 11px; }
.profile-sources a:hover { color: var(--ink); }
.profile-sources p { flex-basis: 100%; margin: 4px 0 0; color: var(--dim); font-size: 11px; line-height: 1.6; }
.profile-confirm { width: 100%; justify-content: center; margin-top: 24px; }

/* --- Priorities --------------------------------------------------------- */

.manifesto-screen { display: grid; grid-template-rows: auto 1fr auto; justify-items: center; }
.manifesto-layout {
  display: grid;
  grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
  gap: 20px;
  align-content: center;
  width: 100%;
  max-width: 1180px;
}

.manifesto-party {
  --party-accent: color-mix(in oklab, var(--party-color), var(--ink) 34%);
  position: relative;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 26px 24px;
  border: 1px solid var(--rule);
  border-radius: var(--r-panel);
  background: var(--panel);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
}
.manifesto-party::before {
  content: '';
  position: absolute;
  top: 0;
  right: 24px;
  left: 24px;
  height: 2px;
  background: var(--party-accent);
}
.manifesto-party span {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.manifesto-party strong {
  font-family: var(--display);
  font-size: 25px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.12;
}
.manifesto-party p { margin: 0; color: var(--dim); font-size: 12px; line-height: 1.55; }

.priority-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.priority-grid button {
  display: grid;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--rule);
  border-radius: var(--r-inner);
  background: var(--panel);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}
.priority-grid button:hover { border-color: var(--hairline); background: rgba(18, 24, 29, 0.74); }
/* Selection is paper, matching the filled action elsewhere — the old olive was an amber leftover. */
.priority-grid button.selected { border-color: var(--ink); background: rgba(246, 243, 236, 0.07); }

.priority-grid button span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.priority-grid button.selected span { color: var(--ink); }
.priority-grid :deep(svg) { width: 14px; height: 14px; }
.priority-grid button strong {
  font-family: var(--display);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.priority-grid button small { color: var(--dim); font-size: 11px; line-height: 1.5; }

.manifesto-confirm { margin-top: 30px; }

/* --- Intro -------------------------------------------------------------- */

.intro-screen { display: grid; place-items: center; }
.intro-card {
  --party-accent: color-mix(in oklab, var(--party-color), var(--ink) 34%);
  position: relative;
  width: min(720px, 100%);
  padding: 44px 46px 40px;
  border-radius: var(--r-panel);
  background: var(--panel-strong);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
  box-shadow: var(--shadow);
}
.intro-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 46px;
  left: 46px;
  height: 2px;
  background: var(--party-accent);
}
.intro-card small {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.intro-card h1 {
  margin: 18px 0 16px;
  font-family: var(--display);
  font-size: clamp(44px, 5.6vw, 74px);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 0.98;
}
.intro-card p { margin: 0; max-width: 58ch; color: var(--dim); font-size: 14px; line-height: 1.62; }
.intro-priorities { display: flex; flex-wrap: wrap; gap: 9px; margin: 26px 0 30px; }
.intro-priorities span {
  padding: 8px 15px;
  border: 1px solid var(--rule);
  border-radius: var(--r-pill);
  font-size: 12px;
}

/* --- Responsive and motion --------------------------------------------- */

@media (max-width: 1180px) {
  .party-banner-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .profile-layout,
  .manifesto-layout { grid-template-columns: minmax(0, 1fr); }
  .profile-intro { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 760px) {
  .party-banner-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .party-stats { grid-template-columns: repeat(2, 1fr); }
  .priority-grid { grid-template-columns: minmax(0, 1fr); }
  .title-foot { flex-direction: column; gap: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .entry-loading b { animation: none; width: 70%; }
  .entry-fade-enter-active,
  .entry-fade-leave-active { transition: none; }
  .party-banner:hover { transform: none; }
}
</style>
