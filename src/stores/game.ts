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
} from '../core/contracts'
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
    snapshot.value = data.snapshot
    if (isCampaignComplete(data.snapshot.month)) speed.value = 0
    ready.value = true
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

  function reset(): void {
    speed.value = 0
    accumulatedMs = 0
    selectedBuilding.value = null
    selectedNews.value = null
    worker.postMessage({ type: 'RESET', seed: 2036 })
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
