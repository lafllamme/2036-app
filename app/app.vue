<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSound } from '~/composables/useSound'
import { getParty } from '~/content/parties'
import { useGameStore } from '~/stores/game'
import { tenancyAt } from '~/world/tenancy'

/*
 * Die Schale, und sonst nichts.
 *
 * Vorher standen hier die Kopfleiste, die Zeitsteuerung, die Kamerahilfe und das Render-Abzeichen im
 * Template — ein halbes Layout in der Datei, die eigentlich nur sagen soll, was es auf dem Schirm
 * gibt. Die Bedienung ist jetzt `CommandDeck`, jede Fläche bringt ihr eigenes CSS mit, und was hier
 * bleibt, sind die Dinge, die zu nichts anderem gehören: die Auswahl unter dem Mauszeiger, die zwei
 * Meldungsdialoge und der Fehlerzustand.
 */

const game = useGameStore()
const sound = useSound()

/*
 * Der Messstand, falls `?bench` an der Adresse hängt — nach dem Mounten, nie im Setup.
 *
 * Pinia überschreibt den Client-Zustand nach dem Setup mit dem des Servers; alles, was der Messstand
 * vorher setzt, ist danach wieder weg. Siehe `enterBench` im Store.
 */
onMounted(() => game.enterBench())
const {
  experienceStage,
  selectedBuilding,
  selectedNews,
  selectedReport,
  selectedCitizen,
  rendererStats,
  walking,
  walkState,
} = storeToRefs(game)

/*
 * Was im Erdgeschoss des angeklickten Hauses ist.
 *
 * Der Anteil kommt aus dem Einzelhandelsbestand gegen seinen Ausgangswert: bricht er ein, stehen
 * hier sichtbar Läden leer. Die Richtung läuft nur so herum — siehe `world/tenancy.ts`.
 */
const CITY_SEED = 2036
const tenancy = computed(() => {
  const picked = selectedBuilding.value
  const now = game.snapshot?.metrics.businessStock
  const start = game.snapshot?.baselineMetrics.businessStock
  if (!picked || now === undefined || !start)
    return null
  return tenancyAt(picked, CITY_SEED, now / start)
})

const buildingLabels = {
  altbau: 'Gründerzeit-Wohnhaus',
  modern: 'Modernes Quartier',
  residential: 'Wohngebäude',
  commercial: 'Gewerbeimmobilie',
  industrial: 'Industriebetrieb',
  civic: 'Öffentliche Einrichtung',
}

/*
 * Ein Einsatz, dreimal gesagt.
 *
 * Die Meldung hat Platz für eine Zeile und sagt, wer hingeschickt wurde und wofür. Der Dialog hat
 * Platz, das aufzuteilen: Dienst und Viertel als Vorzeile, die Sache selbst als Überschrift, und
 * darunter der Grund — denn in diesem Spiel hat ein Einsatz immer einen.
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
/** Welche Farbe ein Einsatz trägt: nach dem, was passiert ist, nicht nach dem, wer gekommen ist. */
const CALL_TONE: Record<string, string> = {
  burglary: 'theft',
  assault: 'police',
  accident: 'medical',
  fire: 'fire',
}
const REPORT_STATUS: Record<string, string> = {
  open: 'Kräfte unterwegs',
  onScene: 'Kräfte vor Ort',
  cleared: 'Einsatz beendet',
}

/*
 * Eine Uhr, die nur tickt, solange ein Einsatz offen auf dem Schirm steht.
 *
 * Ein Einsatz ist etwas, das gerade passiert, und die eine Frage dazu ist, wie lange schon — also
 * zählt der Dialog, statt einen Zeitstempel zu zeigen. Ohne offenen Dialog läuft nichts.
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

/** Den Spieler hinbringen und aus dem Weg gehen; die Kamera ist die Antwort, nicht der Dialog. */
function flyToReport(): void {
  const report = selectedReport.value
  if (!report)
    return
  game.focusOnPlace(report.x, report.z)
  game.selectedReport = null
}

function restart(): void {
  sound.play('hud.reset')
  game.reset()
}
</script>

