/**
 * A campaign written down.
 *
 * `schemaVersion` exists so an old save can be read rather than rejected; the store migrates by
 * filling in defaults rather than by branching on the number, because a save that loses the
 * interface is worse than a save that loses a field.
 */

import type { SimulationState } from '../../simulation/model'
import type { CampaignGoalId, CampaignLeader, PartyId } from './politics'
import type { SimulationSnapshot } from './simulation'

/**
 * A saved campaign.
 *
 * Version 1 kept only the snapshot, which is the simulation's report and not the simulation: rents,
 * relationships, cooldowns, which events had already fired and how far each measure had run all
 * live in the state behind it. A campaign restored from a snapshot alone would have looked right
 * for one month and then diverged, so version 2 keeps the state and derives the rest.
 *
 * The state is plain data — the simulation is pure by contract — so it survives structured clone
 * into IndexedDB and back out again unchanged.
 */
export interface SaveGame {
  schemaVersion: 2
  contentVersion: 'vertical-slice-1'
  citySeed: number
  partyId?: PartyId
  goalIds?: CampaignGoalId[]
  leader?: CampaignLeader | null
  state: SimulationState
  snapshot: SimulationSnapshot
  savedAt: string
}

/** Enough to offer "continue" on the title screen without opening the database. */
export interface SaveSummary {
  savedAt: string
  partyId?: PartyId
  month: number
}

// ---------------------------------------------------------------------------
// Events and council voting — see docs/EVENT_MATRIX.md and ADR-0003
// ---------------------------------------------------------------------------
