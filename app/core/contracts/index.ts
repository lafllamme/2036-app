/**
 * Every shape the parts of this game agree on, in one place.
 *
 * It was one file of six hundred and seventy lines holding eight unrelated domains — the city's
 * geometry next to the save format next to the sky. Nothing bound them together except the file.
 * They are eight files now, and this barrel means not one import anywhere else had to change.
 *
 * | File | What belongs in it |
 * | --- | --- |
 * | `city.ts` | the ground plan: buildings, roads, areas, relief |
 * | `metrics.ts` | what the city measures, and what the residents believe about it |
 * | `politics.ts` | parties, their positions and their red lines |
 * | `policies.ts` | what a decision does to the city, and where the number came from |
 * | `events.ts` | what happens, how the council votes on it, and what it closes off |
 * | `visuals.ts` | the one-way valve from the simulation to the renderer |
 * | `simulation.ts` | the wire between the worker and the interface |
 * | `save.ts` | a campaign written down |
 */

export type * from './city'
export type * from './events'
export type * from './metrics'
export type * from './policies'
export type * from './politics'
export type * from './save'
export type * from './simulation'
export type * from './situation'
export type * from './visuals'