<template>
  <!--
    `--pick-space` sagt der linken Spalte, wie viel eine offene Auswahlkarte oben wegnimmt.

    Karte und Lagebild sitzen beide links und beide absolut; ohne das überlappen sie, und die Zahlen
    des Lagebilds lesen sich wie die der Karte. Die Schale weiß als Einzige, dass gerade etwas
    ausgewählt ist, also setzt sie den Wert und `MetricRail` zieht ihn ab.
  -->
  <main
    class="game-shell"
    :class="{ 'entry-active': experienceStage !== 'gameplay' }"
    :style="{ '--pick-space': selectedBuilding || selectedCitizen ? '236px' : '0px' }"
  >
    <ClientOnly>
      <CityCanvas />
    </ClientOnly>
    <div class="atmosphere-vignette" aria-hidden="true" />

    <ClientOnly>
      <template v-if="experienceStage === 'gameplay'">
        <div class="shell-hem" aria-hidden="true" />

        <MetricRail />
        <DecisionPanel />
        <NewsTicker />
        <CommandDeck />
        <VoteSheet />
        <VoteResult />
        <ClosingReport />

        <!--
          Die Kamerahilfe und das Render-Abzeichen: das Leiseste auf dem Schirm, in der Ecke des
          Himmels, in der ohnehin nichts steht. Beides ist Auskunft und keine Bedienung.
        -->
        <div class="hints" aria-hidden="true">
          <!-- Die Steuerung, die gerade gilt — nicht die, die es sonst gäbe. -->
          <p v-if="walking">
            <b>WASD</b> gehen · <b>Shift</b> laufen · <b>Leertaste</b> springen · <b>Maus</b> umsehen · <b>Knopf</b> zurück zur Karte
          </p>
          <p v-else>
            <b>Links</b> verschieben · <b>Rechts</b> drehen · <b>Rad</b> zoomen · <b>Rechtsklick</b> anfliegen
          </p>
          <!--
            Wo man steht, solange man zu Fuß unterwegs ist.

            Hier sind zwei Reparaturen ins Leere gegangen, weil „sieht komisch aus" und „stecke fest"
            für ein halbes Dutzend Ursachen gleich aussehen: in einer Wand, unter Wasser, oder die
            Steuerung läuft gar nicht. Drei Zahlen im Bild unterscheiden das in einer Sekunde.
          -->
          <p v-if="walking && walkState" class="render-badge">
            Standort {{ walkState.x.toFixed(0) }} / {{ walkState.z.toFixed(0) }} ·
            Boden {{ walkState.ground.toFixed(1) }} m · Auge {{ walkState.eye.toFixed(1) }} m
            <template v-if="walkState.stuck">
              · <b>in einem Gebäude</b>
            </template>
          </p>
          <p v-if="rendererStats" class="render-badge">
            {{ rendererStats.backend }} · {{ rendererStats.fps }} FPS · {{ rendererStats.drawCalls }} Draws ·
            {{ (rendererStats.triangles / 1000).toFixed(0) }}k Dreiecke · {{ rendererStats.resolution.toFixed(2) }}× ·
            {{ rendererStats.buildings }} Gebäude
          </p>
        </div>

        <section v-if="selectedBuilding" class="pod pick" aria-label="Ausgewähltes Gebäude">
          <button type="button" class="close-button" aria-label="Auswahl schließen" @click="game.selectedBuilding = null">
            <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          <span class="kick">{{ selectedBuilding.districtId.replaceAll('-', ' ') }}</span>
          <h2>{{ buildingLabels[selectedBuilding.type] }}</h2>
          <dl>
            <div><dt>Objekt</dt><dd>{{ selectedBuilding.id.toUpperCase() }}</dd></div>
            <div><dt>Zustand</dt><dd>{{ (selectedBuilding.condition * 100).toFixed(0) }} %</dd></div>
            <div><dt>Auslastung</dt><dd>{{ (selectedBuilding.occupancy * 100).toFixed(0) }} %</dd></div>
            <!--
              Das Erdgeschoss. Eine Adresse ist erst eine Adresse, wenn etwas darin ist — und ein
              zugeklebtes Schaufenster ist die Kennzahl „Gewerbebestand", auf der Straße gelesen.
            -->
            <div v-if="tenancy">
              <dt>Erdgeschoss</dt>
              <dd :class="{ vacant: !tenancy.open }">
                {{ tenancy.open ? tenancy.label : `${tenancy.label} · geschlossen` }}
              </dd>
            </div>
          </dl>
        </section>

        <!--
          Jemand auf der Straße.

          Alle, die in Lindenhafen laufen oder fahren, haben einen Namen, ein Alter, einen Beruf und
          eine Familiengeschichte — nichts davon gespeichert, alles abgeleitet aus der Nummer der
          Figur, auf die man gezeigt hat. Es gibt also fünfhundert Menschen in der Stadt, und keiner
          kostet etwas, bis man hinsieht. Siehe `app/world/citizens.ts`.
        -->
        <section v-if="selectedCitizen" class="pod pick pick--person" aria-label="Ausgewählte Person">
          <button type="button" class="close-button" aria-label="Auswahl schließen" @click="game.selectedCitizen = null">
            <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          <span class="kick">Passantin oder Passant</span>
          <h2>{{ selectedCitizen.name }}</h2>
          <dl>
            <div><dt>Alter</dt><dd>{{ selectedCitizen.age }}</dd></div>
            <div><dt>Tätigkeit</dt><dd>{{ selectedCitizen.job }}</dd></div>
            <div><dt>Herkunft</dt><dd>{{ selectedCitizen.origin.country }}</dd></div>
            <div>
              <dt>{{ selectedCitizen.origin.born === 'here' ? 'Geboren in' : 'In Lindenhafen seit' }}</dt>
              <dd>{{ selectedCitizen.origin.born === 'here' ? 'Lindenhafen' : selectedCitizen.since }}</dd>
            </div>
            <div>
              <dt>Würde wählen</dt>
              <dd>
                <i class="party-dot" :style="{ background: getParty(selectedCitizen.leaning).color }" />
                {{ getParty(selectedCitizen.leaning).abbreviation }}
              </dd>
            </div>
          </dl>
          <p class="note">
            Herkunft und Tätigkeit sind Merkmale und keine Werte: sie gehen in keine Bewertung, keinen Auslöser und
            keine Kennzahl ein. Die Wahlabsicht ergibt sich aus der Haltung dieser Person und daraus, wohin die Stadt
            gerade tendiert – sie kann sich im Lauf der Kampagne ändern.
          </p>
        </section>
      </template>
    </ClientOnly>

    <EntryExperience v-if="experienceStage !== 'gameplay'" />

    <SettingsSheet />

    <div v-if="game.error" class="modal-backdrop" role="alert">
      <div class="pod dialog">
        <h2>Simulation angehalten</h2>
        <p>{{ game.error }}</p>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="restart">
            Neu laden
          </button>
        </div>
      </div>
    </div>

    <div v-if="selectedNews" class="modal-backdrop" @click.self="game.selectedNews = null">
      <article class="pod dialog" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <div class="dialog-top">
          <span class="kick">{{ selectedNews.scope }} · Monat {{ selectedNews.month }}</span>
          <button type="button" class="close-button" aria-label="Meldung schließen" @click="game.selectedNews = null">
            <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <h2 id="news-title">
          {{ selectedNews.headline }}
        </h2>
        <p class="note">
          Diese Meldung wurde aus dem deterministischen Stadtmodell erzeugt. Zugehörige Ursachen erscheinen im
          monatlichen Kausalprotokoll.
        </p>
      </article>
    </div>

    <div v-if="selectedReport" class="modal-backdrop" @click.self="game.selectedReport = null">
      <article
        class="pod dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        :style="{ '--call': `var(--call-${CALL_TONE[selectedReport.kind]})` }"
      >
        <div class="dialog-top">
          <span class="kick call">
            <i />{{ SERVICE_LABELS[selectedReport.service] }}{{ selectedReport.district ? ` · ${selectedReport.district}` : '' }}
          </span>
          <button type="button" class="close-button" aria-label="Meldung schließen" @click="game.selectedReport = null">
            <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <h2 id="report-title" class="call">
          {{ CALL_TITLES[selectedReport.kind] }}
        </h2>
        <p class="status" :class="selectedReport.status">
          <i />{{ REPORT_STATUS[selectedReport.status] }} · seit {{ reportElapsed }}
        </p>
        <p class="cause">
          {{ CALL_SUBTITLES[selectedReport.kind] }}
        </p>
        <!--
          Der Sinn der ganzen Sache: ein Einsatz ist ein Ort, und niemand soll drei Kilometer Stadt
          nach dem absuchen müssen, von dem ihm gerade erzählt wurde.
        -->
        <div class="dialog-actions">
          <button type="button" class="btn btn--ghost btn--sm" @click="game.selectedReport = null">
            Später
          </button>
          <button type="button" class="btn" :disabled="selectedReport.status === 'cleared'" @click="flyToReport">
            {{ selectedReport.status === 'cleared' ? 'Einsatz beendet' : 'Zum Einsatzort' }}
          </button>
        </div>
        <p class="note">
          Einsätze entstehen aus dem Stadtmodell: Einbrüche aus der Belastung des Ordnungsdienstes, Unfälle aus dem
          Verkehr. Sie sind keine Zufallsereignisse.
        </p>
      </article>
    </div>
  </main>
