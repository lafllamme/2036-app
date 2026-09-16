import type { EventDrawState } from '../../app/simulation/events'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { BASELINE_METRICS, BASELINE_STOCKS } from '../../app/simulation/baseline'
import { applyMeasures, costThisMonth, eligibleEvents, rampFactor } from '../../app/simulation/events'
import { advanceMonths, applyPolicy, campaignFor, createInitialState, forecastsForEvent, migrateState, negotiate, resolveDecision, snapshotOf } from '../../app/simulation/model'

describe('event library', () => {
  /*
   * Die Formregel, von der Inhaltsseite her geprüft.
   *
   * Eine Weggabelung braucht einen Weg, den die Verwaltung nimmt, wenn niemand entscheidet. Eine
   * Vorlage braucht das Gegenteil: keinen Ersatzbeschluss, sondern einen Preis für das Nein. Solange
   * beides dieselbe Form hatte, musste jede Haltungsfrage eine Nichts-tun-Karte mitschleppen.
   */
  it('gives a Weggabelung a default and a Vorlage a price for refusing', () => {
    expect(new Set(EVENTS.map(event => event.id)).size).toBe(EVENTS.length)
    for (const event of EVENTS) {
      expect(new Set(event.options.map(option => option.id)).size).toBe(event.options.length)
      if (event.options.length > 1) {
        expect(event.defaultOptionId, `${event.id}: Weggabelung ohne Weg für den Fall, dass niemand entscheidet`).toBeDefined()
        expect(event.options.some(option => option.id === event.defaultOptionId)).toBe(true)
        expect(event.refusedEffects, `${event.id}: eine Weggabelung wird nicht abgelehnt, sie wird gewählt`).toBeUndefined()
      }
      if (event.options.length === 1) {
        expect(event.defaultOptionId, `${event.id}: eine Vorlage hat keinen Ersatzbeschluss`).toBeUndefined()
      }
    }
  })

  it('never triggers on an identity-composition indicator', () => {
    const forbidden = ['internationalShare']
    for (const event of EVENTS) {
      for (const condition of event.trigger.conditions) {
        expect(forbidden).not.toContain(condition.metric)
      }
    }
  })

  it('buys capacity rather than writing outcomes directly', () => {
    // Measures may not set a crime rate, a satisfaction value, or an employment rate.
    /*
     * Every figure the dynamics chase a target for. A `level` effect on one of these is erased within
     * months — the convergence simply takes it back — so an option that writes one is an option that
     * promises something the model never delivers. Ten of them wrote `businessStock` and the whole
     * economic loop was quietly temporary; see `businessSites` in `baseline.ts`.
     *
     * `immediateEffects` are deliberately not checked here: a chemical accident's spike or an
     * attack's polarisation *should* fade, and writing the metric directly is how a shock is said.
     */
    const outcomeOnly = [
      'crimeRate',
      'burglaryRate',
      'satisfaction',
      'employment',
      'youthUnemployment',
      'averageRent',
      'businessStock',
      'emissions',
      'polarisation',
      'transitReliability',
    ]
    for (const event of EVENTS) {
      for (const option of event.options) {
        for (const effect of option.effects) expect(outcomeOnly).not.toContain(effect.target)
      }
    }
  })

  it('fires events across a full campaign without leaving decisions stuck open', () => {
    const state = advanceMonths(createInitialState(2036, 'spd', ['housing', 'employment', 'mobility']), 131)
    expect(state.firedOnce.length).toBeGreaterThan(8)
    expect(state.measures.length).toBeGreaterThan(4)
    for (const pending of state.pending) expect(pending.expiresMonth).toBeGreaterThanOrEqual(state.month)
  })

  it('applies a level effect exactly once rather than every month', () => {
    const metrics = { ...BASELINE_METRICS }
    const stocks = { ...BASELINE_STOCKS }
    const measure = {
      key: 'test',
      sourceId: 'test',
      optionId: 'test',
      label: 'Test',
      category: 'safety' as const,
      kind: 'decision' as const,
      startedMonth: 0,
      monthlyCost: 0,
      costMonths: null,
      applied: {},
      effects: [{ target: 'orderServiceFte' as const, mode: 'level' as const, delayMonths: 0, rampMonths: 4, min: 10, expected: 14, max: 18, confidence: 'high' as const }],
    }
    for (let month = 1; month <= 40; month += 1) applyMeasures([measure], metrics, stocks, month, [])
    expect(stocks.orderServiceFte).toBeCloseTo(BASELINE_STOCKS.orderServiceFte + 14, 6)
  })

  /*
   * Ten years of play used to end with twenty-one entries under „Laufende Maßnahmen" and no way to
   * end any of them, against a city that has 0,5 Mio. € a month to spare. A permanent charge is a
   * subscription the player can never cancel, so it has to be a deliberate act of authoring: real
   * staff, real operations. Everything else — a lawsuit, an inspection, a build, a funding
   * programme — ends, and `costMonths` says when.
   */
  it('only lets genuine staff and operations bind the budget for good', () => {
    const forever = new Set([
      'saf-burglary-order', // Stellen im Ordnungsdienst
      'saf-burglary-cctv', // Betrieb und Wartung der Anlagen
      'saf-youth-transfer', // der neue Träger betreibt weiter
      'soc-childcare-build', // Kitaplätze brauchen dauerhaft Erzieherinnen
      'soc-childcare-daycare', // laufende Leistung an die Tagespflege
      'soc-allocation-decentral', // Unterbringung und Kurse laufen weiter
      'mob-bridge-detour', // die Umleitung ist die Dauerlösung
      'mob-funding-apply', // ein dichterer Takt ist Betrieb, kein Projekt
      'soc-judgment-build', // wie soc-childcare-build
      'gov-cyber-rebuild', // „dauerhaft absichern" heißt dauerhaft
    ])
    const unexpected = EVENTS.flatMap(event => event.options)
      .filter(option => option.monthlyCost > 0 && option.costMonths === undefined && !forever.has(option.id))
      .map(option => `${option.id} (${option.label})`)
    expect(unexpected, 'binden den Haushalt dauerhaft, ohne Betrieb zu sein — costMonths setzen oder hier eintragen').toEqual([])
  })

  it('keeps a policy time limit when it is carried as a motion', () => {
    const started = applyPolicy(createInitialState(2036, 'spd', []), 'business-tax-balance')
    const pact = started.measures.find(measure => measure.sourceId === 'business-tax-balance')
    expect(pact?.costMonths).toBe(60)
  })

  it('heals a save that has NaN in it instead of rendering one', () => {
    const state = createInitialState(2036, 'spd', [])
    const poisoned = { ...state, metrics: { ...state.metrics, population: Number.NaN, cityBudget: Number.NaN }, stocks: { ...state.stocks, businessSites: Number.NaN } }
    const healed = migrateState(poisoned)
    expect(healed.metrics.population).toBe(BASELINE_METRICS.population)
    expect(healed.metrics.cityBudget).toBe(BASELINE_METRICS.cityBudget)
    expect(healed.stocks.businessSites).toBe(BASELINE_STOCKS.businessSites)
    // Everything that was a number stays exactly the number it was.
    expect(migrateState(state).metrics).toEqual(state.metrics)
  })

  it('stops charging a time-limited measure, and keeps what it bought', () => {
    const temporary = { key: 't', kind: 'decision' as const, sourceId: 't', optionId: 't', label: 'T', category: 'economy' as const, startedMonth: 10, monthlyCost: 1.2, costMonths: 60, effects: [], applied: {} }
    expect(costThisMonth(temporary, 10)).toBe(1.2)
    expect(costThisMonth(temporary, 69)).toBe(1.2)
    expect(costThisMonth(temporary, 70)).toBe(0)
    expect(costThisMonth({ ...temporary, costMonths: null }, 200)).toBe(1.2)
  })

  it('ramps from zero to full between delay and ramp length', () => {
    expect(rampFactor(1, 2, 10)).toBe(0)
    expect(rampFactor(2, 2, 10)).toBeCloseTo(0.1, 6)
    expect(rampFactor(40, 2, 10)).toBe(1)
  })

  it('records a rejected motion as a defeat that costs trust', () => {
    let state = createInitialState(2036, 'linke', ['housing', 'cohesion', 'climate'])
    state = advanceMonths(state, 131)
    const withDecision = { ...state, pending: [{ eventId: 'saf-burglary-series', raisedMonth: state.month, expiresMonth: state.month + 3, negotiatedPartyIds: [], campaignedOptionIds: [], tabledBy: null, tabledOptionId: null }] }
    const trustBefore = withDecision.perception.trust
    const outcome = resolveDecision(withDecision, 'saf-burglary-series', 'saf-burglary-cctv')

    expect(outcome.result).not.toBeNull()
    expect(snapshotOf(outcome.state).pendingDecisions).toHaveLength(0)
    if (outcome.result && !outcome.result.passed)
      expect(outcome.state.perception.trust).toBeLessThan(trustBefore)
  })
})

