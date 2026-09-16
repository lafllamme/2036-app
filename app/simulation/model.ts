import type {
  ActiveMeasureView,
  CampaignGoalId,
  CampaignLeader,
  CampaignPriorityId,
  CausalEdge,
  CityMetrics,
  CityVisualState,
  EventDefinition,
  EventOption,
  MetricId,
  NewsItem,
  PartyDefinition,
  PartyId,
  PartyVote,
  PendingDecision,
  PerceptionState,
  PolicyDefinition,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '../core/contracts'
import type { RandomStream } from '../core/rng'
import type { CityStocks } from './baseline'
import type { VoteContext } from './council'
import type { Defeat, EdgeState } from './election'
import type { Support } from './electorate'
import type { ActiveMeasure, EventDrawState } from './events'
import { getEvent } from '../content/events'
import { getGoal, goalIsMet } from '../content/goals'
import { getBackground } from '../content/leaders'
import { getParty, mapParties, PARTIES } from '../content/parties'
import { getPolicy, mayTable } from '../content/policies'
import { CAMPAIGN_LAST_MONTH } from '../core/campaign'
import { formatNumber } from '../core/format'
import { createRandomStream } from '../core/rng'
import {
  BASELINE_METRICS,
  BASELINE_PERCEPTION,
  BASELINE_STOCKS,

  vacancyRate,
} from './baseline'
import { castVote, forecastVote, supportFor } from './council'
import { BASE_CAPITAL_PER_MONTH, clamp, healthFromState, stepDynamics } from './dynamics'
import { defeatFromEdges, holdElection, isElectionMonth, MAJORITY, trackEdges, votedOut } from './election'
import { axisDistance, driftFromCity, initialSupport, shiftFromDecision } from './electorate'
import {

  applyMeasures,
  costThisMonth,
  drawEvent,

  measureFromOption,
  updateStreaks,
} from './events'

export interface ActivePolicyState {
  id: string
  startedMonth: number
}

export interface MotionPreparation {
  negotiatedPartyIds: PartyId[]
  campaignedOptionIds: string[]
}

const EMPTY_PREPARATION: MotionPreparation = { negotiatedPartyIds: [], campaignedOptionIds: [] }

function preparationFor(state: SimulationState, motionId: string): MotionPreparation {
  return state.motionPrep[motionId] ?? EMPTY_PREPARATION
}

/** Drop the preparation for a motion once it has been voted on: the capital is spent either way. */
function withoutPreparation(motionPrep: Record<string, MotionPreparation>, motionId: string): Record<string, MotionPreparation> {
  return Object.fromEntries(Object.entries(motionPrep).filter(([id]) => id !== motionId))
}

export interface SimulationState {
  seed: number
  month: number
  partyId: PartyId | null
  goalIds: CampaignGoalId[]
  /** Wer den Vorsitz hat. Null in Spielständen von vor Stufe 6 und in Tests. */
  leader: CampaignLeader | null
  metrics: CityMetrics
  previousMetrics: CityMetrics
  /**
   * The city as it was on the first day, kept for the whole campaign.
   *
   * A number on its own is not information. "Kriminalität 52 / 1.000" says nothing about whether the
   * player is doing well; "52, seit Amtsantritt +7 %" says everything. Held in the state rather than
   * recomputed, because it has to survive a save — a baseline that resets on reload is worse than
   * none, since it quietly tells the player they have changed nothing.
   */
  baselineMetrics: CityMetrics
  /**
   * What the player's own decisions have done to each metric, summed over the campaign.
   *
   * Keyed metric, then the measure's name. Only decisions are kept: the city's dynamics move every
   * number every month and would drown out the one thing the player can act on. The question is not
   * "why is crime 52" — the model answers that — but "what did I do to it".
   */
  drivers: Partial<Record<MetricId, Record<string, { label: string, delta: number }>>>
  stocks: CityStocks
  perception: PerceptionState
  measures: ActiveMeasure[]
  pending: PendingDecision[]
  /**
   * Negotiation and campaigning the player has already paid for, keyed by motion id. Kept apart
   * from `pending` because the three standing motions are voted on without ever being raised as an
   * event, and they must support the same preparation.
   */
  motionPrep: Record<string, MotionPreparation>
  cooldowns: Record<string, number>
  streaks: Record<string, number>
  firedOnce: string[]
  /** Every choice the council carried, as `eventId:optionId`. What the city did, not what it was asked. */
  choices: string[]
  /**
   * How many motions somebody else has tabled so far.
   *
   * Kept because the first one is not rolled for. An opposition that happens not to table anything
   * for two years because the dice went that way is an opposition the player never learns they have —
   * and the whole point of the mechanic is that the chamber has five other groups in it.
   */
  tabledByOthers: number
  relationships: Partial<Record<PartyId, number>>
  seatsByParty: Record<PartyId, number>
  coalitionPartyIds: PartyId[]
  /**
   * Who the city would vote for today, as six shares that add to one.
   *
   * Kept apart from `seatsByParty` on purpose: seats do not move between elections and support does.
   * The gap between the two *is* the game — you govern with a majority that is no longer the city.
   */
  support: Support
  /** How many months running the city has been past each hard edge. See `election.ts`. */
  edges: EdgeState
  /** Why the campaign ended early, or null while the player is still in office. */
  defeat: Defeat | null
  news: NewsItem[]
  causalEdges: CausalEdge[]
  /** Legacy view for the three directly adoptable policies. */
  policies: ActivePolicyState[]
}

function dateForMonth(month: number): { year: number, monthOfYear: number } {
  return { year: 2026 + Math.floor(month / 12), monthOfYear: (month % 12) + 1 }
}

function seatsFromContent(): Record<PartyId, number> {
  return mapParties(party => party.stats.councilSeats)
}

/** Mean per-axis distance beyond which two parties will not sit in one coalition. */
const COALITION_COMPATIBILITY_LIMIT = 0.55

/**
 * Coalition formation runs on position distance, never on identity: start from the player's own
 * party and admit the closest compatible parties until the bloc holds a majority.
 *
 * Incompatible partners are never admitted just to reach 31 seats, so a player whose neighbours are
 * all far away governs as a minority and has to win every vote by negotiation. That is a legitimate
 * and common municipal outcome, not a failure state.
 */
function formCoalition(partyId: PartyId | null): PartyId[] {
  return formCoalitionWith(partyId, seatsFromContent())
}

/**
 * The same rule, against whatever the council currently looks like.
 *
 * Split out for election night: after the count the seats are not the ones written in `parties.ts`
 * any more, and a coalition formed against the old numbers is a coalition that does not exist.
 */
function formCoalitionWith(partyId: PartyId | null, seats: Record<PartyId, number>): PartyId[] {
  if (!partyId)
    return []
  const own = getParty(partyId)
  const axisKeys = Object.keys(own.axes) as (keyof typeof own.axes)[]
  const distance = (other: PartyDefinition): number =>
    axisKeys.reduce((sum, axis) => sum + Math.abs(own.axes[axis] - other.axes[axis]), 0) / axisKeys.length

  const partners = PARTIES
    .filter(party => party.id !== partyId && distance(party) <= COALITION_COMPATIBILITY_LIMIT)
    .sort((a, b) => distance(a) - distance(b))

  const coalition: PartyId[] = [partyId]
  let total = seats[partyId]
  for (const partner of partners) {
    if (total > 30)
      break
    coalition.push(partner.id)
    total += seats[partner.id]
  }
  return coalition
}

/** Wie weit die Startverhältnisse auseinandergehen dürfen. Ein Rat, kein Lager. */
const OPENING_SPREAD = 0.45

/**
 * Wer am ersten Tag mit wem kann.
 *
 * Stand bei allen auf null: sechs Fraktionen, die einen gleich gut kennen, und eine Koalition, die
 * sich nur aus Sitzen ergab. Ein Rat ist aber am Tag der Konstituierung schon sortiert — wer
 * inhaltlich nahe steht, redet miteinander, und wer weit weg steht, hat schon im Wahlkampf
 * übereinander geredet.
 *
 * Abgeleitet aus dem, was ohnehin dasteht: dem Achsenabstand. Kein neuer Inhalt, keine Matrix, die
 * jemand pflegen müsste, und keine Verzweigung auf eine Parteikennung — nur dieselbe Nähe, die auch
 * das Wahlvolk und der Rat benutzen. Darüber liegt, was der Vorsitz persönlich mitbringt.
 */
function relationshipsAtStart(partyId: PartyId | null, leader: CampaignLeader | null): Partial<Record<PartyId, number>> {
  const fromBackground = leader ? getBackground(leader.backgroundId)?.startingRelationship ?? 0 : 0
  const own = partyId ? getParty(partyId) : null
  if (!own)
    return fromBackground === 0 ? {} : Object.fromEntries(PARTIES.map(party => [party.id, fromBackground]))

  return Object.fromEntries(PARTIES.filter(party => party.id !== own.id).map((party) => {
    // Abstand 0,25 heißt „nah" und ergibt +0,45; 0,75 heißt „fern" und ergibt −0,45.
    const closeness = 1 - 2 * axisDistance(own.axes, party.axes)
    return [party.id, clamp(closeness * OPENING_SPREAD + fromBackground, -1, 1)]
  }))
}

/** Der Wert, um den die sechs Apparate streuen. */
const TYPICAL_ORGANISATION = 70

/**
 * Wie schnell politisches Kapital nachwächst, je Partei.
 *
 * `organization` steht seit jeher in jedem Parteiprofil — 78 bei der CDU, 52 bei der FDP — und wurde
 * von null Code gelesen. Ein gut aufgestellter Apparat arbeitet Vorlagen schneller ab; ein dünner
 * braucht für dasselbe länger.
 */
function organisationFactor(partyId: PartyId | null): number {
  return partyId ? getParty(partyId).stats.organization / TYPICAL_ORGANISATION : 1
}

/** Was eine öffentliche Kampagne regulär kostet. */
const CAMPAIGN_COST = 18

/** Was sie diesen Vorsitz kostet: wer der Stadt schon bekannt ist, braucht weniger Anlauf. */
export function campaignCost(leader: CampaignLeader | null): number {
  return CAMPAIGN_COST - (leader ? getBackground(leader.backgroundId)?.campaignDiscount ?? 0 : 0)
}

/** Wie schnell politisches Kapital nachwächst. Der Grundwert steht in `dynamics`. */
export function capitalPerMonth(leader: CampaignLeader | null, partyId: PartyId | null = null): number {
  const fromLeader = leader ? getBackground(leader.backgroundId)?.capitalPerMonth ?? BASE_CAPITAL_PER_MONTH : BASE_CAPITAL_PER_MONTH
  return fromLeader * organisationFactor(partyId)
}

export function createInitialState(
  seed = 2036,
  partyId: PartyId | null = null,
  goalIds: CampaignGoalId[] = [],
  leader: CampaignLeader | null = null,
): SimulationState {
  // Womit man antritt: ein Betrieb im Rücken bringt Spielraum, eine Bürgerinitiative bringt Publikum.
  const background = leader ? getBackground(leader.backgroundId) : undefined
  const metrics = { ...BASELINE_METRICS, politicalCapital: background?.startingCapital ?? BASELINE_METRICS.politicalCapital }
  return {
    seed,
    month: 0,
    partyId,
    goalIds,
    leader,
    metrics,
    previousMetrics: { ...metrics },
    stocks: { ...BASELINE_STOCKS },
    perception: { ...BASELINE_PERCEPTION, mediaAttention: { ...BASELINE_PERCEPTION.mediaAttention } },
    measures: [],
    pending: [],
    motionPrep: {},
    cooldowns: {},
    streaks: {},
    firedOnce: [],
    choices: [],
    tabledByOthers: 0,
    /*
     * Wie der Rat zu einem steht, bevor irgendetwas passiert ist.
     *
     * Stand bei allen auf null: sechs Fraktionen, die einen gleich gut kennen. Wer aus der
     * Gewerkschaft kommt, hat in diesem Raum schon gesessen; wer aus einer Bürgerinitiative kommt,
     * hat ihn gegen sich aufgebracht.
     */
    relationships: relationshipsAtStart(partyId, leader),
    seatsByParty: seatsFromContent(),
    coalitionPartyIds: formCoalition(partyId),
    support: initialSupport(),
    baselineMetrics: { ...metrics },
    drivers: {},
    edges: { months: {} },
    defeat: null,
    news: [{ id: 'news-opening', month: 0, scope: 'city', urgency: 'important', headline: 'LINDENHAFEN: Neuer Stadtrat nimmt Arbeit für das Jahrzehnt 2026–2036 auf' }],
    causalEdges: [],
    policies: [],
  }
}

// ---------------------------------------------------------------------------
// Council votes
// ---------------------------------------------------------------------------

/**
 * Wie weit über den laufenden Saldo hinaus ein Rat zu gehen bereit ist.
 *
 * Nicht null, weil kein Haushalt je exakt ausgeglichen beschlossen wird und eine Stadt Rücklagen
 * auch auflösen darf. Aber klein, denn ein Beschluss, der mehr bindet als die Stadt im Monat übrig
 * hat, ist genau das, was zehn Jahre später die Kassenkredite erklärt.
 */
const MONTHLY_HEADROOM = 1.6

/**
 * Wie schwer eine Verpflichtung der Stadt fällt — und **eine Rücklage ist kein Einkommen.**
 *
 * Gemessen wurde das allein gegen `cityBudget`, also gegen den Haufen. Zwei Fehler steckten darin.
 * Erstens wird `cityBudget` bei null gekappt und der Rest läuft in `debt`, sodass eine Stadt mit
 * achthundert Millionen Schulden sich las wie eine mit null: jenseits der Null sah der Rat seine
 * Lage nicht mehr. Zweitens, und das war der teurere: 386 Millionen Rücklage bei 0,5 Millionen
 * Überschuss im Monat lassen jede Dauerkosten-Vorlage bezahlbar aussehen, und sie ist es nicht.
 * Gespielt hieß das, dass fünf von sechs Parteien im Jahrzehnt bei minus dreihundert bis minus
 * tausend landeten — auch dann, wenn der Spieler gegen alles stimmte.
 *
 * Also zwei Maße, und es gilt das strengere. **Laufendes** wird am Monatssaldo gemessen: wer schon
 * im Minus wirtschaftet, für den ist jede weitere Dauerausgabe maximal belastend. **Einmaliges** an
 * der Rücklage, vermindert um das, was der Schuldendienst bindet.
 */
function fiscalStressOf(state: SimulationState, oneOff: number, monthly: number): number {
  const room = Math.max(0.35, state.metrics.monthlyBalance + MONTHLY_HEADROOM)
  const reserve = Math.max(20, state.metrics.cityBudget - state.metrics.debt * 0.35)
  return clamp(Math.max(monthly / room, oneOff / reserve), 0, 1)
}

function voteContext(state: SimulationState, option: EventOption | PolicyDefinition, campaigned: boolean): VoteContext {
  const cost = 'oneOffCost' in option ? option.oneOffCost : option.implementationCost
  // What it actually commits the city to, over two years. A cut that ends after five is a smaller
  // ask than one that never does, and a chamber counting money knows the difference.
  const monthly = option.monthlyCost * Math.min(24, option.costMonths ?? 24) / 24
  const own = state.partyId ? getParty(state.partyId) : null
  /*
   * Welche Fraktion dieses Thema für ihres hält.
   *
   * Hing an den „Prioritäten" — drei weichen Schwerpunkten, die man beim Antritt wählte und die
   * sonst nichts taten. Die Ziele haben dieselbe Aufgabe übernommen und sind dabei das, was am Ende
   * auch gezählt wird: wer sich auf bezahlbare Mieten festlegt, findet im Rat die Fraktionen an
   * seiner Seite, die Wohnen zu ihrem Feld erklärt haben.
   */
  const fields = state.goalIds.map(id => getGoal(id)?.field).filter((field): field is CampaignPriorityId => field !== undefined)
  const salient = mapParties(party => party.focusPriorityIds.some(priority => fields.includes(priority)))
  return {
    parties: PARTIES,
    seatsByParty: state.seatsByParty,
    coalitionPartyIds: state.coalitionPartyIds,
    playerPartyId: state.partyId,
    playerNegotiation: own?.stats.negotiation ?? 50,
    relationships: state.relationships,
    publicPressure: campaigned ? 0.75 : clamp((100 - state.metrics.satisfaction) / 100, 0, 1) * 0.4,
    fiscalStress: fiscalStressOf(state, cost, monthly),
    salientCategories: salient,
  }
}

function asOption(policy: PolicyDefinition): EventOption {
  return {
    id: policy.id,
    label: policy.name,
    rationale: policy.summary,
    oneOffCost: policy.implementationCost,
    monthlyCost: policy.monthlyCost,
    costMonths: policy.costMonths,
    axes: policy.axes,
    salience: policy.salience,
    effects: policy.effects,
    sourceIds: policy.sourceIds,
  }
}

function forecastFor(state: SimulationState, motionId: string, optionId: string): VoteForecast | null {
  const campaigned = preparationFor(state, motionId).campaignedOptionIds.includes(optionId)
  // Auf einer eigenen Vorlage steht die eigene Stimme fest; auf einer fremden ist sie die Frage.
  const own = ownMotion(state, motionId) ? ({ playerVote: 'yes' } as const) : {}
  const policy = getPolicy(motionId)
  if (policy && policy.id === optionId)
    return forecastVote(asOption(policy), { ...voteContext(state, policy, campaigned), ...own })
  const option = getEvent(motionId)?.options.find(candidate => candidate.id === optionId)
  if (!option)
    return null
  return forecastVote(option, { ...voteContext(state, option, campaigned), ...own })
}

/**
 * Whether this motion is the player's own, as opposed to one another group tabled.
 *
 * Wer eine Vorlage einbringt, stimmt für sie. Das war bisher nicht so: die eigene Fraktion wurde auf
 * eigenen Vorlagen gewürfelt wie jede andere, und das Ergebnis war absurd — die LINKE brachte den
 * Gewerbesteuer-Pakt ein und ihre eigenen Abgeordneten stimmten zu hundert Prozent dagegen, während
 * das Modell das Einbringen gleichzeitig als Zustimmung wertete.
 *
 * Dass eine Partei Dinge einbringen kann, die ihr fremd sind, bleibt ein Problem — aber es ist das
 * Problem eines fehlenden Parteiprogramms, nicht eines der Abstimmung. Hier gilt nur: wer fragt,
 * ist dafür.
 */
function ownMotion(state: SimulationState, motionId: string): boolean {
  return !state.pending.find(entry => entry.eventId === motionId)?.tabledBy
}

export function forecastsForEvent(state: SimulationState, eventId: string): Record<string, VoteForecast> {
  const event = getEvent(eventId)
  const result: Record<string, VoteForecast> = {}
  if (!event) {
    const policy = getPolicy(eventId)
    if (policy) {
      const forecast = forecastFor(state, eventId, policy.id)
      if (forecast)
        result[policy.id] = forecast
    }
    return result
  }
  for (const option of event.options) {
    const forecast = forecastFor(state, eventId, option.id)
    if (forecast)
      result[option.id] = forecast
  }
  return result
}

/**
 * Option ids that stand for something that happened rather than something the council resolved:
 * the shock a situation deals on arrival, and the price of having refused it.
 */
const INCIDENT_OPTION_IDS = new Set(['sofort', 'abgelehnt'])

/**
 * Put a decision into effect, and write down that the city took this road.
 *
 * The choice is recorded here rather than where the vote is counted, because this is the one place
 * every road runs through: a council motion that passed, a standing motion the player tabled
 * themselves, an incident that simply happened.
 *
 * **Was hier hereinkommt, ist nicht immer eine Entscheidung.** Der Schock eines Vorfalls und der
 * Preis einer Ablehnung laufen durch dieselbe Funktion, weil beide über Monate wirken — aber keiner
 * von beiden ist etwas, das der Rat *getan* hat. Stünden sie in `choices`, hieße „abgelehnt"
 * dasselbe wie „beschlossen": die Vorlage käme nie wieder, und die Tür, die sich hinter einem Nein
 * öffnen soll, bliebe zu. Gemessen war das der Fall — fünf von sechs Nachspielen konnten nie
 * eintreten, weil ihre Elternvorlage nach der Ablehnung als erledigt galt.
 */
function adoptMeasure(state: SimulationState, sourceId: string, option: EventOption, category: ActiveMeasure['category']): SimulationState {
  const metrics = { ...state.metrics, cityBudget: Math.max(0, state.metrics.cityBudget - option.oneOffCost) }
  const decided = !INCIDENT_OPTION_IDS.has(option.id)
  const choice = `${sourceId}:${option.id}`
  return {
    ...state,
    metrics,
    choices: !decided || state.choices.includes(choice) ? state.choices : [...state.choices, choice],
    measures: [...state.measures, measureFromOption(sourceId, option, category, state.month, INCIDENT_OPTION_IDS.has(option.id) ? 'incident' : 'decision')],
  }
}

/** Resolve an open decision by putting one option to the council. */
/**
 * When another party brings something forward, and who.
 *
 * The floor is what happens even to a council the player fully controls: other groups do table
 * things, and a decade without a single opposition motion is not a chamber. The spread is what a
 * lost majority adds on top — at zero coalition seats it is more likely than not.
 *
 * Stand auf 0,36 und rutschte auf 17,7 % Oppositionsanteil, als abgelehnte Vorlagen wieder
 * zurückkommen durften: die Wiedervorlagen landen alle beim Spieler und verwässern den Anteil.
 * Bei 0,56 liegt er wieder bei 24 %.
 */
const FOREIGN_MOTION_FLOOR = 0.56
const FOREIGN_MOTION_SPREAD = 0.5
/** Too small a group to command the agenda, however much it might want to. */
const OPPOSITION_SEATS = 4
/** And nobody tables a motion they are merely lukewarm about. `supportFor` runs 0 … 1. */
const TABLING_CONVICTION = 0.55

/**
 * Who, if anybody, tables this instead of the player.
 *
 * A council in which only one group ever brings anything forward is not a council. The chance rises
 * as the player's own majority falls — which is the story this game tells anyway, and it means a
 * player who has held the council together mostly sets the agenda, while one who has lost it spends
 * the decade answering other people's motions.
 *
 * Whoever tables it is the party outside the coalition that wants one of the options most, and the
 * option is the one they want. Nobody tables something they would then vote against.
 */
function tabler(state: SimulationState, event: EventDefinition, stream: RandomStream): { partyId: PartyId, optionId: string } | null {
  /*
   * Ein Vorfall wird nicht beantragt, er passiert. Alles andere schon — auch und gerade eine
   * Vorlage mit einer einzigen Option: das ist genau die Form, in der eine Fraktion etwas
   * einbringt. Der Wächter stand hier auf `options.length < 2`, aus der Zeit, als eine Vorlage
   * nichts zum Auswählen hatte; mit der Formregel hätte er der Opposition ein Drittel der
   * Tagesordnung weggenommen.
   */
  if (event.options.length === 0 || event.kind === 'incident' || event.kind === 'external')
    return null

  const outside = PARTIES.filter(party =>
    party.id !== state.partyId
    && !state.coalitionPartyIds.includes(party.id)
    && (state.seatsByParty[party.id] ?? 0) >= OPPOSITION_SEATS)
  if (outside.length === 0)
    return null

  const held = state.coalitionPartyIds.reduce((sum, id) => sum + (state.seatsByParty[id] ?? 0), 0)
  const exposure = 1 - clamp(held / MAJORITY, 0, 1)
  // The first one is not rolled for: every player meets the chamber they are actually in.
  const certain = state.tabledByOthers === 0
  if (!certain && stream.next() > FOREIGN_MOTION_FLOOR + exposure * FOREIGN_MOTION_SPREAD)
    return null

  let best: { partyId: PartyId, optionId: string, wants: number } | null = null
  for (const option of event.options) {
    const context = voteContext(state, option, false)
    for (const party of outside) {
      const wants = supportFor(party, option, context)
      if (!best || wants > best.wants)
        best = { partyId: party.id, optionId: option.id, wants }
    }
  }
  // Nobody tables a motion they are lukewarm about; below this it stays off the agenda.
  return best && best.wants >= TABLING_CONVICTION ? { partyId: best.partyId, optionId: best.optionId } : null
}

/**
 * Vote on somebody else's motion.
 *
 * The player does not choose the option here — the proposer did — and the only thing they bring is
 * what every other party has always brought: their seats, and which way they go. Their group is the
 * one party in the chamber whose vote is decided rather than rolled.
 */
/**
 * Die Formregel: **die Zahl der Optionen bestimmt die Form.**
 *
 * Eine Vorlage ist ein konkreter Vorschlag, und darauf gibt es genau drei Antworten — dafür,
 * enthalten, dagegen. Eine Weggabelung sind zwei oder drei echte Wege, und dort wählt man einen.
 *
 * Vorher wechselte die Form danach, *wer* gefragt hatte: eine fremde Vorlage hieß Ja/Nein, eine
 * eigene hieß Optionen wählen, eine Krise wieder Optionen. Das war nicht zu lernen, weil es nichts
 * zu lernen gab. Jetzt sagt die Vorlage selbst, welche Form sie hat, und der Satz gilt überall.
 *
 * Returns the one option on the agenda when this is a Vorlage, otherwise `null`.
 */
export function motionOnTheAgenda(state: SimulationState, eventId: string): string | null {
  const pending = state.pending.find(entry => entry.eventId === eventId)
  if (!pending)
    return null
  if (pending.tabledOptionId)
    return pending.tabledOptionId
  const options = getEvent(eventId)?.options ?? []
  return options.length === 1 ? options[0]!.id : null
}

/** Take a position on a Vorlage: dafür, enthalten oder dagegen. */
export function voteOnMotion(state: SimulationState, eventId: string, vote: PartyVote): { state: SimulationState, result: VoteResult | null } {
  const optionId = motionOnTheAgenda(state, eventId)
  if (!optionId)
    return { state, result: null }
  return decide(state, eventId, optionId, vote)
}

/** Take one road at a Weggabelung. Choosing it is tabling it, and tabling it is your yes. */
export function resolveDecision(state: SimulationState, eventId: string, optionId: string): { state: SimulationState, result: VoteResult | null } {
  // Auf eine Vorlage antwortet man mit einer Haltung, nicht mit einer Auswahl. `voteOnMotion` ist
  // der Weg hinein — auch dann, wenn die Vorlage aus der Verwaltung und nicht aus einer Fraktion kam.
  if (motionOnTheAgenda(state, eventId))
    return { state, result: null }
  // Wer einbringt, stimmt zu, und die eigene Fraktion folgt.
  return decide(state, eventId, optionId, 'yes')
}

/** Was eine laute, hauchdünn entschiedene Abstimmung an Polarisierung hinterlässt. */
const HEAT_PER_VOTE = 1.35

/**
 * Wie sehr eine Abstimmung die Stadt spaltet.
 *
 * Zwei Faktoren, beide schon vorhanden. **Lautstärke** ist die Salienz der Vorlage — worüber
 * niemand streitet, spaltet auch niemanden; es ist dieselbe Summe, mit der `shiftFromDecision` misst,
 * wie laut eine Entscheidung auf der Straße ankommt. **Knappheit** ist der Abstand im Rat: 57:3
 * eint, 31:29 spaltet. Ein Ergebnis, das beides ist — laut und knapp —, kostet gut einen
 * Polarisierungspunkt, und ein Jahrzehnt davon verschiebt die Stadt spürbar.
 */
function heatOf(option: EventOption, result: VoteResult): number {
  const loudness = clamp(Object.values(option.salience).reduce((sum, value) => sum + Math.abs(value ?? 0), 0) / 3, 0, 1)
  const decided = result.yesSeats + result.noSeats
  const closeness = decided === 0 ? 0 : 1 - Math.abs(result.yesSeats - result.noSeats) / decided
  return HEAT_PER_VOTE * loudness * closeness
}

function decide(state: SimulationState, eventId: string, optionId: string, playerVote: PartyVote | undefined): { state: SimulationState, result: VoteResult | null } {
  const event = getEvent(eventId)
  const option = event?.options.find(candidate => candidate.id === optionId)
  const pending = state.pending.find(entry => entry.eventId === eventId)
  if (!event || !option || !pending)
    return { state, result: null }

  const stream = createRandomStream(state.seed, `vote:${state.month}:${eventId}:${optionId}`)
  const context = { ...voteContext(state, option, preparationFor(state, eventId).campaignedOptionIds.includes(optionId)), playerVote }
  const result = castVote(option, context, stream)

  /*
   * The street judges the decision, not the result. A motion the player fought for and lost still
   * says what they stand for, and an electorate answers that — which is why this is outside the
   * branch below.
   */
  /*
   * The street judges what the player stood for, and a vote by name is a position whichever way it
   * goes. Tabling it or voting for it moves the electorate toward whoever wanted it; voting against
   * moves it the other way by the same amount. Only an abstention says nothing — which is also what
   * an abstention is for.
   */
  const stance = playerVote === 'no' ? -1 : 1
  let next: SimulationState = {
    ...state,
    stocks: { ...state.stocks, politicalHeat: state.stocks.politicalHeat + heatOf(option, result) },
    support: playerVote === 'abstain' ? state.support : shiftFromDecision(state.support, option, stance),
    pending: state.pending.filter(entry => entry.eventId !== eventId),
    motionPrep: withoutPreparation(state.motionPrep, eventId),
    firedOnce: state.firedOnce.includes(eventId) ? state.firedOnce : [...state.firedOnce, eventId],
    cooldowns: { ...state.cooldowns, [eventId]: state.month + event.trigger.cooldownMonths },
  }

  if (result.passed) {
    next = adoptMeasure(next, eventId, option, event.category)
    next = pushNews(next, {
      id: `vote-${eventId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'important',
      headline: `RATHAUS: „${option.label}“ mit ${result.yesSeats}:${result.noSeats} beschlossen`,
    })
  }
  else {
    /*
     * A defeat is a real outcome: trust drops, and the motion is spent.
     *
     * It used to be put back — cleared from `firedOnce`, cooldown cut to forty per cent — on the
     * reasoning that a problem voted down is still a problem. The problem is; the motion is not.
     * What that produced was the same sheet with the same options offered again a few months later,
     * and a council you could simply keep asking until it said yes. The problem coming back is the
     * job of the metrics, which get worse on their own, and of the other seventeen events that read
     * them.
     */
    next = {
      ...next,
      perception: { ...next.perception, trust: clamp(next.perception.trust - 4.5) },
    }
    next = pushNews(next, {
      id: `vote-${eventId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'breaking',
      headline: `STADTRAT: „${option.label}“ mit ${result.noSeats}:${result.yesSeats} abgelehnt`,
    })
    /*
     * Was eine Ablehnung kostet.
     *
     * Solange es diesen Ort nicht gab, musste jede Vorlage eine Nichts-tun-Karte mitführen, damit
     * die Folgen des Nichtstuns irgendwo stehen konnten — „Schließen", „Durchlaufen lassen",
     * „Aufschieben". Genau das machte aus jeder Haltungsfrage ein Menü und verhinderte die Formregel.
     *
     * Als Vorfall verbucht, nicht als Maßnahme: die Stadt hat nichts beschlossen, ihr ist etwas
     * widerfahren. Deshalb steht es auch nicht unter „Laufende Maßnahmen".
     */
    if (event.refusedEffects?.length) {
      next = adoptMeasure(next, eventId, {
        id: 'abgelehnt',
        label: event.title,
        rationale: event.briefing,
        oneOffCost: 0,
        monthlyCost: 0,
        axes: {},
        salience: {},
        effects: event.refusedEffects,
        sourceIds: event.sourceIds,
      }, event.category)
    }
  }

  return { state: next, result }
}

/**
 * Bring a restored campaign up to the current shape of the state.
 *
 * A save holds the whole `SimulationState`, so every field added afterwards is missing from every
 * save written before it. `support` was the first one, and without this the HUD read
 * `snapshot.support[partyId]` on a ten-year-old campaign and threw — the city rendered, the entire
 * interface did not, and the only clue was one line in the console.
 *
 * Defaults rather than a version number, because what matters is that a field has a sane value and
 * not which build wrote it. A restored campaign keeps everything it had.
 */
/**
 * Put a number back where a `NaN` got saved.
 *
 * A save is written every month turn, so an arithmetic bug does not just show a wrong screen — it is
 * persisted, and it spreads: one `NaN` in `population` reaches `cityBudget`, `satisfaction` and every
 * health score within a month. A campaign was lost that way to an effect routed at a metric that did
 * not exist, and the save kept showing `NaN` long after the cause was fixed.
 *
 * Falling back to the baseline is not a repair of the city — that history is gone either way. It is the
 * difference between a save that can be played on and one that can only be deleted.
 */
function healed<T extends object>(values: T, baseline: T): T {
  let broken = false
  const next = { ...values }
  for (const key of Object.keys(baseline) as (keyof T)[]) {
    if (!Number.isFinite(next[key] as number)) {
      next[key] = baseline[key]
      broken = true
    }
  }
  if (broken)
    console.warn('[2036] Ein Spielstand enthielt ungültige Zahlen und wurde auf Ausgangswerte zurückgesetzt.')
  return next
}

export function migrateState(state: SimulationState): SimulationState {
  return {
    ...state,
    // Ein Spielstand von vor den Zielen hat keine. Er wird ohne Wertung zu Ende gespielt.
    goalIds: state.goalIds ?? [],
    leader: state.leader ?? null,
    metrics: healed(state.metrics, BASELINE_METRICS),
    stocks: healed(state.stocks, BASELINE_STOCKS),
    support: state.support ?? initialSupport(),
    // A campaign saved before the baseline existed takes today as its first day. Not accurate, but
    // the alternative is a comparison against `undefined`, which is a crash.
    baselineMetrics: state.baselineMetrics ?? { ...state.metrics },
    drivers: state.drivers ?? {},
    edges: state.edges ?? { months: {} },
    defeat: state.defeat ?? null,
    relationships: state.relationships ?? {},
    motionPrep: state.motionPrep ?? {},
    cooldowns: state.cooldowns ?? {},
    streaks: state.streaks ?? {},
    firedOnce: state.firedOnce ?? [],
    choices: state.choices ?? [],
    tabledByOthers: state.tabledByOthers ?? 0,
  }
}

/** How many seats the player's coalition holds. One place, because two places drift apart. */
function seatsOfCoalition(state: SimulationState): number {
  return state.coalitionPartyIds.reduce((sum, id) => sum + (state.seatsByParty[id] ?? 0), 0)
}

const NEGOTIATION_COST = 12

function withPreparation(state: SimulationState, motionId: string, change: Partial<MotionPreparation>): SimulationState {
  const current = preparationFor(state, motionId)
  return { ...state, motionPrep: { ...state.motionPrep, [motionId]: { ...current, ...change } } }
}

/**
 * Spend political capital to move one party's relationship before a vote. The relationship is not
 * tied to this motion: it carries into later votes and decays by about 6 % a month.
 */
export function negotiate(state: SimulationState, motionId: string, partyId: PartyId): SimulationState {
  const prepared = preparationFor(state, motionId)
  if (prepared.negotiatedPartyIds.includes(partyId) || state.metrics.politicalCapital < NEGOTIATION_COST)
    return state
  const next = withPreparation(state, motionId, { negotiatedPartyIds: [...prepared.negotiatedPartyIds, partyId] })
  return {
    ...next,
    metrics: { ...next.metrics, politicalCapital: clamp(next.metrics.politicalCapital - NEGOTIATION_COST) },
    relationships: { ...next.relationships, [partyId]: clamp((next.relationships[partyId] ?? 0) + 0.45, -1, 1) },
  }
}

/** Spend political capital on a public campaign for one option of one motion. */
export function campaignFor(state: SimulationState, motionId: string, optionId: string): SimulationState {
  const prepared = preparationFor(state, motionId)
  const cost = campaignCost(state.leader)
  if (prepared.campaignedOptionIds.includes(optionId) || state.metrics.politicalCapital < cost)
    return state
  const next = withPreparation(state, motionId, { campaignedOptionIds: [...prepared.campaignedOptionIds, optionId] })
  return { ...next, metrics: { ...next.metrics, politicalCapital: clamp(next.metrics.politicalCapital - cost) } }
}

/** Direct adoption without a vote. Used by the three legacy policies and by tests. */
export function applyPolicy(state: SimulationState, policyId: string): SimulationState {
  if (state.policies.some(policy => policy.id === policyId))
    return state
  const definition = getPolicy(policyId)
  if (!definition)
    throw new Error(`Unknown policy: ${policyId}`)
  const next = adoptMeasure(state, policyId, asOption(definition), 'governance')
  return pushNews(
    { ...next, policies: [...next.policies, { id: policyId, startedMonth: state.month }] },
    {
      id: `policy-${policyId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'important',
      headline: `RATHAUS: „${definition.name}“ mit Ratsmehrheit beschlossen`,
      policyId,
    },
  )
}

/** Put one of the three standing motions to the council instead of adopting it directly. */
export function proposePolicy(state: SimulationState, policyId: string): { state: SimulationState, result: VoteResult | null } {
  const definition = getPolicy(policyId)
  // Keine Fraktion bringt das Programm einer anderen ein. Die Auswahl selbst steht im Inhalt.
  if (!definition || !mayTable(state.partyId, policyId) || state.policies.some(policy => policy.id === policyId))
    return { state, result: null }
  const option = asOption(definition)
  const stream = createRandomStream(state.seed, `vote:${state.month}:${policyId}:${policyId}`)
  const campaigned = preparationFor(state, policyId).campaignedOptionIds.includes(policyId)
  const result = castVote(option, { ...voteContext(state, definition, campaigned), playerVote: 'yes' }, stream)

  const remainingPrep = withoutPreparation(state.motionPrep, policyId)
  if (!result.passed) {
    return {
      state: pushNews(
        { ...state, motionPrep: remainingPrep, perception: { ...state.perception, trust: clamp(state.perception.trust - 3.5) } },
        { id: `policy-${policyId}-${state.month}`, month: state.month, scope: 'city', urgency: 'breaking', headline: `STADTRAT: „${definition.name}“ mit ${result.noSeats}:${result.yesSeats} abgelehnt`, policyId },
      ),
      result,
    }
  }
  return { state: applyPolicy({ ...state, motionPrep: remainingPrep }, policyId), result }
}

// ---------------------------------------------------------------------------
// Monthly tick
// ---------------------------------------------------------------------------

function pushNews(state: SimulationState, item: NewsItem): SimulationState {
  return { ...state, news: [item, ...state.news].slice(0, 14) }
}

function significantNews(state: SimulationState, month: number, metrics: CityMetrics, previous: CityMetrics): NewsItem[] {
  const items: NewsItem[] = []
  const { year, monthOfYear } = dateForMonth(month)

  if (monthOfYear === 1) {
    items.push({ id: `budget-${month}`, month, scope: 'city', urgency: 'important', headline: `HAUSHALT ${year}: ${formatNumber(metrics.cityBudget)} Mio. € Spielraum, ${formatNumber(metrics.debt)} Mio. € Kassenkredite` })
  }
  const completed = Math.round(metrics.housingUnits - previous.housingUnits)
  if (monthOfYear === 7 && completed !== 0) {
    items.push({ id: `housing-${month}`, month, scope: 'city', urgency: 'normal', headline: `WOHNUNGSMARKT: Leerstand bei ${formatNumber(vacancyRate(metrics) * 100, 1)} %, Angebotsmiete ${formatNumber(metrics.averageRent, 2)} €/m²` })
  }
  if (month % 3 === 0) {
    const direction = metrics.satisfaction >= previous.satisfaction ? 'stabil' : 'rückläufig'
    items.push({ id: `quarter-${month}`, month, scope: 'city', urgency: metrics.satisfaction < 48 ? 'breaking' : 'normal', headline: `QUARTALSBERICHT: Zufriedenheit ${formatNumber(metrics.satisfaction)} (${direction}), Beschäftigung ${formatNumber(metrics.employment, 1)} %` })
  }
  return items
}

function eventNews(event: EventDefinition, month: number): NewsItem {
  return { id: `event-${event.id}-${month}`, month, scope: 'city', urgency: event.urgency, headline: event.title.toUpperCase() }
}

/**
 * Everything the city shows, derived from what the city is.
 *
 * Each of these is a reading and never a setting. There is no lever marked "more fires": a fire is
 * what happens when a council lets maintenance spending fall and vacancy rise, and the only way to
 * see fewer of them is to fix that. The renderer reads these and nothing else, which is what keeps
 * the display out of the arithmetic — see `docs/CITY_LIFE.md`.
 *
 * Each is scaled so that 0 is a well-run city and 1 is one in trouble, because the renderer turns
 * them into frequencies and a frequency needs a known range.
 */
function visualsFrom(metrics: CityMetrics, stocks: CityStocks): CityVisualState {
  const vacancy = vacancyRate(metrics)
  const blight = clamp((vacancy - 0.05) / 0.08, 0, 1)
  /*
   * Maintenance against what the baseline spends. Below it the fabric is being run down — which is
   * what old wiring, blocked escapes and empty flats with nobody to notice a fire actually are.
   */
  const upkeep = clamp(stocks.maintenanceSpend / Math.max(1, BASELINE_STOCKS.maintenanceSpend), 0.3, 1.6)
  /*
   * Staff per thousand of population rather than raw staff, so a growing city has to keep hiring to
   * stand still. This is the one number that shortens every response in the city.
   */
  const staffing = clamp(
    (stocks.orderServiceFte / Math.max(1, metrics.population / 1_000))
    / Math.max(0.001, BASELINE_STOCKS.orderServiceFte / (BASELINE_METRICS.population / 1_000)),
    0.35,
    1.8,
  )

  return {
    constructionSites: Math.round(clamp(metrics.unitsUnderConstruction / 150, 0, 16)),
    completedUnitsSinceStart: Math.round(metrics.housingUnits - BASELINE_METRICS.housingUnits),
    vacancyRate: vacancy,
    blight,
    transitDensity: clamp(metrics.transitCoverage / 100, 0, 1),
    nightLife: clamp(metrics.satisfaction / 100, 0, 1),
    greenery: clamp(stocks.greenSpaceHectares / BASELINE_STOCKS.greenSpaceHectares, 0.4, 1.8),
    unrest: clamp((metrics.polarisation / 100) * (1 - metrics.satisfaction / 100) * 2.2, 0, 1),

    fireRisk: clamp((1.25 - upkeep) * 0.7 + blight * 0.5, 0, 1),
    // Break-ins against the people whose job is to answer them.
    burglaryPressure: clamp((metrics.burglaryRate / 12) / staffing, 0, 1),
    /*
     * Collisions rise with how much traffic there is and fall with how well the network carries it —
     * a city that moved its journeys onto a reliable transit system has fewer cars to crash.
     */
    accidentPressure: clamp(
      (1 - metrics.transitCoverage / 130) * (1.35 - metrics.transitReliability / 100) * 0.9,
      0,
      1,
    ),
    // The rare serious call: crime, a divided city, and young people with nothing to do.
    violentPressure: clamp(
      ((metrics.crimeRate / 90) * 0.5 + (metrics.polarisation / 100) * 0.3 + (metrics.youthUnemployment / 22) * 0.2)
      / staffing,
      0,
      1,
    ),
    responseCapacity: clamp(staffing / 1.4, 0.2, 1),
    buildingActivity: clamp(metrics.unitsUnderConstruction / 900, 0, 1),
    /*
     * A demographic reading and nothing more. It decides who is on the pavement and never what
     * happens there: `docs/CITY_LIFE.md` states the separation and an architecture test holds it.
     */
    originMix: clamp(metrics.internationalShare / 100, 0, 1),
    /*
     * Against the baseline rather than against zero: a city with no emissions at all is not a city,
     * and what the player changes is the distance from where they started.
     */
    haze: clamp((metrics.emissions - BASELINE_METRICS.emissions * 0.7) / (BASELINE_METRICS.emissions * 0.9), 0, 1),
    idleness: clamp(metrics.youthUnemployment / 24, 0, 1),
    /*
     * Against two thousand, which is roughly where this city's own dynamics top out under a decade
     * of bad housing policy. Not against the population: a share of 120,000 would leave the signal
     * sitting at a hundredth for the whole campaign and nothing would ever be visible.
     */
    roughSleeping: clamp(metrics.homelessPeople / 2_000, 0, 1),
  }
}

function buildSnapshot(state: SimulationState): SimulationSnapshot {
  const health = healthFromState(state.metrics, state.perception)
  const date = dateForMonth(state.month)
  const coalitionSeats = seatsOfCoalition(state)
  const measures: ActiveMeasureView[] = state.measures.filter(measure => measure.kind === 'decision').map(measure => ({
    id: measure.key,
    label: measure.label,
    category: measure.category,
    startedMonth: measure.startedMonth,
    monthlyCost: costThisMonth(measure, state.month),
    costUntilMonth: measure.costMonths === null ? null : measure.startedMonth + measure.costMonths,
  }))

  return {
    schemaVersion: 1,
    month: state.month,
    ...date,
    metrics: state.metrics,
    previousMetrics: state.previousMetrics,
    health,
    perception: state.perception,
    activePolicyIds: state.policies.map(policy => policy.id),
    activeMeasures: measures,
    choices: state.choices,
    goalIds: state.goalIds,
    leader: state.leader,
    goals: state.goalIds.flatMap((id) => {
      const goal = getGoal(id)
      if (!goal)
        return []
      const value = state.metrics[goal.metric as keyof CityMetrics] as number
      return [{ id, value, met: goalIsMet(goal, value) }]
    }),
    pendingDecisions: state.pending,
    motionPreparation: state.motionPrep,
    councilSeatsByParty: state.seatsByParty,
    coalitionPartyIds: state.coalitionPartyIds,
    coalitionSupport: coalitionSeats,
    support: state.support ?? initialSupport(),
    defeat: state.defeat ?? null,
    baselineMetrics: state.baselineMetrics ?? state.metrics,
    /*
     * Handed over strongest first, so the interface can name the one that matters without sorting
     * the same list on every render.
     */
    drivers: Object.fromEntries(
      Object.entries(state.drivers ?? {}).map(([metric, sources]) => [
        metric,
        Object.entries(sources ?? {})
          .map(([id, source]) => ({ id, label: source.label, delta: source.delta }))
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
      ]),
    ),
    causalEdges: state.causalEdges,
    news: state.news,
    cityVisuals: visualsFrom(state.metrics, state.stocks),
  }
}

export function snapshotOf(state: SimulationState): SimulationSnapshot {
  return buildSnapshot(state)
}

function advanceOneMonth(state: SimulationState): SimulationState {
  if (state.month >= CAMPAIGN_LAST_MONTH)
    return state
  const month = state.month + 1
  const { monthOfYear } = dateForMonth(month)

  const edges: CausalEdge[] = []
  const workingMetrics = { ...state.metrics }
  const workingStocks = { ...state.stocks }
  const measures = state.measures.map(measure => ({ ...measure, applied: { ...measure.applied } }))

  // Measures buy capacity first, so the same month's dynamics already read the new capacity.
  applyMeasures(measures, workingMetrics, workingStocks, month, edges)
  const measureCost = measures.reduce((sum, measure) => sum + costThisMonth(measure, month), 0)

  if (monthOfYear === 1) {
    workingStocks.fiscalYearRevenue = 0
    workingStocks.fiscalYearSpending = 0
  }

  const previousHealth = healthFromState(state.metrics, state.perception)
  const stepped = stepDynamics(workingMetrics, workingStocks, state.perception, previousHealth, measureCost, capitalPerMonth(state.leader, state.partyId))
  edges.push(...stepped.edges)

  /*
   * What the month actually did to the city's money — the whole of it.
   *
   * `stepDynamics` only knows the running side, revenue against spending, and that number was a lie
   * on its own: the reserve fell nine million in a month the running balance called zero, because
   * one-off payments and crisis costs are written straight into `cityBudget` before the month is
   * stepped. Measured against the net position rather than the reserve, so a month paid for out of
   * cash credit counts as the loss it is instead of stopping at zero.
   */
  stepped.metrics.monthlyBalance
    = (stepped.metrics.cityBudget - stepped.metrics.debt) - (state.metrics.cityBudget - state.metrics.debt)

  /*
   * What the player's own decisions did this month, added to what they have done so far.
   *
   * Only the edges that carry a measure's name — the dynamics move everything every month and are
   * not a thing anybody chose. A measure that has since expired keeps its total, because it did
   * happen and the player did it.
   */
  const drivers: Partial<Record<MetricId, Record<string, { label: string, delta: number }>>> = { ...state.drivers }
  for (const edge of edges) {
    if (!edge.label)
      continue
    const metric = edge.to as MetricId
    const sources = { ...(drivers[metric] ?? {}) }
    /*
     * Keyed by the measure rather than by its name, so the closing report can tell a decision the
     * council took from the immediate cost of a crisis it did not. Both arrive here as an edge with
     * a label on it, and by the time it is a string the difference is gone.
     */
    const held = sources[edge.from]
    sources[edge.from] = { label: edge.label, delta: (held?.delta ?? 0) + edge.delta }
    drivers[metric] = sources
  }

  let next: SimulationState = {
    ...state,
    month,
    previousMetrics: state.metrics,
    metrics: stepped.metrics,
    stocks: stepped.stocks,
    perception: stepped.perception,
    measures,
    causalEdges: edges,
    drivers,
  }

  const expired = next.pending.filter(entry => month >= entry.expiresMonth)
  for (const entry of expired) {
    const event = getEvent(entry.eventId)
    /*
     * A motion somebody else tabled is still a motion. Not answering it does not make it go away and
     * does not hand the administration its own fallback instead — the chamber votes on what is
     * actually on the agenda, and the player's group is recorded as having abstained. Which is what
     * not turning up is.
     *
     * The first version applied the event's `defaultOptionId` here, so ignoring the CDU's motion
     * quietly adopted an option the CDU had not tabled and nobody had voted on.
     */
    if (motionOnTheAgenda(next, entry.eventId)) {
      next = pushNews(next, {
        id: `abstained-${entry.eventId}-${month}`,
        month,
        scope: 'city',
        urgency: 'normal',
        headline: `STADTRAT: Ohne Fraktionsvotum zur Abstimmung über „${event?.title ?? entry.eventId}“`,
      })
      next = voteOnMotion(next, entry.eventId, 'abstain').state
      continue
    }

    // Eine Weggabelung ohne Beschluss: die Verwaltung nimmt ihren eigenen Weg.
    const fallback = event?.options.find(option => option.id === event.defaultOptionId)
    next = { ...next, pending: next.pending.filter(open => open.eventId !== entry.eventId) }
    if (event && fallback) {
      next = adoptMeasure(next, event.id, fallback, event.category)
      next = pushNews(next, { id: `expired-${event.id}-${month}`, month, scope: 'city', urgency: 'normal', headline: `RATHAUS: Ohne Beschluss greift „${fallback.label}“ bei ${event.title}` })
    }
  }

  /*
   * A month of government, credited or debited. It runs after the metrics have settled and before
   * the next event is drawn, so the draw already sees the city the player has just made.
   */
  next = { ...next, support: driftFromCity(next.support, next.metrics, next.perception, next.coalitionPartyIds) }

  /*
   * How long the city has been past each hard edge. Counted every month and acted on only after
   * fourteen of them: a single terrible month is a crisis and this game is about governing through
   * those. A city that has been in one for over a year has stopped being governable.
   */
  next = { ...next, edges: trackEdges(next.edges, next.metrics) }
  const broken = defeatFromEdges(next.edges, month)
  if (broken && !next.defeat) {
    next = { ...next, defeat: broken }
    next = pushNews(next, { id: `defeat-${broken.reason}-${month}`, month, scope: 'city', urgency: 'breaking', headline: broken.headline })
  }

  /*
   * Election night. The council is counted out of the support the city has been building for five
   * years, the coalition is formed again from scratch by the same axis distance as on day one, and
   * if it cannot reach a majority the campaign is over.
   */
  if (isElectionMonth(month) && !next.defeat) {
    const result = holdElection(next.support, next.seatsByParty, next.partyId)
    const coalition = formCoalitionWith(next.partyId, result.seats)
    next = { ...next, seatsByParty: result.seats, coalitionPartyIds: coalition }
    const seats = seatsOfCoalition(next)
    const own = next.partyId ? result.seats[next.partyId] ?? 0 : 0
    next = pushNews(next, {
      id: `election-${month}`,
      month,
      scope: 'city',
      urgency: 'breaking',
      headline: `KOMMUNALWAHL: ${own} Sitze für die eigene Fraktion, ${seats} von 60 für die Koalition`,
    })
    const out = votedOut(seats, month)
    if (out) {
      next = { ...next, defeat: out }
      next = pushNews(next, { id: `defeat-voted-out-${month}`, month, scope: 'city', urgency: 'breaking', headline: out.headline })
    }
  }

  // Draw at most one new event.
  next = { ...next, streaks: updateStreaks({ month, metrics: next.metrics, cooldowns: next.cooldowns, streaks: next.streaks, firedOnce: next.firedOnce, choices: next.choices, openDecisions: next.pending.length, activeMeasureSources: next.measures.map(measure => measure.sourceId), coalitionSeats: seatsOfCoalition(next) }) }
  const drawState: EventDrawState = {
    month,
    metrics: next.metrics,
    cooldowns: next.cooldowns,
    streaks: next.streaks,
    firedOnce: next.firedOnce,
    choices: next.choices,
    openDecisions: next.pending.length,
    activeMeasureSources: next.measures.map(measure => measure.sourceId),
    coalitionSeats: seatsOfCoalition(next),
  }
  const drawn = drawEvent(drawState, monthOfYear, createRandomStream(state.seed, `events:${month}`))

  if (drawn) {
    next = pushNews(next, eventNews(drawn, month))
    next = {
      ...next,
      perception: {
        ...next.perception,
        mediaAttention: { ...next.perception.mediaAttention, [drawn.category]: Math.min(1, (next.perception.mediaAttention[drawn.category] ?? 0) + (drawn.urgency === 'breaking' ? 0.9 : 0.55)) },
      },
      cooldowns: { ...next.cooldowns, [drawn.id]: month + drawn.trigger.cooldownMonths },
      firedOnce: next.firedOnce.includes(drawn.id) ? next.firedOnce : [...next.firedOnce, drawn.id],
    }
    if (drawn.immediateEffects.length > 0) {
      next = adoptMeasure(next, `${drawn.id}:sofort`, { id: 'sofort', label: drawn.title, rationale: drawn.briefing, oneOffCost: 0, monthlyCost: 0, axes: {}, salience: {}, effects: drawn.immediateEffects, sourceIds: drawn.sourceIds }, drawn.category)
    }
    if (drawn.options.length > 0) {
      const tabled = tabler(next, drawn, createRandomStream(next.seed, `tabled:${month}:${drawn.id}`))
      next = {
        ...next,
        pending: [...next.pending, {
          eventId: drawn.id,
          raisedMonth: month,
          expiresMonth: month + drawn.expiresInMonths,
          negotiatedPartyIds: [],
          campaignedOptionIds: [],
          tabledBy: tabled?.partyId ?? null,
          tabledOptionId: tabled?.optionId ?? null,
        }],
      }
      if (tabled) {
        next = { ...next, tabledByOthers: next.tabledByOthers + 1 }
        next = pushNews(next, {
          id: `tabled-${drawn.id}-${month}`,
          month,
          scope: 'city',
          urgency: 'normal',
          headline: `STADTRAT: ${getParty(tabled.partyId)?.abbreviation ?? tabled.partyId} bringt „${drawn.options.find(option => option.id === tabled.optionId)?.label ?? drawn.title}“ ein`,
        })
      }
    }
  }

  // Relationships cool off toward neutral over roughly a year.
  const relationships: Partial<Record<PartyId, number>> = {}
  for (const party of PARTIES) {
    const value = next.relationships[party.id]
    if (value !== undefined)
      relationships[party.id] = value * 0.94
  }
  next = { ...next, relationships }

  const news = [...significantNews(next, month, next.metrics, state.metrics), ...next.news].slice(0, 14)
  return { ...next, news }
}

export function advanceMonths(state: SimulationState, count: number): SimulationState {
  let next = state
  for (let index = 0; index < count; index += 1) next = advanceOneMonth(next)
  return next
}

export { forecastVote, supportFor }
