import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  BuildingRecord,
  CampaignPriorityId,
  NewsItem,
  PartyId,
  SaveGameV1,
  SimulationMessage,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '../core/contracts'
import { getEvent } from '../content/events'
import { getPolicy } from '../content/policies'
import type { EventDefinition } from '../core/contracts'
import { CAMPAIGN_LAST_MONTH, isCampaignComplete } from '../core/campaign'
import type { RendererStats } from '../rendering/CityRenderer'

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
  const speed = ref<0 | 1 | 2 | 4>(0)
  const ready = ref(false)
  const error = ref<string | null>(null)
  const saveStatus = ref('Nicht gespeichert')
  const worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' })
  let accumulatedMs = 0
  let previousTime = performance.now()

  worker.onmessage = ({ data }: MessageEvent<SimulationMessage>) => {
    if (data.type === 'ERROR') {
      error.value = data.message
      speed.value = 0
      return
    }
    if (data.type === 'FORECAST') {
      forecasts.value = data.forecasts
      return
    }
    if (data.type === 'VOTE_RESULT') lastVoteResult.value = data.result

    const previous = snapshot.value
    snapshot.value = data.snapshot
    ready.value = true
    if (isCampaignComplete(data.snapshot.month)) speed.value = 0

    // A new council motion stops the clock: the player should never miss a decision while watching.
    const known = new Set((previous?.pendingDecisions ?? []).map((entry) => entry.eventId))
    const arrived = data.snapshot.pendingDecisions.find((entry) => !known.has(entry.eventId))
    if (arrived) {
      speed.value = 0
      openDecisionId.value = arrived.eventId
    }
  }

  worker.onerror = () => {
    error.value = 'Die Simulation wurde angehalten. Lade die Stadt neu, um den letzten Stand wiederherzustellen.'
    speed.value = 0
  }

  worker.postMessage({ type: 'INIT', seed: 2036 })

  const timer = window.setInterval(() => {
    const now = performance.now()
    const elapsed = now - previousTime
    previousTime = now
    if (speed.value === 0 || !ready.value || isCampaignComplete(snapshot.value?.month ?? 0)) return
    accumulatedMs += elapsed * speed.value
    if (accumulatedMs >= MONTH_DURATION_MS) {
      accumulatedMs %= MONTH_DURATION_MS
      worker.postMessage({ type: 'ADVANCE', months: 1 })
    }
  }, 250)

  onScopeDispose(() => {
    window.clearInterval(timer)
    worker.terminate()
  })

  const currentDate = computed(() => {
    if (!snapshot.value) return 'JAN 2026'
    const monthNames = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ']
    return `${monthNames[snapshot.value.monthOfYear - 1]} ${snapshot.value.year}`
  })

  const campaignProgress = computed(() => Math.min(100, ((snapshot.value?.month ?? 0) / 131) * 100))
  const canAdvance = computed(() => (snapshot.value?.month ?? 0) < CAMPAIGN_LAST_MONTH)

  function setSpeed(nextSpeed: 0 | 1 | 2 | 4): void {
    speed.value = canAdvance.value ? nextSpeed : 0
  }

  function advanceMonth(): void {
    if (!canAdvance.value) return
    speed.value = 0
    worker.postMessage({ type: 'ADVANCE', months: 1 })
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
    if (!selectedPartyId.value) return
    experienceStage.value = 'manifesto'
  }

  function togglePriority(priorityId: CampaignPriorityId): void {
    const currentIndex = selectedPriorityIds.value.indexOf(priorityId)
    if (currentIndex >= 0) {
      selectedPriorityIds.value = selectedPriorityIds.value.filter((id) => id !== priorityId)
      return
    }
    if (selectedPriorityIds.value.length < 3) selectedPriorityIds.value = [...selectedPriorityIds.value, priorityId]
  }

  function reviewCampaign(): void {
    if (selectedPartyId.value && selectedPriorityIds.value.length === 3) experienceStage.value = 'intro'
  }

  function enterCity(): void {
    if (!selectedPartyId.value || selectedPriorityIds.value.length !== 3) return
    reset()
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
    if (selectedPartyId.value) experienceStage.value = 'partyProfile'
  }

  function applyPolicy(policyId: string): void {
    speed.value = 0
    worker.postMessage({ type: 'APPLY_POLICY', policyId })
  }

  const pendingDecisions = computed(() => snapshot.value?.pendingDecisions ?? [])

  /**
   * One lookup for both sources of a council vote: an event raised by the city, and one of the
   * player's own standing motions. The sheet renders them identically.
   */
  function decisionDefinition(id: string): EventDefinition | null {
    const event = getEvent(id)
    if (event) return event
    const policy = getPolicy(id)
    if (!policy) return null
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
    if (!openDecisionId.value) return null
    const definition = decisionDefinition(openDecisionId.value)
    if (!definition) return null
    // A standing motion is never raised as an event, so it has no pending entry — but it does carry
    // the same preparation, and the sheet must show it.
    const prepared = snapshot.value?.motionPreparation[openDecisionId.value] ?? { negotiatedPartyIds: [], campaignedOptionIds: [] }
    const entry = pendingDecisions.value.find((decision) => decision.eventId === openDecisionId.value)
      ?? { eventId: openDecisionId.value, raisedMonth: snapshot.value?.month ?? 0, expiresMonth: Number.POSITIVE_INFINITY, ...prepared }
    return { entry, definition: definition, prepared }
  })

  function openDecisionSheet(eventId: string | null): void {
    openDecisionId.value = eventId
    forecasts.value = {}
    if (eventId) {
      speed.value = 0
      worker.postMessage({ type: 'REQUEST_FORECAST', eventId })
    }
  }

  function requestForecasts(eventId: string): void {
    worker.postMessage({ type: 'REQUEST_FORECAST', eventId })
  }

  function resolveDecision(eventId: string, optionId: string): void {
    speed.value = 0
    // A standing motion has no pending entry in the worker, so it goes through the policy path.
    if (getEvent(eventId)) worker.postMessage({ type: 'RESOLVE_DECISION', eventId, optionId })
    else worker.postMessage({ type: 'APPLY_POLICY', policyId: eventId })
    openDecisionId.value = null
  }

  function negotiate(motionId: string, partyId: PartyId): void {
    worker.postMessage({ type: 'NEGOTIATE', eventId: motionId, partyId })
  }

  function campaignFor(motionId: string, optionId: string): void {
    worker.postMessage({ type: 'CAMPAIGN', eventId: motionId, optionId })
  }

  function dismissVoteResult(): void {
    lastVoteResult.value = null
  }

  function reset(): void {
    speed.value = 0
    accumulatedMs = 0
    selectedBuilding.value = null
    selectedNews.value = null
    // Spread the priority list: a ref's value is a reactive Proxy, and structured clone rejects it.
    worker.postMessage({ type: 'RESET', seed: 2036, partyId: selectedPartyId.value ?? undefined, priorityIds: [...selectedPriorityIds.value] })
  }

  async function save(): Promise<void> {
    if (!snapshot.value) return
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
    } catch {
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
    ready,
    error,
    saveStatus,
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
