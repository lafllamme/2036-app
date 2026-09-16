import type { RandomStream } from '../core/rng'

/**
 * Die Lage: die Welt über der Stadt.
 *
 * Vier Größen, die du **nie direkt beantwortest**. Du beantwortest nie den Krieg — du beantwortest,
 * was er in Lindenhafen auslöst. Das ist der ehrliche Maßstab einer Kommune und zugleich der
 * spielbare.
 *
 * Bis hierher war Lindenhafen eine Stadt ohne Land und ohne Jahrzehnt: die Energiepreise, die
 * Konjunktur, die Förderpolitik des Bundes und der Zuwanderungsdruck kamen im Modell schlicht nicht
 * vor, und damit fühlten sich zehn Jahre an wie zehnmal dasselbe Jahr. Jede der vier ist ein Index
 * um 100 — 130 heißt dreißig Prozent über normal —, und sie tun zwei Dinge:
 *
 * 1. **Sie färben alles ein.** Teures Gas macht den Betrieb der Stadt teurer und die Emissionen
 *    hartnäckiger. Eine gute Konjunktur bringt Gewerbesteuer. Volle Bundestöpfe erhöhen die
 *    Zuweisungen. Hoher Zuwanderungsdruck bringt Menschen, die Wohnraum und Kurse brauchen.
 * 2. **Sie erzeugen städtische Ereignisse.** Gaspreis über der Schwelle, und im Rat liegt eine
 *    Vorlage zum Fernwärmeausbau. Rezession, und ein Werk schließt.
 *
 * Alles ist deterministisch aus dem Spielstand gezogen: dieselbe Kampagne ergibt dasselbe Jahrzehnt.
 */
export interface SituationState {
  /** Energiepreis, Index um 100. Teuer heißt Betrieb, Sanierung und Fernwärme kosten mehr. */
  gasPrice: number
  /** Konjunktur, Index um 100. Trägt den Gewerbesteueranteil und die Ansiedlungen. */
  economy: number
  /** Wie voll die Bundestöpfe sind, Index um 100. Trägt die Zuweisungen. */
  federalFunds: number
  /** Zuwanderungsdruck, Index um 100. Mehr Ankünfte, mehr Bedarf an Wohnraum und Kursen. */
  migrationPressure: number
}

export const BASELINE_SITUATION: SituationState = {
  gasPrice: 100,
  economy: 100,
  federalFunds: 100,
  migrationPressure: 100,
}

/**
 * Wie träge eine Weltgröße ist.
 *
 * `pull` zieht jeden Monat zum Normalwert zurück — die Welt kehrt zur Mitte zurück, nur langsam.
 * `walk` ist das monatliche Rauschen, `shock` die Wahrscheinlichkeit eines Sprungs und `jump` seine
 * Größe. Ein Gaspreisschock ist selten und heftig; die Konjunktur schwankt breit und stetig.
 */
interface Behaviour {
  pull: number
  walk: number
  shock: number
  jump: number
  floor: number
  ceiling: number
}

const BEHAVIOUR: Record<keyof SituationState, Behaviour> = {
  // Selten, dafür heftig: ein Lieferstopp verdoppelt den Preis und er bleibt zwei Jahre oben.
  gasPrice: { pull: 0.022, walk: 3.4, shock: 0.012, jump: 58, floor: 62, ceiling: 235 },
  // Der Konjunkturzyklus: breit, stetig, mit gelegentlichem Einbruch.
  economy: { pull: 0.03, walk: 2.6, shock: 0.016, jump: -34, floor: 68, ceiling: 132 },
  // Förderpolitik springt mit Haushaltsjahren und Regierungswechseln, in beide Richtungen.
  federalFunds: { pull: 0.045, walk: 4.2, shock: 0.02, jump: 40, floor: 55, ceiling: 160 },
  // Zuwanderung folgt Ereignissen weit außerhalb, die niemand in Lindenhafen beeinflusst.
  migrationPressure: { pull: 0.025, walk: 3.8, shock: 0.014, jump: 52, floor: 60, ceiling: 215 },
}

const KEYS = Object.keys(BEHAVIOUR) as (keyof SituationState)[]

/** Ein Monat Welt. Deterministisch aus dem Strom, den der Aufrufer mitbringt. */
export function stepSituation(previous: SituationState, stream: RandomStream): SituationState {
  const next = { ...previous }
  for (const key of KEYS) {
    const rule = BEHAVIOUR[key]
    const drift = (BASELINE_SITUATION[key] - previous[key]) * rule.pull
    const noise = (stream.next() - 0.5) * 2 * rule.walk
    // Ein Schock springt in die Richtung, die der Sache eigen ist — nach oben für Preise und
    // Zuwanderung, nach unten für die Konjunktur —, und das Vorzeichen bei Bundesmitteln ist offen.
    const shocked = stream.next() < rule.shock
    const direction = key === 'federalFunds' ? (stream.next() < 0.5 ? -1 : 1) : 1
    const jump = shocked ? rule.jump * direction : 0
    next[key] = Math.min(rule.ceiling, Math.max(rule.floor, previous[key] + drift + noise + jump))
  }
  return next
}

/** Der Index als Faktor um eins, gedämpft: 130 bei `0.5` heißt Faktor 1,15. */
export function factor(value: number, weight = 1): number {
  return 1 + ((value - 100) / 100) * weight
}

/** Wie die Lage in einem Satz klingt, für Leiste und Bericht. */
export function situationReading(situation: SituationState): { label: string, value: number, word: string }[] {
  const word = (value: number, high: string, low: string, normal: string): string =>
    value > 118 ? high : value < 84 ? low : normal
  return [
    { label: 'Energiepreis', value: situation.gasPrice, word: word(situation.gasPrice, 'teuer', 'billig', 'normal') },
    { label: 'Konjunktur', value: situation.economy, word: word(situation.economy, 'Aufschwung', 'Rezession', 'stabil') },
    { label: 'Bundesmittel', value: situation.federalFunds, word: word(situation.federalFunds, 'reichlich', 'knapp', 'normal') },
    { label: 'Zuwanderung', value: situation.migrationPressure, word: word(situation.migrationPressure, 'hoch', 'gering', 'normal') },
  ]
}
