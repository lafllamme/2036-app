import type {
  BuildingRecord,
  CampaignGoalId,
  CampaignLeader,
  DistrictId,
  EventDefinition,
  LeaderBackgroundId,
  NewsItem,
  PartyId,
  PartyVote,
  SaveGame,
  SaveSummary,
  SimulationCommand,
  SimulationMessage,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '~/core/contracts'
import type { RendererStats } from '~/rendering/CityRenderer'
import type { ScreenPoint } from '~/rendering/screen'
import type { PersonAt } from '~/rendering/world/traffic/agents'
import type { Citizen } from '~/world/citizens'
import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { getEvent } from '~/content/events'
import { getPolicy } from '~/content/policies'
import { CAMPAIGN_LAST_MONTH, isCampaignComplete } from '~/core/campaign'
import { formatClock, readDaylight } from '~/core/daylight'
import { debugFlags } from '~/core/debug'
import { weatherAt } from '~/core/weather'
import { initialSupport } from '~/simulation/electorate'
import { citizenAt } from '~/world/citizens'
import { leaningOf } from '~/world/leaning'
import { createCityReports } from './cityReports'
import { clearSummary, readSave, readSummary, writeSave } from './saveStore'

const MONTH_DURATION_MS = 300_000
/**
 * Wie schnell der Zeitraffer läuft, als Vielfaches der einfachen Geschwindigkeit.
 *
 * Zwanzigfach heißt: ein Monat in fünfzehn Sekunden. Schnell genug, dass Warten sich nicht nach
 * Warten anfühlt, langsam genug, dass man Tag und Nacht über die Stadt ziehen sieht und merkt, wie
 * viel von einem Jahrzehnt man gerade verbraucht.
 */
const SKIP_SPEED = 20
export type ExperienceStage = 'title' | 'leader' | 'partyHall' | 'partyProfile' | 'manifesto' | 'intro' | 'gameplay'

export const useGameStore = defineStore('game', () => {
  /** The one seed the city, its weather and every save are built from. */
  const CITY_SEED = 2036

  const snapshot = shallowRef<SimulationSnapshot | null>(null)
  const selectedBuilding = shallowRef<BuildingRecord | null>(null)
  const selectedNews = shallowRef<NewsItem | null>(null)
  const rendererStats = shallowRef<RendererStats | null>(null)
  const experienceStage = ref<ExperienceStage>('title')
  const openDecisionId = ref<string | null>(null)
  /**
   * Die Abstimmungsergebnisse, die noch gezeigt werden müssen — eines nach dem anderen.
   *
   * Eine Warteschlange, seit der Rat einmal im Monat tagt und dabei bis zu drei Vorlagen abstimmt.
   * Vorher war es immer genau eins, weil jede Abstimmung für sich stattfand; drei Ergebnisse
   * gleichzeitig übereinanderzulegen wäre ein Stapel, dessen oberstes Blatt alle Klicks schluckt.
   */
  const voteQueue = shallowRef<VoteResult[]>([])
  const lastVoteResult = computed(() => voteQueue.value[0] ?? null)
  const forecasts = shallowRef<Record<string, VoteForecast>>({})
  const selectedPartyId = ref<PartyId | null>(null)
  /**
   * Die drei Ziele, an denen dieses Jahrzehnt gemessen wird.
   *
   * Hießen „Prioritäten" und waren weiche Schwerpunkte: man wählte drei, und am Ende stand nirgends,
   * ob man sie erreicht hatte. Jetzt sind es Schwellen, die im Dezember 2036 gelten oder nicht.
   */
  const selectedGoalIds = ref<CampaignGoalId[]>([])
  /**
   * Wer den Vorsitz übernimmt.
   *
   * Man wählte eine Fraktion und war dann niemand: das Spiel sprach von „der eigenen Partei" und nie
   * von einem Menschen. Der Name steht jetzt im Lagebild und im Abschlussbericht, und der Werdegang
   * bringt mit, was man aus dem vorigen Leben mitnimmt.
   */
  const leaderName = ref('')
  const leaderBackgroundId = ref<LeaderBackgroundId | null>(null)
  const leader = computed<CampaignLeader | null>(() =>
    leaderName.value.trim().length > 0 && leaderBackgroundId.value !== null
      ? { name: leaderName.value.trim(), backgroundId: leaderBackgroundId.value }
      : null)
  /*
   * The campaign runs as soon as the player enters the city. Starting paused made the clock and the
   * sky look broken: nothing moved until you found the speed buttons. A raised motion still pauses
   * on its own, which is the only moment the game should stop by itself.
   */
  const speed = ref<0 | 1 | 2 | 4>(1)
  /**
   * Läuft der Zeitraffer bis zum nächsten Ereignis?
   *
   * Der Knopf hieß „Nächster Monat" und war damit das Gegenteil dessen, wofür er da war. Ein Monat
   * dauert fünf reale Minuten; eine Kampagne über 132 Monate also elf Stunden bei einfacher
   * Geschwindigkeit — oder **zehn Minuten**, wenn man nur diesen Knopf drückt. Er war der
   * Unterschied zwischen einem Spiel und einem Durchklicken, und er saß als prominentester Knopf in
   * der Leiste.
   *
   * Gefragt war er trotzdem, denn die Beschwerde dahinter stimmt: wer fertig entschieden hat, will
   * nicht warten. Nur ist die Antwort darauf nicht „überspring einen Monat", sondern **„lauf, bis
   * mich etwas braucht"**. Das überspringt nie mehr Zeit als nötig, und es kann nichts überspringen,
   * weil es von selbst anhält.
   *
   * Sichtbar und nicht als Schnitt: die Uhr läuft hoch, Tag wird Nacht, die Stadt rendert weiter. In
   * einer Simulation über zehn Jahre ist das Vergehen der Zeit der Punkt und kein Ladebalken — und
   * einen Zeitraffer, den man ansieht, drückt man nicht so gedankenlos weg wie einen Knopf, der
   * sofort springt.
   */
  const skipping = ref(false)
  /** The speed to go back to once whatever interrupted the player is out of the way. */
  let heldSpeed: 0 | 1 | 2 | 4 = 0

  /** The news bar's own list, which follows calls from raised to over. See `cityReports.ts`. */
  const { cityReports, selectedReport, reportIncident, prune: pruneReports, clear: clearReports } = createCityReports()
  /*
   * Bumped when the player asks to be taken back to the view of the whole city. The store cannot
   * hold a camera — nothing here may know the renderer exists — so it holds the request and the
   * canvas component, which does own one, watches it.
   */
  const overviewRequest = ref(0)

  /**
   * Whoever the player has picked out of the street.
   *
   * Derived on demand from their number and the city's own share of families from elsewhere, so
   * nobody is stored and everybody is the same person every time they are asked about. It is a
   * reading and never an input: nothing the simulation does is changed by having looked.
   */
  const selectedCitizen = shallowRef<(Citizen & { x: number, z: number, leaning: PartyId }) | null>(null)

  function selectPerson(person: PersonAt | null): void {
    if (!person) {
      selectedCitizen.value = null
      return
    }
    const share = snapshot.value?.cityVisuals.originMix ?? 0
    const citizen = citizenAt(person.citizen, CITY_SEED, share)
    /*
     * Who this person would vote for, today. Their own position is fixed for life and derived from
     * who they are; which party it lands on also depends on how the city is currently leaning, so
     * the same person can answer differently in 2031 than in 2026 without having changed their mind.
     */
    const leaning = leaningOf(citizen, person.citizen, CITY_SEED, snapshot.value?.support ?? initialSupport())
    selectedCitizen.value = { ...citizen, leaning, x: person.x, z: person.z }
  }
  /**
   * Where the player has asked to be taken.
   *
   * Same shape as `overviewRequest` and for the same reason: the store may not hold a camera, so it
   * holds the request and the canvas, which does own one, watches it. Replaced rather than mutated
   * so that asking twice for the same place still fires.
   */
  const focusRequest = shallowRef<{ x: number, z: number, at: number } | null>(null)

  function focusOnPlace(x: number, z: number): void {
    focusRequest.value = { x, z, at: Date.now() }
  }

  /**
   * Whether the two side panels are open.
   *
   * They used to be permanently open and together covered most of the city — which is the thing the
   * player is meant to be looking at. Both fold to their headers now, and the decisions panel starts
   * folded when there is nothing to decide, so the screen is only as full as the month is busy.
   */
  /**
   * Zu Fuß in der Stadt statt über ihr.
   *
   * Nur ein Schalter: was er bewirkt, steht in `rendering/firstPerson.ts`. Der Store weiß davon
   * nichts weiter, weil es eine Kamerasache ist und keine Spielregel — die Stadt läuft weiter,
   * während jemand darin herumläuft.
   */
  const walking = ref(false)
  /**
   * Wo der Fußgänger steht, für die Anzeige.
   *
   * An dieser Stelle sind zwei Reparaturen ins Leere gegangen, weil „sieht komisch aus" und „stecke
   * fest" für ein halbes Dutzend Ursachen gleich aussehen. Drei Zahlen im Bild unterscheiden sie.
   */
  const walkState = shallowRef<{ x: number, z: number, ground: number, eye: number, stuck: boolean, refused: number } | null>(null)

  /**
   * Wo ein Ort der Stadt gerade auf dem Schirm liegt — oder nichts, solange keine Stadt da ist.
   *
   * Eine Funktion im Store, und das ist hier Absicht statt Nachlässigkeit. Der Renderer gehört
   * `CityCanvas`, und alles, was seine Kamera braucht, müsste sonst durch dieselbe Komponente
   * gereicht werden — die Marken über der Stadt liegen aber woanders im Dokument, weil sie über
   * allem stehen. `shallowRef`, damit Vue nicht versucht, eine Funktion reaktiv zu machen.
   */
  const project = shallowRef<((x: number, y: number, z: number, out: ScreenPoint) => ScreenPoint) | null>(null)

  /**
   * Beide Schubladen fangen **zu** an.
   *
   * Offen deckten sie zusammen ein gutes Drittel des Bildes ab, und zwar vom ersten Augenblick an:
   * man kam aus dem Einstieg und sah zwei Tabellen statt einer Stadt. Zu heißt, dass die Stadt der
   * erste Eindruck ist und die Zahlen das sind, was man **holt** — und die Einarbeitung zeigt genau
   * das als Erstes, statt einen Zustand zu erklären, der schon da war.
   *
   * Aufgehen tun sie trotzdem von selbst, wenn der Rat eine Vorlage auf den Tisch legt: das steht in
   * `DecisionPanel.vue` und gilt weiter. Ein zugeklappter Posteingang wäre keine Ruhe, sondern ein
   * verpasster Termin.
   */
  /**
   * Welcher Brennpunkt gerade offen ist.
   *
   * Im Store und nicht in der Markenebene, weil zwei Stellen ihn aufmachen: die Marke auf der Karte
   * und die Gebäudekarte. Ein Ort hat eine Lage, und beide Wege müssen auf dieselbe zeigen.
   */
  const openHotspotId = ref<string | null>(null)

  /**
   * Welche Bezirkskennzahl gerade über der Karte liegt — oder keine.
   *
   * Miete, Einbrüche und Leerstand gelten seit gestern je Bezirk, und man sah sie **nur**, wenn man
   * zufällig ein Haus anklickte. Die Standortwahl fragt aber „Hafen, Vorstadt oder Gründerzeit?“ —
   * eine Entscheidung ohne die Information, die sie beantwortet.
   */
  const overlay = ref<'none' | 'averageRent' | 'burglaryRate' | 'vacantUnits'>('none')

  const railOpen = ref(false)
  const decisionsOpen = ref(false)

  const ready = ref(false)
  const error = ref<string | null>(null)
  const saveStatus = ref('Nicht gespeichert')
  /**
   * The campaign waiting on this machine, if any.
   *
   * Null until `refreshSavedGame` is called from the client, and not read here: the store is created
   * during server rendering, where there is no localStorage, and Pinia then hydrates the client with
   * the server's value — so anything read during setup is overwritten by the server's null a moment
   * later, and the title screen offers a new campaign over a saved one.
   */
  const savedGame = ref<SaveSummary | null>(null)

  function refreshSavedGame(): void {
    savedGame.value = readSummary()
  }

  /**
   * Der Messstand geht an der Kampagne vorbei.
   *
   * Mit `?bench` landet man ohne Einstiegsablauf in der Stadt, und die Uhr steht. Das ist nicht
   * bequemer, sondern die Voraussetzung dafür, dass eine Messung etwas bedeutet: bei laufender Uhr
   * springt irgendwann eine Vorlage auf, verdeckt die halbe Stadt und hält den Renderer an — dann
   * misst man ein anderes Bild als das, das man messen wollte. Ohne Monatswechsel gibt es keine
   * Ereignisse, also braucht es dafür keinen zweiten Schalter.
   *
   * Wird **nach dem Mounten** gerufen und nicht im Setup, aus demselben Grund wie `refreshSavedGame`:
   * der Store entsteht schon beim Server-Rendern, und Pinia überschreibt danach den Client-Zustand
   * mit dem des Servers. Im Setup gesetzt, stand eine Sekunde später wieder der Titelbildschirm da —
   * gemessen `stage: 'title'`, `speed: 1`, obwohl der Zweig nachweislich gelaufen war.
   *
   * Partei und Ziele sind gesetzt, weil die Stadt sonst nicht baut; welche es sind, ist für ein Bild
   * ohne Belang.
   */
  function enterBench(): void {
    if (!debugFlags().bench)
      return
    selectedPartyId.value = 'gruene'
    selectedGoalIds.value = ['affordable-rent', 'bound-stock', 'nobody-outside']
    leaderName.value = 'Messfahrt'
    leaderBackgroundId.value = 'administration'
    /*
     * Und der Simulation dasselbe sagen — daran ist der Messstand ein halbes Jahr lang vorbeigelaufen.
     *
     * Die vier Zeilen darüber setzen den **Client**: die Oberfläche zeigte GRÜNE, bot die
     * GRÜNEN-Vorlagen an und sah in jeder Hinsicht aus wie ein laufendes Spiel. Der Worker war aber
     * mit `INIT` ohne Partei gestartet und blieb dabei — also **0 von 60 Sitzen**, jede Abstimmung
     * gegen eine Fraktion, die es nicht gibt, und jede Vorlage abgelehnt.
     *
     * Ein Messstand, der ein anderes Spiel misst als das, das er anzeigt, ist schlimmer als keiner:
     * Vorlagen, Abstimmungen und alles, was daran hängt, waren dort nie zu prüfen. `enterCity` macht
     * es seit jeher richtig; hier fehlte genau diese eine Zeile.
     */
    reset()
    experienceStage.value = 'gameplay'
    speed.value = 0
  }
  /*
   * True while the worker owes us a snapshot. It drives the waiting sound and is the honest place
   * for a future progress indicator; forecasts are excluded because they never commit a month.
   */
  const pendingCommand = ref(false)
  /*
   * The simulation worker, the clock and IndexedDB are browser-only. The store itself is created
   * during server rendering because the entry flow reads from it, so everything that touches a
   * browser API is created behind `import.meta.client` and the rest of the store degrades to an
   * empty snapshot on the server.
   */
  let worker: Worker | null = null
  let accumulatedMs = 0
  /**
   * Who is waiting for the worker's copy of the state.
   *
   * The worker speaks in messages, not promises, so a save is two halves: `save` asks and parks a
   * resolver here, and `receive` finds it when the answer arrives.
   */
  let pendingSave: ((payload: SaveGame) => void) | null = null
  /**
   * How far the campaign has travelled through the current month, 0 … 1. A month is a day, so this
   * is also the time of day. It is derived from simulation progress rather than from a render timer,
   * which is what makes the clock and the sky stop when the player pauses.
   */
  const monthProgress = ref(0)
  let previousTime = 0

  const send = (command: SimulationCommand): void => {
    if (command.type !== 'REQUEST_FORECAST')
      pendingCommand.value = true
    worker?.postMessage(command)
  }

  const receive = ({ data }: MessageEvent<SimulationMessage>) => {
    if (data.type === 'ERROR') {
      error.value = data.message
      speed.value = 0
      pendingCommand.value = false
      return
    }
    if (data.type === 'FORECAST') {
      forecasts.value = data.forecasts
      return
    }
    if (data.type === 'SAVE_STATE') {
      /*
       * A save answers a command like any other, and forgetting to say so here is what made the
       * interface's "still working" loop the sound that never stopped. `REQUEST_SAVE` raised the
       * flag, this branch returned without lowering it, and the campaign saves itself at the turn of
       * every month — so a few hundred milliseconds after the first month ended, a looping cue that
       * the mixer deliberately never ducks started and had nothing left that could stop it.
       */
      pendingCommand.value = false
      /*
       * And lets the clock go, which is the other half of the same lesson.
       *
       * Every path that lowers this flag has to offer the clock back, or the campaign strands on
       * whichever one forgot. This one forgot, and the symptom was precise: pressing "nächster
       * Monat" stopped the game every single time, while voting — which does not always turn the
       * month — mostly did not.
       */
      resumeIfClear()
      const deliver = pendingSave
      pendingSave = null
      deliver?.({
        schemaVersion: 2,
        contentVersion: 'vertical-slice-1',
        citySeed: CITY_SEED,
        partyId: selectedPartyId.value ?? undefined,
        goalIds: [...selectedGoalIds.value],
        leader: leader.value,
        state: data.state,
        snapshot: data.snapshot,
        savedAt: new Date().toISOString(),
      })
      return
    }
    if (data.type === 'VOTE_RESULT')
      voteQueue.value = [...voteQueue.value, data.result]
    // Eine Sitzung bringt mehrere auf einmal; gezeigt werden sie hintereinander.
    if (data.type === 'SESSION')
      voteQueue.value = [...voteQueue.value, ...data.results]

    const previous = snapshot.value
    snapshot.value = data.snapshot
    ready.value = true
    pendingCommand.value = false

    if (isCampaignComplete(data.snapshot.month))
      speed.value = 0

    /*
     * A campaign that has ended stops. Both ways of losing — voted out at an election, or a year
     * past one of the hard edges — arrive here as `defeat` on the snapshot, and the clock has to
     * stop or the player keeps governing a city that has dismissed them.
     */
    // The store never plays a sound itself: `storeSounds.ts` watches the state and answers it.
    if (data.snapshot.defeat && !previous?.defeat)
      speed.value = 0

    // A new council motion stops the clock: the player should never miss a decision while watching.
    const known = new Set((previous?.pendingDecisions ?? []).map(entry => entry.eventId))
    const arrived = data.snapshot.pendingDecisions.find(entry => !known.has(entry.eventId))
    /*
     * Und ein gesuchter Standort hält sie genauso an.
     *
     * Das fehlte, und es hat die auffälligste Regression der letzten Runde erzeugt: eine
     * durchgegangene Bauvorlage wartet auf ihren Ort, aber nichts hielt die Uhr an und nichts öffnete
     * sich. Wer „Nächstes Ereignis“ drückte, sah Monate vorbeiziehen, in denen „irgendwas passiert“ —
     * und die Entscheidung, auf die alles wartete, stand als drei Marken auf einer Karte, die man
     * beim Zeitraffer nicht ansieht. Gemeldet als „ich kriege nicht wie vorher so eine Ansicht“, und
     * das war wörtlich richtig.
     */
    const siteWanted = Boolean(data.snapshot.pendingSiting) && !previous?.pendingSiting
    if (arrived) {
      holdClock()
      openDecisionId.value = arrived.eventId
    }
    else if (siteWanted) {
      holdClock()
      // Und die Kamera dorthin, wo die Wahl steht — sonst zeigt die Karte gerade irgendeine Ecke.
      overviewRequest.value += 1
    }
    else {
      // Nothing new to answer: if the player was only held up by their own vote, they get the clock back.
      resumeIfClear()
    }

    /*
     * Save at the turn of every month — and last, after the clock has been dealt with.
     *
     * A campaign is ten years long and a month is five minutes; asking the player to remember a
     * button is asking them to lose an afternoon. The month is the natural unit — it is what the
     * simulation actually commits — and saving on anything finer would write on every vote and
     * every negotiation for no gain.
     *
     * The ordering is the bug this line used to be. A save is a command like any other, so asking
     * for one raises `pendingCommand`; standing above the resume, it raised that flag a line before
     * the resume read it, and the resume dutifully decided the player was still waiting for
     * something. They were — for a background save they never asked for and could not see.
     */
    if (experienceStage.value === 'gameplay' && previous && data.snapshot.month !== previous.month)
      void save()
  }

  if (import.meta.client) {
    worker = new Worker(new URL('~/workers/simulation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = receive
    worker.onerror = () => {
      error.value = 'Die Simulation wurde angehalten. Lade die Stadt neu, um den letzten Stand wiederherzustellen.'
      speed.value = 0
      pendingCommand.value = false
    }
    send({ type: 'INIT', seed: CITY_SEED })

    previousTime = performance.now()
    useIntervalFn(() => {
      const now = performance.now()
      const elapsed = now - previousTime
      previousTime = now
      if (speed.value === 0 || !ready.value || isCampaignComplete(snapshot.value?.month ?? 0))
        return
      accumulatedMs += elapsed * (skipping.value ? SKIP_SPEED : speed.value)
      if (accumulatedMs >= MONTH_DURATION_MS) {
        accumulatedMs %= MONTH_DURATION_MS
        send({ type: 'ADVANCE', months: 1 })
      }
      monthProgress.value = accumulatedMs / MONTH_DURATION_MS
      pruneReports()
    }, 250)

    onScopeDispose(() => worker?.terminate())
  }

  /** The sky, the clock and the thermometer, all read from the same progress value. */
  const daylight = computed(() => readDaylight(
    snapshot.value?.monthOfYear ?? 1,
    monthProgress.value,
    // A city that has spent its green space runs warmer; see ADR-0005.
    ((21.5 - (snapshot.value?.metrics.greenSpacePerCapita ?? 21.5)) * 0.12),
  ))

  const clock = computed(() => formatClock(daylight.value.hourOfDay))

  /**
   * What the sky is doing. Read from the same month and the same progress the light is read from, so
   * a save reloaded in November is the same November — and so it stops when the player pauses.
   */
  const weather = computed(() => weatherAt(
    snapshot.value?.monthOfYear ?? 1,
    monthProgress.value,
    snapshot.value?.month ?? 0,
    CITY_SEED,
    // The season and the hour; the spell of weather adds its own swing on top of that curve.
    daylight.value.temperature,
  ))

  const currentDate = computed(() => {
    if (!snapshot.value)
      return 'JAN 2026'
    const monthNames = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ']
    return `${monthNames[snapshot.value.monthOfYear - 1]} ${snapshot.value.year}`
  })

  const campaignProgress = computed(() => Math.min(100, ((snapshot.value?.month ?? 0) / 131) * 100))
  const canAdvance = computed(() => (snapshot.value?.month ?? 0) < CAMPAIGN_LAST_MONTH)

  function showOverview(): void {
    overviewRequest.value += 1
  }

  function setSpeed(nextSpeed: 0 | 1 | 2 | 4): void {
    // Von Hand an der Geschwindigkeit drehen heißt: ich will wieder selbst fahren.
    skipping.value = false
    speed.value = canAdvance.value ? nextSpeed : 0
    heldSpeed = speed.value
  }

  /**
   * Stopping the clock for as long as something is in the player's way, and no longer.
   *
   * A motion has to stop the month — nobody should have to vote against a running clock, and a
   * decision that scrolls past unread is a decision the game took for the player. But stopping it
   * was all this did: every vote left the campaign paused for good, so after each one the player had
   * to notice the city had gone still and press play again. The speed they had chosen is held here
   * and handed back the moment the sheet and the result are both out of the way.
   *
   * A player who was already paused stays paused: `heldSpeed` is only ever set from a running clock.
   */
  function holdClock(): void {
    // Was den Spieler aufhält, beendet auch den Zeitraffer — dafür ist er da.
    skipping.value = false
    if (speed.value !== 0)
      heldSpeed = speed.value
    speed.value = 0
  }

  /** Was der Rat gerade offen hat. Gebraucht schon hier, weil der große Knopf daran hängt. */
  const pendingDecisions = computed(() => snapshot.value?.pendingDecisions ?? [])

  /**
   * Was der große Knopf gerade zu tun hat.
   *
   * Es gibt drei Zustände, und er muss in allen dreien in dieselbe Richtung zeigen — nach vorn:
   *
   * - **Eine Vorlage wartet.** Dann steht die Zeit absichtlich still, und das Nächste, was zu tun
   *   ist, ist diese Vorlage. Hier lag der Fehler: der Knopf sagte trotzdem „Nächstes Ereignis" und
   *   hätte beim Drücken über das hinweggerast, was gerade auf dem Tisch liegt. Der prominenteste
   *   Knopf der Leiste zeigte in genau dem Zustand, in dem der Spieler landet, in die falsche
   *   Richtung — und die stehende Uhr daneben liest sich dann wie ein Absturz.
   * - **Der Zeitraffer läuft.** Dann ist er die Bremse.
   * - **Sonst.** Dann läuft er bis zum nächsten Ereignis.
   */
  const nextAction = computed<'decide' | 'site' | 'halt' | 'skip'>(() => {
    if (pendingDecisions.value.length > 0)
      return 'decide'
    /*
     * Ein gesuchter Standort ist dasselbe wie eine Vorlage auf dem Tisch: etwas, das auf **dich**
     * wartet. Der große Knopf darf darüber nicht hinwegrasen — genau das tat er, und der Zeitraffer
     * lief dann durch Monate, in denen nichts weiterging, weil nichts weitergehen konnte.
     */
    if (snapshot.value?.pendingSiting)
      return 'site'
    return skipping.value ? 'halt' : 'skip'
  })

  /**
   * Lauf, bis mich etwas braucht — oder zeig mir, was mich gerade braucht.
   *
   * Der Zeitraffer endet von selbst: `holdClock` läuft, sobald eine Vorlage auf den Tisch kommt, und
   * schaltet ihn ab. Nochmal gedrückt hält er ebenfalls an, denn ein Zeitraffer ohne Bremse ist eine
   * Falle.
   */
  function skipToEvent(): void {
    if (nextAction.value === 'decide') {
      const waiting = pendingDecisions.value[0]
      if (waiting)
        openDecisionSheet(waiting.eventId)
      return
    }
    // Zeig mir, wo gewählt werden soll: die Gesamtansicht hat alle drei Marken im Bild.
    if (nextAction.value === 'site') {
      overviewRequest.value += 1
      return
    }
    if (!canAdvance.value)
      return
    if (skipping.value) {
      skipping.value = false
      return
    }
    skipping.value = true
    if (speed.value === 0)
      speed.value = heldSpeed === 0 ? 1 : heldSpeed
  }

  /** Nothing left on screen to answer, so give the month back its speed. */
  function resumeIfClear(): void {
    if (heldSpeed === 0 || speed.value !== 0)
      return
    // Ein Standort, der noch fehlt, ist eine offene Entscheidung wie jede andere.
    if (openDecisionId.value !== null || lastVoteResult.value !== null || pendingCommand.value || snapshot.value?.pendingSiting)
      return
    if (!canAdvance.value || snapshot.value?.defeat)
      return
    speed.value = heldSpeed
  }

  /**
   * Step the campaign on by one month. It does not touch the clock at all.
   *
   * Two wrong answers came before this one. First it stopped the campaign outright, so pressing the
   * button while it was running left the city standing until somebody noticed. Then it *held* the
   * clock and handed it back when the month landed — which was correct and looked broken: the pause
   * state went up and came down again a few hundred milliseconds later, so the button flashed the
   * paused screen at the player every single press.
   *
   * The button says "nächster Monat" and that is all it should do. What it needs is not a pause but
   * a reset of the month timer: the next automatic turn measures from this month rather than
   * finishing the one the player just skipped, which is the only real way two months could arrive
   * on top of each other.
   */
  function advanceMonth(): void {
    if (!canAdvance.value)
      return
    accumulatedMs = 0
    monthProgress.value = 0
    send({ type: 'ADVANCE', months: 1 })
  }

  function startNewCampaign(): void {
    speed.value = 0
    selectedPartyId.value = null
    selectedGoalIds.value = []
    leaderName.value = ''
    leaderBackgroundId.value = null
    // Erst bist du jemand, dann wählst du eine Partei.
    experienceStage.value = 'leader'
    /*
     * The old campaign is gone the moment the first month of the new one is saved over it, so the
     * title screen must stop offering it now rather than offering a campaign that no longer exists.
     */
    forgetSave()
  }

  function chooseBackground(backgroundId: LeaderBackgroundId): void {
    leaderBackgroundId.value = leaderBackgroundId.value === backgroundId ? null : backgroundId
  }

  function confirmLeader(): void {
    if (leader.value)
      experienceStage.value = 'partyHall'
  }

  function showLeader(): void {
    experienceStage.value = 'leader'
  }

  function selectParty(partyId: PartyId): void {
    selectedPartyId.value = partyId
    experienceStage.value = 'partyProfile'
  }

  function confirmParty(): void {
    if (!selectedPartyId.value)
      return
    experienceStage.value = 'manifesto'
  }

  function toggleGoal(goalId: CampaignGoalId): void {
    if (selectedGoalIds.value.includes(goalId)) {
      selectedGoalIds.value = selectedGoalIds.value.filter(id => id !== goalId)
      return
    }
    if (selectedGoalIds.value.length < 3)
      selectedGoalIds.value = [...selectedGoalIds.value, goalId]
  }

  function reviewCampaign(): void {
    if (selectedPartyId.value && selectedGoalIds.value.length === 3 && leader.value)
      experienceStage.value = 'intro'
  }

  function enterCity(): void {
    if (!selectedPartyId.value || selectedGoalIds.value.length !== 3 || !leader.value)
      return
    reset()
    speed.value = 1
    experienceStage.value = 'gameplay'
  }

  function showTitle(): void {
    speed.value = 0
    experienceStage.value = 'title'
  }

  function showPartyHall(): void {
    speed.value = 0
    experienceStage.value = 'partyHall'
  }

  function showPartyProfile(): void {
    if (selectedPartyId.value)
      experienceStage.value = 'partyProfile'
  }

  function applyPolicy(policyId: string): void {
    send({ type: 'TABLE_MOTION', sourceId: policyId, optionId: policyId })
  }

  /**
   * One lookup for both sources of a council vote: an event raised by the city, and one of the
   * player's own standing motions. The sheet renders them identically.
   */
  function decisionDefinition(id: string): EventDefinition | null {
    const event = getEvent(id)
    if (event)
      return event
    const policy = getPolicy(id)
    if (!policy)
      return null
    return {
      schemaVersion: 1,
      id: policy.id,
      kind: 'decision',
      category: policy.category,
      title: policy.name,
      briefing: policy.summary,
      urgency: 'normal',
      trigger: { earliestMonth: 0, latestMonth: 131, conditions: [], baseWeight: 0, cooldownMonths: 0, oncePerCampaign: true },
      immediateEffects: [],
      options: [{
        id: policy.id,
        label: policy.name,
        rationale: policy.summary,
        oneOffCost: policy.implementationCost,
        monthlyCost: policy.monthlyCost,
        axes: policy.axes,
        salience: policy.salience,
        effects: policy.effects,
        sourceIds: policy.sourceIds,
      }],
      expiresInMonths: 0,
      sourceIds: policy.sourceIds,
    }
  }
  const openDecision = computed(() => {
    // A vote result and a newly raised motion can both become active in the same tick. They each
    // render a full-screen backdrop, so showing them together stacks two overlays and the upper one
    // swallows every click. The motion waits until the result has been acknowledged.
    if (!openDecisionId.value || lastVoteResult.value)
      return null
    const definition = decisionDefinition(openDecisionId.value)
    if (!definition)
      return null
    // A standing motion is never raised as an event, so it has no pending entry — but it does carry
    // the same preparation, and the sheet must show it.
    const prepared = snapshot.value?.motionPreparation[openDecisionId.value] ?? { negotiatedPartyIds: [], campaignedOptionIds: [], counteredBy: [] }
    const entry = pendingDecisions.value.find(decision => decision.eventId === openDecisionId.value)
      ?? { eventId: openDecisionId.value, raisedMonth: snapshot.value?.month ?? 0, expiresMonth: Number.POSITIVE_INFINITY, tabledBy: null, tabledOptionId: null, ...prepared }
    return { entry, definition, prepared }
  })

  function openDecisionSheet(eventId: string | null): void {
    openDecisionId.value = eventId
    forecasts.value = {}
    if (eventId) {
      holdClock()
      send({ type: 'REQUEST_FORECAST', eventId })
    }
    else { resumeIfClear() }
  }

  function requestForecasts(eventId: string): void {
    send({ type: 'REQUEST_FORECAST', eventId })
  }

  /**
   * Auf die Tagesordnung der nächsten Ratssitzung.
   *
   * Hieß einmal „Einbringen“ und war zugleich die Abstimmung. Seit dem Sitzungskalender liegt ein
   * Monat dazwischen — und darin steckt der ganze Sinn: in diesem Monat kann verhandelt und Kampagne
   * gemacht werden, und die Gegenseite kann dasselbe tun. Die Uhr hält danach **nicht** mehr an; im
   * Gegenteil, sie muss laufen, damit die Sitzung kommt.
   */
  function resolveDecision(eventId: string, optionId: string): void {
    send({ type: 'TABLE_MOTION', sourceId: eventId, optionId })
    openDecisionId.value = null
    resumeIfClear()
  }

  /** Und wieder herunter davon, solange die Sitzung nicht war. */
  function withdrawMotion(sourceId: string): void {
    send({ type: 'WITHDRAW_MOTION', sourceId })
  }

  /**
   * Am Kalender vorbei: sofort abstimmen lassen, für politisches Kapital.
   *
   * Keine Bequemlichkeit, sondern der Ausweg für die Fälle, in denen ein Monat zu lang ist — eine
   * gesperrte Hafenbrücke wartet nicht auf die nächste Sitzung.
   */
  function callUrgent(sourceId: string, optionId: string, vote?: PartyVote): void {
    holdClock()
    send({ type: 'CALL_URGENT', sourceId, optionId, vote })
    openDecisionId.value = null
  }

  /**
   * Vote on a motion somebody else tabled.
   *
   * The player picks no option here — the proposer already did — so this is the one place in the game
   * where what they hand over is a Ja, a Nein or an Enthaltung and nothing else. The clock is held
   * the same way a resolution holds it, because the council still has to answer.
   */
  function voteOnMotion(eventId: string, vote: PartyVote): void {
    // Auch die eigene Haltung zu einer fremden Vorlage geht auf die Tagesordnung, nicht sofort durch.
    const tabled = pendingDecisions.value.find(entry => entry.eventId === eventId)
    send({ type: 'TABLE_MOTION', sourceId: eventId, optionId: tabled?.tabledOptionId ?? eventId, vote })
    openDecisionId.value = null
    resumeIfClear()
  }

  /**
   * Wohin das Beschlossene soll.
   *
   * Pflicht, und deshalb hält die Uhr: eine Vorlage, die auf ihren Standort wartet, ist eine
   * Entscheidung, die noch offen ist — und gegen eine laufende Uhr entscheidet niemand gern. Dieselbe
   * Regel wie bei einer Vorlage auf dem Tisch, aus demselben Grund.
   */
  function chooseSite(districtId: DistrictId): void {
    holdClock()
    send({ type: 'CHOOSE_SITE', districtId })
  }

  /**
   * Eine Lage vor Ort beantworten — ohne Rat, aus eigenen Mitteln.
   *
   * Die Uhr hält hier **nicht** an. Ein Brennpunkt ist kein Tagesordnungspunkt: er läuft neben der
   * Zeit her, und wer ihn liegen lässt, trifft damit auch eine Entscheidung. Genau das ist der
   * Unterschied zwischen der ersten Uhr und der zweiten.
   */
  function answerHotspot(id: string, answerId: string): void {
    send({ type: 'ANSWER_HOTSPOT', id, answerId })
  }

  function negotiate(motionId: string, partyId: PartyId): void {
    send({ type: 'NEGOTIATE', eventId: motionId, partyId })
  }

  function campaignFor(motionId: string, optionId: string): void {
    send({ type: 'CAMPAIGN', eventId: motionId, optionId })
  }

  function dismissVoteResult(): void {
    voteQueue.value = voteQueue.value.slice(1)
    resumeIfClear()
  }

  function reset(): void {
    speed.value = 0
    accumulatedMs = 0
    monthProgress.value = 0
    selectedBuilding.value = null
    selectedNews.value = null
    // Spread the priority list: a ref's value is a reactive Proxy, and structured clone rejects it.
    send({ type: 'RESET', seed: CITY_SEED, partyId: selectedPartyId.value ?? undefined, goalIds: [...selectedGoalIds.value], leader: leader.value ?? undefined })
  }

  /**
   * Save the campaign.
   *
   * The state lives in the worker, so this asks for it and writes whatever comes back. `pendingSave`
   * is how the answer finds its way here: the worker speaks in messages, not promises, and the reply
   * arrives through the same channel every other message does.
   */
  function save(): Promise<void> {
    if (!worker || !snapshot.value)
      return Promise.resolve()
    return new Promise<void>((resolve) => {
      pendingSave = (payload) => {
        void keep(payload).then(resolve)
      }
      send({ type: 'REQUEST_SAVE' })
      // A worker that never answers must not leave the button saying "saving" for ever.
      setTimeout(() => {
        if (pendingSave) {
          pendingSave = null
          saveStatus.value = 'Speichern fehlgeschlagen'
          resolve()
        }
      }, 4_000)
    })
  }

  /** Put it away, and say so. What "away" means is `saveStore.ts`; this only reports the outcome. */
  async function keep(payload: SaveGame): Promise<void> {
    try {
      savedGame.value = await writeSave(payload)
      saveStatus.value = `Gespeichert · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    }
    catch {
      saveStatus.value = 'Speichern fehlgeschlagen'
    }
  }

  /**
   * Pick a campaign back up where it was left.
   *
   * Everything the entry flow would have set — party, priorities, the month — comes out of the save
   * rather than being asked for again, and the player lands in the city rather than at the title.
   */
  async function resume(): Promise<boolean> {
    if (!worker)
      return false
    try {
      const payload = await readSave()
      if (!payload) {
        // None, or one this build can no longer read. Say so rather than loading a ruin.
        forgetSave()
        saveStatus.value = 'Spielstand nicht mehr lesbar'
        return false
      }
      selectedPartyId.value = payload.partyId ?? null
      selectedGoalIds.value = [...(payload.goalIds ?? [])]
      leaderName.value = payload.leader?.name ?? ''
      leaderBackgroundId.value = payload.leader?.backgroundId ?? null
      accumulatedMs = 0
      monthProgress.value = 0
      selectedBuilding.value = null
      selectedNews.value = null
      clearReports()
      send({ type: 'RESTORE', state: JSON.parse(JSON.stringify(payload.state)) as typeof payload.state })
      experienceStage.value = 'gameplay'
      speed.value = 1
      saveStatus.value = `Fortgesetzt · ${new Date(payload.savedAt).toLocaleDateString('de-DE')}`
      return true
    }
    catch {
      saveStatus.value = 'Spielstand konnte nicht geladen werden'
      return false
    }
  }

  /** Throw the save away: on starting a new campaign, and on finding one we can no longer read. */
  function forgetSave(): void {
    savedGame.value = null
    clearSummary()
  }

  return {
    snapshot,
    selectedBuilding,
    selectedNews,
    rendererStats,
    experienceStage,
    selectedPartyId,
    selectedGoalIds,
    leaderName,
    leaderBackgroundId,
    leader,
    speed,
    skipping,
    skipToEvent,
    nextAction,
    overviewRequest,
    showOverview,
    cityReports,
    reportIncident,
    selectedReport,
    selectedCitizen,
    selectPerson,
    focusRequest,
    focusOnPlace,
    railOpen,
    openHotspotId,
    overlay,
    walking,
    walkState,
    project,
    decisionsOpen,
    ready,
    error,
    saveStatus,
    savedGame,
    refreshSavedGame,
    enterBench,
    resume,
    forgetSave,
    pendingCommand,
    openDecisionId,
    openDecision,
    pendingDecisions,
    forecasts,
    lastVoteResult,
    voteQueue,
    decisionDefinition,
    openDecisionSheet,
    voteOnMotion,
    requestForecasts,
    resolveDecision,
    negotiate,
    campaignFor,
    chooseSite,
    answerHotspot,
    withdrawMotion,
    callUrgent,
    dismissVoteResult,
    currentDate,
    monthProgress,
    daylight,
    weather,
    clock,
    campaignProgress,
    canAdvance,
    startNewCampaign,
    selectParty,
    confirmParty,
    toggleGoal,
    chooseBackground,
    confirmLeader,
    showLeader,
    reviewCampaign,
    enterCity,
    showTitle,
    showPartyHall,
    showPartyProfile,
    setSpeed,
    advanceMonth,
    applyPolicy,
    reset,
    save,
  }
})
