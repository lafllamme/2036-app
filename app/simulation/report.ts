import type {
  CampaignPriorityId,
  CityMetrics,
  MetricId,
  PartyId,
  SimulationSnapshot,
} from '../core/contracts'
import { EVENTS, getEvent } from '../content/events'
import { CAMPAIGN_PRIORITIES, PARTIES } from '../content/parties'
import { initialSupport } from './electorate'

/**
 * Ten years, written down.
 *
 * The campaign used to end with a disabled button and a headline. Everything a closing report needs
 * had been in the snapshot for weeks and was shown to nobody: what the city looked like the day the
 * player took office, which of their own decisions moved which number, how the street shifted under
 * them, and — the one thing only this game can say — which roads they closed behind themselves.
 *
 * Pure, and free of Vue: the report is a reading of a snapshot, and the only way to know it is right
 * is to be able to build one from numbers in a test.
 *
 * Nothing here computes anything the simulation did not already commit to. A closing report that
 * works out its own verdict is a second model, and a second model is one that can disagree with the
 * first in front of the player at the worst possible moment.
 */

/** What the player is scored against, and which way each has to move to count as kept. */
const PROMISED: Record<CampaignPriorityId, { metric: MetricId, good: 1 | -1 }[]> = {
  housing: [{ metric: 'averageRent', good: -1 }, { metric: 'socialUnits', good: 1 }, { metric: 'homelessPeople', good: -1 }],
  employment: [{ metric: 'employment', good: 1 }, { metric: 'youthUnemployment', good: -1 }],
  mobility: [{ metric: 'transitReliability', good: 1 }, { metric: 'transitCoverage', good: 1 }],
  climate: [{ metric: 'emissions', good: -1 }, { metric: 'greenSpacePerCapita', good: 1 }],
  cohesion: [{ metric: 'satisfaction', good: 1 }, { metric: 'polarisation', good: -1 }, { metric: 'integrationCapacity', good: 1 }],
  fiscalHealth: [{ metric: 'cityBudget', good: 1 }, { metric: 'debt', good: -1 }, { metric: 'investmentBacklog', good: -1 }],
}

/** The six numbers the report opens with: what a resident would ask about first. */
const LEDGER: { metric: MetricId, label: string, unit: string, good: 1 | -1 }[] = [
  { metric: 'averageRent', label: 'Ø Angebotsmiete', unit: ' €/m²', good: -1 },
  { metric: 'socialUnits', label: 'Sozialgebundene Wohnungen', unit: '', good: 1 },
  { metric: 'homelessPeople', label: 'Ohne Wohnung', unit: '', good: -1 },
  { metric: 'employment', label: 'Beschäftigung', unit: ' %', good: 1 },
  { metric: 'crimeRate', label: 'Kriminalität', unit: ' / 1.000', good: -1 },
  { metric: 'cityBudget', label: 'Haushaltsspielraum', unit: ' Mio. €', good: 1 },
]

/**
 * What every number a decision can move is called.
 *
 * The ledger names six; a measure can move any of thirty. Without this the report told the player
 * that their strongest decision had moved `businessStock`, which is a variable name and not German.
 */
const NAMES: Partial<Record<string, string>> = {
  population: 'Einwohner',
  netMigration: 'Wanderungssaldo',
  housingUnits: 'Wohnungsbestand',
  vacantUnits: 'Freie Wohnungen',
  socialUnits: 'Sozialgebundene Wohnungen',
  unitsUnderConstruction: 'Wohnungen im Bau',
  averageRent: 'Ø Angebotsmiete',
  homelessPeople: 'Ohne Wohnung',
  employment: 'Beschäftigung',
  youthUnemployment: 'Jugendarbeitslosigkeit',
  businessStock: 'Betriebe',
  crimeRate: 'Kriminalität',
  burglaryRate: 'Einbrüche',
  orderServiceCapacity: 'Ordnungsdienst',
  transitCoverage: 'ÖPNV-Abdeckung',
  transitReliability: 'ÖPNV-Pünktlichkeit',
  emissions: 'Emissionen',
  greenSpacePerCapita: 'Stadtgrün',
  childcareCoverage: 'Kitaplätze',
  schoolUtilisation: 'Schulauslastung',
  integrationCapacity: 'Integrationsplätze',
  cityBudget: 'Haushaltsspielraum',
  debt: 'Kassenkredite',
  investmentBacklog: 'Sanierungsstau',
  satisfaction: 'Zufriedenheit',
  politicalCapital: 'Politisches Kapital',
  polarisation: 'Polarisierung',
  greenSpaceHectares: 'Stadtgrün (ha)',
  childcarePlaces: 'Kitaplätze',
  schoolPlaces: 'Schulplätze',
  integrationPlaces: 'Integrationsplätze',
  orderServiceFte: 'Ordnungsdienst (VZÄ)',
  transitCapacity: 'ÖPNV-Kapazität',
  maintenanceSpend: 'Instandhaltung',
}

