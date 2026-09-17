import type { BuildingRecord, BuildingType } from '../core/contracts'
import { citizenHash } from './citizens'

/**
 * Was im Erdgeschoss ist.
 *
 * Bis hierher war ein Haus in Lindenhafen ein Haus. Man konnte es anklicken und erfuhr seinen
 * Zustand und seine Auslastung — zwei Zahlen über ein Gebäude und nichts über einen **Ort**. Eine
 * Stadt besteht aber nicht aus Gebäuden, sondern aus Adressen, an denen etwas ist: ein Bäcker, eine
 * Praxis, ein Laden, der leer steht.
 *
 * Gebaut wie `citizens.ts` und aus demselben Grund: **nichts wird gespeichert.** Die Nutzung ist
 * eine reine Funktion aus der Gebäudenummer und dem Stadtkeim, also kostet sie nichts, bis jemand
 * hinsieht, und wer zweimal auf dasselbe Haus zeigt, bekommt zweimal dieselbe Antwort.
 *
 * ## Die eine Richtung, in die das laufen darf
 *
 * Der Einzelhandelsbestand (`businessStock`) entscheidet, **wie viele** Läden offen sind. Umgekehrt
 * nie: keine Kennzahl, kein Ereignis und kein Auslöser liest je, was in einem bestimmten Haus ist.
 * Die Nutzung ist Anschauung, so wie Herkunft und Beruf einer Figur Anschauung sind — sie macht eine
 * Zahl im Lagebild sichtbar, sie erzeugt sie nicht. `docs/CITY_LIFE.md` schreibt es unter „Und dasselbe
 * für das, was in den Häusern ist" fest.
 *
 * Genau das ist der Gewinn: sackt der Bestand, gehen **sichtbar** Läden zu und stehen leer. Eine
 * Zahl, an der man vorbeiliest, wird zu einem zugeklebten Schaufenster, an dem man vorbeigeht.
 */

export type Trade
  = | 'bakery' | 'butcher' | 'greengrocer' | 'kiosk' | 'snack' | 'cafe'
    | 'hairdresser' | 'beauty' | 'laundry' | 'tailor'
    | 'pharmacy' | 'doctor' | 'physio' | 'optician'
    | 'books' | 'flowers' | 'bicycles' | 'hardware'
    | 'bank' | 'insurance' | 'lawyer' | 'estate'
    | 'nursery' | 'workshop' | 'brewery'

export interface Tenancy {
  trade: Trade
  /** Was auf dem Schild steht. */
  label: string
  /** Wofür die Leute herkommen — für die Wege, die die Figuren später gehen. */
  errand: 'daily' | 'care' | 'service' | 'work'
  /** Offen, oder zugeklebt. Hängt am Einzelhandelsbestand, siehe oben. */
  open: boolean
}

interface Shop {
  trade: Trade
  label: string
  errand: Tenancy['errand']
  /**
   * Wie robust das Geschäft ist, 0 bis 1.
   *
   * Eine Apotheke und eine Kita überstehen eine Flaute, die einen Buchladen zumacht — nicht weil sie
   * besser wirtschaften, sondern weil man zum Arzt auch dann geht, wenn man spart. Der Wert
   * entscheidet, in welcher Reihenfolge die Läden aufgeben.
   */
  hardiness: number
}

/**
 * Was es in einer norddeutschen Kleinstadt an einer Geschäftsstraße gibt.
 *
 * Bewusst gewöhnlich. Eine Stadt lebt nicht von Besonderheiten, sondern davon, dass die zwanzig
 * Dinge da sind, die man jeden Tag braucht — und eine Liste, die mit Galerien und Concept Stores
 * anfängt, beschreibt keine Hafenstadt, sondern einen Wunsch.
 */
