<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useSound } from '~/composables/useSound'
import { useSoundSettings } from '~/composables/useSoundSettings'
import { getParty } from '~/content/parties'
import { useGameStore } from '~/stores/game'
import { drift, handOver } from '~/utils/drift'
import { formatNumber } from '~/utils/labels'

/*
 * Die Bedienung, in vier Körpern am unteren Bildrand.
 *
 * Vorher war das eine durchgehende Leiste von Kante zu Kante — die liest wie eine Symbolleiste im
 * Browser und nimmt dem Bild eine ganze Kante weg. Hier steht jeder Körper für sich, jeder so breit
 * wie sein Inhalt, mit Luft dazwischen: du bist das eine, dein Stand das zweite, die Zeit das
 * dritte, und was du drückst das vierte. Die Uhr ist dabei absichtlich das Größte auf dem Schirm —
 * ohne sie war alles gleich laut, und gleich laut heißt keine Ordnung.
 */

const game = useGameStore()
const settings = useSoundSettings()
const sound = useSound()

const {
  snapshot,
  clock,
  daylight,
  weather,
  speed,
  skipping,
  nextAction,
  canAdvance,
  selectedPartyId,
  pendingDecisions,
  railOpen,
  decisionsOpen,
  saveStatus,
  walking,
} = storeToRefs(game)

const party = computed(() => selectedPartyId.value ? getParty(selectedPartyId.value) : null)
const leader = computed(() => snapshot.value?.leader?.name ?? '')

/*
 * Die beiden Zahlen, die absichtlich nicht dieselbe sind.
 *
 * Sitze sind, was du hast; Rückhalt ist, was die Stadt dir heute geben würde. Sie bewegen sich nur
 * bei einer Wahl gemeinsam, und der Abstand dazwischen ist die Lage, für die das ganze politische
 * Modell existiert — regieren mit einer Mehrheit, die die Stadt nicht mehr ist.
 */
const support = computed(() => {
  const id = selectedPartyId.value
  return id && snapshot.value ? (snapshot.value.support[id] ?? null) : null
})
const hasMajority = computed(() => (snapshot.value?.coalitionSupport ?? 0) > 30)

/*
 * In welche Richtung sich der Rückhalt bewegt.
 *
 * Eine Prozentzahl allein sagt nicht, ob man gerade gewinnt oder verliert — und das ist die Frage,
 * die ein Spieler an diese Zahl stellt. Verglichen wird gegen den zuletzt abgeschlossenen Monat,
 * nicht gegen das letzte Bild: innerhalb eines Monats zittert der Wert, und ein Pfeil, der bei jedem
 * Zittern umspringt, ist keine Auskunft.
 */
/*
 * Zwei Stände, nicht einer — und genau daran ist die alte Fassung gescheitert.
 *
 * Sie schrieb beim Monatswechsel `previous = { ...snapshot.support }`. Wenn dieser Watcher läuft,
 * **ist** der Schnappschuss aber schon der neue: verglichen wurde der Monat mit sich selbst, die
 * Differenz war immer null, und der Pfeil ist in der ganzen Kampagne kein einziges Mal erschienen.
 * Ein toter Hinweis, den niemand vermisst hat, weil nichts fehlte — es stand nur nie etwas da.
 *
 * Also wird der Wert beim Wechsel **weitergereicht**: was gerade galt, wird zum Vorherigen, und erst
 * dann kommt der neue hinein.
 */
const settled = ref<Record<string, number> | null>(null)
const previous = ref<Record<string, number> | null>(null)
watch(() => snapshot.value?.month, () => {
  const now = snapshot.value?.support
  if (!now)
    return
  const next = handOver(settled.value, { ...now })
  previous.value = next.previous
  settled.value = next.settled
})

const direction = computed(() => {
  const id = selectedPartyId.value
  return id ? drift(support.value, previous.value?.[id]) : 0
})

/** Wie viele Monate die Kampagne schon gelaufen ist, als Anteil des Jahrzehnts. */
const decade = computed(() => Math.min(100, ((snapshot.value?.month ?? 0) / 131) * 100))

