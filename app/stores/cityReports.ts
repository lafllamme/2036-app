import type { IncidentReport } from '~/rendering/CityRenderer'
import { ref, shallowRef } from 'vue'

/**
 * What the city has just reported, and for how long it stays on the news bar.
 *
 * These come from the renderer, not from the simulation, and they stay apart from `snapshot.news` on
 * purpose: a burglary on the news bar must never become an input to anything the council is scored
 * on. It reads the same way to the player and stays on the right side of the one-way rule in
 * `docs/CITY_LIFE.md`.
 *
 * A call was listed once, when it was raised, and then stayed for ever — so a player could click a
 * headline and be flown to a junction where nothing was happening, because the crew had cleared and
 * gone twenty minutes ago. The list follows the call now: it updates when a crew arrives, and a
 * finished call is marked finished and drops off a few seconds later.
 */

/** Capped, because a ticker that grows for a ten-year campaign is a memory leak with an animation. */
const LIMIT = 8
/** How long a finished call stays listed, so the player sees it end rather than vanish. */
const LINGER_MS = 12_000

/**
 * A call as the interface holds it: what the city said, plus when we heard it.
 *
 * The renderer counts in render seconds and the interface counts in wall clock, and neither should
 * have to know about the other's clock — so the times are taken here, where they are displayed.
 */
export interface LiveReport extends IncidentReport {
  raisedAt: number
  endedAt: number | null
}

export function createCityReports() {
  const cityReports = ref<LiveReport[]>([])
  /** The call the player has opened from the ticker, if any. */
  const selectedReport = shallowRef<LiveReport | null>(null)

  /** Take in what the city says about a call and keep the list honest. */
  function reportIncident(report: IncidentReport): void {
    const existing = cityReports.value.find(entry => entry.id === report.id)

    if (report.status === 'cleared') {
      if (!existing)
        return
      existing.status = 'cleared'
      existing.endedAt = Date.now()
      // Trigger the list's own reactivity: the entry was mutated, not replaced.
      cityReports.value = [...cityReports.value]
      if (selectedReport.value?.id === report.id)
        selectedReport.value = { ...existing }
      return
    }

    if (existing) {
      existing.status = report.status
      cityReports.value = [...cityReports.value]
      if (selectedReport.value?.id === report.id)
        selectedReport.value = { ...existing }
      return
    }

    const live: LiveReport = { ...report, raisedAt: Date.now(), endedAt: null }
    cityReports.value = [live, ...cityReports.value].slice(0, LIMIT)
  }

  /** Drop what has been over long enough to have been noticed. Driven by the campaign clock. */
  function prune(): void {
    const now = Date.now()
    const kept = cityReports.value.filter(entry => entry.endedAt === null || now - entry.endedAt < LINGER_MS)
    if (kept.length !== cityReports.value.length)
      cityReports.value = kept
    if (selectedReport.value && !kept.some(entry => entry.id === selectedReport.value?.id))
      selectedReport.value = null
  }

  /** Everything goes when a campaign is put down and another one picked up. */
  function clear(): void {
    cityReports.value = []
    selectedReport.value = null
  }

  return { cityReports, selectedReport, reportIncident, prune, clear }
}
