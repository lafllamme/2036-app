/**
 * The wire between the worker and the interface.
 *
 * The simulation runs in a worker, so every exchange is a message rather than a call. `SimulationCommand`
 * is what the interface may ask for and `SimulationMessage` what it can get back.
 */

import type { SimulationState } from '../../simulation/model'
import type { SituationState } from '../../simulation/situation'
import type { DistrictId } from './city'
import type { MotionPreparationView, PartyVote, PendingDecision, VoteForecast, VoteResult } from './events'
import type { CausalEdge, CityMetrics, HealthScores, MetricId, PerceptionState } from './metrics'
import type { ActiveMeasureView } from './policies'
import type { CampaignGoalId, CampaignLeader, PartyId } from './politics'
import type { CityVisualState } from './visuals'

export interface NewsItem {
  id: string
  month: number
  scope: 'city' | 'national' | 'world'
  urgency: 'normal' | 'important' | 'breaking'
  headline: string
  districtId?: DistrictId
  policyId?: string
}

/** Ein Ziel mit dem Stand von heute: der Wert, die Schwelle, und ob es gerade gilt. */
export interface CampaignGoalProgress {
  id: CampaignGoalId
  value: number
  met: boolean
}

export interface SimulationSnapshot {
  schemaVersion: 1
  month: number
  year: number
  monthOfYear: number
  metrics: CityMetrics
  previousMetrics: CityMetrics
  /** The city as it was on the first day, so every number can say what the player has changed. */
  baselineMetrics: CityMetrics
  /**
   * What the player's own decisions have done to each metric, summed over the whole campaign.
   *
   * Only the decisions. The city's own dynamics move everything every month and would drown out the
   * one thing the player can actually act on — the question being answered is not "why is crime 52"
   * but "what did *I* do to it".
   */
  drivers: Partial<Record<MetricId, { id: string, label: string, delta: number }[]>>
  health: HealthScores
  perception: PerceptionState
  activePolicyIds: string[]
  activeMeasures: ActiveMeasureView[]
  /**
   * Every choice the council carried, as `eventId:optionId`.
   *
   * Out here rather than only inside the simulation because the closing report is about the road
   * taken, and the road taken is exactly this list. What the player never saw is the other half of
   * the story, and it can only be worked out from what they did.
   */
  choices: string[]
  /** The three the player ran on. The closing report scores them against what they left behind. */
  /** Die drei Ziele, an denen dieses Jahrzehnt gemessen wird. */
  goalIds: CampaignGoalId[]
  /** Wer den Vorsitz hat. */
  leader: CampaignLeader | null
  /** Die Lage: die Welt über der Stadt, vier Indizes um 100. */
  situation: SituationState
  /** Wie weit jedes davon heute steht. Berechnet, nie gespeichert. */
  goals: CampaignGoalProgress[]
  pendingDecisions: PendingDecision[]
  /** Negotiation and campaigning already paid for, keyed by motion id. */
  motionPreparation: Record<string, MotionPreparationView>
  /**
   * Was eine Verhandlung mit jeder Fraktion **gerade** kostet.
   *
   * Es stand fest auf zwölf, in der Oberfläche sogar als Zahl im Text. Seit der Preis am Verhältnis
   * hängt — sieben bei vollem Rückhalt, achtzehn bei offener Feindschaft —, muss er mit dem
   * Schnappschuss kommen: die Oberfläche kennt weder das Verhältnis noch die Formel, und sie soll
   * beides auch nicht kennen.
   */
  negotiationCosts: Partial<Record<PartyId, number>>
  /** Was gerade auf einen Standort wartet, oder nichts. Siehe `PendingSiting`. */
  pendingSiting: PendingSiting | null
  /**
   * Und was gerade auf einen **Block** wartet.
   *
   * Dieselbe Frage eine Größenordnung feiner, und deshalb ein eigenes Feld: auf einen Standort
   * antwortet man mit einem Namen aus einer Liste, auf einen Block, indem man in die Stadt zeigt.
   * Siehe `simulation/renewal.ts`.
   */
  pendingBlock: { policyId: string, title: string, cost: number, months: number } | null
  /** Die beschlossenen Blocksanierungen, laufende wie fertige. Der Renderer putzt danach die Häuser. */
  renewals: RenewalView[]
  /**
   * Die Tagesordnung der nächsten Ratssitzung.
   *
   * Eingebracht heißt: steht hier. Abgestimmt wird am Monatsende über alles davon — und in der Zeit
   * dazwischen kann verhandelt werden. Siehe `simulation/model.ts`, `tableMotion`.
   */
  agenda: { sourceId: string, title: string, optionId: string, vote: PartyVote, tabledMonth: number }[]
  /** Wie viele Pätze eine Tagesordnung hat. */
  agendaSeats: number
  /**
   * Was die Verwaltung trägt und was davon gebunden ist.
   *
   * `administrativeLoad` steht seit jeher an jeder Vorlage und wurde von nichts gelesen. Jetzt
   * entscheidet es, wie viele Vorhaben gleichzeitig laufen können — siehe `ADMIN_CAPACITY`.
   */
  administration: { used: number, booked: number, capacity: number }
  /** Wohin jede verortete Vorlage gegangen ist — damit die Karte dort baut. */
  sites: Partial<Record<string, DistrictId>>
  /** Was der Stadt gerade an einem Ort zusetzt. Siehe `HotspotView`. */
  hotspots: HotspotView[]
  /**
   * Drei Kennzahlen je Bezirk — Miete, Einbrüche, Leerstand.
   *
   * Keine acht Simulationen: die Stadtzahl bleibt die Wahrheit, und das gewichtete Mittel dieser acht
   * Werte ist immer exakt sie. Siehe `simulation/districts.ts`.
   */
  districtMetrics: Record<DistrictId, { averageRent: number, burglaryRate: number, vacantUnits: number }>
  councilSeatsByParty: Record<PartyId, number>
  coalitionPartyIds: PartyId[]
  coalitionSupport: number
  /**
   * Who the city would vote for today, as six shares that add to one.
   *
   * Not the same thing as seats, and the difference is the point: seats do not move between
   * elections, support does, and governing with a majority that is no longer the city is the
   * position the player is meant to feel.
   */
  support: Record<PartyId, number>
  /**
   * Why the campaign ended early, or null while the player is still in office.
   *
   * Two ways to lose: the council elected in 2031 or 2036 no longer carries the player's coalition,
   * or the city has been past one of three hard edges for over a year. Both end in the same closing
   * report — a black screen would be the wrong answer to ten years of work.
   */
  defeat: { reason: 'voted-out' | 'budget' | 'crime' | 'employment', month: number, headline: string } | null
  causalEdges: CausalEdge[]
  news: NewsItem[]
  cityVisuals: CityVisualState
}

