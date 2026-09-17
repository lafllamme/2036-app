import type { DistrictId, DistrictType } from '../core/contracts'
import { LINDENHAFEN } from '../world/model/lindenhafen'

/**
 * Dieselbe Zahl, über zwanzig Viertel verteilt.
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
 * dafür sorgen, dass die Viertel von Anfang an nicht austauschbar sind.
 *
 * ## Warum das an der Art hängt und nicht am Namen
 *
 * Es waren drei Tabellen mit je acht Zeilen, von Hand geschrieben. Mit zwanzig Vierteln wären es
 * sechzig Zahlen, von denen fünfzig aus derselben Überlegung folgen — „Gründerzeit ist teurer als
 * eine Zeile" steht dann viermal da und kann viermal verschieden ausfallen. Hier steht es einmal je
 * Archetyp, und ein Viertel erbt es.
 *
 * Die Zahlen sind Faktoren um eins und müssen es **nicht** treffen: `normalise` zieht sie auf ein
 * gewichtetes Mittel von exakt eins, sobald die Einwohnerzahlen dazukommen. Was hier zählt, ist
 * allein das Verhältnis untereinander.
 */
const GRADIENT: Record<DistrictType, { rent: number, burglary: number, vacancy: number }> = {
  'historic-core': { rent: 1.36, burglary: 1.18, vacancy: 0.8 },
  'civic-green': { rent: 1.3, burglary: 0.68, vacancy: 0.72 },
  'dense-residential': { rent: 1.08, burglary: 1.24, vacancy: 0.9 },
  'regenerated-docks': { rent: 1.16, burglary: 0.8, vacancy: 1.24 },
  'mixed-transit': { rent: 1.12, burglary: 1.34, vacancy: 1.12 },
  'mixed-quarter': { rent: 1, burglary: 1.12, vacancy: 1.02 },
  'mixed-fair': { rent: 0.96, burglary: 1.08, vacancy: 1.08 },
  'residential': { rent: 1, burglary: 1, vacancy: 0.96 },
  'civic-campus': { rent: 1.02, burglary: 0.72, vacancy: 1 },
  'garden-suburb': { rent: 0.94, burglary: 0.76, vacancy: 0.86 },
  'post-war-estate': { rent: 0.82, burglary: 1.06, vacancy: 1.2 },
  'industrial': { rent: 0.76, burglary: 0.64, vacancy: 1.62 },
  'fringe': { rent: 0.72, burglary: 0.6, vacancy: 1.44 },
}

/**
 * Wie stark der Pflegezustand das Gefälle noch einmal spreizt.
 *
 * **Ohne das ist der Archetyp zu viel des Guten.** Vier Gründerzeitviertel bekamen exakt denselben
 * Faktor und damit auf die Kommastelle dieselbe Miete — 13,68 € in der Neustadt, in Westerfeld, in
 * Lindentor —, und in der Kartenansicht waren drei der zwanzig Flächen unsichtbar, weil eine
 * Abweichung von null nichts einfärbt. Zwanzig Viertel mit dreizehn verschiedenen Werten sind keine
 * zwanzig Viertel.
 *
 * `upkeep` ist die Zahl, die ein Viertel als Ort von seinem Archetyp unterscheidet, und sie ist
 * genau die richtige: gepflegter Bestand ist teurer, vernachlässigter wird häufiger aufgebrochen und
 * steht öfter leer. Sie läuft über 0,42 bis 0,90 und spreizt damit um ±10 % um die Mitte — genug,
 * dass Lindentor und Westerfeld auf der Karte verschiedene Viertel sind, und wenig genug, dass der
 * Archetyp die Aussage bleibt.
 */
const UPKEEP_PIVOT = 0.7
const UPKEEP_SPREAD: Record<'rent' | 'burglary' | 'vacancy', number> = { rent: 0.42, burglary: -0.55, vacancy: -0.6 }

/** Je Kennzahl der Faktorensatz über alle Viertel: die Art, um den Pflegezustand gedreht. */
function gradientOf(reading: 'rent' | 'burglary' | 'vacancy'): DistrictShare {
  return Object.fromEntries(
    LINDENHAFEN.districts.map(district => [
      district.id,
      GRADIENT[district.type][reading] * (1 + (district.upkeep - UPKEEP_PIVOT) * UPKEEP_SPREAD[reading]),
    ]),
  ) as DistrictShare
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
    averageRent: normalise(gradientOf('rent')),
    burglaryRate: normalise(gradientOf('burglary')),
    vacantUnits: normalise(gradientOf('vacancy')),
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