/*
 * Das Datum ausgeschrieben, aber ohne Wochentag.
 *
 * Ein Monat hat hier dreißig Tage, also gäbe es für einen Wochentag keinen ehrlichen Kalender: er
 * wäre eine erfundene Tatsache in einem Spiel, das seine Zahlen sonst belegt. Der Tag im Monat sagt
 * dasselbe und stimmt.
 */
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const longDate = computed(() => {
  const now = snapshot.value
  if (!now)
    return '1. Januar 2026'
  return `${daylight.value.dayOfMonth}. ${MONTHS[now.monthOfYear - 1]} ${now.year}`
})

/*
 * Was der Himmel macht, in einem Zeichen und einem Wort. Das Wetter schlägt die Tageszeit: um zwei
 * an einem Novembernachmittag ist die interessante Tatsache, dass es regnet, nicht dass die Sonne
 * technisch oben steht.
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
  night: 'Klare Nacht',
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
  const { rain, snow, cloud, wind } = weather.value
  const phase = daylight.value.phase
  const read = (glyph: string, label: string): { glyph: string, label: string } => ({ glyph, label })
  const look = snow > 0.08
    ? read('lucide:cloud-snow', snow > 0.5 ? 'Schneefall' : 'Leichter Schnee')
    : rain > 0.08
      ? read(rain > 0.5 ? 'lucide:cloud-rain' : 'lucide:cloud-drizzle', rain > 0.5 ? 'Regen' : 'Nieselregen')
      : wind > 0.62
        ? read('lucide:wind', 'Windig')
        : cloud > 0.78
          ? read('lucide:cloudy', 'Bedeckt')
          : cloud > 0.52
            ? read('lucide:cloud-sun', 'Wechselnd bewölkt')
            : read(SUN_GLYPHS[phase] ?? 'lucide:sun', PHASE_LABELS[phase] ?? '')
  return {
    ...look,
    temperature: `${formatNumber(weather.value.temperature, 0)} °C`,
    isNight: phase === 'night',
  }
})

/**
 * Was der große Knopf sagt — dasselbe, was er tut.
 *
 * Er sagte „Nächstes Ereignis" auch dann, wenn längst eines auf dem Tisch lag und die Uhr deshalb
 * stand. Genau in dem Zustand landet der Spieler nach jedem Laden und nach jedem Zeitraffer.
 */
const advanceLabel = computed(() => {
  if (nextAction.value === 'decide')
    return 'Vorlage öffnen'
  if (!canAdvance.value)
    return 'Kampagne beendet'
  return skipping.value ? 'Anhalten' : 'Nächstes Ereignis'
})

/** Warum die Uhr steht, in den Worten des Spiels. Stille sieht aus wie ein Absturz. */
const pauseReason = computed(() => {
  if (snapshot.value?.defeat)
    return 'Kampagne beendet'
  if (pendingDecisions.value.length > 0)
    return 'Vorlage wartet'
  return 'Pausiert'
})

const saved = computed(() => saveStatus.value.startsWith('Gespeichert'))

/*
 * Beide Schubladen geben Laut, weil sie etwas auf- und zumachen — dieselben zwei Klänge, die das
 * Lagebild schon hatte, als es sich noch selbst ein- und ausklappte.
 */
/**
 * Hinein ins Begehen und wieder heraus.
 *
 * Derselbe Klang wie beim Öffnen einer Schublade: es ist dieselbe Art von Handlung — eine andere
 * Sicht auf dieselbe Stadt, kein Eingriff in sie.
 */
function toggleWalking(): void {
  game.walking = !walking.value
  sound.play(game.walking ? 'hud.railExpanded' : 'hud.railCollapsed')
  /*
   * Wer die Stadt begeht, will sie sehen.
   *
   * Aus der Karte heraus sind die beiden Schubladen ein Drittel des Bildes über einer Stadt, die man
   * ohnehin von oben überblickt. Auf Augenhöhe stehen sie vor der Straße, in die man gerade
   * hineingelaufen ist. Sie gehen zu und beim Verlassen nicht von selbst wieder auf — was jemand
   * zugemacht hat, macht das Spiel nicht hinter seinem Rücken wieder auf.
   */
  if (game.walking) {
    game.railOpen = false
    game.decisionsOpen = false
  }
}

function toggleRail(): void {
  game.railOpen = !railOpen.value
  sound.play(game.railOpen ? 'hud.railExpanded' : 'hud.railCollapsed')
}

function toggleDecisions(): void {
  game.decisionsOpen = !decisionsOpen.value
  sound.play(game.decisionsOpen ? 'hud.railExpanded' : 'hud.railCollapsed')
}
</script>

