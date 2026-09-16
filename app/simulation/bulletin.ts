import type { CityMetrics, NewsItem } from '../core/contracts'
import type { SituationState } from './situation'
import { formatNumber } from '../core/format'
import { vacancyRate } from './baseline'

/**
 * Was die Stadt zwischen zwei Ratssitzungen zu berichten hat.
 *
 * Lindenhafen hatte ein Taktproblem, und es war messbar: 48 Ereignisse auf 132 Monate, also eines
 * alle 2,7 Monate. Dazwischen passierte nichts, was der Spieler erfuhr — und weil ein Monat fünf
 * reale Minuten dauert, saß er bis zu dreizehn Minuten vor einer Stadt, die ihm nichts sagte. Der
 * naheliegende Ausweg wäre gewesen, mehr Vorlagen zu schreiben. Das ist der falsche: eine Vorlage
 * braucht Optionen, Kosten, Achsen und Fraktionspositionen, und vierhundert davon schreibt niemand.
 *
 * **Was täglich passiert, muss gemeldet und nicht entschieden werden.** Und dafür muss nichts
 * erfunden werden: die Simulation rechnet jeden Monat dreißig Kennzahlen neu, und jede Bewegung
 * darin ist eine Nachricht. Die Miete ist gestiegen, der Leerstand gefallen, die Kriminalität
 * gesprungen, der Gaspreis hat sich verdoppelt. Das steht alles längst im Zustand — es hat nur nie
 * jemand vorgelesen.
 *
 * Jede Zeile hier ist damit ein **Ablesen und nie ein Stellen**. Es gibt keinen Regler „mehr
 * Meldungen": was gemeldet wird, ist, was sich bewegt hat, und die einzige Art, andere Meldungen zu
 * bekommen, ist, die Stadt anders zu regieren. Dieselbe Einbahnstraße wie bei allem, was der
 * Renderer liest — siehe `docs/CITY_LIFE.md`.
 */

/**
 * Wie viele Meldungen ein Monat höchstens bekommt.
 *
 * Nicht alle, die etwas zu melden hätten, sondern die auffälligsten. Ein Monat, in dem sich alles ein
 * bisschen bewegt, ist kein Monat mit dreißig Schlagzeilen — er ist ein ruhiger Monat, und der soll
 * sich auch so lesen. Gemeldet wird nach Auffälligkeit, und die ist für jede Kennzahl an ihrer
 * eigenen Spanne gemessen, damit sich Promille Kriminalität und Millionen Euro vergleichen lassen.
 */
const PER_MONTH = 4
/** Ab welcher Auffälligkeit etwas überhaupt erwähnenswert ist, gemessen in eigenen Spannen. */
const WORTH_SAYING = 0.5
/**
 * Ab welcher Auffälligkeit es oben auf der Leiste steht statt nur durchzulaufen.
 *
 * Nachgemessen und nach oben korrigiert: bei 1,4 und 2,6 kamen **115 Eilmeldungen je Kampagne**
 * heraus, also fast eine im Monat. Eine Eilmeldung, die jeden Monat kommt, ist keine — sie ist eine
 * Schriftgröße. Eine Kennzahl muss jetzt das Vierfache ihrer üblichen Monatsbewegung machen, bevor
 * sie oben steht.
 */
const NOTABLE = 2.2
const BREAKING = 4.5

interface Watcher {
  id: string
  /** Der Wert, um den es geht — und die Spanne, an der seine Bewegung gemessen wird. */
  read: (metrics: CityMetrics) => number
  scale: number
  /** Ob eine Bewegung nach oben gut oder schlecht ist. Null heißt: es kommt darauf an. */
  headline: (value: number, delta: number) => string
}

/**
 * Die Kennzahlen, die etwas sagen, wenn sie sich bewegen — und ihre Spannen.
 *
 * `scale` ist die monatliche Bewegung, ab der eine Zahl *erwähnenswert* ist; sie stammt aus den
 * gemessenen Spannen über acht durchgespielte Kampagnen und nicht aus dem Gefühl. Die Miete bewegt
 * sich in elf Jahren zwischen 11,50 und 14,90 €, also sind zwei Cent im Monat nichts und zehn viel.
 */
