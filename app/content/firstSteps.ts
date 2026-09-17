/**
 * Die ersten neunzig Sekunden.
 *
 * Bis hierher begann das Spiel so: Einstiegsfluss, „Lindenhafen übernehmen", und dann stand man vor
 * einer Stadt, zwei Schubladen und einer stehenden Uhr. Alles, was das Spiel ausmacht — dass man
 * eine **Fraktion** führt und keine Verwaltung, dass eine Vorlage eine Mehrheit braucht, die man
 * nicht hat, dass man selbst etwas einbringen kann —, stand nirgendwo. Man konnte es sich
 * erarbeiten. Niemand tut das.
 *
 * ## Warum kein Textbildschirm
 *
 * Erklären ließe sich das alles in drei Absätzen vor dem Spiel. Gelesen würde davon nichts, und
 * behalten noch weniger: eine Regel, die man liest, ist eine Behauptung, eine Regel, die man einmal
 * benutzt hat, ist eine Erfahrung. Diese Einarbeitung zeigt deshalb auf die **echten** Flächen und
 * lässt den Spieler die **echte** erste Vorlage einbringen. Es gibt keine Attrappe, keinen
 * Sonderfall im Modell und keinen Schritt, den man nachher nochmal richtig machen muss.
 *
 * ## Was hier steht und was nicht
 *
 * Nur das Drehbuch: welche Fläche, welcher Satz, und woran ein Schritt als erledigt gilt. Wo die
 * Flächen liegen, weiß `FirstSteps.vue`; ob jemand die Einarbeitung schon gesehen hat, weiß
 * `useFirstSteps`. Der Text ist Inhalt und gehört zum Inhalt — derselbe Grund, aus dem die Parteien
 * und die Maßnahmen hier liegen.
 */

/**
 * Worauf ein Schritt zeigt.
 *
 * Die Namen stehen als `data-first-step` an den echten Elementen. Ein Anker, den es gerade nicht
 * gibt, ist kein Fehler: dann steht die Karte in der Mitte und sagt trotzdem ihren Satz.
 */
export type StepAnchor
  = | 'none'
    /** Die Sitzzahl in der Kopfzeile der Entscheidungen. */
    | 'seats'
    /** Das Lagebild. */
    | 'rail'
    /** Die Liste „Was du einbringen kannst". */
    | 'motions'
    /** Der Beschlussvorschlag im offenen Blatt. */
    | 'ways'
    /** Der Knopf, der die Vorlage einbringt. */
    | 'submit'
    /** „Nächstes Ereignis" im Deck. */
    | 'advance'

/**
 * Woran ein Schritt als erledigt gilt.
 *
 * `hand` heißt: der Spieler drückt „Weiter". Die beiden anderen warten auf eine **echte** Handlung
 * im Spiel — eine geöffnete Vorlage, eine gelaufene Abstimmung. Genau die zwei Stellen sind es, an
 * denen das Spielprinzip sitzt, und sie sind deshalb die zwei, die man selbst tut.
 */
export type StepGate = 'hand' | 'sheetOpen' | 'voteCast'

export interface FirstStep {
  id: string
  anchor: StepAnchor
  /** `{partei}` wird durch das Kürzel der eigenen Fraktion ersetzt. */
  title: string
  body: string
  gate: StepGate
  /** Was statt „Weiter" dasteht, solange auf eine Handlung gewartet wird. */
  waiting?: string
}

export const FIRST_STEPS: FirstStep[] = [
  {
    id: 'role',
    anchor: 'none',
    title: 'Du führst die {partei} — mehr nicht.',
    body: 'Lindenhafen hat 120.000 Einwohner, einen Haushalt und einen Stadtrat. Du bist eine Fraktion darin, nicht die Verwaltung: du kannst etwas beantragen, du kannst verhandeln, und du kannst überstimmt werden. Elf Jahre lang.',
    gate: 'hand',
  },
  {
    id: 'seats',
    anchor: 'seats',
    title: 'Deine Sitze reichen nicht.',
    body: 'Hier steht, wie viele der 60 Sitze hinter dir stehen. Für jede einzelne Vorlage brauchst du mehr Ja- als Nein-Stimmen — und die musst du dir jedes Mal neu holen.',
    gate: 'hand',
  },
  {
    id: 'rail',
    anchor: 'rail',
    title: 'Das Lagebild ist die Rechnung.',
    body: 'Wohnen, Arbeit, Sicherheit, Infrastruktur. Diese Zahlen bewegen sich langsam, nie von allein, und an ihnen wirst du im Dezember 2036 gemessen.',
    gate: 'hand',
  },
  {
    id: 'motions',
    anchor: 'motions',
    title: 'Das hier kannst du selbst einbringen.',
    body: 'Diese Vorlagen gehören deiner Fraktion — was darin steht, entspricht dem, wofür sie gewählt wurde. Such dir eine aus und mach sie auf.',
    gate: 'sheetOpen',
    waiting: 'Wartet auf deinen Klick',
  },
  {
    id: 'ways',
    anchor: 'ways',
    title: 'Was sie kostet, und wer mitgeht.',
    body: 'Der Beschlussvorschlag steht hier mit Einmalkosten, Monatskosten und Wirkung. Daneben, wie die anderen Fraktionen dazu stehen und wie die Abstimmung ausgehen dürfte. Verhandeln und Kampagne verschieben das — sie kosten politisches Kapital.',
    gate: 'hand',
  },
  {
    id: 'submit',
    anchor: 'submit',
    title: 'Jetzt bring sie ein.',
    body: 'Danach stimmt der Rat ab, und du bekommst das Ergebnis Fraktion für Fraktion. Angenommen oder abgelehnt — beides ist eine Antwort, und beides kostet dich nichts als diesen einen Versuch.',
    gate: 'voteCast',
    waiting: 'Wartet auf die Abstimmung',
  },
  {
    id: 'loop',
    anchor: 'none',
    title: 'Das war das ganze Spiel.',
    body: 'Einbringen, abstimmen lassen, und die Stadt verändert sich — sichtbar auf der Karte und nicht nur als Zahl. Dazu kommen Vorlagen, die andere einbringen und bei denen du nur Ja, Nein oder Enthaltung in der Hand hast, und Ereignisse, die niemand beantragt hat.',
    gate: 'hand',
  },
  {
    id: 'clock',
    anchor: 'advance',
    title: 'Und dann lass die Zeit laufen.',
    body: 'Der Knopf läuft bis zum nächsten Ereignis und hält von selbst an, sobald der Rat dich braucht. Bis zur Wahl sind es 132 Monate.',
    gate: 'hand',
  },
]

/**
 * Ist dieser Schritt durch das erledigt, was im Spiel gerade passiert ist?
 *
 * Reine Funktion über die zwei Zustände, die das Spiel meldet — damit das Drehbuch prüfbar ist, ohne
 * dass eine Oberfläche dafür gebaut werden muss. `hand` ist hier immer `false`: dieser Schritt endet
 * durch einen Knopf und nicht durch eine Beobachtung.
 */
export function stepCleared(step: FirstStep, world: { sheetOpen: boolean, voteCast: boolean }): boolean {
  if (step.gate === 'sheetOpen')
    return world.sheetOpen
  if (step.gate === 'voteCast')
    return world.voteCast
  return false
}