<template>
  <div class="deck">
    <!-- Wer du bist. Und die zwei Knöpfe, die zur Sitzung gehören und nicht zur Stadt. -->
    <section class="pod identity" aria-label="Amtsinhaberin">
      <span class="wordmark">20<span>36</span></span>
      <div class="who">
        <h1>Lindenhafen</h1>
        <p>
          <span v-if="leader" class="lead">{{ leader }}</span>
          <span v-if="party" class="affil"><i class="party-dot" :style="{ background: party.color }" /> {{ party.abbreviation }}</span>
        </p>
      </div>
      <div class="session">
        <button type="button" class="round round--sm" :class="{ 'is-on': saved }" :title="saveStatus" aria-label="Spielstand speichern" @click="game.save">
          <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
            <path v-if="saved" d="m5 12.5 4.5 4.5L19 7.5" />
            <template v-else>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </template>
          </svg>
        </button>
        <button type="button" class="round round--sm" aria-label="Einstellungen" @click="settings.openSettings()">
          <Icon name="lucide:settings" />
        </button>
      </div>
    </section>

    <!-- Wie du stehst. -->
    <section v-if="snapshot" class="pod standing" aria-label="Rückhalt und Koalition">
      <div v-if="support !== null" class="row">
        <span class="cap">Rückhalt</span>
        <span class="v">
          {{ formatNumber(support * 100, 1) }}<small>%</small>
          <!--
            Die Richtung als gezeichnete Form mit ihrem Wort daneben, nie als Zeichen und nie nur
            als Farbe. Siehe DESIGN.md, „Icons werden gezeichnet".
          -->
          <template v-if="direction !== 0">
            <svg viewBox="0 0 24 24" class="drift" :class="direction > 0 ? 'up' : 'down'" aria-hidden="true">
              <path v-if="direction > 0" d="M12 19V5m0 0-6 6m6-6 6 6" />
              <path v-else d="M12 5v14m0 0 6-6m-6 6-6-6" />
            </svg>
            <em>{{ direction > 0 ? 'steigt' : 'fällt' }}</em>
          </template>
        </span>
      </div>
      <div class="row">
        <span class="cap">Koalition</span>
        <span class="v">{{ snapshot.coalitionSupport }}<small>von 60</small></span>
      </div>
      <!--
        Die fehlende Mehrheit auf eigener Zeile.

        Im Label hinter „Koalition" gehängt brach sie den Körper auf schmalen Fenstern auf drei
        Zeilen um — gemessen bei 1.200 px. Als eigene Zeile über die volle Breite steht sie bei jeder
        Breite ruhig, und sie ist ohnehin eine Aussage über die Lage und keine über das Wort daneben.
      -->
      <p v-if="!hasMajority" class="warn">
        ohne Mehrheit
      </p>
      <!--
        Das Jahrzehnt als Rinne unter den beiden Zahlen: elf Jahre sind der Rahmen, in dem beide
        gelten, und es kostet vier Pixel, das zu sagen.
      -->
      <div class="decade groove" :title="`Monat ${snapshot.month} von 131`">
        <i :style="{ width: `${decade}%` }" />
      </div>
    </section>

    <!-- Die Zeit. Das Größte auf dem Schirm, weil alles andere an ihr hängt. -->
    <section class="pod when" aria-label="Datum und Uhrzeit">
      <span class="clock">{{ clock }}</span>
      <div class="r">
        <span class="date">
          {{ longDate }}
          <b v-if="speed === 0 && canAdvance" class="halt">{{ pauseReason }}</b>
        </span>
        <span class="wx">
          <Icon :name="sky.glyph" class="sky-glyph" :class="{ 'is-night': sky.isNight }" :aria-label="sky.label" />
          <b class="temp">{{ sky.temperature }}</b> <span class="word">{{ sky.label }}</span>
        </span>
      </div>
    </section>

    <!-- Was du drückst. -->
    <section class="pod controls" aria-label="Zeitsteuerung">
      <button type="button" class="round" title="Zurück zur Gesamtansicht" aria-label="Zurück zur Gesamtansicht" @click="game.showOverview">
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
          <path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4" /><circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      <div class="segs groove" role="group" aria-label="Geschwindigkeit">
        <button
          v-for="value in [1, 2, 4] as const"
          :key="value"
          type="button"
          :class="{ 'is-on': speed === value }"
          :aria-pressed="speed === value"
          :title="speed === value ? 'Anhalten' : `${value}-fache Geschwindigkeit`"
          @click="game.setSpeed(speed === value ? 0 : value)"
        >
          {{ `${value}×` }}
        </button>
      </div>

      <!--
        „Nächstes Ereignis" statt „Nächster Monat": ein Monat dauert fünf reale Minuten, eine
        Kampagne also elf Stunden. Der Knopf läuft, bis das Spiel den Spieler braucht, und hält von
        selbst an — er überspringt nie mehr Zeit als nötig.
      -->
      <button
        type="button"
        class="btn advance"
        :class="{ 'is-skipping': skipping }"
        :disabled="!canAdvance && nextAction !== 'decide'"
        @click="game.skipToEvent"
      >
        {{ advanceLabel }}
      </button>

      <!--
        Zu Fuß durch die Stadt.

        Steht bei der Gesamtansicht und nicht bei den Schubladen, weil es dasselbe ist wie sie: eine
        Art, die Stadt anzusehen. Was gebaut wurde — Türen, Treppen, Markisen — ist aus der Karte
        bestenfalls ein Pixel und auf Augenhöhe ein Ort.
      -->
      <button
        type="button"
        class="round"
        :class="{ 'is-on': walking }"
        :aria-pressed="walking"
        :aria-label="walking ? 'Begehen beenden' : 'Stadt begehen'"
        :title="walking ? 'Begehen beenden' : 'Stadt begehen · WASD gehen, Leertaste springen, Maus schauen'"
        @click="toggleWalking"
      >
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
          <circle cx="13" cy="4" r="2" /><path d="M11 21l1.5-6-3-2.5V8l4-1.5 3 3 3 1M9.5 21l2-4.5" />
        </svg>
      </button>

      <span class="divider" />

      <button
        type="button"
        class="round"
        :class="{ 'is-on': railOpen }"
        :aria-pressed="railOpen"
        :aria-label="railOpen ? 'Lagebild schließen' : 'Lagebild öffnen'"
        title="Lagebild"
        @click="toggleRail"
      >
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
      </button>

      <button
        type="button"
        class="round"
        :class="{ 'is-on': decisionsOpen }"
        :aria-pressed="decisionsOpen"
        :aria-label="decisionsOpen ? 'Vorlagen schließen' : 'Vorlagen öffnen'"
        title="Vorlagen"
        @click="toggleDecisions"
      >
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
          <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
        <span v-if="pendingDecisions.length > 0" class="badge">{{ pendingDecisions.length }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.deck {
  position: absolute; right: 34px; bottom: 36px; left: 34px; z-index: 6;
  display: flex; align-items: flex-end; gap: 14px;
  pointer-events: none;
}
/*
 * Kein Körper darf aus dem Bild laufen.
 *
 * Genau das ist passiert: vier Körper mit fester Breite ergaben zusammen mehr als das Fenster, und
 * der letzte — ausgerechnet der mit den Knöpfen — wurde rechts abgeschnitten. Jetzt darf jeder
 * schrumpfen, die Bedienung rechts als letzter, und wo der Platz wirklich eng wird, gehen die
 * Körper der Reihe nach, die am wenigsten gebraucht werden.
 */
.deck > .pod { flex: 0 1 auto; min-width: 0; pointer-events: auto; }
/*
 * Zwei Körper geben nicht nach: die Bedienung rechts, und die Identität links.
 *
 * Wenn alle vier gleichmäßig schrumpfen, trifft es zuerst den einzigen, der Fließtext enthält — und
 * das Ergebnis war „Lindenh…" neben einem „M…" für die Amtsinhaberin. Ein abgeschnittener Stadtname
 * ist keine Stadt. Der Druck geht jetzt auf den Stand und die Zeit, die beide aus Zahlen bestehen
 * und dafür feste Plätze haben; was die Identität abgibt, gibt sie in Stufen ab (siehe unten).
 */
.deck > .identity, .deck > .controls { flex: none; }

/* --- Wer du bist --------------------------------------------------------- */

.identity { display: flex; align-items: center; gap: 18px; height: 96px; padding: 0 18px 0 24px; overflow: hidden; }
.wordmark {
  font-family: var(--display); font-size: 33px; font-weight: 700; letter-spacing: -0.045em; line-height: 1;
}
.wordmark span { opacity: 0.34; }
.who { min-width: 0; }
.who h1 {
  margin: 0; overflow: hidden; font-family: var(--display); font-size: 17px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap;
}
.who p {
  display: flex; gap: 8px; margin: 5px 0 0; overflow: hidden; color: var(--ink-2); font-size: 13px; white-space: nowrap;
}
.who .lead { overflow: hidden; text-overflow: ellipsis; }
.who .affil { flex: none; color: var(--ink-3); }

.session { display: flex; gap: 8px; padding-left: 16px; margin-left: 2px; box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.07); }
.round--sm { width: 38px; height: 38px; }
.round--sm :deep(svg), .round--sm svg { width: 16px; height: 16px; }

