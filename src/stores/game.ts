import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { BuildingRecord, NewsItem, SaveGameV1, SimulationMessage, SimulationSnapshot } from '../core/contracts'
import type { RendererStats } from '../rendering/CityRenderer'

const MONTH_DURATION_MS = 240_000
const DB_NAME = '2036-lindenhafen'
const SAVE_KEY = 'autosave-v1'

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
    if (speed.value === 0 || !ready.value) return
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

  function setSpeed(nextSpeed: 0 | 1 | 2 | 4): void {
    speed.value = nextSpeed
  }

  function advanceMonth(): void {
    speed.value = 0
    worker.postMessage({ type: 'ADVANCE', months: 1 })
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
    speed,
    ready,
    error,
    saveStatus,
    currentDate,
    campaignProgress,
    setSpeed,
    advanceMonth,
    applyPolicy,
    reset,
    save,
  }
})
