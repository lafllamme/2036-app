import type { EventDefinition, PolicyEffect } from '../core/contracts'

/**
 * The Lindenhafen event library. See docs/EVENT_MATRIX.md for the authoring rules.
 *
 * Two rules are load-bearing:
 *  - Options buy capacity, never outcomes. A safety measure staffs the Ordnungsdienst; it does not
 *    set a crime rate. The dynamics turn capacity into outcomes with the appropriate lag.
 *  - No trigger reads an identity-composition indicator. Contested causality runs through funded
 *    capacity, per the rule in docs/METRICS.md and AGENTS.md.
 *
 * All values are labelled Lindenhafen model assumptions, not real-world forecasts.
 */

const MODEL = ['vertical-slice-model-v1']

type EffectInput = Partial<PolicyEffect> & Pick<PolicyEffect, 'target' | 'expected'>

function effect(input: EffectInput): PolicyEffect {
  return {
    mode: 'level',
    delayMonths: 2,
    rampMonths: 10,
    min: input.expected * 0.55,
    max: input.expected * 1.45,
    confidence: 'medium',
    ...input,
  }
}

export const EVENTS: EventDefinition[] = [
  // --- Safety --------------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'saf-burglary-series',
    kind: 'decision',
    category: 'safety',
    title: 'Einbruchserie im Wohnring Süd',
    briefing:
      'Seit zwei Monaten häufen sich Wohnungseinbrüche im Wohnring Süd. Die Polizei ist Landessache, die Stadt kann über Ordnungsdienst, Beleuchtung und Prävention entscheiden.',
    urgency: 'important',
    trigger: { earliestMonth: 4, latestMonth: 120, conditions: [{ metric: 'burglaryRate', operator: '>', value: 4.1, sustainedMonths: 2 }], baseWeight: 10, cooldownMonths: 18, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'saf-burglary-none',
    expiresInMonths: 3,
    options: [
      {
        id: 'saf-burglary-order',
        label: 'Ordnungsdienst aufstocken',
        rationale: 'Zwölf zusätzliche Stellen und Nachtstreifen im betroffenen Quartier.',
        oneOffCost: 2.4,
        monthlyCost: 0.72,
        axes: { securityAuthority: 0.7, fiscalRestraint: -0.2, marketVsPublic: -0.3 },
        salience: { securityAuthority: 1, fiscalRestraint: 0.5, marketVsPublic: 0.2 },
        effects: [effect({ target: 'orderServiceFte', expected: 14, rampMonths: 8 })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-burglary-prevention',
        label: 'Beleuchtung und Nachbarschaftsprogramm',
        rationale: 'Straßenbeleuchtung, Quartiersmanagement und Jugendarbeit statt Präsenz.',
        oneOffCost: 3.6,
        monthlyCost: 0.38,
        costMonths: 36,
        axes: { securityAuthority: -0.5, redistribution: 0.4, marketVsPublic: -0.4 },
        salience: { securityAuthority: 1, redistribution: 0.6, marketVsPublic: 0.3 },
        effects: [
          effect({ target: 'orderServiceFte', expected: 5, rampMonths: 10 }),
          effect({ target: 'integrationPlaces', expected: 120, rampMonths: 14, confidence: 'low' }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'saf-burglary-cctv',
        label: 'Videoüberwachung an Knotenpunkten',
        rationale: 'Kameras an 18 Knotenpunkten, schnell umsetzbar, rechtlich umstritten.',
        oneOffCost: 5.1,
        monthlyCost: 0.24,
        axes: { securityAuthority: 0.9, marketVsPublic: 0.4, opennessIntegration: -0.3 },
        salience: { securityAuthority: 1, marketVsPublic: 0.4, opennessIntegration: 0.5 },
        effects: [effect({ target: 'orderServiceFte', expected: 8, rampMonths: 5, confidence: 'low' })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-burglary-none',
        label: 'Zur Kenntnis nehmen',
        rationale: 'Die Verwaltung verweist auf die Zuständigkeit des Landes.',
        oneOffCost: 0,
        monthlyCost: 0,
        axes: { fiscalRestraint: 0.8 },
        salience: { fiscalRestraint: 1, securityAuthority: 0.3 },
        effects: [],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'saf-youth-centre',
    kind: 'decision',
    category: 'social',
    title: 'Jugendtreff vor der Schließung',
    briefing:
      'Der freie Träger des Jugendtreffs Hafenstraße kann die Kofinanzierung nicht mehr aufbringen. Die Einrichtung erreicht rund 400 Jugendliche.',
    urgency: 'normal',
    trigger: { earliestMonth: 8, latestMonth: 110, conditions: [{ metric: 'cityBudget', operator: '<', value: 300 }], baseWeight: 7, cooldownMonths: 36, oncePerCampaign: true },
    immediateEffects: [],
    expiresInMonths: 2,
    refusedEffects: [
      effect({ target: 'integrationPlaces', expected: -70, delayMonths: 1, rampMonths: 4 }),
    ],
    options: [{
      id: 'saf-youth-fund',
      label: 'Weiterfinanzieren',
      rationale: 'Die Stadt übernimmt den Fehlbetrag dauerhaft.',
      oneOffCost: 0.4,
      monthlyCost: 0.21,
      costMonths: 60,
      axes: { redistribution: 0.6, marketVsPublic: -0.5, fiscalRestraint: -0.4 },
      salience: { redistribution: 1, marketVsPublic: 0.5, fiscalRestraint: 0.7 },
      effects: [effect({ target: 'integrationPlaces', expected: 90, rampMonths: 6 })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },

  // --- Housing -------------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'hou-investor-block',
    kind: 'decision',
    category: 'housing',
    title: 'Investor kauft 400 Wohnungen',
    briefing:
      'Ein überregionaler Bestandshalter übernimmt 412 Wohnungen in Gründerzeit-Nord. Die Stadt hat ein Vorkaufsrecht, aber nur acht Wochen Zeit.',
    urgency: 'breaking',
    trigger: { earliestMonth: 6, latestMonth: 96, conditions: [{ metric: 'vacantUnits', operator: '<', value: 3_000 }], baseWeight: 12, cooldownMonths: 40, oncePerCampaign: true, minCoalitionSeats: 28 },
    immediateEffects: [],
    defaultOptionId: 'hou-investor-none',
    expiresInMonths: 2,
    options: [
      {
        id: 'hou-investor-preempt',
        label: 'Vorkaufsrecht ziehen',
        rationale: 'Teuer und sofort kassenwirksam, sichert aber 412 Wohnungen dauerhaft preisgebunden.',
        oneOffCost: 34,
        monthlyCost: 0.6,
        costMonths: 60,
        axes: { marketVsPublic: -0.9, redistribution: 0.7, fiscalRestraint: -0.7 },
        salience: { marketVsPublic: 1, redistribution: 0.8, fiscalRestraint: 0.9 },
        effects: [effect({ target: 'socialUnits', expected: 412, delayMonths: 1, rampMonths: 4, confidence: 'high' })],
        sourceIds: MODEL,
      },
      {
        id: 'hou-investor-charter',
        label: 'Sozialcharta verhandeln',
        rationale: 'Kostenlos, aber freiwillig: Mieterschutz für zehn Jahre ohne dauerhafte Bindung.',
        oneOffCost: 0.6,
        monthlyCost: 0,
        axes: { marketVsPublic: 0, redistribution: 0.3, fiscalRestraint: 0.3 },
        salience: { marketVsPublic: 0.7, redistribution: 0.7, fiscalRestraint: 0.5 },
        effects: [effect({ target: 'socialUnits', expected: 150, delayMonths: 2, rampMonths: 8, confidence: 'low' })],
        sourceIds: MODEL,
      },
      {
        id: 'hou-investor-none',
        label: 'Verkauf laufen lassen',
        rationale: 'Kein Eingriff in den Markt, keine Belastung des Haushalts.',
        oneOffCost: 0,
        monthlyCost: 0,
        axes: { marketVsPublic: 0.8, fiscalRestraint: 0.7, redistribution: -0.4 },
        salience: { marketVsPublic: 1, fiscalRestraint: 0.7, redistribution: 0.6 },
        effects: [],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'hou-bindings-expire',
    kind: 'milestone',
    category: 'housing',
    title: 'Sozialbindungen laufen aus',
    briefing:
      'Zum Jahreswechsel fallen erneut rund 900 Wohnungen aus der Preisbindung. Ohne Beschluss wird der Verlust dauerhaft.',
    urgency: 'important',
    trigger: { earliestMonth: 24, latestMonth: 120, conditions: [], baseWeight: 100, cooldownMonths: 46, oncePerCampaign: false, scheduledMonthOfYear: 1, minCoalitionSeats: 22 },
    immediateEffects: [],
    expiresInMonths: 3,
    options: [{
      id: 'hou-bindings-buy',
      label: 'Bindungen ankaufen',
      rationale: 'Die Stadt kauft Belegungsrechte für weitere 20 Jahre zurück.',
      oneOffCost: 14,
      monthlyCost: 0.34,
      costMonths: 96,
      axes: { marketVsPublic: -0.7, redistribution: 0.7, fiscalRestraint: -0.5 },
      salience: { marketVsPublic: 0.9, redistribution: 1, fiscalRestraint: 0.8 },
      effects: [effect({ target: 'socialUnits', expected: 860, delayMonths: 1, rampMonths: 6, confidence: 'high' })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'hou-rent-shock',
    kind: 'incident',
    category: 'housing',
    title: 'Mietspiegel springt nach oben',
    briefing: 'Der neue Mietspiegel weist den stärksten Anstieg seit zwölf Jahren aus. Mieterinitiativen kündigen Proteste an.',
    urgency: 'important',
    trigger: { earliestMonth: 10, latestMonth: 128, conditions: [{ metric: 'averageRent', operator: '>', value: 14 }], baseWeight: 8, cooldownMonths: 14, oncePerCampaign: false },
    immediateEffects: [],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },

  // --- Social --------------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'soc-childcare-gap',
    kind: 'decision',
    category: 'social',
    title: 'Klagen auf einen Kitaplatz',
    briefing:
      'Eltern klagen auf den Rechtsanspruch. Die Betreuungsquote liegt unter der gesetzlichen Vorgabe, und die Verwaltung rechnet mit weiteren Verfahren.',
    urgency: 'important',
    trigger: { earliestMonth: 6, latestMonth: 120, conditions: [{ metric: 'childcareCoverage', operator: '<', value: 93, sustainedMonths: 3 }], baseWeight: 11, cooldownMonths: 22, oncePerCampaign: false, minCoalitionSeats: 22 },
    immediateEffects: [],
    defaultOptionId: 'soc-childcare-litigate',
    expiresInMonths: 3,
    options: [
      {
        id: 'soc-childcare-build',
        label: 'Ausbauprogramm beschließen',
        rationale: 'Vier neue Einrichtungen und Personalgewinnung. Wirkt ab dem übernächsten Kitajahr.',
        oneOffCost: 17,
        monthlyCost: 0.95,
        axes: { marketVsPublic: -0.6, redistribution: 0.6, fiscalRestraint: -0.6 },
        salience: { marketVsPublic: 0.7, redistribution: 0.9, fiscalRestraint: 0.9 },
        effects: [effect({ target: 'childcarePlaces', expected: 640, delayMonths: 8, rampMonths: 16, confidence: 'high' })],
        sourceIds: MODEL,
      },
      {
        id: 'soc-childcare-daycare',
        label: 'Tagespflege fördern',
        rationale: 'Schneller und billiger, deckt aber nur einen Teil des Bedarfs ab.',
        oneOffCost: 3.2,
        monthlyCost: 0.42,
        axes: { marketVsPublic: 0.4, fiscalRestraint: 0.3, redistribution: 0.2 },
        salience: { marketVsPublic: 0.8, fiscalRestraint: 0.8, redistribution: 0.5 },
        effects: [effect({ target: 'childcarePlaces', expected: 260, delayMonths: 3, rampMonths: 9 })],
        sourceIds: MODEL,
      },
      {
        id: 'soc-childcare-litigate',
        label: 'Verfahren führen',
        rationale: 'Die Stadt bestreitet die Ansprüche und wartet Urteile ab.',
        oneOffCost: 1.1,
        monthlyCost: 0.14,
        costMonths: 12,
        axes: { fiscalRestraint: 0.8, redistribution: -0.3 },
        salience: { fiscalRestraint: 1, redistribution: 0.7 },
        effects: [],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'soc-allocation',
    kind: 'decision',
    category: 'social',
    title: 'Land weist 600 Personen zu',
    briefing:
      'Die Bezirksregierung weist Lindenhafen 600 Personen zur Aufnahme zu. Die Zuweisung selbst ist nicht verhandelbar; Unterbringung, Sprachkurse und Vermittlung sind kommunale Entscheidungen.',
    urgency: 'important',
    trigger: { earliestMonth: 7, latestMonth: 120, conditions: [], baseWeight: 8, cooldownMonths: 20, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'soc-allocation-central',
    expiresInMonths: 2,
    options: [
      {
        id: 'soc-allocation-decentral',
        label: 'Dezentral unterbringen und Kurse ausbauen',
        rationale: 'Wohnungen im Bestand plus Sprach- und Vermittlungsplätze. Teurer, wirkt auf Arbeitsmarkt und Zusammenhalt.',
        oneOffCost: 8.4,
        monthlyCost: 0.86,
        axes: { opennessIntegration: 0.8, redistribution: 0.5, marketVsPublic: -0.4, fiscalRestraint: -0.5 },
        salience: { opennessIntegration: 1, redistribution: 0.6, fiscalRestraint: 0.7 },
        effects: [effect({ target: 'integrationPlaces', expected: 420, delayMonths: 2, rampMonths: 10, confidence: 'high' })],
        sourceIds: MODEL,
      },
      {
        id: 'soc-allocation-central',
        label: 'Sammelunterkunft am Hafen',
        rationale: 'Schnell und günstig. Ohne Vermittlungsstruktur bleibt die Integrationskapazität knapp.',
        oneOffCost: 3.1,
        monthlyCost: 0.31,
        costMonths: 48,
        axes: { opennessIntegration: -0.2, fiscalRestraint: 0.5, marketVsPublic: 0.2 },
        salience: { opennessIntegration: 0.8, fiscalRestraint: 0.9 },
        effects: [effect({ target: 'integrationPlaces', expected: 60, delayMonths: 2, rampMonths: 6, confidence: 'medium' })],
        sourceIds: MODEL,
      },
      {
        id: 'soc-allocation-appeal',
        label: 'Zuweisung beklagen',
        rationale: 'Rechtsmittel gegen den Verteilbescheid. Die Personen kommen trotzdem, nur später und unvorbereitet.',
        oneOffCost: 1.4,
        monthlyCost: 0.08,
        costMonths: 12,
        axes: { opennessIntegration: -0.8, fiscalRestraint: 0.6, securityAuthority: 0.4 },
        salience: { opennessIntegration: 1, fiscalRestraint: 0.6, securityAuthority: 0.4 },
        effects: [effect({ target: 'integrationPlaces', expected: -80, delayMonths: 1, rampMonths: 5 })],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },

  // --- Mobility ------------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'mob-bridge-closure',
    kind: 'chain',
    category: 'mobility',
    title: 'Hafenbrücke gesperrt',
    briefing:
      'Die Prüfstatik stuft die Hafenbrücke herab. Die Sperrung trennt Gewerbe Ost vom Hafen und trifft den Wirtschaftsverkehr sofort.',
    urgency: 'breaking',
    trigger: { earliestMonth: 18, latestMonth: 126, conditions: [{ metric: 'investmentBacklog', operator: '>', value: 140 }], baseWeight: 30, cooldownMonths: 60, oncePerCampaign: true },
    immediateEffects: [effect({ target: 'businessSites', mode: 'level', expected: -180, delayMonths: 0, rampMonths: 2, confidence: 'high' })],
    defaultOptionId: 'mob-bridge-detour',
    expiresInMonths: 2,
    options: [
      {
        id: 'mob-bridge-rebuild',
        label: 'Vollsanierung beauftragen',
        rationale: 'Teuer und langwierig, beseitigt aber den Schaden und einen Teil des Sanierungsstaus.',
        oneOffCost: 48,
        monthlyCost: 1.1,
        costMonths: 36,
        axes: { fiscalRestraint: -0.8, marketVsPublic: -0.2, growthVsPreservation: -0.2 },
        salience: { fiscalRestraint: 1, marketVsPublic: 0.3 },
        effects: [
          effect({ target: 'investmentBacklog', mode: 'rate', expected: -1.4, delayMonths: 2, rampMonths: 10, confidence: 'high' }),
          effect({ target: 'businessSites', expected: 220, delayMonths: 20, rampMonths: 10 }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'mob-bridge-temporary',
        label: 'Behelfsbrücke aufstellen',
        rationale: 'Schnell befahrbar, hält rund acht Jahre und verschiebt das eigentliche Problem.',
        oneOffCost: 19,
        monthlyCost: 0.42,
        costMonths: 36,
        axes: { fiscalRestraint: 0.3, growthVsPreservation: 0 },
        salience: { fiscalRestraint: 1 },
        effects: [effect({ target: 'businessSites', expected: 150, delayMonths: 6, rampMonths: 8 })],
        sourceIds: MODEL,
      },
      {
        id: 'mob-bridge-detour',
        label: 'Dauerhafte Umleitung',
        rationale: 'Kostet nichts und bleibt als Standortnachteil im Gewerbegebiet bestehen.',
        oneOffCost: 0.8,
        monthlyCost: 0.05,
        axes: { fiscalRestraint: 0.9 },
        salience: { fiscalRestraint: 1, growthVsPreservation: 0.3 },
        effects: [],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'mob-bike-axis',
    kind: 'decision',
    category: 'mobility',
    title: 'Radachse gegen Parkplätze',
    briefing:
      'Die geplante Radachse durch die Innenstadt kostet 310 Stellplätze. Einzelhandel und Verkehrswende-Initiative stehen sich gegenüber.',
    urgency: 'normal',
    trigger: { earliestMonth: 12, latestMonth: 120, conditions: [{ metric: 'transitCoverage', operator: '>', value: 60 }], baseWeight: 6, cooldownMonths: 34, oncePerCampaign: true, minCoalitionSeats: 26 },
    immediateEffects: [],
    expiresInMonths: 3,
    options: [{
      id: 'mob-bike-full',
      label: 'Radachse vollständig bauen',
      rationale: 'Durchgehende Führung, spürbarer Effekt auf Emissionen, Konflikt mit dem Einzelhandel.',
      oneOffCost: 11,
      monthlyCost: 0.24,
      costMonths: 36,
      axes: { climateAmbition: 0.8, growthVsPreservation: -0.3, marketVsPublic: -0.3 },
      salience: { climateAmbition: 1, growthVsPreservation: 0.5, marketVsPublic: 0.4 },
      effects: [effect({ target: 'transitCapacity', expected: 4.5, delayMonths: 4, rampMonths: 12 })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'mob-federal-funding',
    kind: 'decision',
    category: 'mobility',
    title: 'Bund schreibt Takterhöhung aus',
    briefing:
      'Ein Bundesprogramm fördert Taktverdichtung mit 70 Prozent. Die Antragsfrist läuft in zwei Monaten ab, der Eigenanteil belastet den Haushalt.',
    urgency: 'important',
    /*
     * Not after the detour. The tender is for more service on a reliable core network, and a city
     * that answered a closed harbour bridge by sending the traffic round it does not have one — the
     * ministry's own criteria say so before anybody in Lindenhafen gets to argue.
     */
    trigger: { earliestMonth: 26, latestMonth: 72, conditions: [], baseWeight: 8, cooldownMonths: 60, oncePerCampaign: true, minCoalitionSeats: 20, blockedByChoiceIds: ['mob-bridge-closure:mob-bridge-detour'] },
    immediateEffects: [],
    expiresInMonths: 2,
    options: [{
      id: 'mob-funding-apply',
      label: 'Antrag stellen',
      rationale: 'Eigenanteil 30 Prozent, dafür die größte Reichweitensteigerung des Jahrzehnts.',
      oneOffCost: 12.5,
      monthlyCost: 1.35,
      axes: { climateAmbition: 0.6, marketVsPublic: -0.5, fiscalRestraint: -0.4 },
      salience: { climateAmbition: 0.8, marketVsPublic: 0.5, fiscalRestraint: 0.8 },
      effects: [effect({ target: 'transitCapacity', expected: 11, delayMonths: 6, rampMonths: 18, confidence: 'high' })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },

  // --- Environment ---------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'env-heat-summer',
    kind: 'external',
    category: 'environment',
    title: 'Hitzesommer belastet die Stadt',
    briefing:
      'Vierzehn Tropennächte in Folge. Wie hart es die Stadt trifft, entschied sich in den Jahren davor über Stadtgrün und Entsiegelung.',
    urgency: 'important',
    trigger: { earliestMonth: 18, latestMonth: 130, conditions: [], baseWeight: 5, cooldownMonths: 22, oncePerCampaign: false, scheduledMonthOfYear: 7 },
    immediateEffects: [],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'env-green-offensive',
    kind: 'decision',
    category: 'environment',
    title: 'Stadtgrün-Offensive gefordert',
    briefing:
      'Die Grünfläche pro Kopf ist unter den Zielwert gefallen. Ein Entsiegelungs- und Pflanzprogramm wirkt erst in Jahren, aber nur, wenn es jetzt beginnt.',
    urgency: 'normal',
    /*
     * Blocked by the data centre, and the data centre is blocked by this. One site, two futures:
     * whichever the council takes first, the other stops being on offer. That is the whole idea —
     * a decade in which every road is still open at the end is a decade in which nothing was
     * decided.
     */
    trigger: { earliestMonth: 10, latestMonth: 110, conditions: [{ metric: 'greenSpacePerCapita', operator: '<', value: 21.4 }], baseWeight: 7, cooldownMonths: 24, oncePerCampaign: false, minCoalitionSeats: 25, blockedByChoiceIds: ['eco-datacenter:eco-datacenter-accept'] },
    immediateEffects: [],
    defaultOptionId: 'env-green-none',
    expiresInMonths: 4,
    options: [
      {
        id: 'env-green-program',
        label: 'Entsiegeln und pflanzen',
        rationale: 'Vier Quartiersparks und 2.400 Straßenbäume über acht Jahre.',
        oneOffCost: 13,
        monthlyCost: 0.58,
        costMonths: 36,
        axes: { climateAmbition: 0.8, growthVsPreservation: 0.3, marketVsPublic: -0.4, fiscalRestraint: -0.4 },
        salience: { climateAmbition: 1, fiscalRestraint: 0.6, growthVsPreservation: 0.4 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 46, delayMonths: 6, rampMonths: 36, confidence: 'high' })],
        sourceIds: MODEL,
      },
      {
        id: 'env-green-none',
        label: 'Flächen für Wohnungsbau reservieren',
        rationale: 'Die Flächen bleiben für Bauland verfügbar.',
        oneOffCost: 0,
        monthlyCost: 0,
        axes: { climateAmbition: -0.6, growthVsPreservation: -0.7, marketVsPublic: 0.5 },
        salience: { climateAmbition: 1, growthVsPreservation: 0.8 },
        effects: [effect({ target: 'unitsUnderConstruction', mode: 'rate', expected: 18, delayMonths: 6, rampMonths: 12, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },

  // --- Economy and finance -------------------------------------------------
  {
    schemaVersion: 1,
    id: 'eco-plant-closure',
    kind: 'external',
    category: 'economy',
    title: 'Werkschließung im Hafen: 500 Stellen',
    briefing:
      'Der größte industrielle Arbeitgeber der Stadt verlagert die Produktion. Fünfhundert Stellen und ein erheblicher Teil der Gewerbesteuer entfallen.',
    urgency: 'breaking',
    trigger: { earliestMonth: 20, latestMonth: 104, conditions: [], baseWeight: 4, cooldownMonths: 80, oncePerCampaign: true },
    immediateEffects: [effect({ target: 'businessSites', expected: -340, delayMonths: 0, rampMonths: 4, confidence: 'high' })],
    expiresInMonths: 3,
    options: [{
      id: 'eco-closure-transfer',
      label: 'Transfergesellschaft und Qualifizierung',
      rationale: 'Hält Beschäftigte in der Stadt und dämpft die Jugendarbeitslosigkeit.',
      oneOffCost: 7.5,
      monthlyCost: 0.55,
      costMonths: 24,
      axes: { redistribution: 0.7, marketVsPublic: -0.5, fiscalRestraint: -0.4 },
      salience: { redistribution: 1, marketVsPublic: 0.6, fiscalRestraint: 0.6 },
      effects: [effect({ target: 'integrationPlaces', expected: 180, delayMonths: 2, rampMonths: 10 })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'eco-datacenter',
    kind: 'decision',
    category: 'economy',
    title: 'Rechenzentrum will sich ansiedeln',
    briefing:
      'Ein Betreiber sucht 14 Hektar in Gewerbe Ost. Gewerbesteuer und wenige Arbeitsplätze stehen gegen Stromverbrauch, Flächenfraß und Abwärme.',
    urgency: 'normal',
    // The other half of the fork with the green offensive: the same site cannot be both.
    trigger: { earliestMonth: 24, latestMonth: 96, conditions: [], baseWeight: 5, cooldownMonths: 60, oncePerCampaign: true, minCoalitionSeats: 18, blockedByChoiceIds: ['env-green-offensive:env-green-program'] },
    immediateEffects: [],
    defaultOptionId: 'eco-datacenter-reject',
    expiresInMonths: 3,
    options: [
      {
        id: 'eco-datacenter-accept',
        label: 'Ansiedlung zusagen',
        rationale: 'Deutlich mehr Gewerbesteuer, spürbar mehr Emissionen und weniger Freifläche.',
        oneOffCost: 4.2,
        // Grundsteuer, Erbbauzins, Konzessionsabgabe. Die Gewerbesteuer steht bewusst nicht hier:
        // die kommt jetzt aus den Flächen unten, über den Betriebsbestand, wie bei jeder Ansiedlung.
        monthlyCost: -0.25,
        axes: { marketVsPublic: 0.8, climateAmbition: -0.7, growthVsPreservation: -0.6, fiscalRestraint: 0.5 },
        salience: { marketVsPublic: 0.8, climateAmbition: 1, growthVsPreservation: 0.7 },
        effects: [
          effect({ target: 'businessSites', expected: 260, delayMonths: 10, rampMonths: 14, confidence: 'high' }),
          effect({ target: 'greenSpaceHectares', expected: -14, delayMonths: 8, rampMonths: 6, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'eco-datacenter-conditions',
        label: 'Mit Auflagen zusagen',
        rationale: 'Abwärmenutzung und Ausgleichsflächen als Bedingung. Der Betreiber verkleinert das Vorhaben.',
        oneOffCost: 5.8,
        monthlyCost: -0.12,
        axes: { marketVsPublic: 0.3, climateAmbition: 0.2, growthVsPreservation: -0.2 },
        salience: { marketVsPublic: 0.6, climateAmbition: 0.9, growthVsPreservation: 0.6 },
        effects: [
          effect({ target: 'businessSites', expected: 150, delayMonths: 12, rampMonths: 14 }),
          effect({ target: 'greenSpaceHectares', expected: -5, delayMonths: 8, rampMonths: 6 }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'eco-datacenter-reject',
        label: 'Ablehnen',
        rationale: 'Fläche und Klimaziele bleiben unberührt, die Einnahmen entfallen.',
        oneOffCost: 0,
        monthlyCost: 0,
        axes: { climateAmbition: 0.6, growthVsPreservation: 0.6, marketVsPublic: -0.4 },
        salience: { climateAmbition: 1, growthVsPreservation: 0.7, marketVsPublic: 0.5 },
        effects: [],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-maintenance-program',
    kind: 'decision',
    category: 'finance',
    title: 'Sanierungsstau wird zum Risiko',
    briefing:
      'Das Bauamt meldet Brücken, Schulen und Kanäle mit überschrittener Nutzungsdauer. Ohne dauerhaft höheren Unterhalt wächst der Stau weiter.',
    urgency: 'important',
    trigger: { earliestMonth: 9, latestMonth: 120, conditions: [{ metric: 'investmentBacklog', operator: '>', value: 112 }], baseWeight: 10, cooldownMonths: 24, oncePerCampaign: false, minCoalitionSeats: 16 },
    immediateEffects: [],
    expiresInMonths: 4,
    options: [{
      id: 'fin-maintenance-program',
      label: 'Unterhalt dauerhaft anheben',
      rationale: 'Der Bauunterhalt steigt über den Bedarf, der Stau schrumpft langsam und dauerhaft.',
      oneOffCost: 2.5,
      monthlyCost: 0,
      axes: { fiscalRestraint: -0.5, marketVsPublic: -0.3, growthVsPreservation: 0.4 },
      salience: { fiscalRestraint: 1, growthVsPreservation: 0.4 },
      effects: [effect({ target: 'maintenanceSpend', expected: 1.5, delayMonths: 1, rampMonths: 8, confidence: 'high' })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-budget-supervision',
    kind: 'chain',
    category: 'finance',
    title: 'Kommunalaufsicht fordert Haushaltssicherung',
    briefing:
      'Die Aufsichtsbehörde beanstandet die Kassenkredite. Ohne genehmigtes Sicherungskonzept werden freiwillige Leistungen gesperrt.',
    urgency: 'breaking',
    trigger: { earliestMonth: 14, latestMonth: 126, conditions: [{ metric: 'debt', operator: '>', value: 185, sustainedMonths: 4 }], baseWeight: 40, cooldownMonths: 48, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'fin-supervision-consolidate',
    expiresInMonths: 2,
    options: [
      {
        id: 'fin-supervision-consolidate',
        label: 'Konsolidierungspaket',
        rationale: 'Ausgabenschnitt quer durch alle freiwilligen Leistungen. Wirkt sofort und schmerzt überall.',
        oneOffCost: 0,
        monthlyCost: -2.6,
        axes: { fiscalRestraint: 0.9, redistribution: -0.6, marketVsPublic: 0.4 },
        salience: { fiscalRestraint: 1, redistribution: 0.9 },
        effects: [
          effect({ target: 'integrationPlaces', expected: -140, delayMonths: 1, rampMonths: 6, confidence: 'high' }),
          effect({ target: 'maintenanceSpend', expected: -0.4, delayMonths: 1, rampMonths: 4, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'fin-supervision-fees',
        label: 'Gebühren und Hebesätze anheben',
        rationale: 'Mehr Einnahmen ohne Leistungsabbau, dafür höhere Belastung für Haushalte und Betriebe.',
        oneOffCost: 0.6,
        monthlyCost: -2.1,
        axes: { fiscalRestraint: 0.5, redistribution: -0.2, marketVsPublic: -0.2 },
        salience: { fiscalRestraint: 0.9, redistribution: 0.7, marketVsPublic: 0.5 },
        effects: [effect({ target: 'businessSites', expected: -180, delayMonths: 4, rampMonths: 12, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'gov-procurement-scandal',
    kind: 'incident',
    category: 'governance',
    title: 'Vergabeaffäre im Rathaus',
    briefing: 'Ein Bericht des Rechnungsprüfungsamts legt Verstöße bei mehreren Auftragsvergaben offen. Das Vertrauen in die Verwaltung bricht messbar ein.',
    urgency: 'breaking',
    trigger: { earliestMonth: 15, latestMonth: 120, conditions: [], baseWeight: 3, cooldownMonths: 70, oncePerCampaign: true },
    immediateEffects: [],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'saf-state-police',
    kind: 'external',
    category: 'safety',
    title: 'Land zieht Polizeistellen ab',
    briefing: 'Die Landespolizei verlagert 24 Stellen in den Ballungsraum. Die Stadt kann das nicht ersetzen, nur ausgleichen.',
    urgency: 'important',
    trigger: { earliestMonth: 26, latestMonth: 110, conditions: [], baseWeight: 4, cooldownMonths: 80, oncePerCampaign: true },
    immediateEffects: [effect({ target: 'orderServiceFte', expected: -18, delayMonths: 1, rampMonths: 5, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  /*
   * --- Behind the doors -----------------------------------------------------
   *
   * Everything below exists only at the end of one particular road. Each one names the choice it
   * follows in `requiresChoiceIds`, and a choice is `eventId:optionId` — the council having *done*
   * the thing, not having been asked about it. A player who went the other way never learns these
   * are here, which is the point: a decade in which every event turns up regardless is a decade in
   * which nothing was decided.
   */
  {
    schemaVersion: 1,
    id: 'saf-cctv-challenge',
    kind: 'incident',
    category: 'governance',
    title: 'Landesdatenschutz beanstandet die Kameras',
    briefing:
      'Die Landesbeauftragte für Datenschutz hält die Videoüberwachung an achtzehn Knotenpunkten für unverhältnismäßig und fordert Rückbau. Eine Klage ist angekündigt. Die Stadt kann den Rechtsweg gehen, die Anlage auf wenige Brennpunkte zurückschneiden oder sie abbauen.',
    urgency: 'important',
    trigger: { earliestMonth: 6, latestMonth: 120, conditions: [], baseWeight: 9, cooldownMonths: 60, oncePerCampaign: true, requiresChoiceIds: ['saf-burglary-series:saf-burglary-cctv'] },
    // The order arrives with the lawyers already on it, whatever the council decides afterwards.
    immediateEffects: [effect({ target: 'cityBudget', expected: -0.9, delayMonths: 0, rampMonths: 1 })],
    defaultOptionId: 'saf-cctv-reduce',
    expiresInMonths: 3,
    options: [
      {
        id: 'saf-cctv-defend',
        label: 'Den Rechtsweg gehen',
        rationale: 'Die Stadt verteidigt die Anlage vor Gericht und behält sie bis zur Entscheidung in Betrieb.',
        oneOffCost: 1.8,
        monthlyCost: 0.12,
        costMonths: 12,
        axes: { securityAuthority: 0.8, opennessIntegration: -0.5, fiscalRestraint: -0.2 },
        salience: { securityAuthority: 1, opennessIntegration: 0.8 },
        effects: [effect({ target: 'orderServiceFte', expected: 3, rampMonths: 6, confidence: 'low' })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-cctv-reduce',
        label: 'Auf vier Brennpunkte zurückschneiden',
        rationale: 'Vergleich mit der Aufsicht: vier Standorte bleiben, vierzehn werden abgebaut.',
        oneOffCost: 0.9,
        monthlyCost: 0,
        axes: { securityAuthority: 0.2, opennessIntegration: 0.2 },
        salience: { securityAuthority: 0.6, opennessIntegration: 0.6 },
        effects: [effect({ target: 'orderServiceFte', expected: -3, rampMonths: 4 })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-cctv-remove',
        label: 'Anlage abbauen',
        rationale: 'Die Stadt gibt die Überwachung auf und schreibt die Investition ab.',
        oneOffCost: 1.2,
        monthlyCost: 0,
        axes: { securityAuthority: -0.7, opennessIntegration: 0.7 },
        salience: { securityAuthority: 1, opennessIntegration: 0.9 },
        effects: [effect({ target: 'orderServiceFte', expected: -8, rampMonths: 3 })],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'hou-charter-breach',
    kind: 'decision',
    category: 'housing',
    title: 'Investor bricht die Sozialcharta',
    briefing:
      'Der Investor hat in achtzig Wohnungen modernisiert und die Miete über die vereinbarte Grenze gehoben. Die Charta war freiwillig — sie durchzusetzen heißt, sie einzuklagen.',
    urgency: 'important',
    trigger: { earliestMonth: 10, latestMonth: 120, conditions: [], baseWeight: 9, cooldownMonths: 60, oncePerCampaign: true, requiresChoiceIds: ['hou-investor-block:hou-investor-charter'] },
    immediateEffects: [],
    expiresInMonths: 3,
    refusedEffects: [
      effect({ target: 'socialUnits', expected: -80, rampMonths: 8, confidence: 'low' }),
    ],
    options: [{
      id: 'hou-charter-sue',
      label: 'Charta einklagen',
      rationale: 'Die Stadt zieht vor Gericht und setzt die Mietobergrenze für den gesamten Bestand durch.',
      oneOffCost: 2.6,
      monthlyCost: 0.1,
      costMonths: 12,
      axes: { marketVsPublic: -0.8, redistribution: 0.6, fiscalRestraint: -0.3 },
      salience: { marketVsPublic: 1, redistribution: 0.8 },
      // Not the rent: the court order puts eighty flats back under a binding, and the market does the rest.
      effects: [effect({ target: 'socialUnits', expected: 80, rampMonths: 10, confidence: 'low' })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'hou-preempt-strain',
    kind: 'decision',
    category: 'finance',
    title: 'Der Ankauf drückt den Haushalt',
    briefing:
      'Die vorgekauften vierhundert Wohnungen sind im Bestand — und mit ihnen ein Sanierungsstau, den die Stadt vorher nicht hatte. Die Kämmerei verlangt eine Entscheidung, woher das Geld kommt.',
    urgency: 'normal',
    trigger: { earliestMonth: 14, latestMonth: 120, conditions: [], baseWeight: 8, cooldownMonths: 60, oncePerCampaign: true, requiresChoiceIds: ['hou-investor-block:hou-investor-preempt'] },
    immediateEffects: [],
    expiresInMonths: 4,
    refusedEffects: [
      effect({ target: 'investmentBacklog', expected: 11, mode: 'rate', rampMonths: 1, delayMonths: 1, confidence: 'low' }),
    ],
    options: [{
      id: 'hou-preempt-invest',
      label: 'Sanierung in einem Zug',
      rationale: 'Der gesamte Bestand wird energetisch saniert, finanziert über Kassenkredite.',
      oneOffCost: 21,
      monthlyCost: 0.4,
      costMonths: 36,
      axes: { fiscalRestraint: -0.9, climateAmbition: 0.7, marketVsPublic: -0.5 },
      salience: { fiscalRestraint: 1, climateAmbition: 0.7 },
      effects: [
        effect({ target: 'investmentBacklog', expected: -28, rampMonths: 16 }),
        effect({ target: 'cleanHeat', expected: 5, rampMonths: 18, confidence: 'low' }),
      ],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'eco-datacenter-heat',
    kind: 'decision',
    category: 'environment',
    title: 'Abwärme aus dem Rechenzentrum',
    briefing:
      'Das Rechenzentrum wirft so viel Wärme ab, dass sie zweitausend Wohnungen heizen könnte. Nötig wäre eine Leitung zum Fernwärmenetz — und die Bereitschaft, auf Jahre an diesen Betreiber gebunden zu sein.',
    urgency: 'normal',
    trigger: { earliestMonth: 30, latestMonth: 120, conditions: [], baseWeight: 8, cooldownMonths: 60, oncePerCampaign: true, requiresChoiceIds: ['eco-datacenter:eco-datacenter-accept', 'eco-datacenter:eco-datacenter-conditions'] },
    immediateEffects: [],
    expiresInMonths: 4,
    options: [{
      id: 'eco-heat-network',
      label: 'Leitung bauen und einspeisen',
      rationale: 'Vier Kilometer Trasse zum Fernwärmenetz, gemeinsam mit den Stadtwerken.',
      oneOffCost: 17,
      monthlyCost: -0.28,
      axes: { climateAmbition: 0.9, marketVsPublic: -0.4, fiscalRestraint: -0.6 },
      salience: { climateAmbition: 1, fiscalRestraint: 0.7 },
      effects: [effect({ target: 'cleanHeat', expected: 18, rampMonths: 20 })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'soc-childcare-judgment',
    kind: 'incident',
    category: 'social',
    title: 'Verwaltungsgericht gibt den Eltern recht',
    briefing:
      'Die Klagen auf einen Kitaplatz sind entschieden — gegen die Stadt. Sie muss die Kosten privater Betreuung erstatten, rückwirkend und für alle, die geklagt haben. Der Rechtsanspruch bleibt, was er war.',
    urgency: 'breaking',
    trigger: { earliestMonth: 12, latestMonth: 120, conditions: [], baseWeight: 11, cooldownMonths: 60, oncePerCampaign: true, requiresChoiceIds: ['soc-childcare-gap:soc-childcare-litigate'] },
    // The judgment itself: the back-payments land the month it arrives, whatever the council then does.
    immediateEffects: [
      effect({ target: 'cityBudget', expected: -9.5, mode: 'level', delayMonths: 0, rampMonths: 1 }),
    ],
    defaultOptionId: 'soc-judgment-build',
    expiresInMonths: 3,
    options: [
      {
        id: 'soc-judgment-build',
        label: 'Plätze bauen, jetzt',
        rationale: 'Drei Einrichtungen in Modulbauweise, das Schnellste, was das Vergaberecht hergibt.',
        oneOffCost: 15,
        monthlyCost: 0.85,
        axes: { redistribution: 0.7, fiscalRestraint: -0.8, marketVsPublic: -0.5 },
        salience: { redistribution: 1, fiscalRestraint: 0.8 },
        effects: [effect({ target: 'childcarePlaces', expected: 260, rampMonths: 12 })],
        sourceIds: MODEL,
      },
      {
        id: 'soc-judgment-vouchers',
        label: 'Betreuungsgeld zahlen',
        rationale: 'Die Stadt erstattet private Betreuung weiter, statt selbst zu bauen.',
        oneOffCost: 0,
        monthlyCost: 1.15,
        costMonths: 36,
        axes: { marketVsPublic: 0.8, redistribution: 0.2, fiscalRestraint: -0.4 },
        salience: { marketVsPublic: 1, fiscalRestraint: 0.6 },
        effects: [effect({ target: 'childcarePlaces', expected: 90, rampMonths: 4, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  /*
   * --- What happens to you ---------------------------------------------------
   *
   * The other half of the game, and until now the thin half. Everything above is something the
   * player puts on the agenda; everything below arrives whether they are ready or not.
   *
   * Three rules hold for all of them, and they are what makes a crisis a crisis rather than another
   * motion:
   *
   * 1. **No coalition threshold.** A flood does not wait for a majority. `minCoalitionSeats` is
   *    deliberately absent from every trigger here — which is also what makes them the events a
   *    minority council still has to answer.
   * 2. **They cost before anybody votes.** `immediateEffects` land the month they arrive. The
   *    decision is about the aftermath, not about whether it happened.
   * 3. **They are earned.** Every one of them reads a number the council has been moving for years:
   *    a flood defence nobody maintained, an administration nobody patched, a city that let itself
   *    split. None of them has a constant of its own, and none fires out of nowhere.
   *
   * `expiresInMonths` is short throughout. Sitting on a crisis is an answer, and `defaultOptionId`
   * is what that answer costs.
   */
  {
    schemaVersion: 1,
    id: 'env-storm-surge',
    kind: 'external',
    category: 'environment',
    title: 'Sturmflut überspült die Hafenkante',
    briefing:
      'Ein Orkantief hat die Weser aufgestaut. Die Kaimauer der Alten Hafenkante ist an drei Stellen überspült, Keller in Hafen & Industrie stehen unter Wasser. Der Sanierungsstau an den Hochwasserschutzanlagen ist seit Jahren aktenkundig.',
    urgency: 'breaking',
    /*
     * Winter, and only a city that let its own defences rot. The Weser floods every year; what
     * decides whether that is a headline or a catastrophe is whether anybody kept the wall up.
     */
    trigger: {
      earliestMonth: 9,
      latestMonth: 130,
      conditions: [{ metric: 'investmentBacklog', operator: '>', value: 210 }],
      baseWeight: 11,
      cooldownMonths: 36,
      oncePerCampaign: false,
      scheduledMonthOfYear: 12,
      // A council that built the wall, or gave the ground back to the river, does not get this again.
      blockedByChoiceIds: ['env-storm-surge:env-surge-wall', 'env-storm-surge:env-surge-retreat'],
    },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: -12, delayMonths: 0, rampMonths: 1 }),
      effect({ target: 'homelessPeople', expected: 140, delayMonths: 0, rampMonths: 2 }),
    ],
    defaultOptionId: 'env-surge-patch',
    expiresInMonths: 2,
    options: [
      {
        id: 'env-surge-wall',
        label: 'Kaimauer auf Klimaniveau anheben',
        rationale: 'Zwei Kilometer Hochwasserschutz auf den Bemessungswert 2100, statt auf den von 1962.',
        oneOffCost: 58,
        monthlyCost: 0.6,
        costMonths: 48,
        axes: { climateAmbition: 0.9, fiscalRestraint: -1, marketVsPublic: -0.5 },
        salience: { climateAmbition: 1, fiscalRestraint: 1 },
        effects: [effect({ target: 'investmentBacklog', expected: -46, rampMonths: 20 })],
        sourceIds: MODEL,
      },
      {
        id: 'env-surge-patch',
        label: 'Schäden beheben, Mauer flicken',
        rationale: 'Die drei Bruchstellen werden geschlossen, der Rest bleibt auf dem Stand von 1962.',
        oneOffCost: 9,
        monthlyCost: 0,
        axes: { fiscalRestraint: 0.6 },
        salience: { fiscalRestraint: 0.9, climateAmbition: 0.6 },
        effects: [effect({ target: 'investmentBacklog', expected: -6, rampMonths: 6 })],
        sourceIds: MODEL,
      },
      {
        id: 'env-surge-retreat',
        label: 'Hafenkante aufgeben und zurückbauen',
        rationale: 'Die tiefliegenden Parzellen werden entsiegelt und als Überflutungsfläche gewidmet.',
        oneOffCost: 26,
        monthlyCost: -0.2,
        axes: { climateAmbition: 0.8, growthVsPreservation: -0.7, marketVsPublic: -0.4 },
        salience: { climateAmbition: 1, growthVsPreservation: 0.9 },
        effects: [
          effect({ target: 'greenSpaceHectares', expected: 34, rampMonths: 16 }),
          effect({ target: 'housingUnits', expected: -260, rampMonths: 12 }),
        ],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'saf-harbour-chemical',
    kind: 'incident',
    category: 'safety',
    title: 'Chemieunfall im Hafen',
    briefing:
      'Beim Umschlag ist ein Tank mit Ammoniaklösung leckgeschlagen. Die Feuerwehr hat einen Sperrkreis von achthundert Metern gezogen, zweitausend Menschen sind in Schulen untergebracht. Die Anlage war zuletzt vor sechs Jahren geprüft.',
    urgency: 'breaking',
    trigger: { earliestMonth: 14, latestMonth: 130, conditions: [{ metric: 'emissions', operator: '>', value: 44 }], baseWeight: 8, cooldownMonths: 40, oncePerCampaign: false },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: -6.5, delayMonths: 0, rampMonths: 1 }),
      effect({ target: 'emissions', expected: 3.2, delayMonths: 0, rampMonths: 3 }),
    ],
    expiresInMonths: 2,
    options: [{
      id: 'saf-chemical-inspect',
      label: 'Alle Anlagen prüfen lassen',
      rationale: 'Die Stadt stellt eigene Prüfer ein und geht jeden Störfallbetrieb im Hafen durch.',
      oneOffCost: 4.2,
      monthlyCost: 0.55,
      costMonths: 12,
      axes: { securityAuthority: 0.5, marketVsPublic: -0.7, fiscalRestraint: -0.4 },
      salience: { marketVsPublic: 1, securityAuthority: 0.7 },
      effects: [effect({ target: 'maintenanceSpend', expected: 5.5, rampMonths: 10 })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'gov-cyber-attack',
    kind: 'incident',
    category: 'governance',
    title: 'Verwaltung verschlüsselt',
    briefing:
      'Seit Freitagnacht ist die Fachverfahrenslandschaft verschlüsselt. Meldewesen, Kfz-Zulassung und Sozialleistungen stehen still, die Angreifer fordern Lösegeld. Die Server laufen auf einer Wartungsvereinbarung, die 2029 ausgelaufen ist.',
    urgency: 'breaking',
    trigger: {
      earliestMonth: 18,
      latestMonth: 130,
      conditions: [{ metric: 'investmentBacklog', operator: '>', value: 175 }],
      baseWeight: 9,
      cooldownMonths: 48,
      oncePerCampaign: true,
      /*
       * Not while somebody is paying for the upkeep. `blockedByMeasureIds` had been in the contract
       * since the beginning and set by nothing; this is its first user, and it is the plainest case
       * there is — an administration with a live maintenance programme is one whose servers are
       * still under a contract.
       */
      blockedByMeasureIds: ['fin-maintenance-program'],
    },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: -4.8, delayMonths: 0, rampMonths: 1 }),
      effect({ target: 'politicalCapital', expected: -6, delayMonths: 0, rampMonths: 1 }),
    ],
    expiresInMonths: 1,
    refusedEffects: [
      effect({ target: 'cityBudget', expected: -5.5, delayMonths: 0, rampMonths: 1, confidence: 'high' }),
    ],
    options: [{
      id: 'gov-cyber-rebuild',
      label: 'Neu aufbauen und dauerhaft absichern',
      rationale: 'Kein Lösegeld. Wiederaufbau aus Sicherungen, eigene Sicherheitsstelle, laufende Wartung.',
      oneOffCost: 17,
      monthlyCost: 0.72,
      axes: { securityAuthority: 0.4, marketVsPublic: -0.5, fiscalRestraint: -0.7 },
      salience: { securityAuthority: 0.8, fiscalRestraint: 0.9 },
      effects: [effect({ target: 'maintenanceSpend', expected: 8.5, rampMonths: 12 })],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'soc-pandemic-wave',
    kind: 'external',
    category: 'social',
    title: 'Infektionswelle trifft die Stadt',
    briefing:
      'Eine Atemwegswelle läuft durch die Kitas und Schulen. Das Gesundheitsamt meldet Personalausfälle im zweistelligen Prozentbereich, quer durch Pflege, Nahverkehr und Verwaltung. Die Entscheidungen liegen beim Land — die Kapazitäten vor Ort bei der Stadt.',
    urgency: 'important',
    trigger: { earliestMonth: 11, latestMonth: 130, conditions: [], baseWeight: 5, cooldownMonths: 42, oncePerCampaign: false, scheduledMonthOfYear: 2 },
    immediateEffects: [effect({ target: 'cityBudget', expected: -3.4, delayMonths: 0, rampMonths: 1 })],
    expiresInMonths: 2,
    refusedEffects: [
      effect({ target: 'childcarePlaces', expected: -90, rampMonths: 4, confidence: 'low' }),
    ],
    options: [{
      id: 'soc-pandemic-capacity',
      label: 'Kapazitäten aufstocken',
      rationale: 'Springerpools für Kitas und Pflege, zusätzliche Fahrer im Nahverkehr, befristet.',
      oneOffCost: 7.5,
      monthlyCost: 0.9,
      costMonths: 18,
      axes: { redistribution: 0.6, marketVsPublic: -0.6, fiscalRestraint: -0.6 },
      salience: { redistribution: 0.9, fiscalRestraint: 0.8 },
      effects: [
        effect({ target: 'childcarePlaces', expected: 140, rampMonths: 6 }),
        effect({ target: 'transitCapacity', expected: 3.2, rampMonths: 6 }),
      ],
      sourceIds: MODEL,
    }],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'saf-market-attack',
    kind: 'incident',
    category: 'safety',
    title: 'Anschlag auf den Wochenmarkt',
    briefing:
      'Ein Fahrzeug ist am Samstagvormittag in den Wochenmarkt am Rathausplatz gefahren. Vier Tote, vierzig Verletzte. Die Ermittlungen führt der Generalbundesanwalt; die Stadt entscheidet über das, was danach kommt.',
    urgency: 'breaking',
    /*
     * Tied to polarisation, and that is a claim worth being explicit about: the model does not say a
     * divided city causes an attack. It says a divided city is where one does the most damage, and
     * the sustained condition is what keeps this from reading as a dice roll — it takes a council
     * eight months of failing to hold the city together before this is on the table at all.
     */
    trigger: { earliestMonth: 20, latestMonth: 130, conditions: [{ metric: 'polarisation', operator: '>', value: 58, sustainedMonths: 8 }], baseWeight: 4, cooldownMonths: 60, oncePerCampaign: true },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: -2.6, delayMonths: 0, rampMonths: 1 }),
      effect({ target: 'polarisation', expected: 6.5, delayMonths: 0, rampMonths: 3 }),
    ],
    defaultOptionId: 'saf-attack-mourning',
    expiresInMonths: 2,
    options: [
      {
        id: 'saf-attack-harden',
        label: 'Plätze baulich sichern',
        rationale: 'Poller, Zufahrtssperren und Kameras an den elf größten Veranstaltungsflächen.',
        oneOffCost: 13,
        monthlyCost: 0.34,
        costMonths: 36,
        axes: { securityAuthority: 0.9, opennessIntegration: -0.4, fiscalRestraint: -0.4 },
        salience: { securityAuthority: 1, opennessIntegration: 0.7 },
        effects: [effect({ target: 'orderServiceFte', expected: 9, rampMonths: 8 })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-attack-cohesion',
        label: 'In die Stadtgesellschaft investieren',
        rationale: 'Ein Bündnis aus Gemeinden, Vereinen und Schulen, dauerhaft finanziert statt als Geste.',
        oneOffCost: 3.8,
        monthlyCost: 0.62,
        costMonths: 60,
        axes: { opennessIntegration: 0.9, redistribution: 0.5, securityAuthority: -0.3 },
        salience: { opennessIntegration: 1, redistribution: 0.6 },
        effects: [effect({ target: 'integrationPlaces', expected: 240, rampMonths: 16 })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-attack-mourning',
        label: 'Trauerbeschluss und Gedenken',
        rationale: 'Der Rat kommt zusammen, hält inne und beschließt einen Gedenkort.',
        oneOffCost: 0.7,
        monthlyCost: 0,
        axes: { fiscalRestraint: 0.5, opennessIntegration: 0.2 },
        salience: { opennessIntegration: 0.5, securityAuthority: 0.5 },
        effects: [],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'env-heat-deaths',
    kind: 'external',
    category: 'environment',
    title: 'Hitzewelle fordert Tote',
    briefing:
      'Neun Tage über 35 Grad. Das Gesundheitsamt meldet eine Übersterblichkeit von einhundertzwanzig Menschen, überwiegend über achtzig und überwiegend in den unbegrünten Blöcken im Wohnring. Die Stadt hat keinen Hitzeaktionsplan.',
    urgency: 'breaking',
    /*
     * Only a city that spent its green space, and only in summer. This is the sharpest consequence
     * in the game of a decision that looks free at the time: paving a park costs nothing anybody can
     * see for years, and then it costs this.
     */
    trigger: {
      earliestMonth: 16,
      latestMonth: 130,
      conditions: [{ metric: 'greenSpacePerCapita', operator: '<', value: 19.5 }],
      baseWeight: 9,
      cooldownMonths: 30,
      oncePerCampaign: false,
      scheduledMonthOfYear: 7,
      /*
       * The payoff for the green offensive, years later and in the only currency that matters here.
       * A council that unsealed and planted does not get this summer — which is the point of a door:
       * what you never see is as much a consequence as what you do.
       */
      blockedByChoiceIds: ['env-green-offensive:env-green-program', 'env-heat-deaths:env-heat-trees'],
    },
    immediateEffects: [effect({ target: 'politicalCapital', expected: -5, delayMonths: 0, rampMonths: 1 })],
    defaultOptionId: 'env-heat-plan',
    expiresInMonths: 2,
    options: [
      {
        id: 'env-heat-trees',
        label: 'Straßenbäume und Entsiegelung im Wohnring',
        rationale: 'Zweitausend Bäume und dreißig Hektar entsiegelt, dort wo die Toten waren.',
        oneOffCost: 22,
        monthlyCost: 0.4,
        costMonths: 36,
        axes: { climateAmbition: 0.9, redistribution: 0.5, fiscalRestraint: -0.7 },
        salience: { climateAmbition: 1, redistribution: 0.7 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 30, rampMonths: 22 })],
        sourceIds: MODEL,
      },
      {
        id: 'env-heat-plan',
        label: 'Hitzeaktionsplan aufstellen',
        rationale: 'Kühle Räume, Trinkbrunnen, eine Meldekette für Pflegedienste. Wirkt sofort und wenig.',
        oneOffCost: 2.4,
        monthlyCost: 0.22,
        costMonths: 12,
        axes: { redistribution: 0.4, fiscalRestraint: 0.3 },
        salience: { redistribution: 0.7, climateAmbition: 0.6 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 3, rampMonths: 8, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    sourceIds: MODEL,
  },
  // --- Kassenlage: was der Stadt zustößt, ohne dass jemand abstimmt ---------
  /*
   * Ein Haushalt besteht nicht nur aus Beschlüssen. Eine Betriebsprüfung, ein Urteil, ein
   * Grundstück, ein Sturm — das sind die Posten, die eine Kämmerei wirklich umwerfen, und bis
   * hierher kannte das Spiel sie nicht: Geld bewegte sich ausschließlich, wenn der Rat etwas
   * beschloss, und deshalb ging es nur in eine Richtung. Diese hier passieren einfach.
   *
   * Sie tragen keine Optionen. Es gibt nichts zu entscheiden, nur etwas zu verkraften — und
   * gelegentlich etwas zu freuen.
   */
  {
    schemaVersion: 1,
    id: 'fin-windfall-audit',
    kind: 'incident',
    category: 'finance',
    title: 'Betriebsprüfung bringt Millionen nach',
    briefing: 'Eine Konzernbetriebsprüfung über vier Jahre endet mit einer Nachzahlung. Die Kämmerei verbucht sie im laufenden Jahr, warnt aber vor Gewöhnung.',
    urgency: 'important',
    trigger: { earliestMonth: 8, latestMonth: 128, conditions: [{ metric: 'businessStock', operator: '>', value: 5600 }], baseWeight: 7, cooldownMonths: 30, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: 14, delayMonths: 0, rampMonths: 1, confidence: 'medium' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-windfall-land',
    kind: 'incident',
    category: 'finance',
    title: 'Konversionsfläche verkauft',
    briefing: 'Das alte Bahngelände am Westrand geht an einen Projektentwickler. Der Erlös liegt über dem Gutachten, der Verzicht auf die Fläche ist endgültig.',
    urgency: 'normal',
    // Eine Stadt versilbert ihr Tafelsilber, wenn die Rücklage dünn wird.
    trigger: { earliestMonth: 14, latestMonth: 120, conditions: [{ metric: 'cityBudget', operator: '<', value: 260 }], baseWeight: 6, cooldownMonths: 42, oncePerCampaign: false },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: 11, delayMonths: 0, rampMonths: 1, confidence: 'high' }),
      effect({ target: 'greenSpaceHectares', expected: -4, delayMonths: 1, rampMonths: 6, confidence: 'medium' }),
    ],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-windfall-federal',
    kind: 'incident',
    category: 'finance',
    title: 'Bund zahlt aus dem Sonderprogramm',
    briefing: 'Lindenhafen steht auf der Liste eines Bundesprogramms für kommunale Infrastruktur. Das Geld ist gebunden, aber es ist da.',
    urgency: 'important',
    // Bundesprogramme zielen auf Sanierungsstau, nicht auf gut gepflegte Städte.
    trigger: { earliestMonth: 18, latestMonth: 126, conditions: [{ metric: 'investmentBacklog', operator: '>', value: 95 }], baseWeight: 6, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: 18, delayMonths: 0, rampMonths: 1, confidence: 'medium' }),
      effect({ target: 'investmentBacklog', expected: -9, delayMonths: 1, rampMonths: 8, confidence: 'medium' }),
    ],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-windfall-equalisation',
    kind: 'incident',
    category: 'finance',
    title: 'Schlüsselzuweisung höher als veranschlagt',
    briefing: 'Der Finanzausgleich des Landes fällt zugunsten der Stadt aus. Ein Buchungsgewinn, kein Strukturgewinn — nächstes Jahr kann es andersherum laufen.',
    urgency: 'normal',
    trigger: { earliestMonth: 6, latestMonth: 130, conditions: [], baseWeight: 8, cooldownMonths: 20, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: 7, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-windfall-bequest',
    kind: 'incident',
    category: 'finance',
    title: 'Vermächtnis an die Stadt',
    briefing: 'Eine Reederfamilie vererbt der Stadt Wertpapiere und ein Kontorhaus am alten Hafen, zweckgebunden an nichts.',
    urgency: 'normal',
    trigger: { earliestMonth: 20, latestMonth: 128, conditions: [], baseWeight: 4, cooldownMonths: 60, oncePerCampaign: true },
    immediateEffects: [effect({ target: 'cityBudget', expected: 5, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-shock-refund',
    kind: 'incident',
    category: 'finance',
    title: 'Konzern klagt Gewerbesteuer zurück',
    briefing: 'Ein Finanzgericht gibt einem Großbetrieb recht. Die Stadt muss sechs Jahre Gewerbesteuer erstatten, verzinst.',
    urgency: 'breaking',
    trigger: { earliestMonth: 12, latestMonth: 128, conditions: [{ metric: 'businessStock', operator: '>', value: 5400 }], baseWeight: 6, cooldownMonths: 40, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -16, delayMonths: 0, rampMonths: 1, confidence: 'medium' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-shock-contamination',
    kind: 'incident',
    category: 'finance',
    title: 'Altlasten unter dem Bauhof',
    briefing: 'Bei Erdarbeiten kommen Rückstände aus der Zeit der Werft zutage. Die Sanierung ist nicht aufschiebbar und nicht versichert.',
    urgency: 'important',
    trigger: { earliestMonth: 10, latestMonth: 126, conditions: [], baseWeight: 6, cooldownMonths: 48, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -9, delayMonths: 0, rampMonths: 2, confidence: 'medium' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-shock-payscale',
    kind: 'incident',
    category: 'finance',
    title: 'Gericht kippt die Eingruppierung',
    briefing: 'Beschäftigte der Stadt bekommen rückwirkend eine höhere Entgeltgruppe zugesprochen. Die Nachzahlung trifft den Haushalt sofort.',
    urgency: 'breaking',
    trigger: { earliestMonth: 16, latestMonth: 128, conditions: [], baseWeight: 5, cooldownMonths: 54, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -12, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-shock-levy',
    kind: 'incident',
    category: 'finance',
    title: 'Kreisumlage steigt rückwirkend',
    briefing: 'Der Kreis erhöht die Umlage und stellt sie für das laufende Jahr nach. Die Stadt hat kein Mitspracherecht, nur eine Rechnung.',
    urgency: 'important',
    trigger: { earliestMonth: 8, latestMonth: 130, conditions: [], baseWeight: 7, cooldownMonths: 26, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -8, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-shock-storm',
    kind: 'incident',
    category: 'finance',
    title: 'Sturm deckt Schulen und Hallen ab',
    briefing: 'Eine Novemberböe reißt Dächer von zwei Schulen und der Sporthalle Nord. Der Eigenanteil übersteigt die Rücklage für Gebäudeschäden.',
    urgency: 'important',
    trigger: { earliestMonth: 6, latestMonth: 130, conditions: [], baseWeight: 7, cooldownMonths: 30, oncePerCampaign: false },
    immediateEffects: [
      effect({ target: 'cityBudget', expected: -6, delayMonths: 0, rampMonths: 1, confidence: 'high' }),
      effect({ target: 'investmentBacklog', expected: 4, delayMonths: 0, rampMonths: 3, confidence: 'medium' }),
    ],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
]

export function getEvent(eventId: string): EventDefinition | undefined {
  return EVENTS.find(event => event.id === eventId)
}
