import type {
  ActiveMeasureView,
  CampaignGoalId,
  CampaignLeader,
  CampaignPriorityId,
  CausalEdge,
  CityMetrics,
  CityVisualState,
  DistrictId,
  EventDefinition,
  EventOption,
  MetricId,
  NewsItem,
  PartyDefinition,
  PartyId,
  PartyVote,
  PendingDecision,
  PendingSiting,
  PerceptionState,
  PolicyDefinition,
  SimulationSnapshot,
  VoteForecast,
  VoteResult,
} from '../core/contracts'
import type { RandomStream } from '../core/rng'
import type { CityStocks } from './baseline'
import type { VoteContext } from './council'
import type { Spread } from './districts'
import type { Defeat, EdgeState } from './election'
import type { Support } from './electorate'
import type { ActiveMeasure, EventDrawState } from './events'
import type { Hotspot } from './hotspots'
import type { SituationState } from './situation'
import { getEvent } from '../content/events'
import { getGoal, goalIsMet } from '../content/goals'
import { hotspotTemplate } from '../content/hotspots'
import { getBackground } from '../content/leaders'
import { getParty, mapParties, PARTIES } from '../content/parties'
import { getPolicy, mayTable } from '../content/policies'
import { SITE_PROFILES } from '../content/sites'
import { CAMPAIGN_LAST_MONTH } from '../core/campaign'
import { formatNumber } from '../core/format'
import { createRandomStream } from '../core/rng'
import { LINDENHAFEN } from '../world/model/lindenhafen'
import {
  BASELINE_METRICS,
  BASELINE_PERCEPTION,
  BASELINE_STOCKS,

  vacancyRate,
} from './baseline'
import { bulletin } from './bulletin'
import { castVote, forecastVote, supportFor, weightedDistance } from './council'
import { initialSpread, shift, valueIn } from './districts'
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
import { answerHotspot, openHotspot, stepHotspots, TIPPING_LEVEL } from './hotspots'
import { costAt, needsSite, offered, paceAt, sitesFor, unrestAt } from './siting'
import { BASELINE_SITUATION, stepSituation } from './situation'

export interface ActivePolicyState {
  id: string
  startedMonth: number
}

export interface MotionPreparation {
  negotiatedPartyIds: PartyId[]
  campaignedOptionIds: string[]
  /**
   * Wer im Wartemonat **dagegen** gearbeitet hat.
   *
   * Der Sitzungskalender gibt beiden Seiten einen Monat, und bis hierher hat ihn nur eine benutzt:
   * der Spieler verhandelte und machte Kampagne, und der Rat sah zu. Ein Fenster, in dem nur einer
   * arbeitet, ist kein Fenster, sondern eine Wartezeit mit Knöpfen.
   */
  counteredBy: PartyId[]
}

const EMPTY_PREPARATION: MotionPreparation = { negotiatedPartyIds: [], campaignedOptionIds: [], counteredBy: [] }

function preparationFor(state: SimulationState, motionId: string): MotionPreparation {
  return state.motionPrep[motionId] ?? EMPTY_PREPARATION
}

/** Drop the preparation for a motion once it has been voted on: the capital is spent either way. */
function withoutPreparation(motionPrep: Record<string, MotionPreparation>, motionId: string): Record<string, MotionPreparation> {
  return Object.fromEntries(Object.entries(motionPrep).filter(([id]) => id !== motionId))
}

/**
 * Ein Punkt auf der Tagesordnung der nächsten Ratssitzung.
 *
 * `sourceId` ist eine Ereignis- oder eine Vorlagenkennung — dieselben zwei Wege, die auch vorher
 * beide in derselben Abstimmung endeten. `vote` ist die eigene Haltung: wer selbst einbringt, stimmt
 * zu; bei einer fremden Vorlage steht hier, was man ihr entgegenbringt.
 */
export interface AgendaItem {
  sourceId: string
  optionId: string
  vote: PartyVote
  tabledMonth: number
}

