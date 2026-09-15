import type { EvidenceReference, PolicyDefinition } from '../core/contracts'

export const EVIDENCE: EvidenceReference[] = [
  {
    id: 'vertical-slice-model-v1',
    publisher: '2036 Simulation Lab',
    title: 'Vertical-Slice-Modellannahmen',
    url: '/docs/DATA_SOURCES.md',
    publishedAt: '2026-09-11',
    accessedAt: '2026-09-11',
    claimType: 'effect',
    applicability: 'Fiktive Modellwerte für den spielbaren Prototyp; keine reale Prognose.',
  },
]

export const POLICIES: PolicyDefinition[] = [
  {
    id: 'housing-accelerator',
    name: 'Wohnungsbau-Turbo',
    summary: 'Mehr kommunaler Wohnungsbau und schnellere Genehmigungen entlasten den Markt – mit hoher Anfangsinvestition.',
    category: 'housing',
    jurisdiction: 'municipal',
    implementationCost: 28,
    monthlyCost: 1.4,
    // Ein Bauprogramm über sechs Jahre. Die Wohnungen bleiben, das Programm läuft aus.
    costMonths: 72,
    administrativeLoad: 22,
    axes: { growthVsPreservation: -0.6, marketVsPublic: -0.6, redistribution: 0.5, fiscalRestraint: -0.6 },
    salience: { growthVsPreservation: 0.9, marketVsPublic: 0.8, redistribution: 0.6, fiscalRestraint: 0.9 },
    effects: [
      // Buys construction starts, not finished flats: the pipeline needs ~22 months to deliver.
      { target: 'unitsUnderConstruction', mode: 'rate', delayMonths: 2, rampMonths: 10, min: 55, expected: 110, max: 150, confidence: 'medium' },
      { target: 'socialUnits', mode: 'level', delayMonths: 20, rampMonths: 16, min: 240, expected: 480, max: 700, confidence: 'medium' },
    ],
    sourceIds: ['vertical-slice-model-v1'],
  },
  {
    id: 'transit-network',
    name: 'LindenTakt 2030',
    summary: 'Dichterer Takt, neue Busachsen und Vorrangschaltungen verbessern Erreichbarkeit und Luftqualität.',
    category: 'transport',
    jurisdiction: 'municipal',
    implementationCost: 19,
    monthlyCost: 1.9,
    administrativeLoad: 18,
    axes: { climateAmbition: 0.6, marketVsPublic: -0.5, fiscalRestraint: -0.4, growthVsPreservation: -0.2 },
    salience: { climateAmbition: 0.9, marketVsPublic: 0.6, fiscalRestraint: 0.8 },
    effects: [
      { target: 'transitCapacity', mode: 'level', delayMonths: 1, rampMonths: 14, min: 7, expected: 12, max: 16, confidence: 'medium' },
    ],
    sourceIds: ['vertical-slice-model-v1'],
  },
  {
    id: 'business-tax-balance',
    name: 'Gewerbesteuer-Pakt',
    summary: 'Fünf Jahre niedrigerer Hebesatz sollen Ansiedlungen auslösen. Die Betriebe bleiben, die Senkung läuft aus.',
    category: 'tax',
    jurisdiction: 'municipal',
    implementationCost: 4,
    // Ein Hebesatz von 450 auf 400 Punkte kostet gut ein Zehntel eines Aufkommens von rund
    // 133 Mio. € im Jahr. Fünf Jahre lang; was in dieser Zeit angesiedelt wurde, zahlt danach voll.
    monthlyCost: 1.2,
    costMonths: 60,
    administrativeLoad: 8,
    axes: { marketVsPublic: 0.7, fiscalRestraint: 0.2, redistribution: -0.5 },
    salience: { marketVsPublic: 0.9, redistribution: 0.7, fiscalRestraint: 0.7 },
    effects: [
      { target: 'businessSites', mode: 'level', delayMonths: 4, rampMonths: 18, min: 180, expected: 420, max: 700, confidence: 'low' },
    ],
    sourceIds: ['vertical-slice-model-v1'],
  },
]

export function getPolicy(policyId: string): PolicyDefinition | undefined {
  return POLICIES.find(policy => policy.id === policyId)
}
