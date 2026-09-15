<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSound } from '~/composables/useSound'
import { useSoundSettings } from '~/composables/useSoundSettings'
import { getParty } from '~/content/parties'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'

const game = useGameStore()
const settings = useSoundSettings()
const sound = useSound()
const {
  snapshot,
  clock,
  daylight,
  weather,
  currentDate,
  campaignProgress,
  canAdvance,
  experienceStage,
  selectedPartyId,
  speed,
  selectedBuilding,
  selectedNews,
  selectedReport,
  selectedCitizen,
  rendererStats,
} = storeToRefs(game)
const selectedParty = computed(() => selectedPartyId.value ? getParty(selectedPartyId.value) : null)

/*
 * The two numbers that are deliberately not the same number.
 *
 * Seats are what the player has; support is what the city would give them if it were asked today.
 * They only move together at an election, and the gap between them is the position the whole
 * political model exists to put the player in — governing with a majority that is no longer the
 * city. Showing one without the other would hide exactly that.
 */
const ownSupport = computed(() => {
  const id = selectedPartyId.value
  return id && snapshot.value ? (snapshot.value.support[id] ?? null) : null
})

/** What it was at the last committed month, so the arrow says which way the city is going. */
const previousSupport = ref<Record<string, number>>({})
watch(() => snapshot.value?.month, () => {
  const support = snapshot.value?.support
  if (support)
    previousSupport.value = { ...support }
})

/** Which way it has moved since the last committed month, as −1, 0 or 1. A tenth of a point counts. */
const supportDrift = computed(() => {
  const id = selectedPartyId.value
  const now = ownSupport.value
  const before = id ? previousSupport.value[id] : undefined
  if (!id || now === null || before === undefined)
    return 0
  const change = now - before
  return Math.abs(change) < 0.0005 ? 0 : Math.sign(change)
})

const hasMajority = computed(() => (snapshot.value?.coalitionSupport ?? 0) > 30)

/**
 * Why the clock has stopped, in the game's own words.
 *
 * The campaign pauses itself when a motion arrives and when it ends, and until now it did so in
 * complete silence: three speed buttons with none of them lit and a clock that had stopped, which
 * is indistinguishable from a crash. It was read as one.
 */
const pauseReason = computed(() => {
  if (snapshot.value?.defeat)
    return 'Kampagne beendet'
  if ((snapshot.value?.pendingDecisions.length ?? 0) > 0)
    return 'Vorlage wartet'
  return 'Pausiert'
})

const supportHint = computed(() => {
  if (ownSupport.value === null)
    return ''
  const share = formatNumber(ownSupport.value * 100, 1)
  return hasMajority.value
    ? `${share} % der Stimmen. Die Koalition hält noch eine Mehrheit.`
    : `${share} % der Stimmen. Die Koalition hat keine Mehrheit mehr.`
})

/*
 * A call, said three ways.
 *
 * The bar has room for one line and says who was sent and what for. The dialog has room to split
 * that: the service and district as a kicker, the thing itself as the headline, and the reason it
 * happened underneath — because in this game an incident always has one.
 */
const CALL_TITLES: Record<string, string> = {
  burglary: 'Einbruch gemeldet',
  assault: 'Körperverletzung',
  accident: 'Verkehrsunfall',
  fire: 'Gebäudebrand',
}
const CALL_SUBTITLES: Record<string, string> = {
  burglary: 'Einbruchsrate gegen den Ordnungsdienst',
  assault: 'Kriminalität, Polarisierung, Jugendarbeitslosigkeit',
  accident: 'Verkehrsaufkommen gegen die Zuverlässigkeit des Netzes',
  fire: 'Unterhalt der Bausubstanz',
}
const SERVICE_LABELS: Record<string, string> = {
  police: 'Polizei',
  ambulance: 'Rettungsdienst',
  fire: 'Feuerwehr',
}
/** Which colour a call wears: by what happened, not by who was sent. */
const CALL_TONE: Record<string, string> = {
  burglary: 'theft',
  assault: 'police',
  accident: 'medical',
  fire: 'fire',
}