const SHOPS: Shop[] = [
  { trade: 'bakery', label: 'Bäckerei', errand: 'daily', hardiness: 0.86 },
  { trade: 'butcher', label: 'Fleischerei', errand: 'daily', hardiness: 0.62 },
  { trade: 'greengrocer', label: 'Obst und Gemüse', errand: 'daily', hardiness: 0.58 },
  { trade: 'kiosk', label: 'Kiosk', errand: 'daily', hardiness: 0.78 },
  { trade: 'snack', label: 'Imbiss', errand: 'daily', hardiness: 0.7 },
  { trade: 'cafe', label: 'Café', errand: 'daily', hardiness: 0.5 },
  { trade: 'hairdresser', label: 'Friseur', errand: 'service', hardiness: 0.74 },
  { trade: 'beauty', label: 'Kosmetik', errand: 'service', hardiness: 0.38 },
  { trade: 'laundry', label: 'Reinigung', errand: 'service', hardiness: 0.52 },
  { trade: 'tailor', label: 'Änderungsschneiderei', errand: 'service', hardiness: 0.44 },
  { trade: 'pharmacy', label: 'Apotheke', errand: 'care', hardiness: 0.94 },
  { trade: 'doctor', label: 'Arztpraxis', errand: 'care', hardiness: 0.96 },
  { trade: 'physio', label: 'Physiotherapie', errand: 'care', hardiness: 0.82 },
  { trade: 'optician', label: 'Optiker', errand: 'care', hardiness: 0.66 },
  { trade: 'books', label: 'Buchhandlung', errand: 'service', hardiness: 0.3 },
  { trade: 'flowers', label: 'Blumen', errand: 'service', hardiness: 0.46 },
  { trade: 'bicycles', label: 'Fahrradladen', errand: 'service', hardiness: 0.6 },
  { trade: 'hardware', label: 'Eisenwaren', errand: 'service', hardiness: 0.34 },
  { trade: 'bank', label: 'Filiale', errand: 'work', hardiness: 0.42 },
  { trade: 'insurance', label: 'Versicherungsbüro', errand: 'work', hardiness: 0.56 },
  { trade: 'lawyer', label: 'Kanzlei', errand: 'work', hardiness: 0.68 },
  { trade: 'estate', label: 'Immobilienbüro', errand: 'work', hardiness: 0.4 },
  { trade: 'nursery', label: 'Kita', errand: 'care', hardiness: 0.98 },
  { trade: 'workshop', label: 'Werkstatt', errand: 'work', hardiness: 0.72 },
  { trade: 'brewery', label: 'Brauerei', errand: 'work', hardiness: 0.64 },
]

/**
 * Wie wahrscheinlich ein Haus dieser Bauart überhaupt ein Erdgeschoss zum Vermieten hat.
 *
 * Ein Gründerzeithaus an einer Straße hat fast immer eines — so wurde gebaut. Ein Neubauriegel am
 * Stadtrand selten, ein Industriebau hat eine Werkstatt statt eines Ladens, und ein öffentliches
 * Gebäude vermietet gar nichts.
 */
const FRONTAGE: Record<BuildingType, number> = {
  commercial: 0.92,
  altbau: 0.46,
  modern: 0.24,
  residential: 0.12,
  industrial: 0.3,
  civic: 0,
}

/** Ein Industriebau vermietet keinen Friseurladen. */
const INDUSTRIAL: Trade[] = ['workshop', 'brewery', 'hardware']

/**
 * Was in diesem Haus ist, oder nichts.
 *
 * `vitality` ist der Einzelhandelsbestand als Anteil seines Ausgangswertes: 1 heißt, es steht so viel
 * wie am Anfang der Amtszeit, 0,7 heißt, ein knappes Drittel ist weg. Welcher Laden dann zumacht,
 * entscheidet seine Robustheit und nicht der Zufall — eine Apotheke hält länger durch als ein
 * Buchladen, und dass sie es tut, kann der Spieler über die Jahre beobachten.
 */
export function tenancyAt(building: BuildingRecord, seed: number, vitality: number): Tenancy | null {
  const salt = seed & 0xFFFF
  const index = numberOf(building.id)
  const roll = (stream: number): number => citizenHash(index + 1, salt + stream)

  if (roll(41) >= FRONTAGE[building.type])
    return null

  const pool = building.type === 'industrial' ? SHOPS.filter(shop => INDUSTRIAL.includes(shop.trade)) : SHOPS
  const shop = pool[Math.min(pool.length - 1, Math.floor(roll(42) * pool.length))]!

  /*
   * Die Schwelle, an der dieser Laden aufgibt.
   *
   * Aus der Robustheit und einem festen Wurf je Haus, damit zwei Bäckereien nicht gleichzeitig
   * dichtmachen. Bei voller Vitalität ist alles offen; darunter fallen die Läden in der Reihenfolge
   * ihrer Schwellen — und dieselbe Bäckerei macht bei demselben Stand immer wieder zu.
   */
  const threshold = (1 - shop.hardiness) * 0.7 + roll(43) * 0.25
  return { trade: shop.trade, label: shop.label, errand: shop.errand, open: vitality > threshold }
}

/**
 * Die Nummer aus einer Gebäudekennung.
 *
 * Die Kennungen sehen aus wie `b-5x` oder `o-13`; was zählt, ist nur, dass dieselbe Kennung immer
 * dieselbe Zahl ergibt und zwei verschiedene selten dieselbe. Eine Streuung über alle Zeichen tut
 * das und kostet nichts.
 */
function numberOf(id: string): number {
  let value = 0
  for (let at = 0; at < id.length; at += 1)
    value = (Math.imul(value, 31) + id.charCodeAt(at)) | 0
  return Math.abs(value)
}