/* --- Wie du stehst ------------------------------------------------------- */

/*
 * Schmaler werden statt verschwinden.
 *
 * Der Körper war 268 px breit und fest, und unter 1620 px Fensterbreite wurde er ausgeblendet — also
 * auf so gut wie jedem Laptop. Damit waren Rückhalt, Mehrheit und der Stand im Jahrzehnt im
 * normalen Spiel **nie zu sehen**, und das sind die drei Zahlen, um die das ganze Spiel geht. Jetzt
 * ist er so breit wie sein Inhalt, gibt unter Druck zuerst die Rinne und dann die Beschriftungen
 * ab, und geht erst, wenn das Fenster wirklich schmal ist.
 */
/*
 * Die Mindestbreite steht als `.deck > .standing`, nicht als `.standing`.
 *
 * `.deck > .pod` setzt `min-width: 0`, damit überhaupt etwas nachgeben kann — und schlägt mit seiner
 * höheren Spezifität jede Mindestbreite, die nur an der Klasse hängt. Gemessen quetschte sich der
 * Körper dadurch auf 116 px, und „Koalition ohne Mehrheit" brach auf drei Zeilen um.
 */
.standing { display: grid; align-content: center; gap: 9px; height: 96px; padding: 0 20px; }
.deck > .standing { min-width: 172px; }
.row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.cap { color: var(--ink-3); font-size: 11.5px; }
.warn { margin: -3px 0 0; color: var(--negative); font-size: 11.5px; white-space: nowrap; }
.v {
  display: flex; align-items: baseline; gap: 7px;
  font-family: var(--mono); font-size: 17px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  /* „26" und „von 60" sind eine Angabe. Umgebrochen liest man zwei. */
  white-space: nowrap;
}
.v small { color: var(--ink-3); font-size: 12px; }
.v .drift { width: 13px; height: 13px; flex: none; align-self: center; stroke-width: 2.4; }
.v .drift.up { color: var(--positive); }
.v .drift.down { color: var(--negative); }
/* Das Wort gehört dazu, steht aber nur für Vorlesewerkzeuge da: der Pfeil sagt es dem Auge. */
.v em {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}