/** What is happening with the call, in words, and how long it has been going. */
const REPORT_STATUS: Record<string, string> = {
  open: 'Kräfte unterwegs',
  onScene: 'Kräfte vor Ort',
  cleared: 'Einsatz beendet',
}

/*
 * A clock that ticks only while a call is open on screen.
 *
 * A call is a thing that is happening, and the one question a player has looking at it is how long
 * it has been happening — so the dialog counts rather than showing a timestamp. Nothing runs when
 * no dialog is open.
 */
const now = ref(Date.now())
let ticking: ReturnType<typeof setInterval> | null = null
watch(selectedReport, (report) => {
  if (report && !ticking) {
    now.value = Date.now()
    ticking = setInterval(() => {
      now.value = Date.now()
    }, 1_000)
    return
  }
  if (!report && ticking) {
    clearInterval(ticking)
    ticking = null
  }
})
onBeforeUnmount(() => {
  if (ticking)
    clearInterval(ticking)
})

const reportElapsed = computed(() => {
  const report = selectedReport.value
  if (!report)
    return ''
  const seconds = Math.max(0, Math.round(((report.endedAt ?? now.value) - report.raisedAt) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

/** Take the player there and get out of the way; the camera is the answer, not the dialog. */
function flyToReport(): void {
  const report = selectedReport.value
  if (!report)
    return
  game.focusOnPlace(report.x, report.z)
  game.selectedReport = null
}

const coalitionStanding = computed(() => (snapshot.value?.coalitionSupport ?? 0) > 30 ? 'Mehrheit' : 'Minderheit')

/*
 * One glyph carries the state of the sky. The words for each phase and the exact sunrise and sunset
 * times live in the Lagebericht, where they are looked up rather than monitored — a label in the
 * command bar cost 290 px for something the sky itself already says.
 */
const SUN_GLYPHS: Record<string, string> = {
  night: 'lucide:moon',
  dawn: 'lucide:sunrise',
  sunrise: 'lucide:sunrise',
  morning: 'lucide:sun',
  noon: 'lucide:sun',
  afternoon: 'lucide:sun',
  goldenHour: 'lucide:sunset',
  sunset: 'lucide:sunset',
  dusk: 'lucide:sunset',
}

const PHASE_LABELS: Record<string, string> = {
  night: 'Nacht',
  dawn: 'Morgendämmerung',
  sunrise: 'Sonnenaufgang',
  morning: 'Vormittag',
  noon: 'Mittag',
  afternoon: 'Nachmittag',
  goldenHour: 'Goldene Stunde',
  sunset: 'Sonnenuntergang',
  dusk: 'Abenddämmerung',
}

/**
 * What the sky reads as, in one glyph.
 *
 * The weather outranks the hour here on purpose: at two on a November afternoon the interesting fact
 * is that it is raining, not that the sun is technically up. Only when nothing is falling and the
 * sky is not shut does the phase of the day get the icon back.
 */
function skyGlyph(phase: string): { glyph: string, label: string } {
  const { rain, snow, cloud, wind } = weather.value
  if (snow > 0.08)
    return { glyph: 'lucide:cloud-snow', label: snow > 0.5 ? 'Schneefall' : 'Leichter Schnee' }
  if (rain > 0.08)
    return { glyph: rain > 0.5 ? 'lucide:cloud-rain' : 'lucide:cloud-drizzle', label: rain > 0.5 ? 'Regen' : 'Nieselregen' }
  if (wind > 0.62)
    return { glyph: 'lucide:wind', label: 'Windig' }
  if (cloud > 0.78)
    return { glyph: 'lucide:cloudy', label: 'Bedeckt' }
  if (cloud > 0.52)
    return { glyph: 'lucide:cloud-sun', label: 'Wechselnd bewölkt' }
  return { glyph: SUN_GLYPHS[phase] ?? 'lucide:sun', label: PHASE_LABELS[phase] ?? '' }
}

const sky = computed(() => {
  const reading = daylight.value
  const look = skyGlyph(reading.phase)
  return {
    glyph: look.glyph,
    label: `${look.label} · ${PHASE_LABELS[reading.phase] ?? ''}`,
    temperature: `${formatNumber(weather.value.temperature, 0)}°`,
    isNight: reading.phase === 'night',
  }
})

const buildingLabels = {
  altbau: 'Gründerzeit-Wohnhaus',
  modern: 'Modernes Quartier',
  residential: 'Wohngebäude',
  commercial: 'Gewerbeimmobilie',
  industrial: 'Industriebetrieb',
  civic: 'Öffentliche Einrichtung',
}

function restart(): void {
  sound.play('hud.reset')
  game.reset()
}
</script>

<template>
  <main class="game-shell" :class="{ 'entry-active': experienceStage !== 'gameplay' }">
    <ClientOnly>
      <CityCanvas />
    </ClientOnly>
    <div class="atmosphere-vignette" aria-hidden="true" />

    <ClientOnly>
      <template v-if="experienceStage === 'gameplay'">
        <header class="top-command panel">
          <div class="brand-block">
            <strong>20<span>36</span></strong>
            <div>
              <b>LINDENHAFEN</b>
              <small>{{ selectedParty ? `${selectedParty.abbreviation} · ${coalitionStanding}` : 'Politische Stadtsimulation' }}</small>
            </div>
          </div>
          <div class="date-block">
            <span class="date-block__month">{{ currentDate }}</span>
            <span class="date-block__clock">{{ clock }}</span>
            <span class="date-block__temp">{{ sky.temperature }}<small>C</small></span>
            <Icon
              class="date-block__sky"
              :class="{ 'is-night': sky.isNight }"
              :name="sky.glyph"
              :aria-label="sky.label"
            />
            <div class="campaign-track">
              <i :style="{ width: `${campaignProgress}%` }" />
            </div>
          </div>
          <div v-if="snapshot && ownSupport !== null" class="coalition-block" :title="supportHint">
            <small>Rückhalt</small>
            <div class="seatline" role="img" :aria-label="supportHint">
              <i class="support" :style="{ width: `${ownSupport * 100}%` }" />
            </div>
            <strong>
              {{ formatNumber(ownSupport * 100, 1) }}<i>%</i>
              <em v-if="supportDrift !== 0" :class="supportDrift > 0 ? 'up' : 'down'">{{ supportDrift > 0 ? '▲' : '▼' }}</em>
            </strong>
          </div>
          <div v-if="snapshot" class="coalition-block" :class="{ tight: !hasMajority }">
            <small>Koalition</small>
            <div class="seatline" role="img" :aria-label="`${snapshot.coalitionSupport} von 60 Sitzen`">
              <i :style="{ width: `${(snapshot.coalitionSupport / 60) * 100}%` }" />
            </div>
            <strong>{{ snapshot.coalitionSupport }}<i>/60</i></strong>
          </div>
          <button class="quiet-button" type="button" @click="game.save">
            {{ game.saveStatus.startsWith('Gespeichert') ? 'Gespeichert' : 'Speichern' }}
          </button>
          <button class="icon-button" type="button" aria-label="Einstellungen" @click="settings.openSettings()">
            <Icon name="lucide:settings" />
          </button>
        </header>

        <MetricRail />
        <DecisionPanel />

        <section v-if="selectedBuilding" class="selection-card panel">
          <button type="button" aria-label="Auswahl schließen" @click="game.selectedBuilding = null">
            ×
          </button>
          <small>{{ selectedBuilding.districtId.replaceAll('-', ' ') }}</small>
          <h2>{{ buildingLabels[selectedBuilding.type] }}</h2>
          <dl>
            <div><dt>Objekt</dt><dd>{{ selectedBuilding.id.toUpperCase() }}</dd></div>
            <div><dt>Zustand</dt><dd>{{ (selectedBuilding.condition * 100).toFixed(0) }} %</dd></div>
            <div><dt>Auslastung</dt><dd>{{ (selectedBuilding.occupancy * 100).toFixed(0) }} %</dd></div>
          </dl>
        </section>

        <!--
          Somebody in the street.

          Everyone walking or riding in Lindenhafen has a name, an age, a job and a family history,
          none of it stored and all of it derived from the number of the figure you happened to point
          at — so there are five hundred people in the city and none of them cost anything until you
          look. None of it is read back by anything: see `app/world/citizens.ts`.
        -->
        <section v-if="selectedCitizen" class="selection-card citizen-card panel">
          <button type="button" aria-label="Auswahl schließen" @click="game.selectedCitizen = null">
            ×
          </button>
          <small>Passantin oder Passant</small>
          <h2>{{ selectedCitizen.name }}</h2>
          <dl>
            <div><dt>Alter</dt><dd>{{ selectedCitizen.age }}</dd></div>
            <div><dt>Tätigkeit</dt><dd>{{ selectedCitizen.job }}</dd></div>
            <div>
              <dt>Herkunft</dt>
              <dd>{{ selectedCitizen.origin.country }}</dd>
            </div>
            <div>
              <dt>{{ selectedCitizen.origin.born === 'here' ? 'Geboren in' : 'In Lindenhafen seit' }}</dt>
              <dd>{{ selectedCitizen.origin.born === 'here' ? 'Lindenhafen' : selectedCitizen.since }}</dd>
            </div>
            <div>
              <dt>Würde wählen</dt>
              <dd>
                <i class="leaning-dot" :style="{ background: getParty(selectedCitizen.leaning).color }" />
                {{ getParty(selectedCitizen.leaning).abbreviation }}
              </dd>
            </div>
          </dl>
          <p class="dialog-note">
            Herkunft und Tätigkeit sind Merkmale und keine Werte: sie gehen in keine Bewertung, keinen Auslöser und keine Kennzahl ein. Die Wahlabsicht ergibt sich aus der Haltung dieser Person und daraus, wohin die Stadt gerade tendiert — sie kann sich im Lauf der Kampagne ändern.
          </p>
        </section>

        <section class="camera-help panel" aria-label="Kamerasteuerung">
          <span><b>LINKS</b> verschieben</span><span><b>RECHTS</b> drehen</span><span><b>RAD</b> zoomen</span><span><b>RECHTSKLICK</b> anfliegen</span>
        </section>

        <section class="time-controls panel" :class="{ paused: speed === 0 }" aria-label="Zeitsteuerung">
          <!--
            The pause button was taken out because pausing is one click away on any of the speeds and
            the campaign pauses itself for a vote anyway. What was missing is the other half of that:
            the campaign pausing itself was completely silent. Three speed buttons with none of them
            lit, and a clock that has stopped, is indistinguishable from a game that has crashed —
            and was read as exactly that. The resume below says both that it is paused and why.
          -->
          <button
            v-if="speed === 0 && canAdvance"
            type="button"
            class="resume"
            :title="`${pauseReason} — klicken, um fortzusetzen`"
            @click="game.setSpeed(1)"
          >
            <span aria-hidden="true">▶</span> {{ pauseReason }}
          </button>
          <button type="button" class="overview" title="Zurück zur Gesamtansicht" aria-label="Zurück zur Gesamtansicht" @click="game.showOverview">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M1.5 5.5v-4h4M14.5 5.5v-4h-4M1.5 10.5v4h4M14.5 10.5v4h-4" />
              <circle cx="8" cy="8" r="2.1" />
            </svg>
          </button>
          <span />
          <button v-for="value in [1, 2, 4] as const" :key="value" type="button" :class="{ active: speed === value }" @click="game.setSpeed(value)">
            {{ `${value}×` }}
          </button>
          <span />
          <button type="button" class="advance" :disabled="!canAdvance" @click="game.advanceMonth">
            {{ canAdvance ? 'Nächster Monat' : 'Kampagne abgeschlossen' }}
          </button>
        </section>

        <div v-if="rendererStats" class="render-badge">
          {{ rendererStats.backend }} · {{ rendererStats.fps }} FPS · {{ rendererStats.drawCalls }} Draws · {{ (rendererStats.triangles / 1000).toFixed(0) }}k Dreiecke · {{ rendererStats.resolution.toFixed(2) }}× · {{ rendererStats.buildings }} Gebäude
        </div>

        <NewsTicker />
        <VoteSheet />
        <VoteResult />
      </template>
    </ClientOnly>

    <EntryExperience v-if="experienceStage !== 'gameplay'" />

    <SettingsSheet />

    <div v-if="game.error" class="error-state panel" role="alert">
      <strong>Simulation angehalten</strong><p>{{ game.error }}</p><button type="button" @click="restart">
        Neu laden
      </button>
    </div>

    <div v-if="selectedNews" class="modal-backdrop" @click.self="game.selectedNews = null">
      <article class="news-dialog panel" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <button type="button" class="close-button" aria-label="Meldung schließen" @click="game.selectedNews = null">
          ×
        </button>
        <small>{{ selectedNews.scope.toUpperCase() }} · MONAT {{ selectedNews.month }}</small>
        <h2 id="news-title">
          {{ selectedNews.headline }}
        </h2>
        <p class="dialog-note">
          Diese Meldung wurde aus dem deterministischen Stadtmodell erzeugt. Zugehörige Ursachen erscheinen im monatlichen Kausalprotokoll.
        </p>
      </article>
    </div>

    <div v-if="selectedReport" class="modal-backdrop" @click.self="game.selectedReport = null">
      <article
        class="news-dialog report-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        :style="{ '--call': `var(--call-${CALL_TONE[selectedReport.kind]})` }"
      >
        <button type="button" class="close-button" aria-label="Meldung schließen" @click="game.selectedReport = null">
          ×
        </button>
        <small class="report-kicker">
          <i /> {{ SERVICE_LABELS[selectedReport.service] }}{{ selectedReport.district ? ` · ${selectedReport.district}` : '' }}
        </small>
        <h2 id="report-title">
          {{ CALL_TITLES[selectedReport.kind] }}
        </h2>
        <p class="report-meta">
          <span class="report-status" :class="selectedReport.status">
            <i /> {{ REPORT_STATUS[selectedReport.status] }}
          </span>
          <span>· seit {{ reportElapsed }}</span>
        </p>
        <p class="report-cause">
          {{ CALL_SUBTITLES[selectedReport.kind] }}
        </p>
        <!--
          The point of the whole thing: a call is a place, and the player should never have to go
          hunting across three kilometres of city for the one they were just told about.
        -->
        <div class="dialog-actions">
          <button type="button" class="dialog-action" :disabled="selectedReport.status === 'cleared'" @click="flyToReport">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M1.5 5.5v-4h4M14.5 5.5v-4h-4M1.5 10.5v4h4M14.5 10.5v4h-4" />
              <circle cx="8" cy="8" r="2.1" />
            </svg>
            {{ selectedReport.status === 'cleared' ? 'Einsatz beendet' : 'Zum Einsatzort' }}
          </button>
          <button type="button" class="dialog-action ghost" @click="game.selectedReport = null">
            Später
          </button>
        </div>
        <p class="dialog-note">
          Einsätze entstehen aus dem Stadtmodell: Einbrüche aus der Belastung des Ordnungsdienstes, Unfälle aus dem Verkehr. Sie sind keine Zufallsereignisse.
        </p>
      </article>
    </div>
  </main>
</template>
