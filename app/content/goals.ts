import type { CampaignGoalDefinition } from '../core/contracts'

/**
 * Woran ein Jahrzehnt gemessen wird.
 *
 * Drei davon legst du beim Antritt fest, und im Dezember 2036 gelten sie oder nicht. Sie sind die
 * Wertung, die das Spiel bis dahin nicht hatte: man konnte sparsam oder verschwenderisch regieren,
 * und nichts sagte einem, ob man gewonnen hat.
 *
 * **Jede Schwelle ist nachgerechnet, nicht geschätzt.** Der vorherige Katalog stand in
 * `GAME_DESIGN.md` als Wunschzettel, und sieben seiner zehn Ziele waren über zehn Durchläufe hinweg
 * nicht einmal annähernd erreichbar — „Beschäftigung über 75 %" gegen einen Höchstwert von 74,1,
 * „Ohne Wohnung unter 300" gegen eine Zahl, die sich in jedem Lauf verdreifacht. Die Werte hier
 * kommen aus sechs Parteien mal acht Spielweisen, und jede Schwelle liegt bei rund 85 % der
 * gemessenen Spanne: anspruchsvoll, erreichbar, und nur mit Absicht zu schaffen.
 *
 * `tests/unit/goals.test.ts` misst dasselbe bei jedem Lauf nach und schlägt an, wenn ein Ziel
 * unmöglich oder geschenkt wird — Inhalt verschiebt die Spannen, und das soll auffallen.
 */
export const CAMPAIGN_GOALS: CampaignGoalDefinition[] = [
  {
    id: 'affordable-rent',
    field: 'housing',
    name: 'Bezahlbare Mieten',
    metric: 'averageRent',
    direction: 'below',
    threshold: 12.6,
    unit: ' €/m²',
    decimals: 2,
    promise: 'Die durchschnittliche Angebotsmiete liegt unter 12,60 €/m².',
  },
  {
    id: 'bound-stock',
    field: 'housing',
    name: 'Gebundener Wohnraum',
    metric: 'socialUnits',
    direction: 'above',
    threshold: 7200,
    unit: ' Wohnungen',
    decimals: 0,
    promise: 'Mindestens 7.200 Wohnungen stehen unter Preisbindung. Bindungen laufen von selbst aus – das hier ist eine Aufholjagd.',
  },
  {
    id: 'nobody-outside',
    field: 'housing',
    name: 'Ein Dach über dem Kopf',
    metric: 'homelessPeople',
    direction: 'below',
    threshold: 900,
    unit: ' Menschen',
    decimals: 0,
    promise: 'Weniger als 900 Menschen sind ohne Wohnung. In einer Stadt, die nichts tut, werden es fast zweitausend.',
  },
  {
    id: 'work',
    field: 'employment',
    name: 'Arbeit in der Stadt',
    metric: 'employment',
    direction: 'above',
    threshold: 75,
    unit: ' %',
    decimals: 1,
    promise: 'Die Beschäftigungsquote liegt über 75 %.',
  },
  {
    id: 'firms',
    field: 'employment',
    name: 'Ein Standort, der trägt',
    metric: 'businessStock',
    direction: 'above',
    threshold: 7000,
    unit: ' Betriebe',
    decimals: 0,
    promise: 'Mindestens 7.000 Betriebe sind in Lindenhafen ansässig.',
  },
  {
    id: 'balanced-books',
    field: 'fiscalHealth',
    name: 'Ein Haushalt, der aufgeht',
    metric: 'monthlyBalance',
    direction: 'above',
    threshold: 0,
    unit: ' Mio. €/Monat',
    decimals: 1,
    promise: 'Die Stadt nimmt im letzten Monat mehr ein, als sie ausgibt.',
  },
  {
    id: 'no-backlog',
    field: 'fiscalHealth',
    name: 'Kein Sanierungsstau',
    metric: 'investmentBacklog',
    direction: 'below',
    threshold: 45,
    unit: ' Mio. €',
    decimals: 0,
    promise: 'Der aufgelaufene Sanierungsstau liegt unter 45 Mio. €.',
  },
  {
    id: 'safe-streets',
    field: 'cohesion',
    name: 'Sichere Straßen',
    metric: 'crimeRate',
    direction: 'below',
    threshold: 42,
    unit: ' / 1.000',
    decimals: 0,
    promise: 'Weniger als 42 Straftaten je 1.000 Einwohner im Jahr.',
  },
  {
    id: 'childcare',
    field: 'cohesion',
    name: 'Ein Platz für jedes Kind',
    metric: 'childcareCoverage',
    direction: 'above',
    threshold: 100,
    unit: ' % des Anspruchs',
    decimals: 0,
    promise: 'Die Stadt deckt den Rechtsanspruch auf einen Kitaplatz vollständig.',
  },
  {
    id: 'green-city',
    field: 'climate',
    name: 'Grüne Stadt',
    metric: 'greenSpacePerCapita',
    direction: 'above',
    threshold: 24,
    unit: ' m²/Kopf',
    decimals: 1,
    promise: 'Jeder Einwohnerin stehen über 24 m² öffentliches Grün zur Verfügung.',
  },
  {
    id: 'lower-emissions',
    field: 'climate',
    name: 'Weniger Emissionen',
    metric: 'emissions',
    direction: 'below',
    threshold: 44.5,
    unit: '',
    decimals: 1,
    promise: 'Der Emissionsindex liegt unter 44,5.',
  },
  {
    id: 'reliable-transit',
    field: 'mobility',
    name: 'Ein Nahverkehr, auf den Verlass ist',
    metric: 'transitReliability',
    direction: 'above',
    threshold: 90,
    unit: ' %',
    decimals: 0,
    promise: 'Neun von zehn Fahrten sind pünktlich.',
  },
]

export function getGoal(goalId: string): CampaignGoalDefinition | undefined {
  return CAMPAIGN_GOALS.find(goal => goal.id === goalId)
}

/** Ob das Ziel mit diesen Kennzahlen erfüllt ist. Die einzige Stelle, die das entscheidet. */
export function goalIsMet(goal: CampaignGoalDefinition, value: number): boolean {
  return goal.direction === 'above' ? value > goal.threshold : value < goal.threshold
}
