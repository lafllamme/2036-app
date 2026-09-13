import type {
  BuildingRecord,
  CampaignPriorityId,
  EventDefinition,
  NewsItem,
  PartyId,
  SaveGameV1,
  SimulationCommand,
  SimulationMessage,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '~/core/contracts'
import type { IncidentReport, RendererStats } from '~/rendering/CityRenderer'
import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { getEvent } from '~/content/events'
import { getPolicy } from '~/content/policies'
import { CAMPAIGN_LAST_MONTH, isCampaignComplete } from '~/core/campaign'
import { formatClock, readDaylight } from '~/core/daylight'

const MONTH_DURATION_MS = 300_000
const DB_NAME = '2036-lindenhafen'
const SAVE_KEY = 'autosave-v1'

export type ExperienceStage = 'title' | 'partyHall' | 'partyProfile' | 'manifesto' | 'intro' | 'gameplay'

function openSaveDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('saves')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const useGameStore = defineStore('game', () => {
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
  /*
   * Bumped when the player asks to be taken back to the view of the whole city. The store cannot
   * hold a camera — nothing here may know the renderer exists — so it holds the request and the
   * canvas component, which does own one, watches it.
   */
  const overviewRequest = ref(0)

  /**
   * What the city has just reported, newest first.
   *
   * These come from the renderer, not from the simulation, and they stay here rather than being
   * folded into `snapshot.news`: a burglary on the news bar must never become an input to anything
   * the council is scored on. It reads the same way to the player and stays on the right side of
   * the one-way rule in `docs/CITY_LIFE.md`.
   *
   * Capped, because a ticker that grows for the length of a ten-year campaign is a memory leak with
   * a scroll animation.
   */
  const cityReports = ref<IncidentReport[]>([])
  const CITY_REPORT_LIMIT = 8
  /** The call the player has opened from the ticker, if any. */
  const selectedReport = shallowRef<IncidentReport | null>(null)
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

  function reportIncident(report: IncidentReport): void {
    cityReports.value = [report, ...cityReports.value].slice(0, CITY_REPORT_LIMIT)
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
    if (data.type === 'VOTE_RESULT')
      lastVoteResult.value = data.result

    const previous = snapshot.value
    snapshot.value = data.snapshot
    ready.value = true
    pendingCommand.value = false
    if (isCampaignComplete(data.snapshot.month))
      speed.value = 0

    // A new council motion stops the clock: the player should never miss a decision while watching.
    const known = new Set((previous?.pendingDecisions ?? []).map(entry => entry.eventId))
    const arrived = data.snapshot.pendingDecisions.find(entry => !known.has(entry.eventId))
    if (arrived) {
      speed.value = 0
      openDecisionId.value = arrived.eventId
    }
  }

  if (import.meta.client) {
    worker = new Worker(new URL('~/workers/simulation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = receive
    worker.onerror = () => {
      error.value = 'Die Simulation wurde angehalten. Lade die Stadt neu, um den letzten Stand wiederherzustellen.'
      speed.value = 0
      pendingCommand.value = false
    }
    send({ type: 'INIT', seed: 2036 })

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
  }

  function advanceMonth(): void {
    if (!canAdvance.value)
      return
    speed.value = 0
    send({ type: 'ADVANCE', months: 1 })
  }

  function startNewCampaign(): void {
    speed.value = 0
    selectedPartyId.value = null
    selectedPriorityIds.value = []
    experienceStage.value = 'partyHall'
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
    speed.value = 0
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
      speed.value = 0
      send({ type: 'REQUEST_FORECAST', eventId })
    }
  }

  function requestForecasts(eventId: string): void {
    send({ type: 'REQUEST_FORECAST', eventId })
  }

  function resolveDecision(eventId: string, optionId: string): void {
    speed.value = 0
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
  }

  function reset(): void {
    speed.value = 0
    accumulatedMs = 0
    monthProgress.value = 0
    selectedBuilding.value = null
    selectedNews.value = null
    // Spread the priority list: a ref's value is a reactive Proxy, and structured clone rejects it.
    send({ type: 'RESET', seed: 2036, partyId: selectedPartyId.value ?? undefined, priorityIds: [...selectedPriorityIds.value] })
  }

  async function save(): Promise<void> {
    if (!snapshot.value)
      return
    try {
      const database = await openSaveDatabase()
      const payload: SaveGameV1 = {
        schemaVersion: 1,
        contentVersion: 'vertical-slice-1',
        citySeed: 2036,
        partyId: selectedPartyId.value ?? undefined,
        priorityIds: selectedPriorityIds.value,
        snapshot: snapshot.value,
        savedAt: new Date().toISOString(),
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('saves', 'readwrite')
        transaction.objectStore('saves').put(payload, SAVE_KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      database.close()
      saveStatus.value = `Gespeichert · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    }
    catch {
      saveStatus.value = 'Speichern fehlgeschlagen'
    }
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
    focusRequest,
    focusOnPlace,
    railOpen,
    decisionsOpen,
    ready,
    error,
    saveStatus,
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
