import type { BuildingRecord } from '../../../core/contracts'
import type { Tenancy } from '../../../world/tenancy'
import type { ShopSeat } from '../structures/buildings'
import { tenancyAt } from '../../../world/tenancy'

/**
 * Wohin jemand unterwegs ist.
 *
 * Bis hierher lief die Menge zufällig: an jeder Kreuzung ein gewichteter Wurf, geradeaus lieber als
 * abbiegen. Das ergibt Verkehr, aber keine Stadt — niemand hat etwas vor, und deshalb geht auch
 * niemand irgendwohin. Seit `world/tenancy.ts` gibt es aber **Ziele**: jedes Erdgeschoss mit einem
 * Laden ist eine Adresse, zu der man gehen kann.
 *
 * ## Kein Wegfinden
 *
 * Es wird kein Weg berechnet. Der Renderer kann das längst — die Einsatzfahrzeuge tun es seit
 * Wochen: an der Kreuzung nicht würfeln, sondern die Straße nehmen, deren anderes Ende am nächsten
 * am Ziel liegt. Gierig statt geplant, im Sackgassenfall auch mal zurück, und das Verfahren kostet
 * je Kreuzung einen Durchlauf über die drei bis fünf Straßen, die dort zusammenkommen.
 *
 * Für einen Rettungswagen war das eine Notlösung mit Zeitbegrenzung. Für jemanden, der zum Bäcker
 * geht, ist es **richtiger als ein Weg**: Menschen laufen nicht die kürzeste Strecke, sie laufen in
 * die ungefähre Richtung und biegen ab, wenn es passt.
 *
 * ## Und kein Datensatz je Person
 *
 * Ein Gang ist ein Ziel und eine Wartezeit an der Tür, mehr nicht. Wer wo wohnt, wird nicht
 * gespeichert: es gibt fünfhundert Figuren und vierzehntausend Häuser, und eine Zuordnung, die
 * niemand je abfragt, wäre Buchhaltung ohne Leser. Was man sieht, ist jemand, der zielstrebig geht,
 * an einer Ladentür stehen bleibt und danach woandershin geht — und genau das ist der Unterschied
 * zwischen einer Menge und Passanten.
 */

export interface Errand {
  x: number
  z: number
  /** Wofür man herkommt. Entscheidet, zu welcher Tageszeit dieses Ziel überhaupt gewählt wird. */
  kind: Tenancy['errand']
}

export interface Errands {
  all: Errand[]
  /** Nach 250-m-Zellen sortiert, damit „was ist hier in der Nähe" kein Durchlauf über alles ist. */
  cells: Map<number, Errand[]>
}

/** Kantenlänge einer Zelle. Ein Gang von mehr als ein paar hundert Metern ist kein Gang mehr. */
const CELL = 250
/** Wie weit jemand für eine Besorgung höchstens geht. */
export const ERRAND_REACH = 420

/**
 * Wann welches Ziel überhaupt in Frage kommt, nach Stunde des Tages.
 *
 * Kein Kalender, sondern vier grobe Tagesabschnitte — mehr trägt eine Figur nicht, die man aus
 * dreißig Metern sieht. Morgens zur Arbeit, tagsüber besorgen, abends Café und Imbiss, nachts fast
 * nichts.
 */
function wanted(hour: number): Tenancy['errand'][] {
  if (hour < 6)
    return []
  if (hour < 10)
    return ['work', 'care']
  if (hour < 16)
    return ['daily', 'service', 'care', 'work']
  if (hour < 21)
    return ['daily', 'service']
  return ['daily']
}

export function buildErrands(
  seats: (ShopSeat & { record: BuildingRecord })[],
  seed: number,
): Errands {
  const all: Errand[] = []
  const cells = new Map<number, Errand[]>()

  for (const seat of seats) {
    /*
     * Gebaut wird für volle Vitalität, wie bei den Schildern: ein Ziel, das es bei gutem
     * Einzelhandel gibt, bleibt ein Ziel. Ob dort heute offen ist, ändert die Farbe des Schildes und
     * nicht, ob jemand die Straße entlanggeht — und ein Gang zu einem Laden, der zugemacht hat, ist
     * ohnehin etwas, das Menschen tun.
     */
    const tenancy = tenancyAt(seat.record, seed, 1)
    if (!tenancy)
      continue
    // Ein Stück vor der Tür, nicht in ihr: dort steht man, wenn man hineingeht.
    const errand: Errand = { x: seat.x + seat.nx * 2.2, z: seat.z + seat.nz * 2.2, kind: tenancy.errand }
    all.push(errand)
    const key = cellOf(errand.x, errand.z)
    const bucket = cells.get(key)
    if (bucket)
      bucket.push(errand)
    else cells.set(key, [errand])
  }

  return { all, cells }
}

/**
 * Ein Ziel in der Nähe, passend zur Tageszeit — oder nichts, und dann geht man weiter wie bisher.
 *
 * Gesucht wird in den neun Zellen um den eigenen Standort. Das sind bei 250 m Kantenlänge 750 m im
 * Quadrat, also reichlich für die vierhundert Meter, die jemand zu gehen bereit ist, und es kostet
 * neun Kartenzugriffe statt eines Durchlaufs über dreitausend Ziele.
 */
export function pickErrand(errands: Errands, x: number, z: number, hour: number, roll: number): Errand | null {
  const kinds = wanted(hour)
  if (kinds.length === 0)
    return null

  const near: Errand[] = []
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (const errand of cells(errands, cx + dx, cz + dz)) {
        if (!kinds.includes(errand.kind))
          continue
        if ((errand.x - x) ** 2 + (errand.z - z) ** 2 > ERRAND_REACH * ERRAND_REACH)
          continue
        near.push(errand)
      }
    }
  }

  if (near.length === 0)
    return null
  return near[Math.min(near.length - 1, Math.floor(roll * near.length))] ?? null
}

function cells(errands: Errands, cx: number, cz: number): Errand[] {
  return errands.cells.get(key(cx, cz)) ?? []
}

function cellOf(x: number, z: number): number {
  return key(Math.floor(x / CELL), Math.floor(z / CELL))
}

/** Zwei Zellkoordinaten in eine Zahl. Ein String je Abfrage wäre ein String je Abfrage. */
function key(cx: number, cz: number): number {
  return (cx + 8_192) * 16_384 + (cz + 8_192)
}
