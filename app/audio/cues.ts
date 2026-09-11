import type { CueName, PlayOptions } from 'uisfx'

/**
 * The sound contract for 2036.
 *
 * Every audible moment in the product is named here once, as a domain event, and mapped to a
 * semantic UI SFX cue. Components and stores emit the domain name; nothing in the interface ever
 * names a cue directly. That keeps the sound language reviewable in one file and lets the whole
 * product change personality by swapping the pack.
 *
 * `docs/AUDIO.md` is the prose version of this table and must move with it.
 */
export type SoundEvent
  // Generic interaction, fired by the delegated listener for every control in the product.
  = | 'ui.hover'
    | 'ui.press'
    | 'ui.focus'
  // Entry flow and the stage machine.
    | 'stage.forward'
    | 'stage.back'
    | 'stage.partySelected'
    | 'stage.cityEntered'
    | 'entry.cityReady'
    | 'entry.priorityAdded'
    | 'entry.priorityRemoved'
    | 'entry.prioritiesComplete'
    | 'entry.priorityRejected'
  // Time, the HUD and the city.
    | 'hud.monthAdvanced'
    | 'hud.budgetYear'
    | 'hud.campaignComplete'
    | 'hud.paused'
    | 'hud.resumed'
    | 'hud.speedUp'
    | 'hud.speedDown'
    | 'hud.saved'
    | 'hud.saveFailed'
    | 'hud.railExpanded'
    | 'hud.railCollapsed'
    | 'hud.buildingSelected'
    | 'hud.buildingDeselected'
    | 'hud.newsOpened'
    | 'hud.newsClosed'
    | 'hud.simulationFailed'
    | 'hud.reset'
  // Council motions and the vote itself.
    | 'vote.motionRaised'
    | 'vote.sheetOpened'
    | 'vote.sheetClosed'
    | 'vote.negotiationSent'
    | 'vote.negotiationAccepted'
    | 'vote.campaignSent'
    | 'vote.campaignRegistered'
    | 'vote.called'
    | 'vote.passed'
    | 'vote.failed'
    | 'vote.surprise'
    | 'vote.resultDismissed'
  // Municipal money. The city has a budget, so the commerce cues carry real meaning here.
    | 'budget.committed'
    | 'budget.spent'
    | 'budget.income'
    | 'budget.overdrawn'
  // Ongoing work. These are the only looping cues in the product.
    | 'work.started'
    | 'work.finished'

export interface SoundBinding {
  cue: CueName
  /** Why this cue and not a neighbouring one. Read this before changing a mapping. */
  reason: string
  options?: PlayOptions
}

/*
 * Hover and press fire on every control, so they are the two cues a player hears thousands of
 * times. Rate-limiting is what keeps a pointer dragged across a dense panel a texture rather than
 * a stutter — and rate-limiting alone.
 *
 * They carry no extra attenuation, because measurement showed the pack already encodes that
 * balance: at full volume the zen cues peak at roughly 0.018 for hover and 0.064 for an outcome,
 * about -35 and -24 dBFS. A second attenuation on top put hover near -50 dBFS, which is inaudible
 * on a laptop speaker. Trust the pack's own mix; only the master volume is ours to set.
 */
export const HOVER_COOLDOWN_MS = 110
export const PRESS_COOLDOWN_MS = 45