describe('motion preparation', () => {
  it('lets negotiation and campaigning move a standing motion that has no pending entry', () => {
    // Regression: the three standing motions are never raised as events, so preparation used to
    // silently no-op on them and the buttons did nothing.
    const start = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const before = forecastsForEvent(start, 'housing-accelerator')['housing-accelerator']

    const negotiated = negotiate(start, 'housing-accelerator', 'cdu')
    const afterNegotiation = forecastsForEvent(negotiated, 'housing-accelerator')['housing-accelerator']
    const campaigned = campaignFor(negotiated, 'housing-accelerator', 'housing-accelerator')
    const afterCampaign = forecastsForEvent(campaigned, 'housing-accelerator')['housing-accelerator']

    expect(before).toBeDefined()
    expect(afterNegotiation?.majorityProbability ?? 0).toBeGreaterThan(before?.majorityProbability ?? 1)
    expect(afterCampaign?.majorityProbability ?? 0).toBeGreaterThan(afterNegotiation?.majorityProbability ?? 1)
    expect(campaigned.metrics.politicalCapital).toBeLessThan(start.metrics.politicalCapital)
  })

  it('charges political capital only once per party and option', () => {
    const start = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const once = negotiate(start, 'housing-accelerator', 'cdu')
    const twice = negotiate(once, 'housing-accelerator', 'cdu')
    expect(twice.metrics.politicalCapital).toBe(once.metrics.politicalCapital)
  })

  it('forms a minority coalition rather than admitting an incompatible partner', () => {
    const state = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const seats = state.coalitionPartyIds.reduce((sum, id) => sum + state.seatsByParty[id], 0)

    expect(state.coalitionPartyIds).toContain('spd')
    expect(state.coalitionPartyIds.length).toBeLessThan(5)
    expect(seats).toBeLessThan(31)
  })

  it('keeps the player from passing their own flagship motion unopposed', () => {
    const state = createInitialState(2036, 'spd', ['housing', 'employment', 'mobility'])
    const forecast = forecastsForEvent(state, 'housing-accelerator')['housing-accelerator']
    expect(forecast?.majorityProbability ?? 1).toBeLessThan(0.6)
  })
})