export interface SimulationState {
  seed: number
  month: number
  partyId: PartyId | null
  goalIds: CampaignGoalId[]
  /** Wer den Vorsitz hat. Null in Spielständen von vor Stufe 6 und in Tests. */
  leader: CampaignLeader | null
  /** Die Welt über der Stadt. Vier Indizes um 100, die niemand hier beantwortet. */
  situation: SituationState
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
  /**
   * Eine beschlossene Vorlage, die noch auf ihren Standort wartet.
   *
   * Der Rat hat **was** entschieden, der Spieler entscheidet **wo** — und bis er das tut, ist nichts
   * beschafft, nichts bezahlt und nichts gebaut. Deshalb steht die Vorlage hier und nicht in
   * `measures`: eine Maßnahme in der Schwebe wäre eine, die schon wirkt und trotzdem nicht
   * stattfindet. Null in Spielständen von vorher und immer dann, wenn nichts wartet.
   */
  /**
   * Was in der nächsten Ratssitzung abgestimmt wird.
   *
   * Eingebracht heißt seit dem Sitzungskalender: **steht auf der Tagesordnung**, nicht: ist
   * beschlossen. Dazwischen liegt ein Monat, und in dem Monat kann man verhandeln, Kampagne machen —
   * und die Gegenseite auch. Vorher wurde in derselben Sekunde abgestimmt, in der man eingebracht
   * hat, und genau deshalb hat nie jemand die zwölf Kapital für eine Verhandlung ausgegeben: man
   * konnte auch einfach abstimmen lassen.
   */
  agenda: AgendaItem[]
  /**
   * Was die letzte Sitzung ergeben hat.
   *
   * Steht im Zustand und nicht im Rückgabewert, weil `advanceMonths` von zwei Dutzend Stellen
   * gerufen wird und keine davon Sitzungsergebnisse will. Der Worker liest sie nach dem Monatswechsel
   * heraus und schickt sie an die Oberfläche; danach sind sie Geschichte.
   */
  lastSession: VoteResult[]
  /**
   * Beschlossene Vorlagen, die noch auf ihren Standort warten.
   *
   * Eine Liste und kein einzelner Platz, seit eine Sitzung mehrere Vorlagen auf einmal beschließt:
   * gehen zwei Bauvorlagen an einem Abend durch, warten zwei Standorte. Gefragt wird nach dem ersten.
   */
  siting: { policyId: string, decidedMonth: number }[]
  /**
   * Wohin jede verortete Vorlage gegangen ist.
   *
   * Nicht für die Rechnung — die kennt keine Bezirke —, sondern damit die Karte weiß, wo sie bauen
   * soll: der Renderer füllt seine freien Parzellen seit jeher von der Mitte nach außen, und genau
   * diese Reihenfolge ist jetzt eine Entscheidung. Und damit der Schlussbericht sagen kann, wo ein
   * Jahrzehnt lang gebaut wurde.
   */
  sites: Partial<Record<string, DistrictId>>
  /**
   * Die zweite Uhr: was der Stadt gerade an einem Ort zusetzt.
   *
   * Kleiner als ein Ratsbeschluss, schneller, und mit Mitteln zu beantworten statt mit Mehrheiten.
   * Siehe `simulation/hotspots.ts`. Leer in Spielständen von vorher.
   */
  hotspots: Hotspot[]
  /**
   * Dieselben Zahlen, über die acht Bezirke verteilt.
   *
   * Nur ein Gefälle, keine acht Simulationen: die Stadtzahl bleibt die Wahrheit, und je Bezirk steht
   * ein Faktor um eins, dessen gewichtetes Mittel immer exakt eins ist. Siehe `simulation/districts.ts`.
   */
  spread: Spread
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
    situation: { ...BASELINE_SITUATION },
    metrics,
    previousMetrics: { ...metrics },
    stocks: { ...BASELINE_STOCKS },
    perception: { ...BASELINE_PERCEPTION, mediaAttention: { ...BASELINE_PERCEPTION.mediaAttention } },
    measures: [],
    agenda: [],
    lastSession: [],
    siting: [],
    sites: {},
    hotspots: [],
    spread: initialSpread(),
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

/** Was eine Fraktion ausrichtet, die im Wartemonat gegen eine Vorlage arbeitet. */
const COUNTER_PRESSURE = 0.3

function voteContext(state: SimulationState, option: EventOption | PolicyDefinition, campaigned: boolean, counters = 0): VoteContext {
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
    /*
     * Der öffentliche Druck — und wer ihn in die andere Richtung macht.
     *
     * Eine Kampagne setzt ihn auf 0,75. Jede Fraktion, die im Wartemonat dagegen gearbeitet hat,
     * zieht 0,3 ab, und der Wert darf ins Negative laufen: dann zieht derselbe Term, der eine
     * Kampagne trägt, die Vorlage nach unten. Symmetrisch, weil es dieselbe Sache von der anderen
     * Seite ist — und ohne eine einzige neue Größe in der Abstimmungsrechnung.
     */
    publicPressure: (campaigned ? 0.75 : clamp((100 - state.metrics.satisfaction) / 100, 0, 1) * 0.4)
      - COUNTER_PRESSURE * counters,
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
    return forecastVote(asOption(policy), { ...voteContext(state, policy, campaigned, preparationFor(state, motionId).counteredBy.length), ...own })
  const option = getEvent(motionId)?.options.find(candidate => candidate.id === optionId)
  if (!option)
    return null
  return forecastVote(option, { ...voteContext(state, option, campaigned, preparationFor(state, motionId).counteredBy.length), ...own })
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

/** Was ein Dringlichkeitsantrag kostet: er übergeht den Kalender und stimmt sofort ab. */
export const URGENCY_COST = 15

/** Take one road at a Weggabelung. Choosing it is tabling it, and tabling it is your yes. */
export function resolveDecision(state: SimulationState, eventId: string, optionId: string): { state: SimulationState, result: VoteResult | null } {
  // Auf eine Vorlage antwortet man mit einer Haltung, nicht mit einer Auswahl. `voteOnMotion` ist
  // der Weg hinein — auch dann, wenn die Vorlage aus der Verwaltung und nicht aus einer Fraktion kam.
  if (motionOnTheAgenda(state, eventId))
    return { state, result: null }
  // Wer einbringt, stimmt zu, und die eigene Fraktion folgt.
  return decide(state, eventId, optionId, 'yes')
}

/**
 * Der Dringlichkeitsantrag: sofort abstimmen, am Kalender vorbei.
 *
 * Kein Komfort, sondern eine Notwendigkeit. Krisenereignisse haben Fristen von ein bis zwei Monaten,
 * und eine gesperrte Hafenbrücke wartet nicht auf die nächste Sitzung. Er kostet fast so viel wie
 * eine Kampagne, also benutzt man ihn selten und ärgert sich, wenn man muss — genau das soll er.
 */
export function callUrgent(state: SimulationState, sourceId: string, optionId: string, vote: PartyVote = 'yes'): { state: SimulationState, result: VoteResult | null } {
  if (state.metrics.politicalCapital < URGENCY_COST)
    return { state, result: null }
  const paid: SimulationState = {
    ...withdrawMotion(state, sourceId),
    metrics: { ...state.metrics, politicalCapital: clamp(state.metrics.politicalCapital - URGENCY_COST) },
  }
  return getEvent(sourceId) ? decide(paid, sourceId, optionId, vote) : voteOnPolicy(paid, sourceId)
}

/**
 * Wie viele Punkte eine Sitzung schafft.
 *
 * Drei. Nicht, weil ein Rat nicht mehr könnte, sondern weil eine Tagesordnung eine Entscheidung sein
 * soll: was du drauf setzt, setzt jemand anders nicht drauf — und eine Sitzung mit drei Ergebnissen
 * ist ein Abend, eine mit acht eine Liste.
 */
export const AGENDA_SEATS = 3

/**
 * Wie viel die Verwaltung gleichzeitig trägt.
 *
 * Jede Vorlage trägt seit jeher ein Feld `administrativeLoad` — vier bis acht bei den meisten,
 * achtzehn beim Nahverkehrsnetz, zweiundzwanzig beim Wohnungsbau-Turbo. Gelesen hat es **nichts**:
 * der Hebel war entworfen und nie verkabelt, und deshalb konnte man alles auf einmal beschließen.
 * Sechsundzwanzig Vorlagen, von denen keine den Haushalt ernsthaft belastet, sind keine Entscheidung,
 * sondern eine Liste.
 *
 * Zweiunddreißig Punkte tragen vier bis fünf gewöhnliche Vorhaben gleichzeitig — oder eines der
 * großen und **ein** kleines daneben. Das ist der Zielkonflikt, und er ist gemessen: der
 * Wohnungsbau-Turbo bindet allein 22 und das Nahverkehrsnetz 18; zusammen passen sie in keine
 * Verwaltung, die eine Stadt dieser Größe hat. Zwei Jahre lang ist dann eines von beiden dran.
 */
export const ADMIN_CAPACITY = 32

/**
 * Wie lange ein Vorhaben die Verwaltung bindet.
 *
 * So lange, wie es **aufgebaut** wird — nicht so lange, wie es läuft. Ein Bauprogramm bindet Planer,
 * bis die Häuser stehen; danach ist es eine Zeile im Haushalt und kein Vorgang mehr. Die Zahl steht
 * schon in der Wirkung: Verzögerung plus Anlaufzeit, die längste von allen.
 */
function buildMonths(policy: PolicyDefinition): number {
  return policy.effects.reduce((most, effect) => Math.max(most, effect.delayMonths + effect.rampMonths), 0)
}

/** Was die Verwaltung gerade gebunden hat. */
export function adminUsed(state: SimulationState): number {
  return state.policies.reduce((sum, entry) => {
    const policy = getPolicy(entry.id)
    if (!policy || state.month >= entry.startedMonth + buildMonths(policy))
      return sum
    return sum + policy.administrativeLoad
  }, 0)
}

/** Und was ein Vorhaben davon bräuchte. Null für alles, was kein eigenes Vorhaben ist. */
export function adminLoadOf(sourceId: string): number {
  return getPolicy(sourceId)?.administrativeLoad ?? 0
}

/**
 * Etwas auf die Tagesordnung der nächsten Sitzung setzen.
 *
 * Der Kern des Sitzungskalenders. Vorher hieß „einbringen“: in derselben Sekunde abstimmen — und
 * deshalb hat in elf Jahren niemand die zwölf Kapital für eine Verhandlung ausgegeben, obwohl sie
 * seit Monaten im Spiel sind. Wer sofort abstimmen lassen kann, verhandelt nicht.
 *
 * Doppelt geht nicht, und voll ist voll: eine Tagesordnung mit drei Plätzen ist eine Entscheidung
 * darüber, was **diesen** Monat drankommt.
 */
export function tableMotion(state: SimulationState, sourceId: string, optionId: string, vote: PartyVote = 'yes'): SimulationState {
  if (state.agenda.length >= AGENDA_SEATS || state.agenda.some(item => item.sourceId === sourceId))
    return state
  /*
   * Und die Verwaltung muss es tragen können.
   *
   * Gezählt wird, was schon gebunden ist, plus was auf der Tagesordnung steht — sonst setzt man drei
   * Vorhaben drauf, die einzeln passen und zusammen nicht, und die Sitzung beschließt etwas, das die
   * Stadt nicht bauen kann.
   */
  const wanted = adminLoadOf(sourceId)
  const booked = state.agenda.reduce((sum, item) => sum + adminLoadOf(item.sourceId), 0)
  if (wanted > 0 && adminUsed(state) + booked + wanted > ADMIN_CAPACITY)
    return state

  const tabled: SimulationState = { ...state, agenda: [...state.agenda, { sourceId, optionId, vote, tabledMonth: state.month }] }

  // Und wer sich sofort dagegenstellt. Siehe `counterOf` — er muss hier entstehen, nicht in der Sitzung.
  const against = counterOf(state, sourceId, optionId)
  if (!against)
    return tabled

  const title = getEvent(sourceId)?.title ?? getPolicy(sourceId)?.name ?? sourceId
  return pushNews(
    withPreparation(tabled, sourceId, { counteredBy: [...preparationFor(tabled, sourceId).counteredBy, against.id] }),
    {
      id: `counter-${sourceId}-${state.month}-${against.id}`,
      month: state.month,
      scope: 'city',
      urgency: 'normal',
      headline: `${against.abbreviation} macht Front gegen „${title}“`,
    },
  )
}

/** Und wieder herunter, solange die Sitzung nicht war. Ein Antrag ist zurückziehbar. */
export function withdrawMotion(state: SimulationState, sourceId: string): SimulationState {
  return { ...state, agenda: state.agenda.filter(item => item.sourceId !== sourceId) }
}

/**
 * Die Ratssitzung: alles, was auf der Tagesordnung steht, der Reihe nach.
 *
 * Läuft einmal je Monat, am Monatswechsel. Was beschlossen wird, wirkt ab sofort; was durchfällt,
 * ist erledigt. Die Tagesordnung ist danach leer — wer etwas wiederhaben will, setzt es neu drauf.
 */
export function holdSession(state: SimulationState): { state: SimulationState, results: VoteResult[] } {
  if (state.agenda.length === 0)
    return { state, results: [] }

  let next: SimulationState = { ...state, agenda: [] }
  const results: VoteResult[] = []

  for (const item of state.agenda) {
    const outcome = getEvent(item.sourceId)
      ? decide(next, item.sourceId, item.optionId, item.vote)
      : voteOnPolicy(next, item.sourceId)
    next = outcome.state
    if (outcome.result)
      results.push(outcome.result)
  }

  return { state: next, results }
}

/**
 * Wer sich gegen einen frischen Antrag stellt.
 *
 * Läuft beim **Einbringen** und nicht in der Sitzung, und das ist der ganze Unterschied: entstünde der
 * Gegenwind erst am Monatsende, entstünde er in derselben Sekunde wie die Abstimmung — der Spieler
 * sähe ihn nie und könnte nichts dagegen tun. So steht er am Tag nach dem Antrag im Blatt, und der
 * Monat, den der Kalender schenkt, ist die Zeit, ihn zu beantworten.
 *
 * Eine Fraktion stellt sich quer, wenn die Vorlage weit von ihren Achsen weg liegt, und umso eher, je
 * besser sie organisiert ist. Die eigene Fraktion und die Koalition bleiben draußen: gegen den
 * eigenen Antrag arbeitet niemand. Höchstens eine je Vorlage — zwei Gänge wären nicht doppelt so
 * laut, sondern doppelt so viel Text.
 */
function counterOf(state: SimulationState, sourceId: string, optionId: string): PartyDefinition | null {
  const definition = getEvent(sourceId)
  const policy = definition ? undefined : getPolicy(sourceId)
  const option = definition ? definition.options.find(entry => entry.id === optionId) : (policy ? asOption(policy) : undefined)
  if (!option)
    return null

  const stream = createRandomStream(state.seed, `counter:${state.month}:${sourceId}`)
  for (const party of PARTIES) {
    if (party.id === state.partyId || state.coalitionPartyIds.includes(party.id))
      continue
    const zeal = weightedDistance(party.axes, option) * (party.stats.organization / 100)
    if (stream.next() < zeal * 0.5)
      return party
  }
  return null
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
  const prep = preparationFor(state, eventId)
  const context = { ...voteContext(state, option, prep.campaignedOptionIds.includes(optionId), prep.counteredBy.length), playerVote }
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
    situation: healed(state.situation ?? { ...BASELINE_SITUATION }, BASELINE_SITUATION),
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
    // Spielstände von vor der Standortwahl warten auf nichts.
    agenda: state.agenda ?? [],
    lastSession: state.lastSession ?? [],
    // Spielstände von vor der Warteschlange hatten höchstens einen — oder gar keinen.
    siting: Array.isArray(state.siting) ? state.siting : (state.siting ? [state.siting] : []),
    sites: state.sites ?? {},
    hotspots: state.hotspots ?? [],
    spread: state.spread ?? initialSpread(),
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
/**
 * Eine beschlossene Vorlage in Kraft setzen — oder erst fragen, wo sie hin soll.
 *
 * Alles, wobei etwas **steht**, bekommt einen Standort, und zwar vom Spieler. Bis er ihn nennt, ist
 * nichts bezahlt und nichts gebaut: die Vorlage wartet in `siting`, und `chooseSite` führt sie von
 * dort aus zu Ende. Der Rat beschließt was, der Spieler entscheidet wo.
 *
 * Warum das nicht in `adoptMeasure` steht, durch das sonst jeder Weg läuft: dort kommen auch der
 * Schock eines Vorfalls und der Preis einer Ablehnung an, und keins von beiden ist etwas, für das
 * man einen Bauplatz aussuchen würde.
 */
export function applyPolicy(state: SimulationState, policyId: string, districtId: DistrictId | null = null): SimulationState {
  if (state.policies.some(policy => policy.id === policyId))
    return state
  const definition = getPolicy(policyId)
  if (!definition)
    throw new Error(`Unknown policy: ${policyId}`)

  if (districtId === null && needsSite(definition))
    return { ...state, siting: [...state.siting, { policyId, decidedMonth: state.month }] }

  const next = adoptMeasure(state, policyId, sitedOption(definition, districtId), 'governance')
  return pushNews(
    { ...next, policies: [...next.policies, { id: policyId, startedMonth: state.month }] },
    {
      id: `policy-${policyId}-${state.month}`,
      month: state.month,
      scope: 'city',
      urgency: 'important',
      headline: districtId
        ? `RATHAUS: „${definition.name}“ beschlossen — Standort ${SITE_PROFILES[districtId].name}`
        : `RATHAUS: „${definition.name}“ mit Ratsmehrheit beschlossen`,
      districtId: districtId ?? undefined,
      policyId,
    },
  )
}

/**
 * Dieselbe Vorlage, zu dem Preis und in dem Tempo, das ihr Standort verlangt.
 *
 * Ohne Standort unverändert — die sechzehn ortlosen Vorlagen gehen hier durch, ohne dass sich etwas
 * an ihnen ändert. Mit Standort werden drei Dinge angefasst und sonst nichts: der Einmalpreis, die
 * Anlaufzeit jeder Wirkung, und ein einmaliger Kratzer an der Zufriedenheit für den Widerstand vor
 * Ort. Die Wirkungen selbst bleiben, wie sie sind — was gebaut wird, hängt nicht davon ab, wo.
 */
function sitedOption(definition: PolicyDefinition, districtId: DistrictId | null): EventOption {
  const option = asOption(definition)
  if (districtId === null)
    return option
  return {
    ...option,
    oneOffCost: costAt(option.oneOffCost, districtId),
    effects: option.effects.map(effect => ({ ...effect, rampMonths: paceAt(effect.rampMonths, districtId) })),
  }
}

/**
 * Den Standort nennen und die Vorlage damit wirklich beschließen.
 *
 * Ein Bezirk, der nie angeboten wurde, wird abgewiesen: das Angebot ist Teil der Entscheidung, und
 * ein Befehl, der daran vorbeigeht, wäre eine Abkürzung um genau die Wahl herum, um die es geht.
 */
export function chooseSite(state: SimulationState, districtId: DistrictId): SimulationState {
  const waiting = state.siting[0]
  if (!waiting || !offered(waiting.policyId, state.seed, districtId))
    return state

  const bite = unrestAt(districtId)
  const settled = applyPolicy(
    { ...state, siting: state.siting.slice(1), metrics: { ...state.metrics, satisfaction: clamp(state.metrics.satisfaction - bite) } },
    waiting.policyId,
    districtId,
  )
  /*
   * Und was gebaut wird, wirkt dort, wo es gebaut wird.
   *
   * Der Punkt, an dem die Standortwahl von „Preis und Tempo“ zu einer Frage der Wirkung wird: neue
   * Wohnungen drücken die Miete **in ihrem Bezirk** und heben dort den Leerstand. Stadtweit ändert
   * sich dadurch nichts — das tun die Wohnungen selbst, über die Dynamik.
   */
  const definition = getPolicy(waiting.policyId)
  const builds = definition?.effects.some(effect => effect.target === 'housingUnits' || effect.target === 'socialUnits') ?? false
  const spread = builds
    ? {
        ...settled.spread,
        averageRent: shift(settled.spread.averageRent, districtId, -0.06),
        vacantUnits: shift(settled.spread.vacantUnits, districtId, 0.12),
      }
    : settled.spread

  return { ...settled, spread, sites: { ...settled.sites, [waiting.policyId]: districtId } }
}

/** Put one of the three standing motions to the council instead of adopting it directly. */
/**
 * Eine eigene Vorlage zur Abstimmung stellen.
 *
 * Hieß einmal `proposePolicy` und war zugleich das Einbringen. Seit dem Sitzungskalender ist das
 * Einbringen `tableMotion`, und hier steht nur noch die Abstimmung selbst — gerufen aus der Sitzung
 * oder von einem Dringlichkeitsantrag.
 */
export function voteOnPolicy(state: SimulationState, policyId: string): { state: SimulationState, result: VoteResult | null } {
  const definition = getPolicy(policyId)
  // Keine Fraktion bringt das Programm einer anderen ein. Die Auswahl selbst steht im Inhalt.
  if (!definition || !mayTable(state.partyId, policyId) || state.policies.some(policy => policy.id === policyId))
    return { state, result: null }
  const option = asOption(definition)
  const stream = createRandomStream(state.seed, `vote:${state.month}:${policyId}:${policyId}`)
  const campaigned = preparationFor(state, policyId).campaignedOptionIds.includes(policyId)
  const result = castVote(option, { ...voteContext(state, definition, campaigned, preparationFor(state, policyId).counteredBy.length), playerVote: 'yes' }, stream)

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
    /*
     * Radverkehr aus dem, was ihn in Wirklichkeit trägt: ein Netz, das man befahren kann, und eine
     * Stadt, die nicht am Auto klebt. Die Erschließung steht für das Netz, der Emissionsindex für
     * das Gegenteil — er fällt, wenn der Rat Wege verlagert, und steigt, wenn er es nicht tut.
     * Gemessene Spannen über acht Kampagnen: Erschließung 63,8–81,7, Emissionen 44,7–52,2. Beide
     * sind hier auf ihre eigene Spanne normiert, damit keine die andere überfährt.
     */
    cycling: clamp(
      0.25
      + clamp((metrics.transitCoverage - 64) / 18, 0, 1) * 0.45
      + clamp((50 - metrics.emissions) / 5, 0, 1) * 0.3,
      0.18,
      1,
    ),
    /*
     * Und was übrig bleibt, sitzt im Auto. Kein eigener Strom, sondern das Gegenstück: eine Stadt,
     * die Rad und Bahn ausbaut, hat weniger Autos auf der Straße, und das sieht man aus jeder Höhe.
     */
    carTraffic: clamp(
      1.12
      - clamp((metrics.transitCoverage - 64) / 18, 0, 1) * 0.3
      - clamp((50 - metrics.emissions) / 5, 0, 1) * 0.22,
      0.55,
      1.12,
    ),
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
     * Was in der Luft hängt.
     *
     * Gegen den Ausgangswert gerechnet, nicht gegen null: eine Stadt ohne Emissionen ist keine, und
     * was der Spieler ändert, ist der Abstand von dort, wo er angefangen hat.
     *
     * Der Nenner stand auf `emissions × 0,9` gegen einen Sockel von `× 0,7` — bei den Startwerten
     * ergab das **0,33 Dauerdunst**, und damit sah Lindenhafen vom ersten Tag an aus wie eine Stadt
     * im Smog. Nachgemessen bewegen sich die Emissionen über ein Jahrzehnt zwischen 43 und 51; die
     * Spanne ist jetzt darauf gelegt, sodass eine saubere Stadt wirklich klar ist und eine dreckige
     * den Horizont verliert. Das ist der Sinn des Signals.
     */
    haze: clamp((metrics.emissions - 47.4) / 4.4, 0, 1),
    idleness: clamp(metrics.youthUnemployment / 24, 0, 1),
    /*
     * Against two thousand, which is roughly where this city's own dynamics top out under a decade
     * of bad housing policy. Not against the population: a share of 120,000 would leave the signal
     * sitting at a hundredth for the whole campaign and nothing would ever be visible.
     */
    roughSleeping: clamp(metrics.homelessPeople / 2_000, 0, 1),
  }
}

/**
 * Was gerade auf einen Standort wartet, fertig zum Anzeigen.
 *
 * Preis und Dauer werden hier ausgerechnet und nicht in der Oberfläche: die Oberfläche soll zeigen,
 * was etwas kostet, und nicht ausrechnen, was etwas kostet. Sonst gibt es zwei Antworten auf
 * dieselbe Frage, und eine davon ist irgendwann falsch.
 */
function sitingView(state: SimulationState): PendingSiting | null {
  const waiting = state.siting[0]
  if (!waiting)
    return null
  const definition = getPolicy(waiting.policyId)
  if (!definition)
    return null

  const longest = definition.effects.reduce((most, effect) => Math.max(most, effect.rampMonths), 0)
  return {
    policyId: waiting.policyId,
    title: definition.name,
    sites: sitesFor(waiting.policyId, state.seed).map(site => ({
      districtId: site.districtId,
      name: site.name,
      cost: costAt(definition.implementationCost, site.districtId),
      months: paceAt(longest, site.districtId),
      resistance: unrestAt(site.districtId),
      note: site.note,
    })),
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
    situation: state.situation,
    goals: state.goalIds.flatMap((id) => {
      const goal = getGoal(id)
      if (!goal)
        return []
      const value = state.metrics[goal.metric as keyof CityMetrics] as number
      return [{ id, value, met: goalIsMet(goal, value) }]
    }),
    pendingDecisions: state.pending,
    motionPreparation: state.motionPrep,
    pendingSiting: sitingView(state),
    agenda: state.agenda.map(item => ({
      sourceId: item.sourceId,
      title: getEvent(item.sourceId)?.title ?? getPolicy(item.sourceId)?.name ?? item.sourceId,
      optionId: item.optionId,
      vote: item.vote,
      tabledMonth: item.tabledMonth,
    })),
    agendaSeats: AGENDA_SEATS,
    administration: {
      used: adminUsed(state),
      booked: state.agenda.reduce((sum, item) => sum + adminLoadOf(item.sourceId), 0),
      capacity: ADMIN_CAPACITY,
    },
    sites: state.sites,
    districtMetrics: Object.fromEntries(LINDENHAFEN.districts.map(district => [district.id, {
      averageRent: valueIn(state.metrics.averageRent, state.spread.averageRent, district.id),
      burglaryRate: valueIn(state.metrics.burglaryRate, state.spread.burglaryRate, district.id),
      vacantUnits: valueIn(state.metrics.vacantUnits, state.spread.vacantUnits, district.id),
    }])) as SimulationSnapshot['districtMetrics'],
    hotspots: state.hotspots.map((spot) => {
      const template = hotspotTemplate(spot.kind)
      return {
        id: spot.id,
        kind: spot.kind,
        label: template.label,
        districtId: spot.districtId,
        districtName: SITE_PROFILES[spot.districtId].name,
        level: spot.level,
        grace: Math.max(0, TIPPING_LEVEL - spot.level),
        running: spot.answer?.id ?? null,
        answers: template.answers.map(answer => ({
          id: answer.id,
          label: answer.label,
          detail: answer.detail,
          cost: answer.cost,
          monthly: answer.monthly,
          months: answer.months,
          open: !answer.needsPolicy || state.policies.some(policy => policy.id === answer.needsPolicy),
          needs: answer.needsPolicy ?? null,
        })),
      }
    }),
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

/**
 * Die Brennpunkte einen Monat weiter.
 *
 * Drei Dinge in einer Funktion, weil sie zusammengehören: was läuft, läuft weiter; was gekippt ist,
 * kostet; und höchstens einer macht neu auf.
 *
 * **Was kippen kostet: politisches Kapital, nicht die Stadt.**
 *
 * Der erste Versuch hat Zufriedenheit und Vertrauen belastet, und das war aus zwei Gründen falsch.
 * Gemessen: über 131 Monate machen **26** Brennpunkte auf, alle fünf Monate einer, und in einer
 * Amtszeit, in der niemand antwortet, kippen sie alle. Bei −2,2 Zufriedenheit je Kippen sind das
 * −57 Punkte — eine Stadt, die an einer Nebenmechanik zugrunde geht. `goals.test.ts` hat prompt
 * zwei von zwölf Kampagnenzielen für unerreichbar erklärt, und auch bei einem Sechstel des Wertes
 * blieb eins hängen: die Schwellen sitzen so knapp, dass die beste von 36 Durchspielungen teils auf
 * 0,2 an ihr Ziel herankommt. Die Kampagne hat für eine neue Dauerlast schlicht keinen Platz.
 *
 * Der zweite Grund ist der bessere: **es gehört gar nicht der Stadt.** Wer eine Serie monatelang
 * laufen lässt, sieht aus, als hätte er sie nicht im Griff — und das kostet ihn im Rat, nicht die
 * Mieten. Politisches Kapital wächst mit 1,1 im Monat nach; sechs Punkte sind eine halbe Verhandlung,
 * also genau die Ressource, um die die zweite Uhr ohnehin mit der ersten konkurriert.
 *
 * Kein Schaden an der Kennzahl, aus der er entstanden ist — das wäre eine Spirale, in der eine Stadt
 * mit hoher Einbruchsrate immer höhere bekommt, und ein Spiel, aus dem man nicht mehr herauskommt,
 * ist keine Entscheidung mehr.
 */
/** Was ein ausgesessener Brennpunkt im Rat kostet. Eine halbe Verhandlung, siehe oben. */
const TIPPING_COST = 6
function tickHotspots(state: SimulationState, month: number): SimulationState {
  const stepped = stepHotspots(state.hotspots, month)
  let next = state

  for (const spot of stepped.tipped) {
    const template = hotspotTemplate(spot.kind)
    next = escalate(next, template.escalation, month)
    next = pushNews(
      {
        ...next,
        metrics: { ...next.metrics, politicalCapital: clamp(next.metrics.politicalCapital - TIPPING_COST) },
      },
      {
        id: `hotspot-${spot.id}`,
        month,
        scope: 'city',
        urgency: 'breaking',
        headline: `${template.label.toUpperCase()} in ${SITE_PROFILES[spot.districtId].name}: monatelang nichts passiert`,
        districtId: spot.districtId,
      },
    )
  }

  const opened = openHotspot(stepped.open, next.metrics, month, createRandomStream(state.seed, `hotspot:${month}`))
  const open = opened ? [...stepped.open, opened] : stepped.open
  if (opened) {
    /*
     * Und sie steigen **dort**. Bis hierher hob eine Einbruchserie in der Gründerzeit Nord die Rate
     * der ganzen Stadt — also auch die in der Vorstadt West, wo nichts passiert war. Die Stadtzahl
     * bleibt, was die Dynamik gesagt hat; verschoben wird das Gefälle.
     */
    if (opened.kind === 'burglary')
      next = { ...next, spread: { ...next.spread, burglaryRate: shift(next.spread.burglaryRate, opened.districtId, 0.14) } }
    const template = hotspotTemplate(opened.kind)
    next = pushNews(next, {
      id: `hotspot-open-${opened.id}`,
      month,
      scope: 'city',
      urgency: 'important',
      headline: template.headline.replace('{bezirk}', SITE_PROFILES[opened.districtId].name),
      districtId: opened.districtId,
    })
  }

  return { ...next, hotspots: open }
}

/**
 * Was eine ausgesessene Lage im Rat aus sich macht.
 *
 * Aus zwei Strängen wird eine Kette: die Vorlage, die zu dem Brennpunkt gehört, kommt auf die
 * Tagesordnung — und zwar **von einer anderen Fraktion**, denn sie hat jetzt das Thema. Damit ist das
 * Ratsereignis die Eskalation der Lage und nicht ihr Zwilling.
 *
 * Nicht, wenn sie ohnehin schon auf dem Tisch liegt oder gerade abgekühlt ist — sonst bekäme man
 * dieselbe Vorlage zweimal nebeneinander, was genau der Zustand war, aus dem diese Funktion
 * entstanden ist.
 */
function escalate(state: SimulationState, eventId: string, month: number): SimulationState {
  const definition = getEvent(eventId)
  if (!definition || state.pending.some(entry => entry.eventId === eventId) || (state.cooldowns[eventId] ?? 0) > month)
    return state

  const tabled = tabler(state, definition, createRandomStream(state.seed, `escalation:${month}:${eventId}`))
  const next: SimulationState = {
    ...state,
    cooldowns: { ...state.cooldowns, [eventId]: month + definition.trigger.cooldownMonths },
    firedOnce: state.firedOnce.includes(eventId) ? state.firedOnce : [...state.firedOnce, eventId],
    tabledByOthers: tabled ? state.tabledByOthers + 1 : state.tabledByOthers,
    pending: [...state.pending, {
      eventId,
      raisedMonth: month,
      expiresMonth: month + definition.expiresInMonths,
      negotiatedPartyIds: [],
      campaignedOptionIds: [],
      tabledBy: tabled?.partyId ?? null,
      tabledOptionId: tabled?.optionId ?? null,
    }],
  }
  return pushNews(next, {
    id: `escalation-${eventId}-${month}`,
    month,
    scope: 'city',
    urgency: 'important',
    headline: tabled
      ? `STADTRAT: ${getParty(tabled.partyId)?.abbreviation ?? 'Fraktion'} bringt „${definition.title}“ ein`
      : `STADTRAT: „${definition.title}“ steht auf der Tagesordnung`,
    policyId: undefined,
  })
}

/**
 * Eine Antwort auf einen Brennpunkt geben.
 *
 * Bezahlt wird sofort und aus dem Haushalt; was über Monate läuft, wird als Maßnahme geführt wie
 * jede andere, damit es im Lagebild auftaucht und mitläuft, statt eine zweite Buchhaltung zu eröffnen.
 */
export function answerSituation(state: SimulationState, id: string, answerId: string): SimulationState {
  const done = answerHotspot(state.hotspots, id, answerId, state.month, policyId => state.policies.some(policy => policy.id === policyId))
  if (!done)
    return state

  const spot = state.hotspots.find(entry => entry.id === id)!
  const template = hotspotTemplate(spot.kind)
  const answer = template.answers.find(entry => entry.id === answerId)!

  const next: SimulationState = {
    ...state,
    hotspots: done.open,
    metrics: { ...state.metrics, cityBudget: Math.max(0, state.metrics.cityBudget - done.cost) },
    // Was man vor Ort tut, wirkt vor Ort: die Antwort holt das Gefälle wieder zurück.
    spread: spot.kind === 'burglary'
      ? { ...state.spread, burglaryRate: shift(state.spread.burglaryRate, spot.districtId, -0.1 * answer.relief) }
      : state.spread,
  }
  if (done.monthly === 0)
    return next

  return adoptMeasure(
    next,
    `hotspot:${id}`,
    {
      id: answerId,
      label: `${template.label} · ${answer.label}`,
      rationale: answer.detail,
      oneOffCost: 0,
      monthlyCost: done.monthly,
      costMonths: done.months,
      axes: {},
      salience: {},
      effects: [],
      sourceIds: [],
    },
    'safety',
  )
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
  // Erst die Welt, dann die Stadt: der Monat beginnt draußen.
  const situation = stepSituation(state.situation, createRandomStream(state.seed, `situation:${month}`))
  const stepped = stepDynamics(
    workingMetrics,
    workingStocks,
    state.perception,
    previousHealth,
    measureCost,
    capitalPerMonth(state.leader, state.partyId),
    situation,
  )
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
    situation,
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
  next = { ...next, streaks: updateStreaks({ month, metrics: { ...next.metrics, ...next.situation }, cooldowns: next.cooldowns, streaks: next.streaks, firedOnce: next.firedOnce, choices: next.choices, openDecisions: next.pending.length, activeMeasureSources: next.measures.map(measure => measure.sourceId), coalitionSeats: seatsOfCoalition(next) }) }
  const drawState: EventDrawState = {
    month,
    // Stadt und Welt in einer Ansicht, damit eine Bedingung auf beide schauen kann.
    metrics: { ...next.metrics, ...next.situation },
    cooldowns: next.cooldowns,
    streaks: next.streaks,
    firedOnce: next.firedOnce,
    choices: next.choices,
    openDecisions: next.pending.length,
    activeMeasureSources: next.measures.map(measure => measure.sourceId),
    coalitionSeats: seatsOfCoalition(next),
  }
  /*
   * Die zweite Uhr, vor dem Ereignis des Monats.
   *
   * Erst weitergehen lassen, was läuft, dann höchstens einen neuen Brennpunkt aufmachen. Vorher,
   * damit ein Brennpunkt, der in diesem Monat kippt, seinen Preis noch in diesem Monat bezahlt und
   * nicht im nächsten — die Rechnung kommt, wenn man sie ausgesessen hat, und nicht später.
   */
  next = tickHotspots(next, month)

  /*
   * Und dann tagt der Rat.
   *
   * Vor dem Ereignis des Monats, damit eine Vorlage, die heute beschlossen wird, noch heute gilt —
   * und damit das, was der Rat gerade beschlossen hat, nicht vom nächsten Ereignis überholt wird,
   * bevor es überhaupt im Stadtfunk stand.
   */
  const session = holdSession(next)
  next = { ...session.state, lastSession: session.results }

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

  /*
   * Und was der Monat sonst noch zu sagen hatte.
   *
   * `significantNews` meldete den Haushalt einmal im Jahr, den Wohnungsmarkt einmal im Jahr und alle
   * drei Monate einen Quartalsbericht — also etwa eine Zeile je Monat. Bei fünf realen Minuten je
   * Monat ist das eine Stadt, die zwölf Minuten lang schweigt. `bulletin` liest dagegen ab, was sich
   * tatsächlich bewegt hat, und das rechnet die Simulation ohnehin jeden Monat aus.
   */
  const news = [
    ...significantNews(next, month, next.metrics, state.metrics),
    ...bulletin(month, next.metrics, state.metrics, next.situation, state.situation),
    ...next.news,
  ].slice(0, 20)
  return { ...next, news }
}

export function advanceMonths(state: SimulationState, count: number): SimulationState {
  let next = state
  for (let index = 0; index < count; index += 1) next = advanceOneMonth(next)
  return next
}

export { forecastVote, supportFor }