.decade { position: relative; height: 3px; margin-top: 2px; overflow: hidden; }
.decade i { position: absolute; inset: 0 auto 0 0; background: rgba(244, 242, 236, 0.5); border-radius: 999px; }

/* --- Die Zeit ------------------------------------------------------------ */

.when { display: flex; align-items: center; gap: 22px; height: 96px; padding: 0 28px; margin: 0 auto; }
.r { min-width: 0; }
.clock {
  font-family: var(--mono); font-size: 46px; font-weight: 200; font-variant-numeric: tabular-nums;
  letter-spacing: -0.055em; line-height: 1;
}
.r { display: grid; gap: 7px; }
.date { display: flex; align-items: center; gap: 10px; color: var(--ink-2); font-size: 13px; white-space: nowrap; }
/*
 * Eine Kampagne, die sich selbst angehalten hat, muss angehalten aussehen — Stille ist von einem
 * Absturz nicht zu unterscheiden. Das Wort steht bei der Uhr, weil es über die Zeit etwas sagt, und
 * fortgesetzt wird mit derselben Geschwindigkeit, die daneben liegt.
 */
.halt {
  flex: none; padding: 3px 10px; border-radius: 999px;
  background: rgba(255, 143, 107, 0.14); color: var(--negative); font-size: 11.5px; font-weight: 400;
  box-shadow: inset 0 0 0 1px rgba(255, 143, 107, 0.26);
}
.wx { display: flex; align-items: center; gap: 8px; color: var(--ink-3); font-size: 12.5px; white-space: nowrap; }
.wx b { color: var(--ink-2); font-family: var(--mono); font-size: 13.5px; font-weight: 400; }
.wx :deep(svg) { width: 17px; height: 17px; flex: none; color: var(--sun); }
.wx :deep(svg.is-night) { color: var(--moon); }

