/**
 * Die vier Größen der Lage, als Schlüssel.
 *
 * Sie stehen hier und nicht in `metrics.ts`, weil sie nicht die Stadt beschreiben, sondern die Welt
 * über ihr — und weil ein Ereignis auf beide schauen darf, ohne dass daraus dieselbe Sorte Zahl wird.
 */
export type SituationKey = 'gasPrice' | 'economy' | 'federalFunds' | 'migrationPressure'