describe('modal arbitration', () => {
  it('holds a newly raised motion back until the vote result is acknowledged', async () => {
    // Regression: both overlays render a full-screen backdrop. Shown together they stacked, and the
    // upper one swallowed every click — including "Nächster Monat", which hung the browser suite.
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useGameStore } = await import('../../app/stores/game')
    const game = useGameStore()

    game.lastVoteResult = {
      optionId: 'saf-burglary-order',
      passed: true,
      yesSeats: 34,
      noSeats: 20,
      abstainSeats: 6,
      votes: [],
      forecast: { expectedYesSeats: 34, expectedNoSeats: 20, majorityProbability: 0.8, parties: [] },
    }
    game.openDecisionSheet('saf-burglary-series')

    expect(game.openDecisionId).toBe('saf-burglary-series')
    expect(game.openDecision).toBeNull()

    game.dismissVoteResult()
    expect(game.openDecision?.definition.id).toBe('saf-burglary-series')
  })
})

/** A city with nothing decided, nothing on cooldown and every metric at the baseline. */
function drawState(): EventDrawState {
  return {
    month: 12,
    metrics: BASELINE_METRICS,
    firedOnce: [],
    choices: [],
    cooldowns: {},
    streaks: {},
    activeMeasureSources: [],
    openDecisions: 0,
    coalitionSeats: 60,
  }
}