export const SOUND_CUES: Record<SoundEvent, SoundBinding> = {
  'ui.hover': {
    cue: 'hover',
    reason: 'Pointer discovery without commitment, on every enabled control.',
    options: { cooldownMs: HOVER_COOLDOWN_MS, retrigger: 'ignore' },
  },
  'ui.press': {
    cue: 'press',
    reason: 'The physical half of a click. The outcome cue answers it on release.',
    options: { cooldownMs: PRESS_COOLDOWN_MS },
  },
  'ui.focus': {
    cue: 'focus',
    reason: 'Keyboard focus only, so tabbing through the party hall is audible.',
    options: { cooldownMs: 80 },
  },

  'stage.forward': { cue: 'forward', reason: 'The entry flow advances one stage.' },
  'stage.back': { cue: 'back', reason: 'The entry flow returns to an earlier stage.' },
  'stage.partySelected': { cue: 'select', reason: 'A party enters the active set; the profile opens.' },
  'stage.cityEntered': { cue: 'start', reason: 'The campaign session begins. Also the music fade-in.' },
  'entry.cityReady': {
    cue: 'complete',
    reason: 'The city finished building. Usually inaudible: it lands before the first gesture unlocks audio.',
  },
  'entry.priorityAdded': { cue: 'toggle-on', reason: 'A manifesto priority becomes active.' },
  'entry.priorityRemoved': { cue: 'toggle-off', reason: 'A manifesto priority is dropped.' },
  'entry.prioritiesComplete': {
    cue: 'checkpoint',
    reason: 'Three of three chosen: the stage is complete and the continue action unlocks.',
  },
  'entry.priorityRejected': {
    cue: 'blocked',
    reason: 'A fourth priority was attempted. The store drops it silently, so sound is the only feedback.',
  },

  'hud.monthAdvanced': {
    cue: 'progress-step',
    reason: 'A month committed under the clock. At 1x a month is five real minutes, so this is rare.',
  },
  'hud.budgetYear': { cue: 'checkpoint', reason: 'January: the budget year turns over. A milestone, not a step.' },
  'hud.campaignComplete': { cue: 'achievement', reason: 'December 2036. The only celebratory cue in the product.' },
  'hud.paused': { cue: 'pause', reason: 'The clock stops.' },
  'hud.resumed': { cue: 'play', reason: 'The clock runs again.' },
  'hud.speedUp': { cue: 'skip-next', reason: 'Time runs faster.' },
  'hud.speedDown': { cue: 'skip-previous', reason: 'Time runs slower without stopping.' },
  'hud.saved': { cue: 'checkpoint', reason: 'The snapshot reached IndexedDB.' },
  'hud.saveFailed': { cue: 'error', reason: 'Saving failed. A genuine system fault.' },
  'hud.railExpanded': { cue: 'expand', reason: 'The metric rail reveals the full report.' },
  'hud.railCollapsed': { cue: 'collapse', reason: 'The metric rail returns to the short view.' },
  'hud.buildingSelected': { cue: 'select', reason: 'A building in the 3D city is picked.' },
  'hud.buildingDeselected': { cue: 'deselect', reason: 'The building card is dismissed.' },
  'hud.newsOpened': { cue: 'open', reason: 'A headline opens its dialog.' },
  'hud.newsClosed': { cue: 'close', reason: 'The headline dialog recedes.' },
  'hud.simulationFailed': { cue: 'error', reason: 'The worker stopped. The one place an error tone is honest.' },
  'hud.reset': { cue: 'retry', reason: 'The player reloads the city after a fault.' },

  'vote.motionRaised': {
    cue: 'notification',
    reason: 'The council raises a motion on its own and the clock stops. Always paired with the sheet opening.',
  },
  'vote.sheetOpened': { cue: 'open', reason: 'The motion sheet appears.' },
  'vote.sheetClosed': { cue: 'close', reason: 'The motion sheet recedes without a vote.' },
  'vote.negotiationSent': { cue: 'send', reason: 'Political capital leaves the player toward a faction.' },
  'vote.negotiationAccepted': { cue: 'receive', reason: 'The faction is now negotiated and the forecast moves.' },
  'vote.campaignSent': { cue: 'send', reason: 'A public campaign is bought for one option.' },
  'vote.campaignRegistered': { cue: 'receive', reason: 'The campaign is registered against the motion.' },
  'vote.called': { cue: 'start', reason: 'The vote is called. The council is now deciding.' },
  'vote.passed': { cue: 'success', reason: 'More yes than no. The measure exists from here on.' },
  'vote.failed': {
    cue: 'warning',
    /*
     * Not `error`. docs/GAME_DESIGN.md: "failing is a legitimate and consequential outcome". An
     * error tone would tell the player the game broke rather than that the council said no.
     */
    reason: 'The motion was rejected. A consequential state, not a fault.',
  },
  'vote.surprise': {
    cue: 'info',
    reason: 'The result contradicted the forecast. Accents the explanation the result card already shows.',
  },
  'vote.resultDismissed': { cue: 'close', reason: 'The roll-call card is acknowledged.' },

  'budget.committed': {
    cue: 'checkout',
    reason: 'A vote was called on a motion that costs money: the city is entering the payment flow.',
  },
  'budget.spent': { cue: 'purchase', reason: 'The motion passed and its one-off cost is committed to the budget.' },
  'budget.income': { cue: 'refund', reason: 'A measure that earns rather than costs became active.' },
  'budget.overdrawn': {
    cue: 'warning',
    reason: 'Budget headroom fell below zero. The rail shows it; the tone makes it impossible to miss.',
    options: { cooldownMs: 30_000 },
  },

  'work.started': {
    cue: 'processing',
    /* The one cue that runs continuously, so it is also the one that may sit under the others. */
    reason: 'The worker has been computing for longer than a frame budget. Loops until the snapshot lands.',
    options: { volume: 0.6 },
  },
  'work.finished': { cue: 'complete', reason: 'A long computation returned. Only fires if work.started was audible.' },
}

/**
 * Deliberately silent, with the reason. A reviewer should be able to tell an oversight from a
 * decision, and the unit test keeps this list honest against SOUND_CUES.
 */
export const SILENT_BY_DESIGN: Record<string, string> = {
  'ticker.rotation': 'The marquee never stops moving; a cue there would never stop either.',
  'forecast.updated': 'Forecasts refresh milliseconds after the sheet opens and would double the open cue.',
  'metric.changed': 'Fifteen indicators move every month. The month cue already says the city recalculated.',
  'camera.move': 'Continuous input. Sound belongs to discrete state changes, not to the drag itself.',
  'renderer.stats': 'A debug badge, not a player-facing state change.',
  'ui.release': 'Press plus outcome is already a complete gesture; a third tone per click is mush.',
  'hud.monthRequested': 'The press cue answers the click; the month cue answers the worker. A third is noise.',
  /*
   * Verified in Chrome rather than assumed: a `disabled` form control dispatches no pointer or
   * keyboard event at all, and the event does not reach an ancestor either, so no delegated
   * listener can hear the click. A refusal is only audible where the product itself knows it
   * refused — see `entry.priorityRejected`, which carries the `blocked` cue.
   */
  'ui.disabledClick': 'A disabled control dispatches no event, so the refusal is unhearable by delegation.',
}

export function cueFor(event: SoundEvent): SoundBinding {
  return SOUND_CUES[event]
}
