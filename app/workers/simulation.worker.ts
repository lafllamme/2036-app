import type { SimulationCommand, SimulationMessage } from '../core/contracts'
import type { SimulationState } from '../simulation/model'
import {
  advanceMonths,
  answerSituation,
  applyPolicy,
  campaignFor,
  chooseSite,
  createInitialState,
  forecastsForEvent,
  migrateState,
  negotiate,
  proposePolicy,

  resolveDecision,
  snapshotOf,
  voteOnMotion,
} from '../simulation/model'

let state: SimulationState = createInitialState()

const post = (message: SimulationMessage): void => globalThis.postMessage(message)
const publish = (type: 'READY' | 'SNAPSHOT'): void => post({ type, snapshot: snapshotOf(state) })

globalThis.onmessage = ({ data }: MessageEvent<SimulationCommand>) => {
  try {
    switch (data.type) {
      case 'INIT':
      case 'RESET':
        state = createInitialState(data.seed, data.partyId ?? null, data.goalIds ?? [], data.leader ?? null)
        publish(data.type === 'INIT' ? 'READY' : 'SNAPSHOT')
        return
      case 'ADVANCE':
        state = advanceMonths(state, data.months)
        publish('SNAPSHOT')
        return
      case 'APPLY_POLICY': {
        const outcome = proposePolicy(state, data.policyId)
        state = outcome.state
        if (outcome.result)
          post({ type: 'VOTE_RESULT', result: outcome.result, snapshot: snapshotOf(state) })
        else publish('SNAPSHOT')
        return
      }
      case 'ANSWER_HOTSPOT': {
        // Die zweite Uhr: eine Lage vor Ort, ohne Ratsbeschluss beantwortet.
        state = answerSituation(state, data.id, data.answerId)
        publish('SNAPSHOT')
        return
      }
      case 'CHOOSE_SITE': {
        // Wohin die beschlossene Vorlage soll. Erst damit ist sie wirklich beschlossen.
        state = chooseSite(state, data.districtId)
        publish('SNAPSHOT')
        return
      }
      case 'RESOLVE_DECISION': {
        const outcome = resolveDecision(state, data.eventId, data.optionId)
        state = outcome.state
        if (outcome.result)
          post({ type: 'VOTE_RESULT', result: outcome.result, snapshot: snapshotOf(state) })
        else publish('SNAPSHOT')
        return
      }
      case 'VOTE_ON_MOTION': {
        const outcome = voteOnMotion(state, data.eventId, data.vote)
        state = outcome.state
        if (outcome.result)
          post({ type: 'VOTE_RESULT', result: outcome.result, snapshot: snapshotOf(state) })
        else publish('SNAPSHOT')
        return
      }
      /*
       * Hand the whole state out, and take a whole state back.
       *
       * A campaign cannot be restored from a snapshot: the snapshot is what the simulation reports,
       * not what it is. Cooldowns, relationships, which events have already fired and how far each
       * measure has run are all here and nowhere else — restoring without them looks right for one
       * month and then quietly diverges.
       */
      case 'REQUEST_SAVE':
        post({ type: 'SAVE_STATE', state, snapshot: snapshotOf(state) })
        return
      case 'RESTORE':
        // A save written before a field existed has to be brought up to shape, or the first read of
        // that field takes the interface down. See `migrateState`.
        state = migrateState(data.state)
        publish('SNAPSHOT')
        return
      case 'REQUEST_FORECAST':
        post({ type: 'FORECAST', eventId: data.eventId, forecasts: forecastsForEvent(state, data.eventId) })
        return
      case 'NEGOTIATE':
        state = negotiate(state, data.eventId, data.partyId)
        publish('SNAPSHOT')
        post({ type: 'FORECAST', eventId: data.eventId, forecasts: forecastsForEvent(state, data.eventId) })
        return
      case 'CAMPAIGN':
        state = campaignFor(state, data.eventId, data.optionId)
        publish('SNAPSHOT')
        post({ type: 'FORECAST', eventId: data.eventId, forecasts: forecastsForEvent(state, data.eventId) })
        return
      case 'SET_CAMPAIGN':
        state = createInitialState(state.seed, data.partyId, data.goalIds, data.leader ?? null)
        publish('SNAPSHOT')
    }
  }
  catch (error) {
    post({ type: 'ERROR', message: error instanceof Error ? error.message : 'Unbekannter Simulationsfehler' })
  }
}

export { applyPolicy }