describe('a motion the council has decided', () => {
  /*
   * The complaint that produced this: put a motion to the vote, lose it, and a few months later the
   * same sheet with the same options was back. It was deliberate — a problem voted down is still a
   * problem — but it is true of the problem and not of the motion, and what it produced was a
   * council you could keep asking until it said yes.
   *
   * Nine of the eighteen events were flagged `oncePerCampaign` and the other nine were actively put
   * back on a defeat: cleared from `firedOnce`, cooldown cut to forty per cent.
   */
  const withOptions = EVENTS.filter(event => event.options.length > 0)

  it('has motions to check at all', () => {
    expect(withOptions.length).toBeGreaterThan(10)
  })

  /*
   * Beschlossen heißt erledigt — gestellt heißt nur gestellt.
   *
   * Der Test verlangte hier `firedOnce`, also „war schon einmal auf der Tagesordnung", und deckte
   * damit eine Regel ab, die den Inhaltsvorrat des ganzen Spiels auf die Zahl der geschriebenen
   * Entscheidungen begrenzte: ab 2029 stand in den meisten Monaten null Ereignis zur Wahl. Was der
   * Rat *getan* hat, kommt nicht wieder; worüber er nur gestritten hat, schon — nach seiner
   * Sperrfrist, denn das Problem ist ja geblieben.
   */
  it('never comes back once the council has carried it', () => {
    for (const event of withOptions) {
      const carried: EventDrawState = {
        ...drawState(),
        choices: [`${event.id}:${event.options[0]!.id}`],
        month: event.trigger.earliestMonth + 1,
      }
      expect(eligibleEvents(carried, 1).map(entry => entry.id), event.id).not.toContain(event.id)
    }
  })

  it('comes back after its cooldown when the council refused it', () => {
    // Eine Vorlage, die abgelehnt wurde: gestellt, aber nichts beschlossen.
    const repeatable = withOptions.filter(event => !event.trigger.oncePerCampaign)
    expect(repeatable.length, 'kein einziges Ereignis darf sich wiederholen').toBeGreaterThan(5)
    for (const event of repeatable) {
      const refused: EventDrawState = {
        ...drawState(),
        firedOnce: [event.id],
        month: Math.min(event.trigger.latestMonth, event.trigger.earliestMonth + event.trigger.cooldownMonths + 1),
      }
      const eligible = eligibleEvents({ ...refused, cooldowns: {} }, 1).map(entry => entry.id)
      // Bedingungen können es weiterhin ausschließen; geprüft wird nur, dass `firedOnce` allein es nicht tut.
      const blockedByFiredOnce = !eligible.includes(event.id)
        && eligibleEvents({ ...refused, cooldowns: {}, firedOnce: [] }, 1).map(entry => entry.id).includes(event.id)
      expect(blockedByFiredOnce, `${event.id} bleibt allein deshalb weg, weil es schon einmal gestellt wurde`).toBe(false)
    }
  })

  it('is still eligible while it has not been decided', () => {
    const undecided: EventDrawState = { ...drawState(), firedOnce: [] }
    // At least something can happen, or the test above would pass for the wrong reason.
    expect(eligibleEvents(undecided, 1).length).toBeGreaterThan(0)
  })
})

describe('what a coalition is for', () => {
  /*
   * It used to do one thing and do it invisibly: a coalition partner's chance of voting yes went up
   * by twelve hundredths. Nothing about holding thirty-one seats rather than eighteen changed what
   * the player was ever offered, so building a coalition had no visible reward.
   *
   * Eight of the eighteen motions now need a council behind them before anybody will table them.
   * The other ten are things that happen *to* the city — a bridge closed, a works shut, the state
   * pulling police posts — and a crisis does not wait for your coalition.
   */
  it('offers a big coalition everything a small one is offered, and more', () => {
    const small = eligibleEvents({ ...drawState(), coalitionSeats: 12 }, 1).map(event => event.id)
    const large = eligibleEvents({ ...drawState(), coalitionSeats: 60 }, 1).map(event => event.id)
    for (const id of small)
      expect(large, id).toContain(id)
    expect(large.length).toBeGreaterThan(small.length)
  })

  it('never gates a crisis behind a majority', () => {
    /*
     * The rule that keeps the threshold from becoming a wall: a city with no coalition at all still
     * has events, and they are the ones it did not choose.
     */
    const alone = eligibleEvents({ ...drawState(), coalitionSeats: 0 }, 1)
    expect(alone.length).toBeGreaterThan(0)
    for (const event of alone)
      expect(event.trigger.minCoalitionSeats, event.id).toBeUndefined()
  })

  it('asks for less than a majority even at its most demanding', () => {
    // A threshold above half the council would mean a motion nobody without a majority ever sees,
    // and the point is to reward building one rather than to lock the game behind it.
    for (const event of EVENTS)
      expect(event.trigger.minCoalitionSeats ?? 0, event.id).toBeLessThanOrEqual(30)
  })
})
