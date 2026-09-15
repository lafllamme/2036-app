import type {
  BuildingRecord,
  CampaignPriorityId,
  EventDefinition,
  NewsItem,
  PartyId,
  SaveGame,
  SaveSummary,
  SimulationCommand,
  SimulationMessage,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '~/core/contracts'
import type { RendererStats } from '~/rendering/CityRenderer'
import type { PersonAt } from '~/rendering/world/traffic/agents'
import type { Citizen } from '~/world/citizens'
import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { getEvent } from '~/content/events'
import { getPolicy } from '~/content/policies'
import { CAMPAIGN_LAST_MONTH, isCampaignComplete } from '~/core/campaign'
import { formatClock, readDaylight } from '~/core/daylight'
import { weatherAt } from '~/core/weather'
import { initialSupport } from '~/simulation/electorate'
import { citizenAt } from '~/world/citizens'
import { leaningOf } from '~/world/leaning'
import { createCityReports } from './cityReports'
import { clearSummary, readSave, readSummary, writeSave } from './saveStore'

const MONTH_DURATION_MS = 300_000
export type ExperienceStage = 'title' | 'partyHall' | 'partyProfile' | 'manifesto' | 'intro' | 'gameplay'

export const useGameStore = defineStore('game', () => {
  /** The one seed the city, its weather and every save are built from. */
  const CITY_SEED = 2036

  const snapshot = shallowRef<SimulationSnapshot | null>(null)
  const selectedBuilding = shallowRef<BuildingRecord | null>(null)
  const selectedNews = shallowRef<NewsItem | null>(null)
  const rendererStats = shallowRef<RendererStats | null>(null)
  const experienceStage = ref<ExperienceStage>('title')
  const openDecisionId = ref<string | null>(null)
  const lastVoteResult = shallowRef<VoteResult | null>(null)
  const forecasts = shallowRef<Record<string, VoteForecast>>({})
  const selectedPartyId = ref<PartyId | null>(null)
  const selectedPriorityIds = ref<CampaignPriorityId[]>([])
  /*
   * The campaign runs as soon as the player enters the city. Starting paused made the clock and the
   * sky look broken: nothing moved until you found the speed buttons. A raised motion still pauses
   * on its own, which is the only moment the game should stop by itself.
   */
  const speed = ref<0 | 1 | 2 | 4>(1)
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
  const railOpen = ref(true)
  const decisionsOpen = ref(true)

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
        priorityIds: [...selectedPriorityIds.value],
        state: data.state,
        snapshot: data.snapshot,
        savedAt: new Date().toISOString(),
      })
      return
    }
    if (data.type === 'VOTE_RESULT')
      lastVoteResult.value = data.result

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
    if (arrived) {
      holdClock()
      openDecisionId.value = arrived.eventId
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
      accumulatedMs += elapsed * speed.value
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
    if (speed.value !== 0)
      heldSpeed = speed.value
    speed.value = 0
  }

  /** Nothing left on screen to answer, so give the month back its speed. */
  function resumeIfClear(): void {
    if (heldSpeed === 0 || speed.value !== 0)
      return
    if (openDecisionId.value !== null || lastVoteResult.value !== null || pendingCommand.value)
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
    selectedPriorityIds.value = []
    experienceStage.value = 'partyHall'
    /*
     * The old campaign is gone the moment the first month of the new one is saved over it, so the
     * title screen must stop offering it now rather than offering a campaign that no longer exists.
     */
    forgetSave()
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

  function togglePriority(priorityId: CampaignPriorityId): void {
    const currentIndex = selectedPriorityIds.value.indexOf(priorityId)
    if (currentIndex >= 0) {
      selectedPriorityIds.value = selectedPriorityIds.value.filter(id => id !== priorityId)
      return
    }
    if (selectedPriorityIds.value.length < 3)
      selectedPriorityIds.value = [...selectedPriorityIds.value, priorityId]
  }

  function reviewCampaign(): void {
    if (selectedPartyId.value && selectedPriorityIds.value.length === 3)
      experienceStage.value = 'intro'
  }

  function enterCity(): void {
    if (!selectedPartyId.value || selectedPriorityIds.value.length !== 3)
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
    holdClock()
    send({ type: 'APPLY_POLICY', policyId })
  }

  const pendingDecisions = computed(() => snapshot.value?.pendingDecisions ?? [])

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
      category: policy.category === 'housing' ? 'housing' : policy.category === 'transport' ? 'mobility' : 'economy',
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
    const prepared = snapshot.value?.motionPreparation[openDecisionId.value] ?? { negotiatedPartyIds: [], campaignedOptionIds: [] }
    const entry = pendingDecisions.value.find(decision => decision.eventId === openDecisionId.value)
      ?? { eventId: openDecisionId.value, raisedMonth: snapshot.value?.month ?? 0, expiresMonth: Number.POSITIVE_INFINITY, ...prepared }
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

  function resolveDecision(eventId: string, optionId: string): void {
    holdClock()
    // A standing motion has no pending entry in the worker, so it goes through the policy path.
    if (getEvent(eventId))
      send({ type: 'RESOLVE_DECISION', eventId, optionId })
    else send({ type: 'APPLY_POLICY', policyId: eventId })
    openDecisionId.value = null
  }

  function negotiate(motionId: string, partyId: PartyId): void {
    send({ type: 'NEGOTIATE', eventId: motionId, partyId })
  }

  function campaignFor(motionId: string, optionId: string): void {
    send({ type: 'CAMPAIGN', eventId: motionId, optionId })
  }

  function dismissVoteResult(): void {
    lastVoteResult.value = null
    resumeIfClear()
  }

  function reset(): void {
    speed.value = 0
    accumulatedMs = 0
    monthProgress.value = 0
    selectedBuilding.value = null
    selectedNews.value = null
    // Spread the priority list: a ref's value is a reactive Proxy, and structured clone rejects it.
    send({ type: 'RESET', seed: CITY_SEED, partyId: selectedPartyId.value ?? undefined, priorityIds: [...selectedPriorityIds.value] })
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
      selectedPriorityIds.value = [...(payload.priorityIds ?? [])]
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
    selectedPriorityIds,
    speed,
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
    decisionsOpen,
    ready,
    error,
    saveStatus,
    savedGame,
    refreshSavedGame,
    resume,
    forgetSave,
    pendingCommand,
    openDecisionId,
    openDecision,
    pendingDecisions,
    forecasts,
    lastVoteResult,
    decisionDefinition,
    openDecisionSheet,
    requestForecasts,
    resolveDecision,
    negotiate,
    campaignFor,
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
    togglePriority,
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