/**
 * The option id an immediate effect is filed under.
 *
 * A crisis writes its own cost into the ledger the moment it lands, and that cost arrives as a
 * measure like any other — so without this the report named a plant closure as one of the player's
 * strongest decisions. A thing that happened to them is not a thing they did.
 */
const NOT_A_DECISION = ':sofort'

/** Below this a change is noise and saying "unverändert" is the more honest reading. */
const NOTHING_HAPPENED = 0.005

export interface LedgerLine {
  label: string
  unit: string
  before: number
  after: number
  /**
   * What it actually did, as a share of where it started. Signed the way the number moved, not the
   * way the player wanted it to — a rent that fell five per cent reads as −5 %, and `good` says
   * whether that was the direction they were after. Folding the two together produced a report in
   * which homelessness had gone down by two hundred and seventy-seven per cent.
   */
  change: number
  good: boolean
  unchanged: boolean
}

export interface ClosingReport {
  ending: {
    kind: 'served' | 'voted-out' | 'broken'
    /** What the player did with the decade, in one line. */
    headline: string
    /** And why it ended that way, in one more. */
    because: string
  }
  months: number
  ledger: LedgerLine[]
  /** The decisions that moved the city most, strongest first. Only the player's own. */
  decisions: { label: string, on: string, delta: number, good: boolean }[]
  /** Where the street stood on the first day and on the last. */
  support: { partyId: PartyId, name: string, before: number, after: number, own: boolean }[]
  /** The promises, and whether the numbers behind them moved. */
  promises: { id: CampaignPriorityId, name: string, kept: boolean, score: number }[]
  /** How many roads were taken, and how many events that closed off for good. */
  doors: { taken: number, closed: string[] }
}

export function closingReport(snapshot: SimulationSnapshot, ownParty: PartyId | null): ClosingReport {
  const before = snapshot.baselineMetrics
  const after = snapshot.metrics

  return {
    ending: ending(snapshot),
    months: snapshot.month,
    ledger: LEDGER.map(line => reading(line, before, after)),
    decisions: strongest(snapshot),
    support: standing(snapshot, ownParty),
    promises: (snapshot.priorityIds ?? []).map(id => promise(id, before, after)),
    doors: doors(snapshot.choices ?? []),
  }
}

/**
 * How it ended, and why.
 *
 * Three endings, and the report refuses to call any of them a win. A decade of municipal government
 * does not have a score, and putting one on it would be the one place this game told the player
 * something it cannot know. It says what happened and what the numbers did; the verdict is theirs.
 */
function ending(snapshot: SimulationSnapshot): ClosingReport['ending'] {
  const defeat = snapshot.defeat
  if (!defeat) {
    return {
      kind: 'served',
      headline: 'Das Jahrzehnt ist zu Ende.',
      because: 'Zehn Jahre, hundertzwanzig Monate, zwei Wahlen. Der Rat, der im Januar 2026 zusammentrat, hat bis zum Schluss regiert.',
    }
  }
  if (defeat.reason === 'voted-out') {
    return {
      kind: 'voted-out',
      headline: 'Abgewählt.',
      because: 'Die Wahl hat einen Rat hervorgebracht, in dem deine Koalition keine Mehrheit mehr hat. Regiert wird ohne dich weiter.',
    }
  }
  const edge = {
    budget: 'Der Haushalt war über ein Jahr lang nicht mehr ausgeglichen zu bekommen.',
    crime: 'Die Kriminalität lag über ein Jahr lang über der Schwelle, ab der das Land eingreift.',
    employment: 'Die Beschäftigung lag über ein Jahr lang so tief, dass die Stadt sich entvölkert hat.',
  }[defeat.reason]
  return {
    kind: 'broken',
    headline: 'Die Stadt war nicht mehr zu regieren.',
    because: `${edge} Ein einzelner furchtbarer Monat ist eine Krise. Vierzehn am Stück sind etwas anderes.`,
  }
}