const WATCHERS: Watcher[] = [
  {
    id: 'rent',
    read: metrics => metrics.averageRent,
    scale: 0.06,
    headline: (value, delta) => `WOHNUNGSMARKT: Angebotsmiete ${delta > 0 ? 'steigt auf' : 'fällt auf'} ${formatNumber(value, 2)} €/m²`,
  },
  {
    id: 'vacancy',
    read: metrics => vacancyRate(metrics) * 100,
    scale: 0.18,
    headline: (value, delta) => `WOHNUNGSMARKT: Leerstand ${delta > 0 ? 'zieht an auf' : 'sinkt auf'} ${formatNumber(value, 1)} %`,
  },
  {
    id: 'homeless',
    read: metrics => metrics.homelessPeople,
    scale: 34,
    headline: (value, delta) => delta > 0
      ? `SOZIALES: ${formatNumber(value)} Menschen ohne Wohnung, ${formatNumber(delta)} mehr als im Vormonat`
      : `SOZIALES: ${formatNumber(-delta)} Menschen weniger auf der Straße, jetzt ${formatNumber(value)}`,
  },
  {
    id: 'crime',
    read: metrics => metrics.crimeRate,
    scale: 0.42,
    headline: (value, delta) => `POLIZEISTATISTIK: ${formatNumber(value)} Straftaten je 1.000, ${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} zum Vormonat`,
  },
  {
    id: 'burglary',
    read: metrics => metrics.burglaryRate,
    scale: 0.05,
    headline: (value, delta) => `POLIZEISTATISTIK: Wohnungseinbrüche ${delta > 0 ? 'nehmen zu' : 'gehen zurück'} — ${formatNumber(value, 1)} je 1.000 Haushalte`,
  },
  {
    id: 'employment',
    read: metrics => metrics.employment,
    scale: 0.11,
    headline: (value, delta) => `ARBEITSMARKT: Beschäftigungsquote ${formatNumber(value, 1)} %, ${delta > 0 ? '+' : ''}${formatNumber(delta, 2)} Punkte`,
  },
  {
    id: 'youth',
    read: metrics => metrics.youthUnemployment,
    scale: 0.16,
    headline: (value, delta) => `ARBEITSMARKT: Jugendarbeitslosigkeit ${delta > 0 ? 'steigt auf' : 'fällt auf'} ${formatNumber(value, 1)} %`,
  },
  {
    id: 'business',
    read: metrics => metrics.businessStock,
    scale: 22,
    headline: (value, delta) => delta > 0
      ? `WIRTSCHAFT: ${formatNumber(delta)} Gewerbeanmeldungen, Bestand ${formatNumber(value)} Betriebe`
      : `WIRTSCHAFT: ${formatNumber(-delta)} Betriebe abgemeldet, Bestand ${formatNumber(value)}`,
  },
  {
    id: 'construction',
    read: metrics => metrics.unitsUnderConstruction,
    scale: 40,
    headline: (value, delta) => delta > 0
      ? `BAUAMT: ${formatNumber(delta)} Wohnungen neu im Bau, ${formatNumber(value)} insgesamt`
      : `BAUAMT: ${formatNumber(-delta)} Wohnungen fertiggestellt`,
  },
  {
    id: 'school',
    read: metrics => metrics.schoolUtilisation,
    scale: 0.5,
    headline: (value, delta) => value > 100
      ? `SCHULAMT: Auslastung ${formatNumber(value, 1)} % — die Züge sind über Soll`
      : `SCHULAMT: Auslastung ${formatNumber(value, 1)} %, ${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} Punkte`,
  },
  {
    id: 'childcare',
    read: metrics => metrics.childcareCoverage,
    scale: 0.5,
    headline: (value, delta) => `JUGENDAMT: Betreuungsquote ${delta > 0 ? 'steigt auf' : 'fällt auf'} ${formatNumber(value, 1)} %`,
  },
  {
    id: 'transit',
    read: metrics => metrics.transitReliability,
    scale: 0.6,
    headline: (value, delta) => `NAHVERKEHR: Pünktlichkeit ${formatNumber(value, 1)} %, ${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} Punkte`,
  },
  {
    id: 'emissions',
    read: metrics => metrics.emissions,
    scale: 0.22,
    headline: (value, delta) => `UMWELTAMT: Emissionsindex ${formatNumber(value, 1)}, ${delta > 0 ? '+' : ''}${formatNumber(delta, 1)}`,
  },
  {
    id: 'green',
    read: metrics => metrics.greenSpacePerCapita,
    scale: 0.12,
    headline: (value, delta) => `GRÜNFLÄCHENAMT: ${formatNumber(value, 1)} m² je Kopf, ${delta > 0 ? '+' : ''}${formatNumber(delta, 2)}`,
  },
  {
    id: 'balance',
    read: metrics => metrics.monthlyBalance,
    scale: 2.4,
    headline: (value, _delta) => value >= 0
      ? `KÄMMEREI: Monatssaldo +${formatNumber(value, 1)} Mio. €`
      : `KÄMMEREI: Monatssaldo ${formatNumber(value, 1)} Mio. € — die Rücklage trägt es`,
  },
  {
    id: 'debt',
    read: metrics => metrics.debt,
    scale: 6,
    headline: (value, delta) => delta > 0
      ? `KÄMMEREI: Kassenkredite auf ${formatNumber(value)} Mio. €, ${formatNumber(delta, 1)} mehr`
      : `KÄMMEREI: ${formatNumber(-delta, 1)} Mio. € Kredite getilgt, Stand ${formatNumber(value)} Mio. €`,
  },
  {
    id: 'migration',
    read: metrics => metrics.netMigration,
    scale: 26,
    headline: (value, _delta) => value >= 0
      ? `EINWOHNERAMT: Wanderungssaldo +${formatNumber(value)} im Monat`
      : `EINWOHNERAMT: Wanderungssaldo ${formatNumber(value)} — mehr Fort- als Zuzüge`,
  },
  {
    id: 'polarisation',
    read: metrics => metrics.polarisation,
    scale: 0.7,
    headline: (value, delta) => delta > 0
      ? `STIMMUNGSBILD: Die Lager entfernen sich weiter voneinander (${formatNumber(value)})`
      : `STIMMUNGSBILD: Die Fronten weichen auf (${formatNumber(value)})`,
  },
]

