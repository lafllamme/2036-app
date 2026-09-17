import type { HotspotKind, HotspotTemplate } from '../content/hotspots'
import type { CityMetrics, DistrictId } from '../core/contracts'
import type { RandomStream } from '../core/rng'
import { HOTSPOTS, hotspotTemplate } from '../content/hotspots'

/**
 * Brennpunkte: die zweite Uhr.
 *
 * Der Rat tickt in Monaten und in der ganzen Stadt. Ein Brennpunkt tickt genauso schnell, aber an
 * **einem Ort**, und er wird nicht beschlossen, sondern beantwortet — mit Mitteln, die man hat, statt
 * mit einer Mehrheit, die man sich holen muss. Das ist das Stockwerk, das zwischen „nichts zu tun"
 * und „Ratssitzung" gefehlt hat.
 *
 * ## Wie er entsteht
 *
 * Aus der Kennzahl, die ihn trägt, und aus nichts sonst. Steht `burglaryRate` auf ihrem Ausgangswert,
 * passiert fast nie etwas; steigt sie, häufen sich die Serien. Kein fester Würfel, keine eigene
 * Wahrscheinlichkeit — dieselbe Regel wie für alles andere in `docs/CITY_LIFE.md`: **nichts hier hat
 * eine eigene Zahl.**
 *
 * ## Und warum er eskaliert
 *
 * Ein Brennpunkt, den man ignorieren kann, ist keiner. Jeder Monat ohne Antwort hebt den Pegel um
 * eins; auf der letzten Stufe kippt er, und dann kostet er einmalig und spürbar. Das ist die ganze
 * Drohung, und sie ist nötig, damit „später" eine Entscheidung ist und keine Selbstverständlichkeit.
 */

/** Ab hier kippt der Brennpunkt. Vier Stufen sind vier Monate Bedenkzeit — genug, nicht großzügig. */
export const TIPPING_LEVEL = 4

export interface Hotspot {
  id: string
  kind: HotspotKind
  districtId: DistrictId
  /** 1 bis `TIPPING_LEVEL`. Steigt jeden Monat ohne Antwort. */
  level: number
  openedMonth: number
  /** Die laufende Antwort, wenn eine läuft, und bis wann. */
  answer: { id: string, until: number } | null
}

/**
 * Wie wahrscheinlich in diesem Monat ein Brennpunkt dieser Art aufmacht.
 *
 * Linear zwischen „ruhig" und „laut", gedeckelt. Bei der Einbruchserie heißt das: auf dem
 * Ausgangswert von etwa 9 Einbrüchen je 1.000 passiert nichts, bei 22 kommt im Schnitt alle drei
 * Monate eine. Wer die Ordnungsbehörde zusammenstreicht, bekommt sie häufiger — und das ist der Sinn.
 */
const MOST = 0.34

export function chanceOf(template: HotspotTemplate, metrics: CityMetrics): number {
  const value = metrics[template.driver]
  if (typeof value !== 'number' || value <= template.quiet)
    return 0
  return Math.min(MOST, MOST * ((value - template.quiet) / Math.max(1, template.loud - template.quiet)))
}

/**
 * Was diesen Monat aufmacht — höchstens einer, und nie zweimal dasselbe Viertel.
 *
 * Höchstens einer, weil zwei gleichzeitige Brennpunkte in einem Monat, in dem ohnehin ein Ereignis
 * gezogen wird, aus dem Stockwerk darunter ein Gedränge machen. Und nie dasselbe Viertel, weil zwei
 * Einbruchserien in der Neustadt dieselbe Serie sind.
 */
export function openHotspot(
  open: Hotspot[],
  metrics: CityMetrics,
  month: number,
  rng: RandomStream,
): Hotspot | null {
  const taken = new Set(open.map(spot => spot.districtId))
  for (const template of HOTSPOTS) {
    if (rng.next() >= chanceOf(template, metrics))
      continue
    const free = template.districts.filter(id => !taken.has(id))
    if (free.length === 0)
      continue
    const districtId = free[Math.min(free.length - 1, Math.floor(rng.next() * free.length))]!
    return { id: `${template.kind}-${districtId}-${month}`, kind: template.kind, districtId, level: 1, openedMonth: month, answer: null }
  }
  return null
}

export interface HotspotStep {
  open: Hotspot[]
  /** Die, die diesen Monat gekippt sind. Ihr Preis wird woanders gebucht. */
  tipped: Hotspot[]
}

/**
 * Einen Monat weiter: laufende Antworten auslaufen lassen, Pegel heben, Gekippte aussortieren.
 *
 * Ein Brennpunkt mit laufender Antwort steigt nicht — das ist der Unterschied zwischen „ich habe
 * etwas getan" und „ich habe es weggeklickt". Läuft die Antwort aus und der Pegel ist bei null,
 * schließt er sich; ist er es nicht, geht es weiter, wo es aufgehört hat.
 */
export function stepHotspots(open: Hotspot[], month: number): HotspotStep {
  const next: Hotspot[] = []
  const tipped: Hotspot[] = []

  for (const spot of open) {
    const answer = spot.answer && spot.answer.until > month ? spot.answer : null
    if (answer) {
      next.push({ ...spot, answer })
      continue
    }
    const level = spot.level + 1
    if (level > TIPPING_LEVEL) {
      tipped.push(spot)
      continue
    }
    next.push({ ...spot, level, answer: null })
  }

  return { open: next, tipped }
}

/**
 * Eine Antwort geben.
 *
 * Gibt zurück, was es kostet und was aus dem Brennpunkt wird — das Buchen erledigt das Modell, weil
 * nur dort der Haushalt steht. Eine Antwort, die den Pegel unter eins drückt, beendet die Lage: das
 * Problem ist weg, nicht bloß gedeckelt.
 */
export interface Answered {
  open: Hotspot[]
  cost: number
  monthly: number
  months: number
  /** Ob die Lage damit erledigt ist. */
  closed: boolean
}

export function answerHotspot(open: Hotspot[], id: string, answerId: string, month: number, allowed: (policyId: string) => boolean): Answered | null {
  const spot = open.find(entry => entry.id === id)
  if (!spot || spot.answer)
    return null
  const answer = hotspotTemplate(spot.kind).answers.find(entry => entry.id === answerId)
  if (!answer || (answer.needsPolicy && !allowed(answer.needsPolicy)))
    return null

  const level = spot.level - answer.relief
  const closed = level < 1
  const rest = open.filter(entry => entry.id !== id)

  return {
    open: closed ? rest : [...rest, { ...spot, level, answer: answer.months > 0 ? { id: answerId, until: month + answer.months } : null }],
    cost: answer.cost,
    monthly: answer.monthly,
    months: answer.months,
    closed,
  }
}