export type SimulationCommand
  = | { type: 'INIT', seed: number, partyId?: PartyId, goalIds?: CampaignGoalId[], leader?: CampaignLeader }
    | { type: 'ADVANCE', months: number }
    | { type: 'APPLY_POLICY', policyId: string }
    | { type: 'RESET', seed: number, partyId?: PartyId, goalIds?: CampaignGoalId[], leader?: CampaignLeader }
    | SimulationCommandExtra

export type SimulationMessage
  = | { type: 'SAVE_STATE', state: SimulationState, snapshot: SimulationSnapshot }
    | { type: 'READY', snapshot: SimulationSnapshot }
    | { type: 'SNAPSHOT', snapshot: SimulationSnapshot }
    | { type: 'VOTE_RESULT', result: VoteResult, snapshot: SimulationSnapshot }
    /** Was die Ratssitzung dieses Monats ergeben hat — bis zu drei Abstimmungen an einem Abend. */
    | { type: 'SESSION', results: VoteResult[], snapshot: SimulationSnapshot }
    | { type: 'FORECAST', eventId: string, forecasts: Record<string, VoteForecast> }
    | { type: 'ERROR', message: string }

/**
 * Eine beschlossene Vorlage, die noch auf ihren Standort wartet — und die drei, die zur Wahl stehen.
 *
 * Der Rat hat entschieden, was gebaut wird. Wo, entscheidet der Spieler, und bis dahin ist nichts
 * bezahlt und nichts gebaut. Siehe `simulation/siting.ts`.
 */