</template>

<style scoped>
/* --- Die leisesten Zeilen im Bild ---------------------------------------- */

.hints {
  position: absolute; top: 26px; right: 34px; z-index: 4;
  display: grid; gap: 5px; justify-items: end; pointer-events: none;
  color: rgba(244, 242, 236, 0.3);
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em; text-align: right;
}
.hints p { margin: 0; }
.hints b { color: rgba(244, 242, 236, 0.5); font-weight: 400; }
.render-badge { font-variant-numeric: tabular-nums; }

/* --- Was unter dem Mauszeiger lag ---------------------------------------- */

.pick {
  position: absolute; top: 34px; left: 34px; z-index: 7;
  width: 320px; padding: 22px 24px 20px;
}
/*
 * Die Karte einer Person liegt über der eines Gebäudes, weil immer jemand vor einem steht: ein
 * Klick wählt beides, und ohne diese Reihenfolge wäre das ein Kartenstreit.
 */
.pick--person { z-index: 8; }
.pick .close-button { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; }
.pick .close-button svg { width: 14px; height: 14px; }
.kick { display: block; color: var(--ink-3); font-size: 12px; text-transform: capitalize; }
.pick h2 {
  margin: 9px 0 16px; font-family: var(--display); font-size: 21px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1.1; max-width: 15ch;
}
.pick dl { display: grid; gap: 0; margin: 0; }
.pick dl > div {
  display: flex; align-items: baseline; justify-content: space-between; gap: 14px;
  padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.pick dl > div:first-child { border-top: 0; }
.pick dt { color: var(--ink-2); font-size: 12.5px; }
/* Ein leerstehendes Erdgeschoss ist kein Fehler, aber ein Verlust — also grau und nicht rot. */
.pick dd.vacant { color: var(--ink-3); }
.pick dd { margin: 0; font-family: var(--mono); font-size: 12.5px; font-variant-numeric: tabular-nums; }

.note { margin: 14px 0 0; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); color: var(--ink-3); font-size: 11.5px; line-height: 1.55; }

