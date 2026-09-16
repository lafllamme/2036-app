import type { LeaderBackgroundDefinition } from '../core/contracts'

/**
 * Wer du warst, bevor du Parteivorsitzende:r wurdest.
 *
 * Bis hierher wählte man eine Fraktion und war dann niemand — das Spiel sprach von „der eigenen
 * Partei" und nie von einem Menschen. Ein Werdegang gibt dem Antritt ein Gesicht und bringt mit,
 * was man aus dem vorigen Leben mitbringt: Verfahrenssicherheit, Verbindungen, ein Publikum.
 *
 * **Er verzweigt auf keine Partei.** Jeder Werdegang steht jeder Fraktion offen, und was er bewirkt,
 * ist für alle gleich — die Architekturregel gilt hier wie überall. Was sich unterscheidet, ist der
 * Mensch, nicht die Mathematik der Partei.
 */
export const LEADER_BACKGROUNDS: LeaderBackgroundDefinition[] = [
  {
    id: 'administration',
    name: 'Aus der Verwaltung',
    description: 'Zwölf Jahre im Rathaus, zuletzt Amtsleitung. Du kennst jede Frist und jede Vorlage, bevor sie geschrieben ist.',
    effect: 'Politisches Kapital wächst schneller.',
    capitalPerMonth: 1.7,
    startingRelationship: 0,
    startingCapital: 60,
  },
  {
    id: 'union',
    name: 'Aus der Gewerkschaft',
    description: 'Tarifrunden, Betriebsversammlungen, zwei Streiks. Du weißt, wie man einen Raum hinter sich bringt, in dem alle schon Nein gesagt haben.',
    effect: 'Alle Fraktionen starten dir wohlgesonnener.',
    capitalPerMonth: 1.1,
    startingRelationship: 0.18,
    startingCapital: 60,
  },
  {
    id: 'business',
    name: 'Aus der Wirtschaft',
    description: 'Ein mittelständischer Betrieb mit achtzig Beschäftigten, den es noch gibt. Du hast Haushalte gelesen, bevor du wusstest, dass sie so heißen.',
    effect: 'Du trittst mit mehr politischem Kapital an.',
    capitalPerMonth: 1.1,
    startingRelationship: 0,
    startingCapital: 78,
  },
  {
    id: 'grassroots',
    name: 'Aus der Bürgerinitiative',
    description: 'Eine Unterschriftensammlung, die niemand ernst nahm, und ein Bürgerentscheid, den ihr gewonnen habt. Die Stadt kennt dein Gesicht.',
    effect: 'Kampagnen kosten dich weniger Kapital.',
    capitalPerMonth: 1.1,
    startingRelationship: -0.05,
    startingCapital: 66,
    campaignDiscount: 6,
  },
]

export function getBackground(backgroundId: string): LeaderBackgroundDefinition | undefined {
  return LEADER_BACKGROUNDS.find(background => background.id === backgroundId)
}
