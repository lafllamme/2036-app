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
    trigger: { earliestMonth: 4, latestMonth: 120, conditions: [{ metric: 'burglaryRate', operator: '>', value: 3.0, sustainedMonths: 2 }], baseWeight: 10, cooldownMonths: 18, oncePerCampaign: false },
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
    // Zuweisungen kommen, wenn der Druck von außen steigt.
    id: 'soc-allocation',
    kind: 'decision',
    category: 'social',
    title: 'Land weist 600 Personen zu',
    briefing:
      'Die Bezirksregierung weist Lindenhafen 600 Personen zur Aufnahme zu. Die Zuweisung selbst ist nicht verhandelbar; Unterbringung, Sprachkurse und Vermittlung sind kommunale Entscheidungen.',
    urgency: 'important',
    trigger: { earliestMonth: 7, latestMonth: 120, conditions: [{ metric: 'migrationPressure', operator: '>', value: 103 }], baseWeight: 8, cooldownMonths: 20, oncePerCampaign: false },
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
    // Ein Werk schließt in der Flaute, nicht im Aufschwung.
    id: 'eco-plant-closure',
    kind: 'external',
    category: 'economy',
    title: 'Werkschließung im Hafen: 500 Stellen',
    briefing:
      'Der größte industrielle Arbeitgeber der Stadt verlagert die Produktion. Fünfhundert Stellen und ein erheblicher Teil der Gewerbesteuer entfallen.',
    urgency: 'breaking',
    trigger: { earliestMonth: 20, latestMonth: 104, conditions: [{ metric: 'economy', operator: '<', value: 97 }], baseWeight: 4, cooldownMonths: 80, oncePerCampaign: true },
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
    // Wo viel und schnell vergeben wird, wird schlecht vergeben.
    id: 'gov-procurement-scandal',
    kind: 'incident',
    category: 'governance',
    title: 'Vergabeaffäre im Rathaus',
    briefing: 'Ein Bericht des Rechnungsprüfungsamts legt Verstöße bei mehreren Auftragsvergaben offen. Das Vertrauen in die Verwaltung bricht messbar ein.',
    urgency: 'breaking',
    trigger: { earliestMonth: 15, latestMonth: 120, conditions: [{ metric: 'investmentBacklog', operator: '>', value: 45 }], baseWeight: 3, cooldownMonths: 70, oncePerCampaign: true },
    immediateEffects: [],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Das Land zieht dort ab, wo die Stadt selbst genug hat.
    id: 'saf-state-police',
    kind: 'external',
    category: 'safety',
    title: 'Land zieht Polizeistellen ab',
    briefing: 'Die Landespolizei verlagert 24 Stellen in den Ballungsraum. Die Stadt kann das nicht ersetzen, nur ausgleichen.',
    urgency: 'important',
    trigger: { earliestMonth: 26, latestMonth: 110, conditions: [{ metric: 'orderServiceCapacity', operator: '>', value: 11.4 }], baseWeight: 4, cooldownMonths: 80, oncePerCampaign: true },
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
    // Tür: Ohne Kameras klagt niemand gegen Kameras.
    id: 'saf-cctv-challenge',
    kind: 'incident',
    category: 'governance',
    title: 'Landesdatenschutz beanstandet die Kameras',
    briefing:
      'Die Landesbeauftragte für Datenschutz hält die Videoüberwachung an achtzehn Knotenpunkten für unverhältnismäßig und fordert Rückbau. Eine Klage ist angekündigt. Die Stadt kann den Rechtsweg gehen, die Anlage auf wenige Brennpunkte zurückschneiden oder sie abbauen.',
    urgency: 'important',
    trigger: { earliestMonth: 6, latestMonth: 120, blockedByChoiceIds: ['saf-burglary-series:saf-burglary-prevention'], conditions: [], baseWeight: 9, cooldownMonths: 60, oncePerCampaign: true, requiresChoiceIds: ['saf-burglary-series:saf-burglary-cctv'] },
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
      conditions: [{ metric: 'investmentBacklog', operator: '>', value: 150 }],
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
      conditions: [{ metric: 'investmentBacklog', operator: '>', value: 140 }],
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
    trigger: { earliestMonth: 20, latestMonth: 130, conditions: [{ metric: 'polarisation', operator: '>', value: 47, sustainedMonths: 8 }], baseWeight: 4, cooldownMonths: 60, oncePerCampaign: true },
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
      conditions: [{ metric: 'greenSpacePerCapita', operator: '<', value: 20.4 }],
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
  // --- Der zweite Vorrat ----------------------------------------------------
  /*
   * Sechsundzwanzig Vorlagen, geschrieben, nachdem ein durchgespieltes Jahrzehnt zwei Entscheidungen
   * in achtunddreißig Monaten ergab. Die Ursache war nicht die Mechanik, sondern die Menge: in den
   * meisten Januaren ab 2030 stand null Ereignis zur Wahl, weil fünfundzwanzig geschriebene
   * Entscheidungen zehn Jahre nicht füllen.
   *
   * Sie folgen alle der Formregel — überwiegend Vorlagen, für die man ist oder nicht —, sie kaufen
   * Kapazität statt Ergebnisse, und die meisten dürfen wiederkommen, wenn der Rat sie ablehnt. Die
   * Politik ist echte Kommunalpolitik: Milieuschutz, Erbbaurecht, Anwohnerparken, Schulcontainer,
   * Bürgerhaushalt. Nichts davon ist eine Karikatur einer Partei — es sind Sachen, die in jedem
   * deutschen Stadtrat auf der Tagesordnung stehen, und jede Fraktion hat dazu eine Haltung.
   */

  // --- Wohnen ---------------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'hou-milieu-protection',
    kind: 'decision',
    category: 'housing',
    title: 'Milieuschutz für das Hafenviertel',
    briefing:
      'Die Verwaltung legt eine soziale Erhaltungssatzung für das Hafenviertel vor. Sie macht Luxussanierung und Umwandlung in Eigentum genehmigungspflichtig — und verlangt ein Vorkaufsrecht, das die Stadt auch ausüben können muss.',
    urgency: 'important',
    trigger: { earliestMonth: 9, latestMonth: 124, conditions: [{ metric: 'averageRent', operator: '>', value: 13.4 }], baseWeight: 8, cooldownMonths: 40, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'socialUnits', expected: -120, delayMonths: 3, rampMonths: 12, confidence: 'medium' })],
    options: [
      {
        id: 'hou-milieu-adopt',
        label: 'Erhaltungssatzung beschließen',
        rationale: 'Vier Quartiere unter Schutz, mit Personal für die Genehmigungen. Verlangsamt Aufwertung, nicht den Markt.',
        oneOffCost: 1.8,
        monthlyCost: 0.28,
        costMonths: 96,
        axes: { marketVsPublic: -0.7, redistribution: 0.6, growthVsPreservation: 0.5 },
        salience: { marketVsPublic: 0.9, redistribution: 0.8, growthVsPreservation: 0.6 },
        effects: [effect({ target: 'socialUnits', expected: 210, delayMonths: 4, rampMonths: 18, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Angebotsmiete 11,50–14,90 €: Zweckentfremdung ist ein Thema auf angespanntem Markt.
    id: 'hou-vacancy-levy',
    kind: 'decision',
    category: 'housing',
    title: 'Zweckentfremdung wird teuer',
    briefing:
      'Achthundert Wohnungen stehen länger als ein Jahr leer oder laufen als Ferienwohnung. Eine Satzung mit Bußgeld und Anzeigepflicht könnte einen Teil davon zurückholen — sie braucht allerdings Leute, die kontrollieren.',
    urgency: 'normal',
    trigger: { earliestMonth: 14, latestMonth: 126, conditions: [{ metric: 'averageRent', operator: '>', value: 13.1 }], baseWeight: 7, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'hou-vacancy-enforce',
        label: 'Satzung mit Kontrolle beschließen',
        rationale: 'Sechs Stellen im Wohnungsamt, Bußgelder bis 50.000 €. Bringt Wohnungen zurück, kostet Verwaltung.',
        oneOffCost: 0.9,
        monthlyCost: 0.22,
        costMonths: 72,
        axes: { marketVsPublic: -0.6, redistribution: 0.5, fiscalRestraint: -0.2 },
        salience: { marketVsPublic: 0.8, redistribution: 0.6 },
        effects: [effect({ target: 'housingUnits', expected: 340, delayMonths: 6, rampMonths: 14, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Erbbaurecht statt Verkauf kann sich leisten, wer nicht verkaufen muss.
    id: 'hou-leasehold',
    kind: 'decision',
    category: 'housing',
    title: 'Erbbaurecht statt Verkauf',
    briefing:
      'Drei städtische Grundstücke stehen zur Vergabe. Die Kämmerei rechnet mit elf Millionen beim Verkauf; im Erbbaurecht bliebe die Stadt Eigentümerin und könnte Belegungsbindungen auf neunzig Jahre festschreiben.',
    urgency: 'normal',
    trigger: { earliestMonth: 16, latestMonth: 122, conditions: [{ metric: 'cityBudget', operator: '>', value: 140 }], baseWeight: 6, cooldownMonths: 44, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'hou-leasehold-sell',
    options: [
      {
        id: 'hou-leasehold-lease',
        label: 'Im Erbbaurecht an Genossenschaften',
        rationale: 'Kein Erlös heute, dafür Erbbauzins und gebundene Wohnungen über Generationen.',
        oneOffCost: 0.7,
        monthlyCost: -0.09,
        axes: { marketVsPublic: -0.8, redistribution: 0.7, fiscalRestraint: -0.5, growthVsPreservation: 0.2 },
        salience: { marketVsPublic: 1, redistribution: 0.8, fiscalRestraint: 0.7 },
        effects: [effect({ target: 'socialUnits', expected: 260, delayMonths: 14, rampMonths: 24, confidence: 'medium' })],
        sourceIds: MODEL,
      },
      {
        id: 'hou-leasehold-sell',
        label: 'Verkaufen und den Erlös verbuchen',
        rationale: 'Elf Millionen sofort. Was darauf entsteht, entscheidet danach der Markt.',
        oneOffCost: -11,
        monthlyCost: 0,
        axes: { marketVsPublic: 0.7, fiscalRestraint: 0.6, redistribution: -0.4 },
        salience: { marketVsPublic: 0.9, fiscalRestraint: 0.8 },
        effects: [effect({ target: 'unitsUnderConstruction', expected: 180, delayMonths: 8, rampMonths: 12, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Tür: Modulbau in Eigenregie setzt einen eigenen Bauträger voraus. Ohne Gesellschaft baut die Stadt nicht selbst.
    id: 'hou-modular-housing',
    kind: 'decision',
    category: 'housing',
    title: 'Modulbau gegen die Notunterbringung',
    briefing:
      'Die Stadt zahlt für Hotelplätze mehr als eine eigene Wohnung kosten würde. Ein Modulbau an der Ringstraße wäre in vierzehn Monaten bezugsfertig — und würde zwanzig Jahre stehen, obwohl er als Provisorium beantragt ist.',
    urgency: 'important',
    trigger: { earliestMonth: 12, latestMonth: 128, blockedByChoiceIds: ['fin-housing-company:fin-housing-sell'], conditions: [{ metric: 'homelessPeople', operator: '>', value: 700 }], baseWeight: 9, cooldownMonths: 30, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'cityBudget', expected: -2.4, delayMonths: 1, rampMonths: 6, confidence: 'high' })],
    options: [
      {
        id: 'hou-modular-build',
        label: 'Modulbau beschließen',
        rationale: 'Hundertzwanzig Wohnungen, dauerhaft gebunden, statt Hotelrechnungen ohne Ende.',
        oneOffCost: 9.5,
        monthlyCost: 0.18,
        costMonths: 120,
        axes: { redistribution: 0.8, marketVsPublic: -0.5, fiscalRestraint: -0.3 },
        salience: { redistribution: 1, marketVsPublic: 0.6, fiscalRestraint: 0.5 },
        effects: [
          effect({ target: 'socialUnits', expected: 120, delayMonths: 12, rampMonths: 8, confidence: 'high' }),
          effect({ target: 'housingUnits', expected: 120, delayMonths: 12, rampMonths: 8, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Studierende merken die Anspannung zuerst.
    id: 'hou-student-housing',
    kind: 'decision',
    category: 'housing',
    title: 'Wohnheim am Campus',
    briefing:
      'Die Fachhochschule wächst, ihre Studierenden verdrängen Familien aus dem Westviertel. Das Land gibt Fördermittel für ein Wohnheim, wenn die Stadt das Grundstück stellt.',
    urgency: 'normal',
    trigger: { earliestMonth: 20, latestMonth: 120, conditions: [{ metric: 'averageRent', operator: '>', value: 12.7 }], baseWeight: 6, cooldownMonths: 48, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'hou-student-build',
        label: 'Grundstück stellen und mitbauen',
        rationale: 'Vierhundert Plätze mit Landesförderung, im Gegenzug Belegungsrechte für die Stadt.',
        oneOffCost: 6.2,
        monthlyCost: 0.11,
        costMonths: 84,
        axes: { redistribution: 0.4, marketVsPublic: -0.3, growthVsPreservation: -0.2 },
        salience: { redistribution: 0.6, marketVsPublic: 0.5 },
        effects: [effect({ target: 'housingUnits', expected: 400, delayMonths: 16, rampMonths: 14, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Mobilität ------------------------------------------------------------
  {
    schemaVersion: 1,
    // Emissionsindex 44,7–52,2.
    id: 'mob-parking-reform',
    kind: 'decision',
    category: 'mobility',
    title: 'Anwohnerparken wird neu berechnet',
    briefing:
      'Ein Stellplatz im öffentlichen Raum kostet die Stadt rund zweihundert Euro im Jahr und den Anwohner dreißig. Eine Neuberechnung bringt Geld und Platz — und trifft genau die Leute, die am lautesten anrufen.',
    urgency: 'normal',
    trigger: { earliestMonth: 18, latestMonth: 126, conditions: [{ metric: 'emissions', operator: '>', value: 46 }], baseWeight: 7, cooldownMonths: 42, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'mob-parking-moderate',
    options: [
      {
        id: 'mob-parking-full',
        label: 'Auf Kostendeckung anheben',
        rationale: 'Hundertachtzig Euro im Jahr. Deutliche Mehreinnahme, deutlicher Ärger, spürbar weniger Blech.',
        oneOffCost: 0.8,
        monthlyCost: -0.62,
        axes: { climateAmbition: 0.7, marketVsPublic: 0.3, redistribution: -0.3, growthVsPreservation: 0.4 },
        salience: { climateAmbition: 0.9, redistribution: 0.7, growthVsPreservation: 0.5 },
        effects: [effect({ target: 'transitCapacity', expected: 2.4, delayMonths: 4, rampMonths: 12, confidence: 'low' })],
        sourceIds: MODEL,
      },
      {
        id: 'mob-parking-moderate',
        label: 'Moderat anheben',
        rationale: 'Sechzig Euro im Jahr. Ein Drittel der Wirkung, ein Zehntel des Ärgers.',
        oneOffCost: 0.4,
        monthlyCost: -0.19,
        axes: { climateAmbition: 0.3, growthVsPreservation: 0.2 },
        salience: { climateAmbition: 0.5, redistribution: 0.4 },
        effects: [effect({ target: 'transitCapacity', expected: 0.8, delayMonths: 4, rampMonths: 12, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Erschließung 63,8–81,7 %: nach dem Nachtbus ruft, wer abends nicht heimkommt.
    id: 'mob-night-network',
    kind: 'decision',
    category: 'mobility',
    title: 'Nachtbusnetz für die Außenbezirke',
    briefing:
      'Nach 22 Uhr ist der Wohnring nicht mehr erreichbar. Die Verkehrsbetriebe schlagen vier Nachtlinien im Stundentakt vor, Freitag und Samstag im Halbstundentakt.',
    urgency: 'normal',
    trigger: { earliestMonth: 10, latestMonth: 128, conditions: [{ metric: 'transitCoverage', operator: '<', value: 74 }], baseWeight: 7, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'mob-night-run',
        label: 'Nachtlinien bestellen',
        rationale: 'Vier Linien, dauerhafte Betriebskosten. Erreichbarkeit rund um die Uhr ist Betrieb, kein Projekt.',
        oneOffCost: 1.4,
        monthlyCost: 0.46,
        axes: { marketVsPublic: -0.5, redistribution: 0.5, climateAmbition: 0.4 },
        salience: { marketVsPublic: 0.6, redistribution: 0.7, climateAmbition: 0.5 },
        effects: [effect({ target: 'transitCapacity', expected: 3.6, delayMonths: 3, rampMonths: 8, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Schulauslastung 93,6–100,1 %: volle Schulen heißt volle Bringzeiten.
    id: 'mob-school-streets',
    kind: 'decision',
    category: 'mobility',
    title: 'Schulstraßen zu den Bringzeiten',
    briefing:
      'Vor sechs Grundschulen staut sich morgens der Elternverkehr. Eine Sperrung für dreißig Minuten am Morgen ist rechtlich möglich, verlangt aber jemanden, der die Poller stellt.',
    urgency: 'normal',
    trigger: { earliestMonth: 8, latestMonth: 130, conditions: [{ metric: 'schoolUtilisation', operator: '>', value: 96 }], baseWeight: 7, cooldownMonths: 34, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'mob-school-close',
        label: 'Schulstraßen einrichten',
        rationale: 'Sechs Schulen, Poller und Schulwegdienst. Klein, sichtbar, und jeden Morgen umstritten.',
        oneOffCost: 0.6,
        monthlyCost: 0.14,
        costMonths: 60,
        axes: { climateAmbition: 0.5, securityAuthority: 0.3, growthVsPreservation: 0.3 },
        salience: { climateAmbition: 0.6, securityAuthority: 0.5 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 2, delayMonths: 4, rampMonths: 10, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Eine Straßenbahn prüft, wem der Bus nicht mehr reicht.
    id: 'mob-tram-study',
    kind: 'decision',
    category: 'mobility',
    title: 'Straßenbahn: Machbarkeit prüfen',
    briefing:
      'Eine Trasse vom Hafen zum Wohnring wäre der größte Verkehrseingriff seit vierzig Jahren. Bevor irgendjemand darüber abstimmen kann, braucht es eine Untersuchung — und die kostet, bevor sie irgendetwas bringt.',
    urgency: 'normal',
    trigger: { earliestMonth: 24, latestMonth: 108, conditions: [{ metric: 'transitCoverage', operator: '<', value: 72 }], baseWeight: 5, cooldownMonths: 54, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'mob-tram-commission',
        label: 'Untersuchung beauftragen',
        rationale: 'Achtzehn Monate Planung. Danach weiß der Rat, was er nicht wissen wollte: was es kostet.',
        oneOffCost: 3.2,
        monthlyCost: 0.2,
        costMonths: 18,
        axes: { climateAmbition: 0.6, marketVsPublic: -0.4, fiscalRestraint: -0.4, growthVsPreservation: -0.2 },
        salience: { climateAmbition: 0.7, fiscalRestraint: 0.6 },
        effects: [effect({ target: 'transitCapacity', expected: 1.8, delayMonths: 20, rampMonths: 20, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 4,
    sourceIds: MODEL,
  },

  // --- Umwelt ---------------------------------------------------------------
  {
    schemaVersion: 1,
    // Emissionsindex 44,7–52,2.
    id: 'env-solar-roofs',
    kind: 'decision',
    category: 'environment',
    title: 'Solarpflicht auf städtischen Dächern',
    briefing:
      'Neunzig Dächer der Stadt sind ungenutzt. Eine Eigenbetriebslösung würde sie belegen und den Strom selbst vermarkten — Investition heute, Erlös ab dem achten Jahr.',
    urgency: 'normal',
    trigger: { earliestMonth: 6, latestMonth: 126, conditions: [{ metric: 'emissions', operator: '>', value: 46.5 }], baseWeight: 8, cooldownMonths: 38, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'env-solar-build',
        label: 'Dächer belegen',
        rationale: 'Neunzig Anlagen im Eigenbetrieb. Rechnet sich spät und sicher.',
        oneOffCost: 7.8,
        monthlyCost: -0.14,
        axes: { climateAmbition: 0.8, marketVsPublic: -0.4, fiscalRestraint: -0.3 },
        salience: { climateAmbition: 1, marketVsPublic: 0.5, fiscalRestraint: 0.5 },
        effects: [effect({ target: 'cleanHeat', expected: 11, delayMonths: 8, rampMonths: 16, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Fernwärme ist das teure Mittel; sie kommt, wenn das billige nicht gereicht hat.
    id: 'env-heat-north',
    kind: 'decision',
    category: 'environment',
    title: 'Fernwärme ins Nordviertel',
    briefing:
      'Zweitausend Wohnungen im Norden heizen mit Gas aus den Siebzigern. Die Stadtwerke legen einen Ausbauplan vor: vier Kilometer Leitung, Anschlusszwang für Neubauten, Zuschüsse für den Rest.',
    urgency: 'important',
    trigger: { earliestMonth: 12, latestMonth: 124, conditions: [{ metric: 'emissions', operator: '>', value: 47.5 }], baseWeight: 7, cooldownMonths: 42, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'investmentBacklog', expected: 6, delayMonths: 2, rampMonths: 10, confidence: 'low' })],
    options: [
      {
        id: 'env-heat-extend',
        label: 'Netz ausbauen',
        rationale: 'Vier Kilometer Leitung. Die Straßen sind zwei Jahre aufgerissen, danach hängt ein Viertel am Netz.',
        oneOffCost: 14,
        monthlyCost: 0.3,
        costMonths: 48,
        axes: { climateAmbition: 0.8, marketVsPublic: -0.6, fiscalRestraint: -0.5 },
        salience: { climateAmbition: 1, marketVsPublic: 0.7, fiscalRestraint: 0.6 },
        effects: [effect({ target: 'cleanHeat', expected: 34, delayMonths: 10, rampMonths: 22, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Grünfläche 18,4–24,2 m² je Kopf.
    // Tür: Ein Terminal an der Ostkante und ein mäandernder Fluss sind derselbe Quadratmeter. Einer von beiden.
    id: 'env-river-renaturation',
    kind: 'decision',
    category: 'environment',
    title: 'Die Linde soll wieder mäandern',
    briefing:
      'Der begradigte Flussabschnitt hinter dem Gewerbegebiet ist ökologisch tot und bei Starkregen eine Rinne. Eine Renaturierung senkt das Hochwasserrisiko — und kostet Gewerbefläche.',
    urgency: 'normal',
    trigger: { earliestMonth: 22, latestMonth: 120, blockedByChoiceIds: ['eco-harbour-expansion:eco-harbour-expand'], conditions: [{ metric: 'greenSpacePerCapita', operator: '<', value: 21.5 }], baseWeight: 6, cooldownMonths: 48, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'env-river-partial',
    options: [
      {
        id: 'env-river-full',
        label: 'Vollständig renaturieren',
        rationale: 'Drei Kilometer Aue zurück. Zwölf Hektar Gewerbefläche fallen weg.',
        oneOffCost: 11.5,
        monthlyCost: 0.16,
        costMonths: 60,
        axes: { climateAmbition: 0.9, growthVsPreservation: 0.8, marketVsPublic: -0.3 },
        salience: { climateAmbition: 1, growthVsPreservation: 0.9 },
        effects: [
          effect({ target: 'greenSpaceHectares', expected: 26, delayMonths: 8, rampMonths: 20, confidence: 'high' }),
          effect({ target: 'businessSites', expected: -210, delayMonths: 10, rampMonths: 14, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'env-river-partial',
        label: 'Abschnittsweise, wo niemand baut',
        rationale: 'Ein Kilometer, auf städtischem Grund. Weniger Wirkung, kein Streit mit dem Gewerbe.',
        oneOffCost: 4.2,
        monthlyCost: 0.06,
        costMonths: 48,
        axes: { climateAmbition: 0.4, growthVsPreservation: 0.3 },
        salience: { climateAmbition: 0.6, growthVsPreservation: 0.5 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 8, delayMonths: 8, rampMonths: 16, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Eine Baumschutzsatzung fordert, wer Bäume verliert.
    id: 'env-tree-charter',
    kind: 'decision',
    category: 'environment',
    title: 'Baumschutzsatzung verschärfen',
    briefing:
      'In fünf Jahren sind vierhundert Großbäume auf Privatgrund verschwunden, fast alle genehmigungsfrei. Eine schärfere Satzung würde das stoppen — und jedem Hausbesitzer einen Antrag abverlangen.',
    urgency: 'normal',
    trigger: { earliestMonth: 14, latestMonth: 128, conditions: [{ metric: 'greenSpacePerCapita', operator: '<', value: 21 }], baseWeight: 7, cooldownMonths: 40, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'greenSpaceHectares', expected: -5, delayMonths: 4, rampMonths: 16, confidence: 'medium' })],
    options: [
      {
        id: 'env-tree-adopt',
        label: 'Satzung verschärfen',
        rationale: 'Ab 60 cm Stammumfang genehmigungspflichtig, mit Ersatzpflanzung. Zwei Stellen im Grünamt.',
        oneOffCost: 0.5,
        monthlyCost: 0.11,
        costMonths: 84,
        axes: { climateAmbition: 0.7, growthVsPreservation: 0.7, marketVsPublic: -0.5 },
        salience: { climateAmbition: 0.8, growthVsPreservation: 0.9, marketVsPublic: 0.6 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 12, delayMonths: 6, rampMonths: 24, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Soziales -------------------------------------------------------------
  {
    schemaVersion: 1,
    id: 'soc-school-capacity',
    kind: 'decision',
    category: 'social',
    title: 'Die Grundschulen platzen',
    briefing:
      'Im Wohnring fehlen acht Klassenräume zum kommenden Schuljahr. Container stehen in acht Wochen, ein Anbau in drei Jahren — und die Container bleiben erfahrungsgemäß beides.',
    urgency: 'important',
    trigger: { earliestMonth: 10, latestMonth: 126, conditions: [{ metric: 'schoolUtilisation', operator: '>', value: 97 }], baseWeight: 9, cooldownMonths: 32, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'soc-school-container',
    options: [
      {
        id: 'soc-school-build',
        label: 'Anbau beschließen',
        rationale: 'Drei Jahre Bauzeit, danach steht er sechzig Jahre.',
        oneOffCost: 13.5,
        monthlyCost: 0.24,
        axes: { redistribution: 0.6, marketVsPublic: -0.4, fiscalRestraint: -0.6 },
        salience: { redistribution: 0.8, fiscalRestraint: 0.7 },
        effects: [effect({ target: 'schoolPlaces', expected: 320, delayMonths: 26, rampMonths: 10, confidence: 'high' })],
        sourceIds: MODEL,
      },
      {
        id: 'soc-school-container',
        label: 'Container aufstellen',
        rationale: 'In acht Wochen bezugsfertig. Miete läuft, solange sie stehen, und sie stehen lange.',
        oneOffCost: 2.2,
        monthlyCost: 0.34,
        axes: { fiscalRestraint: 0.4, redistribution: 0.2 },
        salience: { fiscalRestraint: 0.7, redistribution: 0.5 },
        effects: [effect({ target: 'schoolPlaces', expected: 200, delayMonths: 3, rampMonths: 4, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Integrationskapazität 0,3–1,8: Sprach-Kitas fordert, wem die Plätze für die Sprachförderung fehlen.
    // Ausdrücklich NICHT am internationalen Anteil: eine Zusammensetzung darf nie ein Auslöser sein
    // — siehe `tests/unit/events.test.ts`. Gefragt wird nach der Leistung der Stadt, nicht danach,
    // wer in ihr wohnt.
    id: 'soc-language-daycare',
    kind: 'decision',
    category: 'social',
    title: 'Sprach-Kitas ausbauen',
    briefing:
      'In vier Kitas sprechen über achtzig Prozent der Kinder zu Hause kein Deutsch. Zusätzliche Fachkräfte für Sprachförderung wirken nachweislich — und sind auf dem Arbeitsmarkt kaum zu bekommen.',
    urgency: 'normal',
    trigger: { earliestMonth: 12, latestMonth: 128, conditions: [{ metric: 'integrationCapacity', operator: '<', value: 1.2 }], baseWeight: 7, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'integrationPlaces', expected: -60, delayMonths: 4, rampMonths: 12, confidence: 'low' })],
    options: [
      {
        id: 'soc-language-staff',
        label: 'Sprachfachkräfte einstellen',
        rationale: 'Zwölf Stellen, dauerhaft. Wirkt nach Jahren, nicht nach Monaten.',
        oneOffCost: 0.8,
        monthlyCost: 0.38,
        axes: { opennessIntegration: 0.8, redistribution: 0.6, marketVsPublic: -0.4 },
        salience: { opennessIntegration: 1, redistribution: 0.7 },
        effects: [
          effect({ target: 'integrationPlaces', expected: 140, delayMonths: 4, rampMonths: 12, confidence: 'medium' }),
          effect({ target: 'childcarePlaces', expected: 60, delayMonths: 6, rampMonths: 10, confidence: 'medium' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'soc-youth-work',
    kind: 'decision',
    category: 'social',
    title: 'Aufsuchende Jugendarbeit',
    briefing:
      'Die Streetworker melden, dass sie drei Quartiere nicht mehr abdecken. Wo sie fehlen, steigen die Fallzahlen bei Jugendhilfe und Polizei — beides mit anderthalb Jahren Verzögerung.',
    urgency: 'normal',
    trigger: { earliestMonth: 9, latestMonth: 128, conditions: [{ metric: 'youthUnemployment', operator: '>', value: 9.5 }], baseWeight: 8, cooldownMonths: 34, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'orderServiceFte', expected: -6, delayMonths: 6, rampMonths: 12, confidence: 'low' })],
    options: [
      {
        id: 'soc-youth-outreach',
        label: 'Drei Teams aufbauen',
        rationale: 'Neun Stellen in den Quartieren. Nichts davon ist in dieser Wahlperiode zu sehen.',
        oneOffCost: 0.6,
        monthlyCost: 0.29,
        axes: { redistribution: 0.7, securityAuthority: -0.3, marketVsPublic: -0.4 },
        salience: { redistribution: 0.8, securityAuthority: 0.6 },
        effects: [
          effect({ target: 'integrationPlaces', expected: 80, delayMonths: 4, rampMonths: 12, confidence: 'medium' }),
          effect({ target: 'orderServiceFte', expected: 8, delayMonths: 8, rampMonths: 14, confidence: 'low' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Zufriedenheit 57,3–70,5: Quartierspflege fordert, wem es nicht gut genug geht.
    id: 'soc-neighbourhood-care',
    kind: 'decision',
    category: 'social',
    title: 'Quartierspflege statt Heimplätze',
    briefing:
      'Die Pflegekassen zahlen stationär, die Stadt zahlt den Rest. Ein Quartiersansatz mit Tagespflege und Wohngruppen wäre billiger und näher — wenn die Stadt in Vorleistung geht.',
    urgency: 'normal',
    trigger: { earliestMonth: 26, latestMonth: 124, conditions: [{ metric: 'satisfaction', operator: '<', value: 65 }], baseWeight: 6, cooldownMonths: 44, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'soc-care-quarter',
        label: 'Quartierspflege aufbauen',
        rationale: 'Vier Standorte. Kostet acht Jahre lang, spart danach dauerhaft.',
        oneOffCost: 5.4,
        monthlyCost: 0.33,
        costMonths: 96,
        axes: { redistribution: 0.7, marketVsPublic: -0.6, fiscalRestraint: -0.4 },
        salience: { redistribution: 0.9, marketVsPublic: 0.6 },
        effects: [effect({ target: 'integrationPlaces', expected: 70, delayMonths: 10, rampMonths: 20, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Sicherheit -----------------------------------------------------------
  {
    schemaVersion: 1,
    // Kriminalität 39,9–62,5 je 1.000.
    // Tür: Wer auf Kameras gesetzt hat, bekommt für Beleuchtung und Nachbarschaftsarbeit keine Mehrheit mehr — das Geld ist gebunden und die Debatte entschieden.
    id: 'saf-lighting-offensive',
    kind: 'decision',
    category: 'safety',
    title: 'Dunkle Wege im Grünzug',
    briefing:
      'Die Beschwerden über unbeleuchtete Wege häufen sich, vor allem von Frauen und Älteren. LED mit Bewegungsmeldern wäre auch für die Tiere im Grünzug vertretbar — und kostet einmal viel, dann wenig.',
    urgency: 'normal',
    trigger: { earliestMonth: 7, latestMonth: 130, blockedByChoiceIds: ['saf-burglary-series:saf-burglary-cctv'], conditions: [{ metric: 'crimeRate', operator: '>', value: 49 }], baseWeight: 8, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'saf-lighting-build',
        label: 'Wege ausleuchten',
        rationale: 'Vierzehn Kilometer, bedarfsgesteuert. Sichtbar ab dem ersten Winter.',
        oneOffCost: 3.6,
        monthlyCost: 0.09,
        costMonths: 96,
        axes: { securityAuthority: 0.5, redistribution: 0.3, climateAmbition: -0.1 },
        salience: { securityAuthority: 0.8, redistribution: 0.4 },
        effects: [effect({ target: 'orderServiceFte', expected: 9, delayMonths: 4, rampMonths: 10, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Obdachlosigkeit 432–2.591: eine offene Szene hat, wer Menschen auf der Straße hat.
    id: 'saf-drug-scene',
    kind: 'decision',
    category: 'safety',
    title: 'Offene Szene am Hauptbahnhof',
    briefing:
      'Rund achtzig Menschen konsumieren im Bahnhofsumfeld öffentlich. Die Geschäfte klagen, die Sozialverbände warnen vor Verdrängung. Beide Wege sind erprobt, und beide haben genau die Nachteile, die der andere nennt.',
    urgency: 'important',
    trigger: { earliestMonth: 16, latestMonth: 126, conditions: [{ metric: 'homelessPeople', operator: '>', value: 850 }], baseWeight: 7, cooldownMonths: 46, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'saf-drug-presence',
    options: [
      {
        id: 'saf-drug-consumption-room',
        label: 'Druckraum und Beratung',
        rationale: 'Ein Konsumraum nimmt die Szene von der Straße, ohne sie zu verlagern. Die Nachbarschaft wird trotzdem klagen.',
        oneOffCost: 2.8,
        monthlyCost: 0.42,
        axes: { redistribution: 0.7, securityAuthority: -0.6, opennessIntegration: 0.5 },
        salience: { redistribution: 0.8, securityAuthority: 1 },
        effects: [effect({ target: 'integrationPlaces', expected: 90, delayMonths: 5, rampMonths: 12, confidence: 'medium' })],
        sourceIds: MODEL,
      },
      {
        id: 'saf-drug-presence',
        label: 'Präsenz und Platzverweise',
        rationale: 'Ordnungsdienst rund um die Uhr. Der Bahnhof wird sauber, das Problem zieht drei Straßen weiter.',
        oneOffCost: 0.9,
        monthlyCost: 0.51,
        axes: { securityAuthority: 0.8, redistribution: -0.4, opennessIntegration: -0.4 },
        salience: { securityAuthority: 1, redistribution: 0.6 },
        effects: [effect({ target: 'orderServiceFte', expected: 14, delayMonths: 2, rampMonths: 6, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Einsatzkapazität 10,4–14,6.
    id: 'saf-fire-station',
    kind: 'decision',
    category: 'safety',
    title: 'Hilfsfrist im Süden gerissen',
    briefing:
      'Die Feuerwehr erreicht den Süden in zwölf statt in acht Minuten. Eine vierte Wache wäre die saubere Lösung; sie kostet so viel wie zwei Schulanbauten und bindet Personal, das es nicht gibt.',
    urgency: 'important',
    trigger: { earliestMonth: 20, latestMonth: 122, conditions: [{ metric: 'orderServiceCapacity', operator: '<', value: 12.4 }], baseWeight: 6, cooldownMonths: 50, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'investmentBacklog', expected: 8, delayMonths: 3, rampMonths: 12, confidence: 'medium' })],
    options: [
      {
        id: 'saf-fire-build',
        label: 'Vierte Wache bauen',
        rationale: 'Zwei Jahre Bau, achtzehn Stellen. Danach hält die Stadt ihre eigene Hilfsfrist ein.',
        oneOffCost: 16,
        monthlyCost: 0.72,
        axes: { securityAuthority: 0.6, marketVsPublic: -0.4, fiscalRestraint: -0.7 },
        salience: { securityAuthority: 0.9, fiscalRestraint: 0.8 },
        effects: [effect({ target: 'orderServiceFte', expected: 18, delayMonths: 24, rampMonths: 8, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Wirtschaft und Finanzen ---------------------------------------------
  {
    schemaVersion: 1,
    // Jugendarbeitslosigkeit 3,8–14,6 %: ein Gründerzentrum fordert, wer keine Lehrstellen hat.
    // Tür: Die Werfthalle steht dann nicht mehr leer, sondern im Terminal. Ein Gründerzentrum braucht sie.
    id: 'eco-startup-centre',
    kind: 'decision',
    category: 'economy',
    title: 'Gründerzentrum in der Werfthalle',
    briefing:
      'Die denkmalgeschützte Halle 4 steht seit neun Jahren leer. Als Gründerzentrum mit günstigen Mieten wäre sie in zwei Jahren belegt — die Sanierung kostet allerdings, bevor irgendjemand einzieht.',
    urgency: 'normal',
    trigger: { earliestMonth: 14, latestMonth: 122, blockedByChoiceIds: ['eco-harbour-expansion:eco-harbour-expand'], conditions: [{ metric: 'youthUnemployment', operator: '>', value: 7 }], baseWeight: 7, cooldownMonths: 44, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'eco-startup-build',
        label: 'Halle sanieren und vermieten',
        rationale: 'Achtzig Arbeitsplätze im ersten Jahr, ein Vielfaches davon, wenn es läuft.',
        oneOffCost: 8.4,
        monthlyCost: -0.16,
        axes: { marketVsPublic: 0.2, growthVsPreservation: -0.3, fiscalRestraint: -0.3 },
        salience: { marketVsPublic: 0.6, growthVsPreservation: 0.5 },
        effects: [effect({ target: 'businessSites', expected: 190, delayMonths: 12, rampMonths: 18, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Betriebsbestand 4.910–6.374: der Hafen will nach Osten, wenn er ausgelastet ist.
    id: 'eco-harbour-expansion',
    kind: 'decision',
    category: 'economy',
    title: 'Der Hafen will nach Osten',
    briefing:
      'Die Hafengesellschaft beantragt vierzig Hektar für ein neues Terminal. Dieselbe Fläche ist im Landschaftsplan als Ausgleich vorgesehen. Eines von beidem wird es geben.',
    urgency: 'important',
    trigger: { earliestMonth: 28, latestMonth: 118, conditions: [{ metric: 'businessStock', operator: '>', value: 5400 }], baseWeight: 6, cooldownMonths: 54, oncePerCampaign: true },
    immediateEffects: [],
    defaultOptionId: 'eco-harbour-keep',
    options: [
      {
        id: 'eco-harbour-expand',
        label: 'Terminal genehmigen',
        rationale: 'Vierzig Hektar Gewerbe, Umschlag und Arbeitsplätze. Die Ausgleichsfläche ist weg.',
        oneOffCost: 5.5,
        monthlyCost: -0.34,
        axes: { growthVsPreservation: -0.8, marketVsPublic: 0.6, climateAmbition: -0.6 },
        salience: { growthVsPreservation: 1, climateAmbition: 0.8, marketVsPublic: 0.6 },
        effects: [
          effect({ target: 'businessSites', expected: 380, delayMonths: 18, rampMonths: 20, confidence: 'medium' }),
          effect({ target: 'greenSpaceHectares', expected: -34, delayMonths: 12, rampMonths: 10, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
      {
        id: 'eco-harbour-keep',
        label: 'Ausgleichsfläche sichern',
        rationale: 'Der Landschaftsplan gilt. Die Hafengesellschaft geht, wohin sie kann.',
        oneOffCost: 1.2,
        monthlyCost: 0,
        axes: { growthVsPreservation: 0.8, climateAmbition: 0.6, marketVsPublic: -0.4 },
        salience: { growthVsPreservation: 1, climateAmbition: 0.8 },
        effects: [
          effect({ target: 'greenSpaceHectares', expected: 18, delayMonths: 8, rampMonths: 14, confidence: 'high' }),
          effect({ target: 'businessSites', expected: -120, delayMonths: 14, rampMonths: 16, confidence: 'low' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'fin-housing-company',
    kind: 'decision',
    category: 'finance',
    title: 'Anteile an der Wohnungsgesellschaft',
    briefing:
      'Ein Pensionsfonds bietet für 25 Prozent der städtischen Wohnungsgesellschaft. Das Geld würde den Haushalt für Jahre entspannen; die Mitsprache bei viertausend Wohnungen wäre geteilt.',
    urgency: 'important',
    trigger: { earliestMonth: 30, latestMonth: 120, conditions: [{ metric: 'debt', operator: '>', value: 120 }], baseWeight: 7, cooldownMonths: 48, oncePerCampaign: false },
    immediateEffects: [],
    defaultOptionId: 'fin-housing-keep',
    options: [
      {
        id: 'fin-housing-sell',
        label: 'Anteile verkaufen',
        rationale: 'Achtundfünfzig Millionen sofort. Der Fonds will Rendite, und die kommt aus den Mieten.',
        oneOffCost: -58,
        monthlyCost: 0.1,
        axes: { marketVsPublic: 0.9, fiscalRestraint: 0.8, redistribution: -0.7 },
        salience: { marketVsPublic: 1, fiscalRestraint: 0.9, redistribution: 0.9 },
        effects: [effect({ target: 'socialUnits', expected: -420, delayMonths: 12, rampMonths: 24, confidence: 'medium' })],
        sourceIds: MODEL,
      },
      {
        id: 'fin-housing-keep',
        label: 'In städtischer Hand lassen',
        rationale: 'Kein Geld, keine geteilte Mitsprache. Die Schulden bleiben, wo sie sind.',
        oneOffCost: 0,
        monthlyCost: 0,
        axes: { marketVsPublic: -0.8, redistribution: 0.6, fiscalRestraint: -0.5 },
        salience: { marketVsPublic: 1, redistribution: 0.8, fiscalRestraint: 0.7 },
        effects: [effect({ target: 'socialUnits', expected: 60, delayMonths: 8, rampMonths: 20, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Kassenkredite 47–631 Mio.: digitalisieren kann, wer noch Luft hat.
    id: 'fin-digital-office',
    kind: 'decision',
    category: 'finance',
    title: 'Die Verwaltung soll digital werden',
    briefing:
      'Zweiundsiebzig Leistungen sind noch Papier. Eine Digitalisierungsoffensive bindet drei Jahre lang Geld und Personal, bevor irgendjemand etwas merkt — und die Hälfte der Projekte scheitert erfahrungsgemäß.',
    urgency: 'normal',
    trigger: { earliestMonth: 12, latestMonth: 120, conditions: [{ metric: 'debt', operator: '<', value: 320 }], baseWeight: 7, cooldownMonths: 42, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'fin-digital-invest',
        label: 'Offensive beschließen',
        rationale: 'Drei Jahre Aufwand für Verfahren, die danach ohne Schalter laufen.',
        oneOffCost: 6.8,
        monthlyCost: 0.44,
        costMonths: 36,
        axes: { fiscalRestraint: -0.3, marketVsPublic: 0.2, securityAuthority: 0.2 },
        salience: { fiscalRestraint: 0.7, marketVsPublic: 0.4 },
        effects: [effect({ target: 'maintenanceSpend', expected: 0.24, delayMonths: 30, rampMonths: 14, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Verwaltung -----------------------------------------------------------
  {
    schemaVersion: 1,
    // Polarisierung 38–61,8: Beteiligung fordert, wessen Stadt auseinanderdriftet.
    id: 'gov-citizen-budget',
    kind: 'decision',
    category: 'governance',
    title: 'Bürgerhaushalt einführen',
    briefing:
      'Zwei Millionen im Jahr, über die die Quartiere selbst entscheiden. Erfahrungen anderswo: hohe Beteiligung im ersten Jahr, danach dieselben dreißig Leute — und trotzdem mehr Vertrauen als jede Kampagne.',
    urgency: 'normal',
    trigger: { earliestMonth: 8, latestMonth: 124, conditions: [{ metric: 'polarisation', operator: '>', value: 43 }], baseWeight: 7, cooldownMonths: 40, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'gov-citizen-adopt',
        label: 'Bürgerhaushalt beschließen',
        rationale: 'Zwei Millionen und zwei Stellen für die Moderation. Der Rat gibt ein Stück Budgetrecht ab.',
        oneOffCost: 0.6,
        monthlyCost: 0.19,
        costMonths: 72,
        axes: { redistribution: 0.5, marketVsPublic: -0.3, opennessIntegration: 0.6 },
        salience: { redistribution: 0.6, opennessIntegration: 0.8 },
        effects: [effect({ target: 'greenSpaceHectares', expected: 6, delayMonths: 8, rampMonths: 16, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Dieselbe Spannung, eine Stufe später.
    id: 'gov-transparency',
    kind: 'decision',
    category: 'governance',
    title: 'Transparenzsatzung',
    briefing:
      'Verträge, Gutachten und Ratsvorlagen sollen von sich aus öffentlich werden, nicht erst auf Antrag. Die Verwaltung warnt vor Aufwand, die Presse vor dem Gegenteil.',
    urgency: 'normal',
    trigger: { earliestMonth: 10, latestMonth: 126, conditions: [{ metric: 'polarisation', operator: '>', value: 45 }], baseWeight: 7, cooldownMonths: 38, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'gov-transparency-adopt',
        label: 'Satzung beschließen',
        rationale: 'Alles online, außer was rechtlich nicht darf. Vier Stellen für die Prüfung.',
        oneOffCost: 1.1,
        monthlyCost: 0.17,
        costMonths: 84,
        axes: { opennessIntegration: 0.7, marketVsPublic: -0.3, securityAuthority: -0.3 },
        salience: { opennessIntegration: 0.9, securityAuthority: 0.5 },
        effects: [effect({ target: 'maintenanceSpend', expected: 0.08, delayMonths: 12, rampMonths: 18, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Was wiederkommt, weil es abgelehnt wurde ----------------------------
  /*
   * „Nein heißt nicht weg." Die Vorlage ist verbraucht — dieselbe kommt nicht wieder, sonst könnte
   * man den Rat so lange fragen, bis er Ja sagt. Die **Ursache** bleibt, und sie wird teurer.
   *
   * Jedes Ereignis hier setzt eine abgelehnte Vorlage voraus und bietet dieselbe Sache noch einmal
   * an — in anderer Form, zu einem Preis, der inzwischen gestiegen ist. Damit ist Nichtstun eine
   * Entscheidung mit Preis statt eines Ausweges.
   */
  {
    schemaVersion: 1,
    id: 'hou-milieu-tipped',
    kind: 'chain',
    category: 'housing',
    title: 'Das Hafenviertel kippt',
    briefing:
      'Zwei Jahre nach der abgelehnten Erhaltungssatzung sind vier Häuserblöcke durchsaniert und die Hälfte der Mieterschaft weg. Was jetzt noch geht, ist Ankauf – zum Preis von heute.',
    urgency: 'breaking',
    trigger: { earliestMonth: 20, latestMonth: 128, conditions: [], baseWeight: 18, cooldownMonths: 48, oncePerCampaign: true, requiresRefusedEventIds: ['hou-milieu-protection'] },
    immediateEffects: [effect({ target: 'socialUnits', expected: -150, delayMonths: 0, rampMonths: 6, confidence: 'high' })],
    refusedEffects: [effect({ target: 'socialUnits', expected: -180, delayMonths: 2, rampMonths: 14, confidence: 'medium' })],
    options: [
      {
        id: 'hou-milieu-buy-late',
        label: 'Ankaufen, was noch zu haben ist',
        rationale: 'Dreimal so teuer wie eine Satzung vor zwei Jahren, und es rettet weniger.',
        oneOffCost: 17.5,
        monthlyCost: 0.34,
        costMonths: 96,
        axes: { marketVsPublic: -0.8, redistribution: 0.7, fiscalRestraint: -0.6 },
        salience: { marketVsPublic: 0.9, redistribution: 0.9, fiscalRestraint: 0.8 },
        effects: [effect({ target: 'socialUnits', expected: 190, delayMonths: 6, rampMonths: 18, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'soc-language-gap',
    kind: 'chain',
    category: 'social',
    title: 'Sprachstandserhebung fällt durch',
    briefing:
      'Die Einschulungsuntersuchung weist in vier Sprengeln erheblichen Förderbedarf aus. Was in der Kita zwölf Stellen gekostet hätte, kostet in der Schule mehr – und kommt später.',
    urgency: 'important',
    trigger: { earliestMonth: 18, latestMonth: 128, conditions: [], baseWeight: 17, cooldownMonths: 42, oncePerCampaign: false, requiresRefusedEventIds: ['soc-language-daycare'] },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'integrationPlaces', expected: -110, delayMonths: 3, rampMonths: 14, confidence: 'medium' })],
    options: [
      {
        id: 'soc-language-schools',
        label: 'Förderung an den Schulen aufbauen',
        rationale: 'Zwanzig Stellen statt zwölf, und die ersten drei Jahrgänge sind ohnehin durch.',
        oneOffCost: 1.6,
        monthlyCost: 0.62,
        axes: { opennessIntegration: 0.7, redistribution: 0.6, marketVsPublic: -0.4 },
        salience: { opennessIntegration: 1, redistribution: 0.7 },
        effects: [effect({ target: 'integrationPlaces', expected: 160, delayMonths: 6, rampMonths: 16, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'saf-response-lawsuit',
    kind: 'chain',
    category: 'safety',
    title: 'Hilfsfrist vor Gericht',
    briefing:
      'Nach einem Wohnungsbrand mit zwei Schwerverletzten klagt eine Familie auf Einhaltung der Hilfsfrist. Die Aufsichtsbehörde verlangt einen Zeitplan, nicht mehr eine Prüfung.',
    urgency: 'breaking',
    trigger: { earliestMonth: 28, latestMonth: 128, conditions: [], baseWeight: 18, cooldownMonths: 60, oncePerCampaign: true, requiresRefusedEventIds: ['saf-fire-station'] },
    immediateEffects: [effect({ target: 'cityBudget', expected: -4.5, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    refusedEffects: [effect({ target: 'investmentBacklog', expected: 14, delayMonths: 2, rampMonths: 12, confidence: 'high' })],
    options: [
      {
        id: 'saf-response-comply',
        label: 'Wache bauen, mit Frist',
        rationale: 'Dasselbe Gebäude wie damals, unter Zeitdruck ausgeschrieben. Das kostet Aufschlag.',
        oneOffCost: 21,
        monthlyCost: 0.78,
        axes: { securityAuthority: 0.6, fiscalRestraint: -0.8, marketVsPublic: -0.3 },
        salience: { securityAuthority: 0.9, fiscalRestraint: 0.9 },
        effects: [effect({ target: 'orderServiceFte', expected: 18, delayMonths: 20, rampMonths: 8, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'env-heat-gas-failure',
    kind: 'chain',
    category: 'environment',
    title: 'Das Gasnetz im Norden gibt auf',
    briefing:
      'Ein Leitungsabschnitt aus den Siebzigern muss stillgelegt werden. Zweitausend Wohnungen stehen ohne Heizung da, und die Fernwärme liegt vier Kilometer entfernt – wie vor drei Jahren.',
    urgency: 'breaking',
    trigger: { earliestMonth: 24, latestMonth: 128, conditions: [], baseWeight: 18, cooldownMonths: 54, oncePerCampaign: true, requiresRefusedEventIds: ['env-heat-north'] },
    immediateEffects: [effect({ target: 'investmentBacklog', expected: 18, delayMonths: 0, rampMonths: 3, confidence: 'high' })],
    refusedEffects: [effect({ target: 'cleanHeat', expected: -12, delayMonths: 2, rampMonths: 10, confidence: 'medium' })],
    options: [
      {
        id: 'env-heat-emergency',
        label: 'Netz jetzt legen, im Notbetrieb',
        rationale: 'Dieselben vier Kilometer, nur im Winter und ohne Ausschreibung.',
        oneOffCost: 19,
        monthlyCost: 0.34,
        costMonths: 48,
        axes: { climateAmbition: 0.7, marketVsPublic: -0.6, fiscalRestraint: -0.7 },
        salience: { climateAmbition: 0.9, fiscalRestraint: 0.8, marketVsPublic: 0.6 },
        effects: [effect({ target: 'cleanHeat', expected: 30, delayMonths: 6, rampMonths: 18, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'mob-bike-referendum',
    kind: 'chain',
    category: 'mobility',
    title: 'Bürgerbegehren für die Radachse',
    briefing:
      'Nach der Ablehnung im Rat haben elftausend Menschen unterschrieben. Der Rat kann das Begehren übernehmen oder den Bürgerentscheid abwarten – und die Kampagne bezahlen.',
    urgency: 'important',
    trigger: { earliestMonth: 20, latestMonth: 126, conditions: [], baseWeight: 17, cooldownMonths: 48, oncePerCampaign: true, requiresRefusedEventIds: ['mob-bike-axis'] },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'cityBudget', expected: -3.8, delayMonths: 1, rampMonths: 3, confidence: 'high' })],
    options: [
      {
        id: 'mob-bike-adopt-petition',
        label: 'Begehren übernehmen',
        rationale: 'Der Rat macht sich das Anliegen zu eigen. Dieselbe Achse, ein Jahr später, unter Frist und zu Preisen von heute.',
        oneOffCost: 14.5,
        monthlyCost: 0.3,
        costMonths: 36,
        axes: { climateAmbition: 0.7, opennessIntegration: 0.4, growthVsPreservation: 0.3 },
        salience: { climateAmbition: 0.9, opennessIntegration: 0.6 },
        effects: [effect({ target: 'transitCapacity', expected: 3.4, delayMonths: 6, rampMonths: 16, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'hou-gyms-occupied',
    kind: 'chain',
    category: 'housing',
    title: 'Turnhallen als Notunterkunft',
    briefing:
      'Der Modulbau kam nicht, die Hotelplätze reichen nicht mehr. Drei Sporthallen sind seit November belegt, der Schulsport fällt aus, und die Presse zählt die Tage.',
    urgency: 'breaking',
    trigger: { earliestMonth: 22, latestMonth: 128, conditions: [], baseWeight: 19, cooldownMonths: 44, oncePerCampaign: false, requiresRefusedEventIds: ['hou-modular-housing'] },
    immediateEffects: [effect({ target: 'cityBudget', expected: -5.2, delayMonths: 0, rampMonths: 2, confidence: 'high' })],
    refusedEffects: [effect({ target: 'homelessPeople', expected: 180, delayMonths: 2, rampMonths: 12, confidence: 'medium' })],
    options: [
      {
        id: 'hou-gyms-build-now',
        label: 'Modulbau jetzt, im Eilverfahren',
        rationale: 'Dasselbe Gebäude wie damals, ohne Ausschreibung und mit Winterbaukosten.',
        oneOffCost: 14,
        monthlyCost: 0.22,
        costMonths: 120,
        axes: { redistribution: 0.8, marketVsPublic: -0.5, fiscalRestraint: -0.5 },
        salience: { redistribution: 1, fiscalRestraint: 0.7 },
        effects: [
          effect({ target: 'socialUnits', expected: 120, delayMonths: 8, rampMonths: 8, confidence: 'high' }),
          effect({ target: 'housingUnits', expected: 120, delayMonths: 8, rampMonths: 8, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'hou-bindings-gone',
    kind: 'chain',
    category: 'housing',
    title: 'Die letzten Bindungen laufen aus',
    briefing:
      'Der Jahrgang 1998 ist durch: achthundert Wohnungen fallen auf einen Schlag aus der Preisbindung. Die Ankaufsvorlage von damals hätte die Hälfte gehalten.',
    urgency: 'important',
    trigger: { earliestMonth: 18, latestMonth: 128, conditions: [], baseWeight: 18, cooldownMonths: 40, oncePerCampaign: false, requiresRefusedEventIds: ['hou-bindings-expire'] },
    immediateEffects: [effect({ target: 'socialUnits', expected: -240, delayMonths: 0, rampMonths: 8, confidence: 'high' })],
    refusedEffects: [effect({ target: 'socialUnits', expected: -160, delayMonths: 3, rampMonths: 14, confidence: 'medium' })],
    options: [
      {
        id: 'hou-bindings-rescue',
        label: 'Nachbinden, was noch geht',
        rationale: 'Anschlussbindungen gegen Modernisierungszuschuss. Teurer als der Ankauf und weniger wirksam.',
        oneOffCost: 12.5,
        monthlyCost: 0.46,
        costMonths: 84,
        axes: { marketVsPublic: -0.7, redistribution: 0.8, fiscalRestraint: -0.5 },
        salience: { marketVsPublic: 0.8, redistribution: 1, fiscalRestraint: 0.7 },
        effects: [effect({ target: 'socialUnits', expected: 300, delayMonths: 6, rampMonths: 20, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'gov-records-lawsuit',
    kind: 'chain',
    category: 'governance',
    title: 'Presse klagt auf Akteneinsicht',
    briefing:
      'Ein Recherchebüro zieht vor Gericht, weil drei Gutachten unter Verschluss bleiben. Ohne Transparenzsatzung entscheidet nun ein Richter, was die Stadt herausgibt.',
    urgency: 'important',
    trigger: { earliestMonth: 16, latestMonth: 128, conditions: [], baseWeight: 17, cooldownMonths: 42, oncePerCampaign: false, requiresRefusedEventIds: ['gov-transparency'] },
    immediateEffects: [effect({ target: 'cityBudget', expected: -1.8, delayMonths: 0, rampMonths: 2, confidence: 'high' })],
    refusedEffects: [effect({ target: 'maintenanceSpend', expected: -0.12, delayMonths: 3, rampMonths: 12, confidence: 'low' })],
    options: [
      {
        id: 'gov-records-open',
        label: 'Alles offenlegen und Satzung nachholen',
        rationale: 'Dieselbe Satzung wie vor zwei Jahren, jetzt unter Aufsicht eines Gerichts und mit Nachbearbeitung der Altakten.',
        oneOffCost: 3.4,
        monthlyCost: 0.21,
        costMonths: 84,
        axes: { opennessIntegration: 0.8, marketVsPublic: -0.3, securityAuthority: -0.4 },
        salience: { opennessIntegration: 1, securityAuthority: 0.6 },
        effects: [effect({ target: 'maintenanceSpend', expected: 0.1, delayMonths: 10, rampMonths: 18, confidence: 'low' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },

  // --- Was die Lage in Lindenhafen auslöst ---------------------------------
  /*
   * Du beantwortest nie den Krieg. Du beantwortest, was er in Lindenhafen auslöst.
   *
   * Diese Ereignisse lesen die vier Weltgrößen statt der Stadt: den Gaspreis, die Konjunktur, die
   * Bundestöpfe, den Zuwanderungsdruck. Damit bekommt das Jahrzehnt eine Richtung, die niemand im
   * Rat gewählt hat — und die Stadt bekommt Momente, in denen sie auf etwas reagiert, statt es zu
   * verursachen.
   */
  {
    schemaVersion: 1,
    id: 'lage-gas-shock',
    kind: 'external',
    category: 'environment',
    title: 'Gaspreis verdoppelt sich',
    briefing:
      'Ein Lieferstopp treibt den Preis binnen Wochen auf das Doppelte. Die Stadtwerke rechnen mit einem Nachzahlungsbescheid für jede städtische Liegenschaft, und die Fernwärme ist plötzlich das günstige Netz.',
    urgency: 'breaking',
    trigger: { earliestMonth: 6, latestMonth: 128, conditions: [{ metric: 'gasPrice', operator: '>', value: 150 }], baseWeight: 14, cooldownMonths: 30, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -7.5, delayMonths: 0, rampMonths: 3, confidence: 'high' })],
    refusedEffects: [effect({ target: 'investmentBacklog', expected: 9, delayMonths: 2, rampMonths: 10, confidence: 'medium' })],
    options: [
      {
        id: 'lage-gas-network',
        label: 'Fernwärme vorziehen, solange es sich rechnet',
        rationale: 'Was bei billigem Gas unwirtschaftlich war, trägt sich jetzt. Das Zeitfenster ist so lang wie der Preis hoch bleibt.',
        oneOffCost: 12.5,
        monthlyCost: 0.26,
        costMonths: 48,
        axes: { climateAmbition: 0.7, marketVsPublic: -0.5, fiscalRestraint: -0.3 },
        salience: { climateAmbition: 0.9, fiscalRestraint: 0.7, marketVsPublic: 0.5 },
        effects: [effect({ target: 'cleanHeat', expected: 38, delayMonths: 8, rampMonths: 20, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 3,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'lage-recession-closure',
    kind: 'external',
    category: 'economy',
    title: 'Die Rezession erreicht den Hafen',
    briefing:
      'Zwei Zulieferer melden Kurzarbeit, ein dritter hat Insolvenz angemeldet. Was sonst über Jahre schleicht, passiert in diesem Winter auf einmal.',
    urgency: 'breaking',
    trigger: { earliestMonth: 8, latestMonth: 128, conditions: [{ metric: 'economy', operator: '<', value: 84, sustainedMonths: 3 }], baseWeight: 14, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'businessSites', expected: -220, delayMonths: 0, rampMonths: 5, confidence: 'high' })],
    refusedEffects: [effect({ target: 'businessSites', expected: -140, delayMonths: 3, rampMonths: 12, confidence: 'medium' })],
    options: [
      {
        id: 'lage-recession-bridge',
        label: 'Überbrückung und Qualifizierung',
        rationale: 'Die Stadt hält die Hallen und die Leute, bis die Konjunktur zurückkommt. Sie kommt zurück, nur weiß niemand wann.',
        oneOffCost: 6.4,
        monthlyCost: 0.58,
        costMonths: 36,
        axes: { redistribution: 0.7, marketVsPublic: -0.6, fiscalRestraint: -0.5 },
        salience: { redistribution: 0.9, marketVsPublic: 0.7, fiscalRestraint: 0.7 },
        effects: [
          effect({ target: 'businessSites', expected: 170, delayMonths: 8, rampMonths: 18, confidence: 'low' }),
          effect({ target: 'integrationPlaces', expected: 60, delayMonths: 4, rampMonths: 10, confidence: 'medium' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'lage-federal-call',
    kind: 'external',
    category: 'finance',
    title: 'Der Bund schreibt aus',
    briefing:
      'Ein Sonderprogramm über zweihundert Millionen wird aufgelegt, Frist acht Wochen. Wer die Planung fertig in der Schublade hat, bekommt etwas; wer sie erst schreiben muss, bekommt nichts.',
    urgency: 'important',
    trigger: { earliestMonth: 10, latestMonth: 126, conditions: [{ metric: 'federalFunds', operator: '>', value: 128 }], baseWeight: 13, cooldownMonths: 32, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'lage-federal-apply',
        label: 'Bewerben, mit allem was wir haben',
        rationale: 'Vier Wochen Verwaltung im Ausnahmezustand für einen Zuschlag, der nicht sicher ist. Ohne Eigenanteil gibt es nichts.',
        oneOffCost: 4.2,
        monthlyCost: -0.72,
        costMonths: 60,
        axes: { fiscalRestraint: 0.2, marketVsPublic: -0.3, growthVsPreservation: -0.2 },
        salience: { fiscalRestraint: 0.8, marketVsPublic: 0.4 },
        effects: [effect({ target: 'maintenanceSpend', expected: 0.35, delayMonths: 6, rampMonths: 14, confidence: 'medium' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'lage-arrivals-surge',
    kind: 'external',
    category: 'social',
    title: 'Die Zuweisungen steigen sprunghaft',
    briefing:
      'Das Land erhöht die Quote um sechzig Prozent, mit vier Wochen Vorlauf. Was an Plätzen da ist, ist da; was fehlt, fehlt ab dem ersten Tag.',
    urgency: 'breaking',
    trigger: { earliestMonth: 8, latestMonth: 128, conditions: [{ metric: 'migrationPressure', operator: '>', value: 142 }], baseWeight: 14, cooldownMonths: 30, oncePerCampaign: false },
    immediateEffects: [],
    refusedEffects: [effect({ target: 'integrationPlaces', expected: -90, delayMonths: 2, rampMonths: 10, confidence: 'medium' })],
    options: [
      {
        id: 'lage-arrivals-capacity',
        label: 'Plätze und Kurse aufstocken',
        rationale: 'Dezentral, in vier Quartieren, mit Personal, das es auf dem Markt nicht gibt. Teuer und richtig.',
        oneOffCost: 5.8,
        monthlyCost: 0.66,
        axes: { opennessIntegration: 0.8, redistribution: 0.7, marketVsPublic: -0.5 },
        salience: { opennessIntegration: 1, redistribution: 0.8 },
        effects: [effect({ target: 'integrationPlaces', expected: 210, delayMonths: 3, rampMonths: 10, confidence: 'high' })],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    id: 'lage-boom-sites',
    kind: 'external',
    category: 'economy',
    title: 'Der Aufschwung sucht Flächen',
    briefing:
      'Drei Unternehmen fragen gleichzeitig nach Gewerbeflächen. In zwei Jahren fragt niemand mehr – und die Erschließung dauert achtzehn Monate.',
    urgency: 'important',
    trigger: { earliestMonth: 12, latestMonth: 124, conditions: [{ metric: 'economy', operator: '>', value: 116, sustainedMonths: 2 }], baseWeight: 12, cooldownMonths: 36, oncePerCampaign: false },
    immediateEffects: [],
    options: [
      {
        id: 'lage-boom-develop',
        label: 'Erschließen, jetzt',
        rationale: 'Auf Vorrat bauen, während das Geld da ist. Kommt die Konjunktur nicht mit, steht es leer.',
        oneOffCost: 11.5,
        monthlyCost: 0.18,
        costMonths: 60,
        axes: { marketVsPublic: 0.6, growthVsPreservation: -0.6, fiscalRestraint: -0.3 },
        salience: { marketVsPublic: 0.8, growthVsPreservation: 0.8 },
        effects: [
          effect({ target: 'businessSites', expected: 330, delayMonths: 10, rampMonths: 18, confidence: 'medium' }),
          effect({ target: 'greenSpaceHectares', expected: -11, delayMonths: 10, rampMonths: 10, confidence: 'high' }),
        ],
        sourceIds: MODEL,
      },
    ],
    expiresInMonths: 2,
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
    // Der Schlüsselausgleich fällt der Stadt auf, die ihn braucht.
    id: 'fin-windfall-equalisation',
    kind: 'incident',
    category: 'finance',
    title: 'Schlüsselzuweisung höher als veranschlagt',
    briefing: 'Der Finanzausgleich des Landes fällt zugunsten der Stadt aus. Ein Buchungsgewinn, kein Strukturgewinn — nächstes Jahr kann es andersherum laufen.',
    urgency: 'normal',
    trigger: { earliestMonth: 6, latestMonth: 130, conditions: [{ metric: 'debt', operator: '>', value: 140 }], baseWeight: 8, cooldownMonths: 20, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: 7, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Zufriedenheit 57,3–70,5: man vermacht der Stadt etwas, die man mag.
    id: 'fin-windfall-bequest',
    kind: 'incident',
    category: 'finance',
    title: 'Vermächtnis an die Stadt',
    briefing: 'Eine Reederfamilie vererbt der Stadt Wertpapiere und ein Kontorhaus am alten Hafen, zweckgebunden an nichts.',
    urgency: 'normal',
    trigger: { earliestMonth: 20, latestMonth: 128, conditions: [{ metric: 'satisfaction', operator: '>', value: 62 }], baseWeight: 4, cooldownMonths: 60, oncePerCampaign: true },
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
    // Sanierungsstau 0–234,5 Mio.: Altlasten findet, wer endlich gräbt.
    id: 'fin-shock-contamination',
    kind: 'incident',
    category: 'finance',
    title: 'Altlasten unter dem Bauhof',
    briefing: 'Bei Erdarbeiten kommen Rückstände aus der Zeit der Werft zutage. Die Sanierung ist nicht aufschiebbar und nicht versichert.',
    urgency: 'important',
    trigger: { earliestMonth: 10, latestMonth: 126, conditions: [{ metric: 'investmentBacklog', operator: '>', value: 55 }], baseWeight: 6, cooldownMonths: 48, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -9, delayMonths: 0, rampMonths: 2, confidence: 'medium' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Beschäftigung 68,5–73,5 %: um Eingruppierung wird gestritten, wo Personal knapp ist.
    id: 'fin-shock-payscale',
    kind: 'incident',
    category: 'finance',
    title: 'Gericht kippt die Eingruppierung',
    briefing: 'Beschäftigte der Stadt bekommen rückwirkend eine höhere Entgeltgruppe zugesprochen. Die Nachzahlung trifft den Haushalt sofort.',
    urgency: 'breaking',
    trigger: { earliestMonth: 16, latestMonth: 128, conditions: [{ metric: 'employment', operator: '>', value: 70.5 }], baseWeight: 5, cooldownMonths: 54, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -12, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Der Kreis holt sich die Umlage dort, wo etwas zu holen ist.
    id: 'fin-shock-levy',
    kind: 'incident',
    category: 'finance',
    title: 'Kreisumlage steigt rückwirkend',
    briefing: 'Der Kreis erhöht die Umlage und stellt sie für das laufende Jahr nach. Die Stadt hat kein Mitspracherecht, nur eine Rechnung.',
    urgency: 'important',
    trigger: { earliestMonth: 8, latestMonth: 130, conditions: [{ metric: 'cityBudget', operator: '>', value: 110 }], baseWeight: 7, cooldownMonths: 26, oncePerCampaign: false },
    immediateEffects: [effect({ target: 'cityBudget', expected: -8, delayMonths: 0, rampMonths: 1, confidence: 'high' })],
    options: [],
    expiresInMonths: 0,
    sourceIds: MODEL,
  },
  {
    schemaVersion: 1,
    // Ein Sturm deckt ab, was ohnehin undicht war.
    id: 'fin-shock-storm',
    kind: 'incident',
    category: 'finance',
    title: 'Sturm deckt Schulen und Hallen ab',
    briefing: 'Eine Novemberböe reißt Dächer von zwei Schulen und der Sporthalle Nord. Der Eigenanteil übersteigt die Rücklage für Gebäudeschäden.',
    urgency: 'important',
    trigger: { earliestMonth: 6, latestMonth: 130, conditions: [{ metric: 'investmentBacklog', operator: '>', value: 35 }], baseWeight: 7, cooldownMonths: 30, oncePerCampaign: false },
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