function reading(line: typeof LEDGER[number], before: CityMetrics, after: CityMetrics): LedgerLine {
  const from = before[line.metric]
  const to = after[line.metric]
  const moved = to - from
  const share = from === 0 ? 0 : moved / Math.abs(from)
  return {
    label: line.label,
    unit: line.unit,
    before: from,
    after: to,
    change: share,
    good: Math.sign(moved) === line.good,
    unchanged: Math.abs(share) < NOTHING_HAPPENED,
  }
}

/**
 * Which of the player's own decisions actually moved the city.
 *
 * Read straight out of `drivers`, which the simulation has been keeping all along: for each number,
 * the measures that pushed it and by how much. Deduplicated by decision, because one measure that
 * moved four numbers is one decision and should be named once — with the number it moved most.
 */
function strongest(snapshot: SimulationSnapshot): ClosingReport['decisions'] {
  const best = new Map<string, { label: string, on: string, delta: number, good: boolean }>()
  for (const [metric, drivers] of Object.entries(snapshot.drivers ?? {})) {
    const line = LEDGER.find(entry => entry.metric === metric)
    for (const driver of drivers ?? []) {
      if (driver.id?.endsWith(NOT_A_DECISION))
        continue
      const held = best.get(driver.label)
      if (held && Math.abs(held.delta) >= Math.abs(driver.delta))
        continue
      best.set(driver.label, {
        label: driver.label,
        on: NAMES[metric] ?? line?.label ?? metric,
        delta: driver.delta,
        good: line ? Math.sign(driver.delta) === line.good : driver.delta > 0,
      })
    }
  }
  return [...best.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6)
}

function standing(snapshot: SimulationSnapshot, ownParty: PartyId | null): ClosingReport['support'] {
  const start = initialSupport()
  return PARTIES.map(party => ({
    partyId: party.id,
    name: party.abbreviation,
    before: start[party.id],
    after: snapshot.support?.[party.id] ?? start[party.id],
    own: party.id === ownParty,
  })).sort((a, b) => b.after - a.after)
}

/**
 * Whether a promise was kept, measured rather than judged.
 *
 * Each priority names two or three numbers and the direction each has to move. The score is the mean
 * of what they did as a share of where they started — so a promise is kept when the numbers behind it
 * moved the right way, and not because the player says it was.
 */
function promise(id: CampaignPriorityId, before: CityMetrics, after: CityMetrics): ClosingReport['promises'][number] {
  const measures = PROMISED[id]
  const score = measures.reduce((sum, measure) => {
    const from = before[measure.metric]
    const moved = after[measure.metric] - from
    return sum + (from === 0 ? 0 : (moved / Math.abs(from)) * measure.good)
  }, 0) / Math.max(1, measures.length)
  return {
    id,
    name: CAMPAIGN_PRIORITIES.find(priority => priority.id === id)?.name ?? id,
    kept: score > NOTHING_HAPPENED,
    score,
  }
}

/**
 * What the player will never see, because of what they did.
 *
 * The payoff for the whole branching system, and the only part of the report that is about the
 * decade that did not happen. Every event whose trigger is shut by a choice the council carried is
 * named — not as a reproach, but because a decision that closes nothing was not a decision.
 */
function doors(choices: string[]): ClosingReport['doors'] {
  const taken = new Set(choices)
  const closed = EVENTS
    .filter(event => event.trigger.blockedByChoiceIds?.some(choice => taken.has(choice)))
    // An event that shuts itself is a problem solved, not a road not taken.
    .filter(event => !event.trigger.blockedByChoiceIds!.every(choice => choice.startsWith(`${event.id}:`)))
    .map(event => event.title)
  return { taken: choices.filter(choice => getEvent(choice.split(':')[0] ?? '')).length, closed }
}