/** Eine Blocksanierung, so wie der Renderer und die Karte sie brauchen. */
export interface RenewalView {
  id: string
  districtId: DistrictId
  x: number
  z: number
  startedMonth: number
  /** 0 … 1. Bei eins ist das Gerüst weg. */
  progress: number
}

export interface PendingSiting {
  policyId: string
  title: string
  sites: {
    districtId: DistrictId
    name: string
    /** Was das Vorhaben hier kostet, in Millionen. */
    cost: number
    /** Und wie lange es hier dauert, in Monaten bis zur vollen Wirkung. */
    months: number
    /** Was es an Zufriedenheit kostet, hier zu bauen. */
    resistance: number
    note: string
  }[]
}

/**
 * Ein Brennpunkt, fertig zum Anzeigen: was los ist, wo, wie schlimm, und was man tun kann.
 *
 * Die zweite Uhr des Spiels — kleiner als ein Ratsbeschluss, an einem Ort, mit Mitteln zu beantworten
 * statt mit Mehrheiten. Siehe `simulation/hotspots.ts`.
 */
export interface HotspotView {
  id: string
  kind: string
  label: string
  districtId: DistrictId
  districtName: string
  /** 1 bis 4. Auf der letzten Stufe kippt er im nächsten Monat. */
  level: number
  /** Wie viele Stufen es bis zum Kippen noch sind. */
  grace: number
  /** Die laufende Antwort, wenn eine läuft. */
  running: string | null
  answers: {
    id: string
    label: string
    detail: string
    cost: number
    monthly: number
    months: number
    /** Ob sie überhaupt gewählt werden kann — manche brauchen erst einen Ratsbeschluss. */
    open: boolean
    /** Und wenn nicht: welchen. */
    needs: string | null
  }[]
}

export type SimulationCommandExtra
  = | { type: 'REQUEST_SAVE' }
    /** Wohin die beschlossene Vorlage soll. Pflicht: ohne sie passiert nichts. */
    | { type: 'CHOOSE_SITE', districtId: DistrictId }
    /** Auf welchen Block die Sanierung geht: das angeklickte Haus. Siehe `simulation/renewal.ts`. */
    | { type: 'CHOOSE_BLOCK', at: { x: number, z: number, districtId: DistrictId } }
    /** Eine Antwort auf einen Brennpunkt. Ohne Rat, aus eigenen Mitteln. */
    | { type: 'ANSWER_HOTSPOT', id: string, answerId: string }
    /** Auf die Tagesordnung der nächsten Sitzung damit. Abgestimmt wird am Monatsende. */
    | { type: 'TABLE_MOTION', sourceId: string, optionId: string, vote?: PartyVote }
    | { type: 'WITHDRAW_MOTION', sourceId: string }
    /** Am Kalender vorbei, sofort abstimmen. Kostet politisches Kapital. */
    | { type: 'CALL_URGENT', sourceId: string, optionId: string, vote?: PartyVote }
    | { type: 'RESTORE', state: SimulationState }
    | { type: 'REQUEST_FORECAST', eventId: string }
    | { type: 'RESOLVE_DECISION', eventId: string, optionId: string }
    /** Somebody else tabled it; all the player brings is their seats. See `voteOnMotion`. */
    | { type: 'VOTE_ON_MOTION', eventId: string, vote: PartyVote }
    | { type: 'NEGOTIATE', eventId: string, partyId: PartyId }
    | { type: 'CAMPAIGN', eventId: string, optionId: string }
    | { type: 'SET_CAMPAIGN', partyId: PartyId, goalIds: CampaignGoalId[], leader?: CampaignLeader }
