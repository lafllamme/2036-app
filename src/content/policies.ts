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
    administrativeLoad: 22,
    effects: [
      { metric: 'housingUnits', delayMonths: 2, rampMonths: 10, min: 55, expected: 110, max: 150, confidence: 'medium' },
      { metric: 'averageRent', delayMonths: 8, rampMonths: 14, min: -1.8, expected: -1.1, max: -0.4, confidence: 'low' },
      { metric: 'satisfaction', delayMonths: 5, rampMonths: 9, min: 0.08, expected: 0.16, max: 0.24, confidence: 'medium' },
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
    effects: [
      { metric: 'transitCoverage', delayMonths: 1, rampMonths: 12, min: 0.18, expected: 0.32, max: 0.45, confidence: 'medium' },
      { metric: 'emissions', delayMonths: 5, rampMonths: 16, min: -0.22, expected: -0.14, max: -0.06, confidence: 'low' },
      { metric: 'satisfaction', delayMonths: 3, rampMonths: 10, min: 0.05, expected: 0.12, max: 0.2, confidence: 'medium' },
    ],
    sourceIds: ['vertical-slice-model-v1'],
  },
  {
    id: 'business-tax-balance',
    name: 'Gewerbesteuer-Pakt',
    summary: 'Eine zeitlich begrenzte Senkung soll Investitionen auslösen, verringert aber zunächst die Einnahmen.',
    category: 'tax',
    jurisdiction: 'municipal',
    implementationCost: 4,
    monthlyCost: 2.4,
    administrativeLoad: 8,
    effects: [
      { metric: 'employment', delayMonths: 4, rampMonths: 14, min: 0.025, expected: 0.055, max: 0.09, confidence: 'low' },
      { metric: 'satisfaction', delayMonths: 7, rampMonths: 10, min: -0.04, expected: 0.04, max: 0.12, confidence: 'low' },
    ],
    sourceIds: ['vertical-slice-model-v1'],
  },
]

export function getPolicy(policyId: string): PolicyDefinition | undefined {
  return POLICIES.find((policy) => policy.id === policyId)
}
