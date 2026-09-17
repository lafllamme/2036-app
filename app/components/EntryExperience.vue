<script setup lang="ts">
import type { CampaignGoalDefinition, CampaignGoalId, PartyDefinition, PartyPolicyPosition } from '~/core/contracts'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useSound } from '~/composables/useSound'
import { useSoundSettings } from '~/composables/useSoundSettings'
import { CAMPAIGN_GOALS } from '~/content/goals'
import { LEADER_BACKGROUNDS } from '~/content/leaders'
import {
  getParty,
  getPartyEvidence,
  PARTIES,
} from '~/content/parties'
import { getPolicy } from '~/content/policies'
import { useGameStore } from '~/stores/game'

const game = useGameStore()
const settings = useSoundSettings()
const sound = useSound()
const {
  experienceStage,
  ready,
  rendererStats,
  selectedPartyId,
  selectedGoalIds,
  leaderName,
  leaderBackgroundId,
  leader,
  savedGame,
} = storeToRefs(game)

/** Die Initialen, als Platzhalter für ein Gesicht, das es noch nicht gibt. */
const monogram = computed(() => {
  const parts = leaderName.value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0)
    return '—'
  return (parts.length === 1 ? parts[0]!.slice(0, 2) : parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
})

/**
 * The campaign waiting on this machine, said in a line.
 *
 * A ten-year campaign that starts over on every refresh is not a campaign, and "Fortsetzen" sat here
 * disabled with nothing behind it. It says which party and which month, because that is what tells
 * the player whether this is the run they meant to come back to.
 */
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

// Only the browser knows whether a campaign is saved, so ask it once the title screen is in it.
onMounted(() => game.refreshSavedGame())

const savedLabel = computed(() => {
  const saved = savedGame.value
  if (!saved)
    return null
  const party = saved.partyId ? getParty(saved.partyId).abbreviation : null
  const month = MONTH_NAMES[saved.month % 12] ?? ''
  const year = 2026 + Math.floor(saved.month / 12)
  return party ? `${party} · ${month} ${year}` : `${month} ${year}`
})

const cityReady = computed(() => ready.value && Boolean(rendererStats.value))
const selectedParty = computed<PartyDefinition | null>(() => (
  selectedPartyId.value ? getParty(selectedPartyId.value) : null
))
const selectedEvidence = computed(() => (
  selectedParty.value ? getPartyEvidence(selectedParty.value.sourceIds) : []
))
const selectedGoals = computed(() => CAMPAIGN_GOALS.filter(({ id }) => selectedGoalIds.value.includes(id)))

/** Die Schwelle in einem Wort, damit die Karte sagt, worauf man sich einlässt. */
function goalTarget(goal: CampaignGoalDefinition): string {
  const value = goal.threshold.toLocaleString('de-DE', { minimumFractionDigits: goal.decimals, maximumFractionDigits: goal.decimals })
  return `${goal.direction === 'above' ? 'über' : 'unter'} ${value}${goal.unit}`
}

const stanceLabel: Record<PartyPolicyPosition['stance'], string> = {
  support: 'Unterstützt',
  conditional: 'Bedingt',
  oppose: 'Lehnt ab',
}

const policyName = (policyId: string): string => getPolicy(policyId)?.name ?? policyId

/**
 * The store silently drops a fourth goal, so without this the click has no consequence a player can
 * perceive at all. The refusal cue is the only feedback that moment has.
 */
function chooseGoal(goalId: CampaignGoalId): void {
  const chosen = selectedGoalIds.value
  if (chosen.length === 3 && !chosen.includes(goalId)) {
    sound.play('entry.priorityRejected')
    return
  }
  game.toggleGoal(goalId)
}

/**
 * Die Fraktionen, nach Mandaten sortiert — und der Rat als sechzig Striche.
 *
 * Sechs gleich große Karten haben behauptet, die Parteien seien gleich groß. Die CDU hat achtzehn
 * Sitze und die FDP drei; das ist die wichtigste Zahl des ganzen Bildschirms, und sie stand klein
 * unten in einer Kachel, die genauso breit war wie alle anderen. Jetzt trägt die Reihenfolge sie,
 * und die Schriftgröße der Zeile trägt sie mit — `--weight` läuft von 1 bei der stärksten Fraktion
 * herunter.
 */
const rankedParties = computed(() =>
  [...PARTIES].sort((a, b) => b.stats.councilSeats - a.stats.councilSeats))

