import type { DistrictId, MetricId } from '../core/contracts'

/**
 * Lagen: was der Stadt über Wochen zusetzt, an einem Ort, mit einer Antwort.
 *
 * Das Spiel hatte bis hierher genau eine Uhr, und die tickt in Monaten: einbringen, abstimmen lassen,
 * warten. Dazwischen wollte nichts vom Spieler etwas. Gemeldet als *„man drückt Einbringen, wartet,
 * klickt sich durch und guckt ab und an auf die Karte"* — und das ist keine Geschmacksfrage, sondern
 * ein fehlendes Stockwerk.
 *
 * Eine Lage ist das Stockwerk darunter: **kleiner als ein Ratsbeschluss, schneller, an einem Ort, und
 * mit Mitteln zu beantworten statt mit Mehrheiten.** Eine Einbruchserie in der Gründerzeit Nord
 * braucht keine Ratssitzung — sie braucht Streifen, Licht, oder jemanden, der sich um die Jugendlichen
 * kümmert. Erst die vierte Antwort, die Kameras, geht wieder in den Rat. Damit greifen die beiden
 * Ebenen ineinander, statt nebeneinanderher zu laufen.
 *
 * ## Warum sie in der Simulation entsteht und nicht aus den Einsätzen auf der Straße
 *
 * Es wäre naheliegend, eine Lage daraus zu bauen, dass sich gezeichnete Einsätze in einem Bezirk
 * häufen — die tragen längst Ort und Art. Es wäre auch **falsch**: `docs/CITY_LIFE.md` verbietet
 * genau diese Richtung. Was gezeigt wird, darf nie zurück in das wirken, was gerechnet wird, sonst
 * bewertet der Rat am Ende eine Zufallsfolge des Renderers.
 *
 * Also andersherum, und das ist auch das ehrlichere Modell: die Lage ist ein **Zustand der Stadt**,
 * geboren aus `burglaryRate` und `investmentBacklog` wie alles andere, und die Einsätze auf der
 * Straße sind ihr Aussehen. Nicht die Serie macht den Druck, der Druck macht die Serie.
 *
 * ## Eine Dopplung, die aufgelöst gehört
 *
 * Es gibt bereits ein **Ratsereignis** namens „Einbruchserie im Wohnring Süd“ — mit der
 * Videoüberwachung als Beschlussvorschlag. Beim Durchspielen standen kurz darauf beide nebeneinander,
 * und ein Spieler sähe zweimal dieselbe Sache mit zwei verschiedenen Bedienungen.
 *
 * Richtig wäre eine Kette statt zweier Stränge: der Brennpunkt kommt zuerst und ist die
 * Verwaltungsebene; wer ihn aussitzt, bekommt ihn irgendwann als **Vorlage auf den Tisch**, weil eine
 * andere Fraktion ihn aufgreift. Dann ist das Ratsereignis die Eskalation der Lage und nicht ihr
 * Zwilling. Bis dahin ist es eine bekannte Kante — aufgeschrieben, damit sie niemand für Absicht
 * hält.
 */

export type HotspotKind = 'burglary' | 'fire'

export interface HotspotAnswer {
  id: string
  label: string
  /** Ein Satz, der sagt, was das bedeutet — nicht, was es heißt. */
  detail: string
  /** Einmalig aus dem Haushalt, in Millionen. */
  cost: number
  /** Und je Monat, solange sie läuft. */
  monthly: number
  /** Wie viele Monate sie läuft. Null heißt: sofort und vorbei. */
  months: number
  /** Um wie viele Stufen sie den Pegel sofort senkt. */
  relief: number
  /**
   * Die Vorlage, ohne die es diese Antwort nicht gibt.
   *
   * Der Satz, den das Spiel bisher nie ausspricht: **auf der Karte kannst du fast nichts, bis ein
   * Beschluss es freigeschaltet hat.** Eine Fraktion verwaltet nicht, sie beantragt — und wer die
   * Kameras will, muss dafür erst eine Mehrheit finden.
   */
  needsPolicy?: string
}