/* --- Die zwei Dialoge und der Fehlerzustand ------------------------------- */

.dialog { width: min(460px, 100%); padding: 26px 28px 22px; border-radius: var(--r-card); }
.dialog-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.dialog h2 {
  margin: 12px 0 0; font-family: var(--display); font-size: 27px; font-weight: 700;
  letter-spacing: -0.032em; line-height: 1.08;
}
.dialog > p { margin: 12px 0 0; color: var(--ink-2); font-size: 13.5px; line-height: 1.6; }

/*
 * Die Art des Einsatzes trägt die Farbe, und sie trägt sie auf der Überschrift: ein farbiger Strich
 * quer über den Dialog las sich als verirrte Linie statt als Bedeutung.
 */
.kick.call { display: flex; align-items: center; gap: 8px; }
.kick.call i { width: 7px; height: 7px; border-radius: 50%; background: var(--call); }
h2.call { color: var(--call); }

/*
 * Ob schon jemand da ist: ein pulsender Punkt, solange die Kräfte fahren, ein ruhiger, sobald sie
 * da sind, keiner mehr, wenn es vorbei ist — dieselben drei Zustände wie die Absperrung auf der
 * Straße, damit Dialog und Stadt nie etwas Verschiedenes behaupten.
 */
.status { display: flex; align-items: center; gap: 8px; margin: 10px 0 0 !important; color: var(--ink) !important; font-size: 12.5px !important; }
.status i { width: 7px; height: 7px; border-radius: 50%; background: var(--call); }
.status.open i { animation: report-pulse 1.1s ease-in-out infinite; }
.status.cleared { color: var(--ink-3) !important; }
.status.cleared i { background: var(--ink-3); }
@keyframes report-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

.cause { margin: 8px 0 0 !important; color: var(--ink-3) !important; font-size: 12.5px !important; }

.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

@media (max-width: 1180px) {
  .hints p:first-child { display: none; }
}
</style>
