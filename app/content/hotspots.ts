import type { DistrictId, DistrictType, MetricId } from '../core/contracts'
import { LINDENHAFEN } from '../world/model/lindenhafen'

/**
 * Lagen: was der Stadt über Wochen zusetzt, an einem Ort, mit einer Antwort.
 *
 * Das Spiel hatte bis hierher genau eine Uhr, und die tickt in Monaten: einbringen, abstimmen lassen,
 * warten. Dazwischen wollte nichts vom Spieler etwas. Gemeldet als *„man drückt Einbringen, wartet,
 * klickt sich durch und guckt ab und an auf die Karte"* — und das ist keine Geschmacksfrage, sondern
 * ein fehlendes Stockwerk.
 *
 * Eine Lage ist das Stockwerk darunter: **kleiner als ein Ratsbeschluss, schneller, an einem Ort, und
 * mit Mitteln zu beantworten statt mit Mehrheiten.** Eine Einbruchserie in der Neustadt
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
 * Es gibt bereits ein **Ratsereignis** namens „Einbruchserie in Kleinfeld“ — mit der
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
  /**
   * Die Vorlage, die eine andere Fraktion einbringt, wenn man die Lage aussitzt.
   *
   * Damit wird aus zwei Strängen eine Kette. „Einbruchserie in Kleinfeld“ gab es nämlich schon als
   * Ratsereignis, und beim Durchspielen standen kurz beide nebeneinander — zweimal dieselbe Sache mit
   * zwei verschiedenen Bedienungen. Jetzt kommt der Brennpunkt zuerst und ist die Verwaltungsebene;
   * wer ihn monatelang laufen lässt, bekommt ihn als **Vorlage auf den Tisch**, weil eine andere
   * Fraktion ihn aufgreift. Das Ratsereignis ist damit die Eskalation der Lage und nicht ihr Zwilling.
   */
  escalation: string
  answers: HotspotAnswer[]
}

/*
 * Wo eine Lage spielt — an der Art des Viertels und nicht an einer Namensliste.
 *
 * Es waren zwei Listen mit vier Namen. Bei zwanzig Vierteln wäre das eine Liste, die jedes Mal
 * nachgeführt werden muss, wenn ein Viertel dazukommt, und die genau dann vergessen wird. Eine
 * Einbruchserie spielt dort, wo dicht gewohnt wird; ein Brand dort, wo Betrieb ist.
 */
const RESIDENTIAL_TYPES = new Set<DistrictType>(['dense-residential', 'residential', 'post-war-estate', 'garden-suburb', 'historic-core'])
const BUSY_TYPES = new Set<DistrictType>(['mixed-transit', 'mixed-quarter', 'mixed-fair', 'historic-core', 'industrial', 'regenerated-docks'])

const RESIDENTIAL: DistrictId[] = LINDENHAFEN.districts.filter(district => RESIDENTIAL_TYPES.has(district.type)).map(district => district.id)
const BUSY: DistrictId[] = LINDENHAFEN.districts.filter(district => BUSY_TYPES.has(district.type)).map(district => district.id)

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
    /*
     * Der Ausgangswert ist **3,4** Einbrüche je 1.000 Einwohner, nicht neun.
     *
     * Hier standen 9 und 22, und damit war die Einbruchserie totes Inventar: die Schwelle lag beim
     * Zweieinhalbfachen des Startwertes, also hätte sie in keiner realistischen Amtszeit je
     * ausgelöst — 26 Brennpunkte in elf Jahren waren gemessen fast alle Brandserien. Aufgefallen ist
     * es erst, als die Bezirkswerte auf der Gebäudekarte standen und dort „Einbrüche 3,9 / 1.000“
     * zu lesen war. Eine Zahl, die man sieht, ist eine Zahl, die man prüft.
     *
     * Auch 3,8 gegen 7,5 war noch geraten statt gemessen, und auch 3,5 gegen 6,0: gezählt kamen in
     * einem durchgerechneten Jahrzehnt **null** Einbruchserien heraus und neunzehn Brandserien. Der
     * Grund ist, dass diese Kennzahl sich kaum bewegt — sie startet bei 3,4 und erreicht in einer
     * völlig vernachlässigten Stadt über elf Jahre höchstens **4,4**. Eine Schwelle bei 6 liegt damit
     * jenseits von allem, was im Spiel je passiert.
     *
     * Jetzt spannt der Bereich genau über das, was die Zahl wirklich tut: knapp über dem Startwert
     * fängt es an, und bei 4,6 ist es so häufig, wie es werden kann.
     */
    quiet: 3.42,
    loud: 4.3,
    districts: RESIDENTIAL,
    escalation: 'saf-burglary-series',
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
    /*
     * Und dasselbe von der anderen Seite: bei 60 gegen 160 stand die Brandserie über weite Strecken
     * auf der Höchstwahrscheinlichkeit — gezählt neunzehn in elf Jahren gegen zwei Einbruchserien.
     * Der Sanierungsstau ist die Kennzahl, die am weitesten läuft — aber auch nicht beliebig weit:
     * gemessen 45 zu Beginn und **120** als Höchstwert einer völlig vernachlässigten Amtszeit. 95
     * gegen 300 war deshalb der Fehler in die andere Richtung und ließ überhaupt nichts mehr
     * passieren. Der Bereich spannt jetzt genau über das, was die Zahl wirklich tut.
     */
    quiet: 68,
    loud: 118,
    districts: BUSY,
    // Die Ursache einer Brandserie ist aufgeschobener Unterhalt — also kommt das Instandhaltungsprogramm.
    escalation: 'fin-maintenance-program',
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