/** Ein Eintrag je Sitz, in der Reihenfolge der Fraktionen. Sechzig Stück, einmal gerechnet. */
const chamber = computed(() =>
  rankedParties.value.flatMap(party =>
    Array.from({ length: party.stats.councilSeats }, (_, at) => ({
      key: `${party.id}-${at}`,
      partyId: party.id,
      color: party.color,
    }))))

/** Auf welche Zeile gerade gezeigt wird. Nur dort leuchtet Parteifarbe auf — siehe `DESIGN.md`. */
const hoveredParty = ref<string | null>(null)

/**
 * Die Zeile über der Kammer.
 *
 * Sechzig graue Striche ohne ein Wort sind ein Muster und keine Auskunft — man erfährt erst durch
 * Zeigen, dass es ein Rat ist. Der Satz sagt es vorher und wird dann zu dem, was man gerade
 * betrachtet.
 */
const hoveredLabel = computed(() => {
  const party = PARTIES.find(entry => entry.id === hoveredParty.value)
  return party
    ? `${party.abbreviation} hält ${party.stats.councilSeats} der 60 Sitze`
    : 'Der Rat von Lindenhafen, 60 Sitze'
})

function moveBannerFocus(event: KeyboardEvent, index: number): void {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
    return
  event.preventDefault()
  if (!(event.currentTarget instanceof HTMLElement))
    return
  const row = event.currentTarget.closest('.party-rank')
  const buttons = Array.from(row?.querySelectorAll<HTMLButtonElement>('.party-row') ?? [])
  if (buttons.length === 0)
    return
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
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
            <!--
              A campaign in progress is the thing you came back for, so it is the first button.
              Starting over is still one click away and is what a first-time player sees, because
              there is nothing to continue yet.
            -->
            <button v-if="savedLabel" class="entry-primary" type="button" :disabled="!cityReady" @click="game.resume">
              {{ cityReady ? 'Kampagne fortführen' : 'Lindenhafen wird aufgebaut' }}
              <Icon v-if="cityReady" name="lucide:arrow-right" />
            </button>
            <button v-else class="entry-primary" type="button" :disabled="!cityReady" @click="game.startNewCampaign">
              {{ cityReady ? 'Neue Kampagne' : 'Lindenhafen wird aufgebaut' }}
              <Icon v-if="cityReady" name="lucide:arrow-right" />
            </button>
            <p v-if="savedLabel" class="title-saved">
              Gespeicherter Stand · {{ savedLabel }}
            </p>
          </div>
        </div>

        <footer class="title-foot">
          <div class="title-secondary" aria-label="Weitere Optionen">
            <!-- With a campaign saved, the other way out of here is to start a fresh one. -->
            <button v-if="savedGame" type="button" :disabled="!cityReady" @click="game.startNewCampaign">
              <Icon name="lucide:rotate-ccw" />Neue Kampagne
            </button>
            <button v-else type="button" disabled title="Es ist noch keine Kampagne gespeichert">
              <Icon name="lucide:play" />Fortsetzen
            </button>
            <button type="button" @click="settings.openSettings()">
              <Icon name="lucide:settings" />Einstellungen
            </button>
          </div>
          <div class="entry-loading" :class="{ complete: cityReady }" aria-live="polite">
            <span>{{ cityReady ? 'Stadtmodell bereit' : 'Stadtmodell wird synchronisiert' }}</span>
            <i><b /></i>
            <span>{{ cityReady ? '100 %' : 'Lädt …' }}</span>
          </div>
        </footer>
        <!-- The ground plan is real map data, and its licence asks to be told about it. -->
        <p class="title-attribution">
          Stadtgrundriss auf Basis von Kartendaten der OpenStreetMap-Mitwirkenden (ODbL)
        </p>
      </section>

      <!--
        Wer den Vorsitz übernimmt. Steht vor der Parteienwahl, weil es so herum stimmt: erst ist man
        jemand, dann tritt man für eine Fraktion an. Vorher wählte man eine Partei und war niemand.
      -->
      <section v-else-if="experienceStage === 'leader'" key="leader" class="entry-screen leader-screen" aria-labelledby="leader-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showTitle">
            ← Titel
          </button>
          <div>
            <h1 id="leader-title">
              Wer tritt an?
            </h1>
          </div>
          <span class="entry-step">1 / 4</span>
        </header>

        <div class="leader-layout">
          <label class="leader-name">
            <span>Name</span>
            <input
              v-model="leaderName"
              type="text"
              maxlength="42"
              autocomplete="off"
              spellcheck="false"
              placeholder="Wie sollen dich die Leute nennen?"
              @keydown.enter="game.confirmLeader"
            >
            <!-- Das Monogramm ist das Gesicht, bis es eines gibt: die Initialen in der Farbe, die
                 die Partei später beisteuert. -->
            <i class="leader-monogram" aria-hidden="true">{{ monogram }}</i>
          </label>

          <div class="leader-grid" aria-label="Werdegang">
            <button
              v-for="background in LEADER_BACKGROUNDS"
              :key="background.id"
              type="button"
              :class="{ selected: leaderBackgroundId === background.id }"
              :aria-pressed="leaderBackgroundId === background.id"
              @click="game.chooseBackground(background.id)"
            >
              <span>
                {{ background.effect }}
                <Icon :name="leaderBackgroundId === background.id ? 'lucide:check' : 'lucide:plus'" />
              </span>
              <strong>{{ background.name }}</strong>
              <small>{{ background.description }}</small>
            </button>
          </div>
        </div>

        <button class="entry-primary" type="button" :disabled="!leader" @click="game.confirmLeader">
          {{ leader ? 'Weiter zur Partei' : leaderName.trim() ? 'Werdegang wählen' : 'Namen eintragen' }}
          <Icon v-if="leader" name="lucide:arrow-right" />
        </button>
      </section>

      <section v-else-if="experienceStage === 'partyHall'" key="party-hall" class="entry-screen party-hall" aria-labelledby="party-hall-title">
        <header class="entry-header">
          <button class="entry-back" type="button" @click="game.showLeader">
            ← Vorsitz
          </button>
          <div>
            <h1 id="party-hall-title">
              Welche Richtung für Lindenhafen?
            </h1>
          </div>
          <span class="entry-step">2 / 4</span>
        </header>

        <!--
          Der Rat, bevor man seinen Platz darin wählt.

          Sechzig Striche, einer je Sitz, in der Reihenfolge der Fraktionen. Sie sind grau, bis man
          auf eine Zeile zeigt — dann leuchten **ihre** Sitze auf. Damit erscheint Parteifarbe genau
          dort, wo sie Identität ist und nichts bewertet, und man sieht in derselben Sekunde, wie
          viel von diesem Rat die Fraktion ist, die man gerade anschaut.
        -->
        <div class="chamber-strip">
          <span>{{ hoveredLabel }}</span>
          <div class="chamber" aria-hidden="true">
            <i
              v-for="seat in chamber"
              :key="seat.key"
              class="seat"
              :class="{ 'is-lit': hoveredParty === seat.partyId }"
              :style="{ '--party-color': seat.color }"
            />
          </div>
        </div>

        <ol class="party-rank" aria-label="Spielbare fiktive Parteien">
          <li v-for="(party, index) in rankedParties" :key="party.id">
            <button
              class="party-row"
              type="button"
              :style="{ '--party-color': party.color, '--weight': party.stats.councilSeats / 18 }"
              :aria-label="`${party.abbreviation}: ${party.name}, ${party.stats.councilSeats} von 60 Sitzen`"
              @click="game.selectParty(party.id)"
              @keydown="moveBannerFocus($event, index)"
              @mouseenter="hoveredParty = party.id"
              @mouseleave="hoveredParty = null"
              @focus="hoveredParty = party.id"
              @blur="hoveredParty = null"
            >
              <i class="party-mark" aria-hidden="true" />
              <strong>{{ party.abbreviation }}</strong>
              <span class="party-full">{{ party.name }}</span>
              <span class="party-seats"><b>{{ party.stats.councilSeats }}</b> von 60</span>
              <Icon class="party-go" name="lucide:arrow-right" />
            </button>
          </li>
        </ol>

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
            <h1 id="party-profile-title">
              {{ selectedParty.abbreviation }} prüfen
            </h1>
          </div>
          <span class="entry-step">2 / 3</span>
        </header>

        <div class="profile-layout">
          <!--
            Ein Körper statt zweier, und darin nur Haarlinien.

            Vorher: eine Fahne links, ein Blatt rechts, und im Blatt sechs Kästen mit eigenem Rahmen —
            ein Körper im Körper im Körper. `DESIGN.md` sagt dazu einen Satz: „Innerhalb eines Körpers
            kommt Struktur aus Haarlinien und Abstand, nicht aus verschachtelten Kästen."
          -->
          <article class="profile-sheet" :style="{ '--party-color': selectedParty.color }">
            <header class="profile-head">
              <i class="party-mark" aria-hidden="true" />
              <strong>{{ selectedParty.abbreviation }}</strong>
              <h2>{{ selectedParty.name }}</h2>
              <p>{{ selectedParty.summary }}</p>
            </header>

            <dl class="party-stats" aria-label="Fiktive Ausgangswerte">
              <div><dt>Ratsmandate</dt><dd>{{ selectedParty.stats.councilSeats }}<em>von 60</em></dd></div>
              <div><dt>Zustimmung</dt><dd>{{ selectedParty.stats.publicSupport }}<em>Prozent</em></dd></div>
              <div><dt>Organisation</dt><dd>{{ selectedParty.stats.organization }}<em>von 100</em></dd></div>
              <div><dt>Verhandlung</dt><dd>{{ selectedParty.stats.negotiation }}<em>von 100</em></dd></div>
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
              <small>Quellen und Einordnung · Stand {{ selectedParty.asOf }}</small>
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
            <h1 id="manifesto-title">
              Drei Ziele für das Jahrzehnt
            </h1>
          </div>
          <span class="entry-step">{{ selectedGoalIds.length }} / 3</span>
        </header>

        <div class="manifesto-layout">
          <div class="manifesto-party" :style="{ '--party-color': selectedParty.color }">
            <span>{{ selectedParty.abbreviation }}</span>
            <strong>{{ selectedParty.name }}</strong>
            <p>Diese drei Zahlen müssen im Dezember 2036 stimmen. Sonst nichts – daran wird gemessen.</p>
          </div>
          <div class="priority-grid" aria-label="Ziele der Kampagne">
            <button
              v-for="goal in CAMPAIGN_GOALS"
              :key="goal.id"
              type="button"
              :class="{ selected: selectedGoalIds.includes(goal.id) }"
              :aria-pressed="selectedGoalIds.includes(goal.id)"
              :disabled="!selectedGoalIds.includes(goal.id) && selectedGoalIds.length === 3"
              @click="chooseGoal(goal.id)"
            >
              <span>
                {{ selectedGoalIds.includes(goal.id) ? 'Ausgewählt' : goalTarget(goal) }}
                <Icon :name="selectedGoalIds.includes(goal.id) ? 'lucide:check' : 'lucide:plus'" />
              </span>
              <strong>{{ goal.name }}</strong>
              <small>{{ goal.promise }}</small>
            </button>
          </div>
        </div>

        <button class="entry-primary manifesto-confirm" type="button" :disabled="selectedGoalIds.length !== 3" @click="game.reviewCampaign">
          {{ selectedGoalIds.length === 3 ? 'Mandat bestätigen' : `Noch ${3 - selectedGoalIds.length} auswählen` }}
          <Icon v-if="selectedGoalIds.length === 3" name="lucide:arrow-right" />
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
            <span v-for="goal in selectedGoals" :key="goal.id">{{ goal.name }}</span>
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
 * Der Einstieg behält seinen Blur, und zwar als **eigenen** Wert.
 *
 * Im laufenden Spiel ist er gestrichen: dort deckten sechs solcher Flächen sechzig Prozent des
 * Schirms ab und kosteten gemessen 18 FPS. Hier steht die Kamera still, es wird nichts gespielt, und
 * die Parteienhalle lebt davon, dass die Stadt hinter den Karten liegt statt zugedeckt zu sein. Der
 * Wert steht als Zahl und nicht als Token: ein Token ist eine Einladung, ihn woanders auch zu
 * nehmen, und `tests/architecture/boundaries.test.ts` besteht zu Recht darauf, dass jeder Token
 * global definiert ist. Hier soll er gerade nicht global sein.
 */
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
/* Der Schrittzähler ist eine Zahl, die man vergleicht — also Mono, und ohne Versalienkostüm. */
.entry-step {
  color: var(--faint);
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.04em;
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

/*
 * Der Rückweg: dieselbe leise Pille wie `.btn--ghost` im Spiel.
 *
 * Vorher eine Kontur in 9-px-Mono-Versalien. Ein Knopf im Einstieg und ein Knopf im Spiel waren
 * damit zwei verschiedene Objekte für dieselbe Sache, und das ist genau der Bruch, den man in den
 * ersten zehn Sekunden sieht.
 */
.entry-back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  color: var(--dim);
  font-family: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.entry-back:hover { background: rgba(255, 255, 255, 0.1); color: var(--ink); }

/*
 * The one filled action per screen.
 *
 * Der Abstand nach oben steht hier und nicht am Elternteil, weil der Knopf auf drei von vier
 * Bildschirmen das **letzte Element** ist und dort direkt auf einem Raster von Karten aufsetzt. Ohne
 * ihn klebte „Namen eintragen" an der Kachelreihe darüber, als gehöre er zur letzten Karte — und
 * genau das ist er nicht: er schließt den Schritt ab. Achtundzwanzig Pixel sind mehr als die
 * Innenabstände der Fläche (18) und damit als Schnitt lesbar.
 *
 * `:first-child` nimmt ihn zurück, wo der Knopf allein in seiner Zeile steht — auf dem Titelbild
 * sitzt er in einer eigenen Gruppe, die ihren Abstand schon hat.
 */
.entry-primary {
  display: inline-flex;
  margin-top: 28px;
  align-items: center;
  gap: 9px;
  min-height: 46px;
  padding: 0 26px;
  border: 0;
  border-radius: var(--r-pill);
  /*
   * Dasselbe Objekt wie `.btn` im Spiel: ein Körper aus Papier mit Lichtkante und Schatten, gesetzt
   * in Switzer. Vorher war es eine flache Fläche in 10-px-Mono-Versalien — die gefüllte Aktion des
   * Einstiegs und die des Spiels waren zwei verschiedene Dinge für dieselbe Handlung.
   */
  background: linear-gradient(180deg, #fbf9f4 0%, #e6e2d8 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 10px 22px -8px rgba(0, 0, 0, 0.7);
  color: #0b0f12;
  font-family: var(--text);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.005em;
  cursor: pointer;
  transition: filter 160ms ease, opacity 160ms ease, transform 160ms ease;
}
.entry-primary:first-child { margin-top: 0; }
.entry-primary:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.entry-primary:disabled { opacity: 0.42; cursor: default; }
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
/* What you are coming back to, under the button that takes you there. */
.title-saved {
  margin: 14px 0 0; color: var(--faint);
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
}

.title-attribution {
  margin: 0.9rem 0 0;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in oklab, var(--ink), transparent 62%);
  text-align: center;
}

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

.party-hall { display: grid; grid-template-rows: auto auto 1fr auto; gap: 26px; }

/*
 * Der Rat als sechzig Striche.
 *
 * Nicht als Balkendiagramm und nicht als Halbkreis: ein Sitz ist ein Sitz, und sechzig davon
 * nebeneinander sind die eine Auskunft, die dieser Bildschirm schuldet — wie viel von diesem Haus
 * eine Fraktion ist. Grau, bis man auf eine Zeile zeigt; dann leuchten ihre Sitze auf. Damit steht
 * Parteifarbe genau dort, wo sie Identität ist und nichts bewertet.
 */
.chamber-strip { display: grid; gap: 10px; }
.chamber-strip > span {
  color: var(--faint);
  font-size: 11.5px;
}
.chamber {
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 28px;
  padding: 0 2px;
}
/*
 * Die Sitze stehen auf, wenn man auf ihre Fraktion zeigt — der eine gestaltete Moment auf diesem
 * Bildschirm. Ohne den Höhenunterschied wechselte nur die Farbe, und eine Farbe allein ist eine
 * Zustandsanzeige; ein Aufrichten ist eine Handlung.
 */
.seat {
  flex: 1 1 0;
  height: 17px;
  min-width: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.11);
  transition: background-color 260ms cubic-bezier(0.16, 1, 0.3, 1), height 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.seat.is-lit {
  height: 28px;
  background: color-mix(in oklab, var(--party-color), var(--ink) 40%);
}

@media (prefers-reduced-motion: reduce) {
  .seat { transition: background-color 120ms linear; }
}

/*
 * Die Fraktionen als Rangliste, nicht als Raster.
 *
 * Sechs gleich große Karten haben behauptet, die Parteien seien gleich groß — und die Zahl, die das
 * widerlegt, stand klein in der vorletzten Zeile jeder Kachel. Hier trägt die Reihenfolge sie, und
 * das Kürzel wächst mit: `--weight` läuft von 1 bei der stärksten Fraktion herunter, und daraus
 * folgt eine Schriftgröße zwischen 26 und 46 px. Der Bildschirm sagt damit dasselbe wie die Zahl
 * daneben, nur ohne dass man sie lesen muss.
 */
.party-rank { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; align-content: center; }

.party-row {
  display: grid;
  grid-template-columns: 10px minmax(0, auto) minmax(0, 1fr) auto 18px;
  gap: 18px;
  align-items: baseline;
  width: 100%;
  padding: 18px 20px;
  border: 0;
  border-radius: var(--r-inner);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 180ms ease;
}
.party-row + .party-row { box-shadow: inset 0 1px 0 var(--rule); }
.party-rank li + li .party-row { box-shadow: inset 0 1px 0 var(--rule); }
.party-row:hover,
.party-row:focus-visible { background: rgba(255, 255, 255, 0.05); }

/* Identität, und sonst nichts: der kleine runde Punkt aus `DESIGN.md`. */
.party-mark {
  align-self: center;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: color-mix(in oklab, var(--party-color), var(--ink) 34%);
}

.party-row strong {
  font-family: var(--display);
  font-size: calc(26px + var(--weight) * 20px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}
.party-full {
  align-self: center;
  color: var(--dim);
  font-size: 12.5px;
  line-height: 1.45;
}
/* Die Zahl in Mono, weil man sie vergleicht — die Beschriftung daneben in Sprache. */
.party-seats { align-self: center; color: var(--dim); font-size: 12px; }
.party-seats b { color: var(--ink); font-family: var(--mono); font-size: 16px; font-weight: 400; }
.party-go { align-self: center; width: 16px; height: 16px; color: var(--faint); }
.party-row:hover .party-go { color: var(--ink); }

.fiction-note {
  margin: 36px 0 0;
  color: var(--dim);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

/* --- Party profile ------------------------------------------------------ */

.profile-layout { max-width: 940px; margin: 0 auto; }

.profile-sheet {
  padding: 34px 36px 28px;
  border-radius: var(--r-panel);
  background: var(--panel);
  box-shadow: var(--body-edge), var(--body-drop);
}

/*
 * Der Kopf: Punkt, Kürzel, Name, ein Satz.
 *
 * Die Fahne links ist weg. Sie war eine zweite Fläche für dieselbe Auskunft, und ihr farbiger
 * Streifen und der farbige Emblemring verstießen gegen die einzige Farbregel, die dieses Projekt
 * hat — Parteifarbe erscheint als kleiner runder Punkt neben einem Kürzel, nie als Fläche.
 */
.profile-head {
  display: grid;
  grid-template-columns: 12px auto minmax(0, 1fr);
  gap: 0 16px;
  align-items: baseline;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--rule);
}
.profile-head .party-mark { width: 12px; height: 12px; }
.profile-head strong {
  font-family: var(--display);
  font-size: 44px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1;
}
.profile-head h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.profile-head p {
  grid-column: 2 / -1;
  max-width: 62ch;
  margin: 14px 0 0;
  color: var(--dim);
  font-size: 14px;
  line-height: 1.6;
}

/*
 * Vier Zahlen, getrennt durch Haarlinien statt durch vier Kästen.
 *
 * Die Zahl steht in Mono, weil man sie vergleicht; ihre Einheit daneben in Sprache und klein, weil
 * man sie einmal liest. Vorher stand die Beschriftung in 8-px-Mono-Versalien — genau das, was
 * `DESIGN.md` unter „Vermeiden" führt und was die alte Oberfläche wie ein Datenblatt aussehen ließ.
 */
.party-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 26px 0 0;
}
.party-stats > div { padding: 4px 20px; }
.party-stats > div + div { border-left: 1px solid var(--rule); }
.party-stats > div:first-child { padding-left: 0; }
.party-stats dt { color: var(--dim); font-size: 12px; }
.party-stats dd {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin: 7px 0 0;
  font-family: var(--mono);
  font-size: 26px;
  line-height: 1;
}
.party-stats dd em {
  color: var(--faint);
  font-family: var(--text);
  font-size: 11.5px;
  font-style: normal;
}

/* Zwei Spalten, eine Haarlinie dazwischen. Kein Kasten, keine Rahmen. */
.profile-columns {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 30px;
  margin-top: 30px;
  padding-top: 26px;
  border-top: 1px solid var(--rule);
}
.profile-columns section + section { padding-left: 30px; border-left: 1px solid var(--rule); }
/*
 * Beschriftungen sind Sprache, keine Technik.
 *
 * Sie standen alle in 8-px-Mono-Versalien mit 0,14 em Sperrung — `SPIELERISCHE STÄRKEN`,
 * `AKTUELLE RATSVORLAGEN`, `QUELLEN UND EINORDNUNG`. `DESIGN.md` führt genau das unter „Vermeiden"
 * und nennt auch den Grund: Mono ist für Zahlen da, nicht als Kostüm für „technisch", und ein
 * Bildschirm, dessen jede Beschriftung so gesetzt ist, sieht aus wie ein Datenblatt statt wie ein
 * Spiel. Sie sind jetzt Fließschrift in Satzschreibung.
 */
.profile-columns small,
.position-list header small,
.profile-sources small {
  color: var(--dim);
  font-size: 12px;
}
.profile-columns ul { margin: 14px 0 0; padding-left: 16px; display: grid; gap: 8px; }
.profile-columns li { font-size: 13px; line-height: 1.55; }

.position-list { margin-top: 26px; }
.position-list header {
  display: flex;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rule);
}
.position-list header span { color: var(--faint); font-size: 12px; }
.position-list details { border-bottom: 1px solid var(--rule); }
.position-list summary {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  cursor: pointer;
  font-size: 13px;
}
.position-list summary b { font-size: 12px; font-weight: 500; }
.position-list details p { margin: 0 0 16px; max-width: 68ch; color: var(--dim); font-size: 13px; line-height: 1.6; }

/* Status colours: the only two that carry meaning, plus paper for the middle ground. */
.stance-support { color: var(--positive); }
.stance-conditional { color: var(--ink); }
.stance-oppose { color: var(--negative); }

.profile-sources { margin-top: 24px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
.profile-sources a { color: var(--dim); font-size: 12px; }
.profile-sources a:hover { color: var(--ink); }
.profile-sources p { flex-basis: 100%; max-width: 70ch; margin: 6px 0 0; color: var(--faint); font-size: 12px; line-height: 1.6; }
.profile-confirm { width: 100%; justify-content: center; margin-top: 30px; }

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
  border: 0;
  border-radius: var(--r-panel);
  background: var(--panel);
  box-shadow: var(--body-edge), var(--body-drop);
}
.manifesto-party::before {
  content: '';
  position: absolute;
  display: none;
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

/*
 * Der Vorsitz. Das Namensfeld trägt das Monogramm rechts, damit der Name sofort ein Gesicht bekommt
 * und nicht erst auf dem nächsten Bildschirm.
 */
.leader-layout { display: grid; gap: 18px; }

.leader-name {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 20px 96px 20px 20px;
  border: 0;
  border-radius: var(--r-inner);
  background: var(--panel);
  box-shadow: var(--body-edge), var(--body-drop);
}

.leader-name > span {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dim);
}

.leader-name input {
  border: 0;
  border-bottom: 1px solid var(--rule);
  padding: 0 0 8px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 22px;
  letter-spacing: -0.01em;
}

.leader-name input:focus { outline: none; border-bottom-color: var(--ink); }
.leader-name input::placeholder { color: var(--faint); font-size: 15px; }

.leader-monogram {
  position: absolute;
  inset-block: 50% auto;
  inset-inline-end: 20px;
  translate: 0 -50%;
  display: grid;
  place-items: center;
  inline-size: 58px;
  block-size: 58px;
  border: 1px solid var(--rule);
  border-radius: 50%;
  color: var(--ink);
  font-size: 19px;
  font-style: normal;
  letter-spacing: 0.04em;
}

.priority-grid,
.leader-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.priority-grid button,
.leader-grid button {
  display: grid;
  gap: 8px;
  padding: 20px;
  border: 0;
  border-radius: var(--r-inner);
  background: var(--panel);
  box-shadow: var(--body-edge), var(--body-drop);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}
.priority-grid button:hover,
.leader-grid button:hover { border-color: var(--hairline); background: rgba(18, 24, 29, 0.74); }
/* Selection is paper, matching the filled action elsewhere — the old olive was an amber leftover. */
.priority-grid button.selected,
.leader-grid button.selected { border-color: var(--ink); background: rgba(246, 243, 236, 0.07); }

.priority-grid button span,
.leader-grid button span {
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
  box-shadow: var(--body-edge), var(--body-drop);
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
