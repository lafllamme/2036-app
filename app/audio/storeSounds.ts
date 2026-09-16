import type { AudioBus } from './AudioBus'
import type { ExperienceStage } from '~/stores/game'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { isCampaignComplete } from '~/core/campaign'
import { useGameStore } from '~/stores/game'

const STAGE_ORDER: ExperienceStage[] = ['title', 'partyHall', 'partyProfile', 'manifesto', 'intro', 'gameplay']

/** A one-off cost large enough to be a budget decision rather than rounding. */
const SPEND_THRESHOLD_MILLIONS = 0.5
/** How long the worker may compute before the wait becomes audible. */
const WORK_LOOP_DELAY_MS = 350

/**
 * The semantic layer: city and council state changes, heard.
 *
 * These watch the store rather than the buttons, because a motion sheet opens from three different
 * call sites and the council raises motions with no click at all. One watcher covers every path.
 */
export function bindStoreSounds(bus: AudioBus): () => void {
  const game = useGameStore()
  const {
    experienceStage,
    ready,
    rendererStats,
    selectedGoalIds,
    speed,
    snapshot,
    selectedBuilding,
    selectedNews,
    error,
    openDecisionId,
    pendingDecisions,
    lastVoteResult,
    saveStatus,
    pendingCommand,
  } = storeToRefs(game)

  const stops: Array<() => void> = []
  const on = (stop: () => void): void => void stops.push(stop)

  /*
   * Three deliberate delays. The two accents let the result cue land first so the pair reads as
   * one sentence rather than a chord; the third keeps a fast worker round trip silent.
   */
  const accentSurprise = useTimeoutFn(() => bus.play('vote.surprise'), 320, { immediate: false })
  const accentSpending = useTimeoutFn(() => bus.play('budget.spent'), 160, { immediate: false })
  const waitForWorker = useTimeoutFn(() => bus.startLoop('work.started'), WORK_LOOP_DELAY_MS, { immediate: false })

  on(watch(experienceStage, (next, previous) => {
    if (next === 'gameplay')
      return bus.play('stage.cityEntered')
    if (next === 'partyProfile' && previous === 'partyHall')
      return bus.play('stage.partySelected')
    bus.play(STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(previous) ? 'stage.forward' : 'stage.back')
  }))

  on(watch(() => ready.value && Boolean(rendererStats.value), (cityReady) => {
    if (cityReady)
      bus.play('entry.cityReady')
  }))

  on(watch(selectedGoalIds, (next, previous) => {
    if (next.length > previous.length)
      bus.play(next.length === 3 ? 'entry.prioritiesComplete' : 'entry.priorityAdded')
    else if (next.length < previous.length)
      bus.play('entry.priorityRemoved')
  }, { deep: true }))

  on(watch(speed, (next, previous) => {
    if (next === 0)
      return bus.play('hud.paused')
    if (previous === 0)
      return bus.play('hud.resumed')
    bus.play(next > previous ? 'hud.speedUp' : 'hud.speedDown')
  }))

  on(watch(() => snapshot.value?.month, (month, previousMonth) => {
    if (month === undefined || previousMonth === undefined || month === previousMonth)
      return
    if (isCampaignComplete(month))
      bus.play('hud.campaignComplete')
    else bus.play(snapshot.value?.monthOfYear === 1 ? 'hud.budgetYear' : 'hud.monthAdvanced')
  }))

  /*
   * The end of a campaign the player did not choose. It is the one moment in the game that is not a
   * consequence of a click, so it needs a sound of its own more than most things do.
   */
  on(watch(() => snapshot.value?.defeat?.reason, (reason, before) => {
    if (reason && !before)
      bus.play('hud.campaignComplete')
  }))

  on(watch(() => snapshot.value?.metrics.cityBudget, (budget, previous) => {
    if (budget !== undefined && previous !== undefined && budget < 0 && previous >= 0)
      bus.play('budget.overdrawn')
  }))

  /*
   * A measure whose monthly cost is negative earns money rather than spending it — a municipal
   * business-tax change, for instance. It is the one moment the city's balance improves by choice.
   */
  on(watch(() => snapshot.value?.activeMeasures, (measures, previous) => {
    if (!measures || !previous)
      return
    const known = new Set(previous.map(measure => measure.id))
    if (measures.some(measure => !known.has(measure.id) && measure.monthlyCost < 0))
      bus.play('budget.income')
  }))

  on(watch(selectedBuilding, (building, previous) => {
    if (building)
      bus.play('hud.buildingSelected')
    else if (previous)
      bus.play('hud.buildingDeselected')
  }))

  on(watch(selectedNews, (news, previous) => {
    if (news)
      bus.play('hud.newsOpened')
    else if (previous)
      bus.play('hud.newsClosed')
  }))

  on(watch(error, (message) => {
    if (message)
      bus.play('hud.simulationFailed')
  }))

  on(watch(openDecisionId, (id, previous) => {
    if (id)
      bus.play('vote.sheetOpened')
    // Resolving a motion also clears the id, but the vote cue has already answered that click.
    else if (previous && !lastVoteResult.value)
      bus.play('vote.sheetClosed')
  }))

  on(watch(pendingDecisions, (next, previous) => {
    const known = new Set((previous ?? []).map(entry => entry.eventId))
    if (next.some(entry => !known.has(entry.eventId)))
      bus.play('vote.motionRaised')
  }, { deep: true }))

  on(watch(() => snapshot.value?.motionPreparation, (next, previous) => {
    if (!next || !previous)
      return
    for (const [motionId, preparation] of Object.entries(next)) {
      const before = previous[motionId] ?? { negotiatedPartyIds: [], campaignedOptionIds: [] }
      if (preparation.negotiatedPartyIds.length > before.negotiatedPartyIds.length)
        bus.play('vote.negotiationAccepted')
      else if (preparation.campaignedOptionIds.length > before.campaignedOptionIds.length)
        bus.play('vote.campaignRegistered')
    }
  }, { deep: true }))

  on(watch(lastVoteResult, (result, previous) => {
    if (!result) {
      if (previous)
        bus.play('vote.resultDismissed')
      return
    }
    bus.play(result.passed ? 'vote.passed' : 'vote.failed')

    const chance = result.forecast.majorityProbability
    if ((result.passed && chance < 0.4) || (!result.passed && chance > 0.6))
      accentSurprise.start()

    /*
     * The vote result carries an option id but not its price, and the motion is already closed by
     * the time it lands. The budget itself is the reliable witness: a passed motion that moved
     * money shows up as a drop between the two committed snapshots.
     */
    const metrics = snapshot.value?.metrics
    const before = snapshot.value?.previousMetrics
    if (result.passed && metrics && before && before.cityBudget - metrics.cityBudget >= SPEND_THRESHOLD_MILLIONS)
      accentSpending.start()
  }))

  on(watch(saveStatus, (status) => {
    if (status.startsWith('Gespeichert'))
      bus.play('hud.saved')
    else if (status.includes('fehlgeschlagen'))
      bus.play('hud.saveFailed')
  }))

  /*
   * Work the player waits for. The loop only starts once the worker has been busy longer than a
   * frame budget, so the usual instant round trip stays completely silent.
   */
  on(watch(pendingCommand, (pending) => {
    waitForWorker.stop()
    if (pending)
      waitForWorker.start()
    else bus.stopLoop('work.started', 'work.finished')
  }))

  return () => {
    accentSurprise.stop()
    accentSpending.stop()
    waitForWorker.stop()
    for (const stop of stops) stop()
  }
}
