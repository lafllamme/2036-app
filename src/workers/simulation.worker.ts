/// <reference lib="webworker" />

import type { SimulationCommand, SimulationMessage } from '../core/contracts'
import { advanceMonths, applyPolicy, createInitialState } from '../simulation/model'

let state = createInitialState()

function respond(message: SimulationMessage): void {
  self.postMessage(message)
}

self.onmessage = ({ data }: MessageEvent<SimulationCommand>) => {
  try {
    switch (data.type) {
      case 'INIT':
      case 'RESET':
        state = createInitialState(data.seed)
        respond({ type: 'READY', snapshot: state.snapshot })
        return
      case 'ADVANCE':
        state = advanceMonths(state, data.months)
        respond({ type: 'SNAPSHOT', snapshot: state.snapshot })
        return
      case 'APPLY_POLICY':
        state = applyPolicy(state, data.policyId)
        respond({ type: 'SNAPSHOT', snapshot: state.snapshot })
        return
    }
  } catch (error) {
    respond({ type: 'ERROR', message: error instanceof Error ? error.message : 'Unbekannter Simulationsfehler' })
  }
}

export {}
