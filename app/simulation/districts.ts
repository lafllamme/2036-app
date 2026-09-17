import type { DistrictId } from '../core/contracts'
import { LINDENHAFEN } from '../world/model/lindenhafen'

/**
 * Dieselbe Zahl, über acht Bezirke verteilt.
 *
 * Bis hierher galt jede Kennzahl für ganz Lindenhafen. Eine Einbruchserie in der Gründerzeit Nord
 * hob die Einbruchsrate **der Stadt**, und Wohnungsbau im Hafen senkte die Miete **überall** — also
 * genau so viel wie im Wohnring Süd, wo nicht gebaut wurde. Damit war jeder Ort austauschbar, und der
 * Standortbeschluss eine Frage von Preis und Tempo statt von Wirkung.
 *
 * ## Verteilung statt acht Simulationen
 *
 * Es wäre naheliegend, acht kleine Städte zu rechnen. Es wäre auch der Weg, auf dem man sich das
 * ganze Modell zerschießt: `goals.test.ts` hat heute zweimal gezeigt, wie eng die Zielschwellen
 * sitzen — die beste von 36 Durchspielungen kommt teils auf 0,2 an ihr Ziel heran. Acht parallel
 * driftende Teilstädte, deren Summe irgendwo landet, wären das Ende dieser Balance.
 *
 * Deshalb bleibt die **Stadtzahl die Wahrheit**, und die Bezirke sind ihre Verteilung: je Bezirk ein
 * Faktor um eins, gewichtet mit der Einwohnerzahl, und das gewichtete Mittel ist **immer exakt eins**.
 * Der Bezirkswert ist damit Stadtwert × Faktor. Verschiebt sich etwas an einem Ort, verschiebt es
 * sich woanders gegenläufig — die Summe kann gar nicht auseinanderlaufen, weil sie nicht gerechnet,
 * sondern erhalten wird.
 *
 * Das ist keine Notlösung, sondern die ehrlichere Aussage: eine Stadt hat eine Durchschnittsmiete,
 * und was ein Bezirk hat, ist seine Abweichung davon.
 */

export type DistrictShare = Record<DistrictId, number>

/** Wie viele Menschen in jedem Bezirk wohnen — das Gewicht, mit dem er in den Stadtwert eingeht. */
const WEIGHT = Object.fromEntries(
  LINDENHAFEN.districts.map(district => [district.id, district.population]),
) as Record<DistrictId, number>

const TOTAL = Object.values(WEIGHT).reduce((sum, people) => sum + people, 0)

/**
 * Das Gefälle, das eine Stadt von sich aus hat.
 *
 * Eine Altstadt ist teuer, ein Hafen billig, und eingebrochen wird dort, wo dicht gewohnt wird und
 * viele Fremde durchkommen. Das sind Konventionen, keine Messwerte — sie sollen plausibel sein und
 * dafür sorgen, dass die acht Bezirke von Anfang an nicht austauschbar sind.
 */
const RENT: Record<DistrictId, number> = {
  'innenstadt': 1.34,
  'bahnhof': 1.12,
  'gruenderzeit-nord': 1.06,
  'wohnring-sued': 1,
  'universitaet-klinikum': 1.02,
  'vorstadt-west': 0.92,
  'gewerbe-ost': 0.84,
  'hafen-industrie': 0.78,
}

const BURGLARY: Record<DistrictId, number> = {
  'bahnhof': 1.32,
  'gruenderzeit-nord': 1.24,
  'innenstadt': 1.18,
  'wohnring-sued': 1,
  'gewerbe-ost': 0.88,
  'vorstadt-west': 0.76,
  'universitaet-klinikum': 0.72,
  'hafen-industrie': 0.64,
}

const VACANCY: Record<DistrictId, number> = {
  'hafen-industrie': 1.62,
  'gewerbe-ost': 1.3,
  'bahnhof': 1.12,
  'universitaet-klinikum': 1,
  'wohnring-sued': 0.96,
  'gruenderzeit-nord': 0.9,
  'vorstadt-west': 0.86,
  'innenstadt': 0.8,
}

/** Die drei Kennzahlen, die je Bezirk gelten. Mehr wäre ein Umbau und kein Anfang. */
export const SPREAD_METRICS = ['averageRent', 'burglaryRate', 'vacantUnits'] as const
export type SpreadMetric = typeof SPREAD_METRICS[number]

export type Spread = Record<SpreadMetric, DistrictShare>

/**
 * Faktoren so skalieren, dass ihr gewichtetes Mittel exakt eins ist.
 *
 * Der Kern der ganzen Sache. Ohne diesen Schritt wäre die Summe der Bezirke nicht mehr die Stadt,
 * und dann hätte man zwei Wahrheiten — eine im Lagebild und eine auf der Karte.
 */
export function normalise(share: DistrictShare): DistrictShare {
  let mean = 0
  for (const [id, factor] of Object.entries(share) as [DistrictId, number][])
    mean += factor * (WEIGHT[id] / TOTAL)
  if (mean <= 0)
    return share
  return Object.fromEntries(
    (Object.entries(share) as [DistrictId, number][]).map(([id, factor]) => [id, factor / mean]),
  ) as DistrictShare
}

export function initialSpread(): Spread {
  return {
    averageRent: normalise({ ...RENT }),
    burglaryRate: normalise({ ...BURGLARY }),
    vacantUnits: normalise({ ...VACANCY }),
  }
}

/** Wie weit ein Bezirk höchstens vom Stadtschnitt abweichen darf. Zwei Welten in einer Stadt reichen. */
const FLOOR = 0.45
const CEILING = 2.2

/**
 * Einen Bezirk verschieben — und die anderen gegenläufig mit.
 *
 * `by` ist eine relative Änderung: 0,08 heißt acht Prozent teurer als bisher **in diesem Bezirk**.
 * Weil danach neu normiert wird, wird alles andere ein Stück billiger, und die Stadtmiete bleibt, was
 * die Dynamik gesagt hat. Genau das ist gemeint: Wohnungsbau an einem Ort verschiebt das Gefälle, er
 * baut nicht die Stadt neu.
 */
export function shift(share: DistrictShare, districtId: DistrictId, by: number): DistrictShare {
  const moved = { ...share }
  moved[districtId] = Math.min(CEILING, Math.max(FLOOR, (share[districtId] ?? 1) * (1 + by)))
  return normalise(moved)
}

/** Was in diesem Bezirk gilt: der Stadtwert, mit seinem Faktor. */
export function valueIn(cityValue: number, share: DistrictShare, districtId: DistrictId): number {
  return cityValue * (share[districtId] ?? 1)
}

/**
 * Und die Gegenprobe: das gewichtete Mittel aller Bezirke.
 *
 * Muss immer der Stadtwert sein. Steht hier, damit ein Test es fragen kann, und nicht, weil das
 * Modell es ausrechnen müsste — es ist die Eigenschaft, die die Konstruktion garantiert.
 */
export function cityFrom(share: DistrictShare, valueOf: (districtId: DistrictId) => number): number {
  let sum = 0
  for (const id of Object.keys(share) as DistrictId[])
    sum += valueOf(id) * (WEIGHT[id] / TOTAL)
  return sum
}