/* --- Was du drückst ------------------------------------------------------ */

.controls { display: flex; align-items: center; gap: 14px; height: 96px; padding: 0 18px; }
.divider { width: 2px; height: 30px; margin: 0 4px; background: rgba(255, 255, 255, 0.07); border-radius: 2px; }

.segs { display: flex; align-items: center; gap: 2px; padding: 4px; }
.segs button {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 42px; height: 38px; border: 0; border-radius: 999px; background: none; cursor: pointer;
  color: var(--ink-3); font-family: var(--mono); font-size: 13px; font-weight: 400;
}
.segs button:hover { color: var(--ink-2); }
.segs button.is-on {
  background: linear-gradient(180deg, #fbf9f4 0%, #e8e4da 100%); color: #0b0f12;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 4px 10px -3px rgba(0, 0, 0, 0.6);
}

.advance { flex: none; white-space: nowrap; }
/*
 * Während der Zeitraffer läuft, ist der Knopf die Bremse und nicht mehr das Gaspedal — also muss er
 * anders aussehen. Ein Puls, weil etwas läuft; kein Farbwechsel ins Warnende, weil nichts falsch ist.
 */
.advance.is-skipping { animation: skipping-pulse 1.1s ease-in-out infinite; }
@keyframes skipping-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.66; } }

/*
 * Die Reihenfolge, in der etwas weicht — und was nie weicht.
 *
 * Zuerst gehen Ausschmückungen: die Rinne unter den beiden Zahlen, das Wetterwort, der Name der
 * Amtsinhaberin. Dann erst geht ein ganzer Körper. **Die beiden Knöpfe in der Identität bleiben
 * immer**: sie waren unter 1320 px ausgeblendet, und weil es sonst nirgends im laufenden Spiel einen
 * Weg zu Einstellungen oder zum Speichern gibt, war beides auf einem schmalen Fenster schlicht nicht
 * erreichbar. Die Uhr geht nie.
 */
@media (max-width: 1480px) {
  /* Erst die Luft zwischen den Körpern und in der Bedienung, dann erst Inhalt. */
  .deck { gap: 10px; }
  .controls { gap: 10px; padding: 0 14px; }
  .deck > .standing { min-width: 158px; }
  .standing { padding: 0 16px; }
  .standing .decade { display: none; }
  .when { gap: 16px; padding: 0 22px; }
  .when .clock { font-size: 40px; }
  .identity { gap: 13px; padding: 0 14px 0 18px; }
  .identity .wordmark { font-size: 28px; }
  /* Der Name der Amtsinhaberin geht vor dem Namen der Stadt: „Lindenh…" ist keine Stadt. */
  .identity .who .lead { display: none; }
}
@media (max-width: 1280px) {
  /*
   * Ab hier gibt auch die Bedienung nach — vorher wurde sie nie kleiner, und der Rest des Decks
   * musste ihre 508 px allein tragen: gemessen blieben dem Stand 157 px, „26 von 60" brach um und
   * das Wort neben der Uhr wurde beschnitten. Kleinere Knöpfe sind besser als abgeschnittene Zahlen.
   */
  .controls { gap: 8px; padding: 0 12px; }
  .controls .round { width: 40px; height: 40px; }
  .controls .round :deep(svg), .controls .round svg { width: 17px; height: 17px; }
  .segs button { min-width: 36px; height: 34px; }
  .controls .divider { margin: 0 2px; }
  .deck > .standing { min-width: 146px; }
  .when .r .wx .word { display: none; }
  .when .r .date { font-size: 12px; }
  .standing .cap { font-size: 11px; }
  .standing .v { font-size: 15px; }
  .identity .who { display: none; }
}
/*
 * Unter 1180 px geht der Stand — nicht, weil er unwichtig wäre, sondern weil ab hier sonst die Uhr
 * und das Datum beschnitten würden, und die Uhr geht nie.
 */
@media (max-width: 1180px) {
  .standing { display: none; }
}
@media (max-width: 1080px) {
  .when .clock { font-size: 34px; }
}
</style>