/**
 * Und die Welt über der Stadt, die sich bisher stumm bewegt hat.
 *
 * Gemessen: 6,1 Schocks je Kampagne in Gaspreis, Konjunktur, Bundesmitteln und Zuwanderung — aber
 * nur 4,3 davon meldeten sich als Ereignis. Der Rest verschob still die Grundlagen, auf denen der
 * Spieler rechnete, und er erfuhr es allenfalls daran, dass seine Zahlen nicht mehr aufgingen.
 */
const WORLD: { id: keyof SituationState, scale: number, headline: (value: number, delta: number) => string }[] = [
  {
    id: 'gasPrice',
    scale: 5,
    headline: (value, delta) => delta > 0
      ? `ENERGIE: Beschaffungspreise ziehen an — Index ${formatNumber(value)}`
      : `ENERGIE: Beschaffungspreise geben nach — Index ${formatNumber(value)}`,
  },
  {
    id: 'economy',
    scale: 4,
    headline: (value, delta) => delta > 0
      ? `KONJUNKTUR: Die Lage hellt sich auf — Index ${formatNumber(value)}`
      : `KONJUNKTUR: Die Lage trübt sich ein — Index ${formatNumber(value)}`,
  },
  {
    id: 'federalFunds',
    scale: 6,
    headline: (value, delta) => delta > 0
      ? `BUND: Mehr Mittel in den Programmen — Index ${formatNumber(value)}`
      : `BUND: Die Programme werden gekürzt — Index ${formatNumber(value)}`,
  },
  {
    id: 'migrationPressure',
    scale: 6,
    headline: (value, delta) => delta > 0
      ? `LAND: Die Zuweisungen steigen — Index ${formatNumber(value)}`
      : `LAND: Die Zuweisungen gehen zurück — Index ${formatNumber(value)}`,
  },
]

/**
 * Was dieser Monat zu melden hat, höchstens `PER_MONTH` Zeilen, die auffälligsten zuerst.
 *
 * Die Auffälligkeit ist die Bewegung geteilt durch die eigene Spanne der Kennzahl — nur so lassen
 * sich Cent Miete und Millionen Euro überhaupt nebeneinander sortieren. Was unter `WORTH_SAYING`
 * bleibt, sagt niemand; was über `BREAKING` liegt, steht oben.
 */
export function bulletin(
  month: number,
  metrics: CityMetrics,
  previous: CityMetrics,
  situation: SituationState,
  previousSituation: SituationState,
): NewsItem[] {
  const candidates: { weight: number, item: NewsItem }[] = []

  for (const watcher of WATCHERS) {
    const value = watcher.read(metrics)
    const delta = value - watcher.read(previous)
    const weight = Math.abs(delta) / watcher.scale
    if (!Number.isFinite(weight) || weight < WORTH_SAYING)
      continue
    candidates.push({
      weight,
      item: {
        id: `bulletin-${watcher.id}-${month}`,
        month,
        scope: 'city',
        urgency: weight >= BREAKING ? 'breaking' : weight >= NOTABLE ? 'important' : 'normal',
        headline: watcher.headline(value, delta),
      },
    })
  }

  for (const watcher of WORLD) {
    const value = situation[watcher.id]
    const delta = value - previousSituation[watcher.id]
    const weight = Math.abs(delta) / watcher.scale
    if (!Number.isFinite(weight) || weight < WORTH_SAYING)
      continue
    candidates.push({
      weight,
      item: {
        id: `bulletin-${watcher.id}-${month}`,
        month,
        // Die Welt ist nicht die Stadt, und das soll man der Meldung ansehen.
        scope: 'national',
        urgency: weight >= BREAKING ? 'breaking' : weight >= NOTABLE ? 'important' : 'normal',
        headline: watcher.headline(value, delta),
      },
    })
  }

  return candidates.sort((a, b) => b.weight - a.weight).slice(0, PER_MONTH).map(entry => entry.item)
}