export interface HotspotTemplate {
  kind: HotspotKind
  label: string
  /** Wie die Lage im Stadtfunk angekündigt wird. `{bezirk}` wird ersetzt. */
  headline: string
  /** Woran sie hängt. Steigt die Kennzahl, kommen die Lagen häufiger. */
  driver: MetricId
  /** Unterhalb davon gibt es sie gar nicht. */
  quiet: number
  /** Und ab hier ist sie so wahrscheinlich, wie sie werden kann. */
  loud: number
  /** In welchen Bezirken sie vorkommt. Eine Einbruchserie braucht Wohnungen. */
  districts: DistrictId[]
  answers: HotspotAnswer[]
}

const RESIDENTIAL: DistrictId[] = ['gruenderzeit-nord', 'wohnring-sued', 'vorstadt-west', 'innenstadt']
const BUSY: DistrictId[] = ['bahnhof', 'innenstadt', 'gewerbe-ost', 'hafen-industrie']

/*
 * Eine dritte Art — Unfallhäufung an einer Kreuzung — stand hier und ist wieder raus: es gibt keine
 * Kennzahl, die sie ehrlich trägt. `transitReliability` ist der Nahverkehr und nicht der Autoverkehr,
 * und `investmentBacklog` wäre dieselbe Ursache wie beim Brand. Eine Lage, die an der falschen Zahl
 * hängt, ist Dekoration mit Kosten.
 */

export const HOTSPOTS: HotspotTemplate[] = [
  {
    kind: 'burglary',
    label: 'Einbruchserie',
    headline: 'EINBRUCHSERIE in {bezirk} — dritte Woche in Folge',
    driver: 'burglaryRate',
    quiet: 9,
    loud: 22,
    districts: RESIDENTIAL,
    answers: [
      {
        id: 'patrols',
        label: 'Streifen verlegen',
        detail: 'Sofort und ohne Beschluss — aber die Kräfte fehlen dann im Rest der Stadt.',
        cost: 0,
        monthly: 0.12,
        months: 6,
        relief: 2,
      },
      {
        id: 'lighting',
        label: 'Beleuchtung erneuern',
        detail: 'Aus dem laufenden Haushalt. Wirkt langsamer und bleibt, wenn die Serie vorbei ist.',
        cost: 0.6,
        monthly: 0,
        months: 0,
        relief: 1,
      },
      {
        id: 'cameras',
        label: 'Kameras aufstellen',
        detail: 'Wirkt am stärksten und kostet Vertrauen. Nur, wenn der Rat das Kameranetz beschlossen hat.',
        cost: 1.4,
        monthly: 0,
        months: 0,
        relief: 4,
        needsPolicy: 'afd-cctv-network',
      },
    ],
  },
  {
    kind: 'fire',
    label: 'Brandserie',
    headline: 'FEUERWEHR: dritter Einsatz in {bezirk} binnen zwei Wochen',
    driver: 'investmentBacklog',
    quiet: 60,
    loud: 160,
    districts: BUSY,
    answers: [
      {
        id: 'inspections',
        label: 'Brandschau anordnen',
        detail: 'Die Bauaufsicht geht die Häuser durch. Kostet Zeit, findet die Ursache.',
        cost: 0.3,
        monthly: 0.08,
        months: 4,
        relief: 2,
      },
      {
        id: 'repairs',
        label: 'Anlagen instand setzen',
        detail: 'Teurer und endgültig: was defekt ist, wird ersetzt.',
        cost: 2.2,
        monthly: 0,
        months: 0,
        relief: 4,
      },
    ],
  },
]

export function hotspotTemplate(kind: HotspotKind): HotspotTemplate {
  return HOTSPOTS.find(template => template.kind === kind) ?? HOTSPOTS[0]!
}
