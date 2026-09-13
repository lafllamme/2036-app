<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
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
  currentDate,
  campaignProgress,
  canAdvance,
  experienceStage,
  selectedPartyId,
  speed,
  selectedBuilding,
  selectedNews,
  selectedReport,
  rendererStats,
} = storeToRefs(game)
const selectedParty = computed(() => selectedPartyId.value ? getParty(selectedPartyId.value) : null)

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
/** Which of the three service colours a dialog wears. */
const SERVICE_TONE: Record<string, string> = {
  police: 'police',
  ambulance: 'medical',
  fire: 'fire',
}

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

const sky = computed(() => {
  const reading = daylight.value
  return {
    glyph: SUN_GLYPHS[reading.phase] ?? 'lucide:sun',
    label: PHASE_LABELS[reading.phase] ?? '',
    temperature: `${formatNumber(reading.temperature, 0)}°`,
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
          <div v-if="snapshot" class="coalition-block">
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

        <section class="camera-help panel" aria-label="Kamerasteuerung">
          <span><b>LINKS</b> verschieben</span><span><b>RECHTS</b> drehen</span><span><b>RAD</b> zoomen</span><span><b>RECHTSKLICK</b> anfliegen</span>
        </section>

        <section class="time-controls panel" aria-label="Zeitsteuerung">
          <!--
            Where the pause button used to be. Pausing is one click away on any of the speeds and the
            campaign pauses itself for a vote anyway; finding the middle of a three-kilometre city
            again after following a street to the edge of it was the thing there was no way back from.
          -->
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
        :style="{ '--call': `var(--call-${SERVICE_TONE[selectedReport.service]})` }"
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
          Einsatz {{ String(selectedReport.id).padStart(3, '0') }} · {{ CALL_SUBTITLES[selectedReport.kind] }}
        </p>
        <!--
          The point of the whole thing: a call is a place, and the player should never have to go
          hunting across three kilometres of city for the one they were just told about.
        -->
        <div class="dialog-actions">
          <button type="button" class="dialog-action" @click="flyToReport">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M1.5 5.5v-4h4M14.5 5.5v-4h-4M1.5 10.5v4h4M14.5 10.5v4h-4" />
              <circle cx="8" cy="8" r="2.1" />
            </svg>
            Zum Einsatzort
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
