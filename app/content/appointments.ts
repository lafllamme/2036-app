import type { PartyId } from '../core/contracts'

/**
 * Termine: wo politisches Kapital herkommt.
 *
 * Es kam bis hierher von **nirgendwo**. `BASE_CAPITAL_PER_MONTH` tropft eine feste Rate in die
 * Kasse, und ausgegeben wird sie für Verhandeln, Kampagne und Dringlichkeit. Eine Währung, die eine
 * Stoppuhr ist, enthält keine Entscheidung: man kann nur warten, bis man genug hat, und es gibt
 * nichts, was man tun könnte, um früher genug zu haben.
 *
 * Ein Termin ist die Gegenrichtung. Jemand will wissen, wo man steht — der Handelsverein, der
 * Mieterbund, die Lokalzeitung —, und man **tauscht Haltung gegen Rückhalt**. Wer sich vor eine
 * Gruppe stellt, bekommt Kapital und ein besseres Verhältnis zu den Fraktionen, die dasselbe wollen,
 * und ein schlechteres zu denen, die das Gegenteil wollen. Und weil der Preis einer Verhandlung seit
 * `negotiationCost` am Verhältnis hängt, ist das keine Buchhaltung: was man dem einen zusagt, macht
 * die Stimme des anderen in der nächsten Sitzung teurer.
 *
 * ## Warum das nicht dieselbe Sache wie ein Brennpunkt ist
 *
 * Ein Brennpunkt ist **ortsgebunden** — er hat einen Bezirk, eine Kennzahl dahinter und eskaliert,
 * wenn man ihn liegen lässt. Ein Termin ist **beziehungsgebunden**: er hat keinen Ort, keine
 * Kennzahl und keine Drohung. Er läuft ab, wenn man ihn ignoriert, und das ist die ganze Strafe.
 * Beides füllt denselben Monat, aber mit verschiedenen Fragen.
 *
 * ## Und warum keine Stadtkennzahl daran hängt
 *
 * Dieselbe Lehre wie bei den Brennpunkten, und sie hat zweimal wehgetan: `goals.test.ts` sitzt so
 * eng, dass die beste von 36 Durchspielungen teils auf 0,2 an ihr Ziel herankommt. Eine neue
 * laufende Belastung auf Zufriedenheit oder Haushalt hat die Balance schon zweimal zerschossen.
 * Termine bewegen deshalb **nur Kapital und Verhältnisse** — eine eigene Währungsebene, die die
 * Stadt nicht anfassen kann. Wenn es sich zu zahm anfühlt, hängt man Kennzahlen später daran, aber
 * dann gemessen.
 */

export interface AppointmentOption {
  id: string
  label: string
  /** Was man dafür bekommt oder hergibt, in politischem Kapital. Darf negativ sein. */
  capital: number
  /** Fraktionen, deren Verhältnis steigt — die wollen dasselbe. */
  warms: PartyId[]
  /** Und die, deren Verhältnis fällt. */
  cools: PartyId[]
  /** Ein Satz, der sagt, was daraus folgt. Steht unter der Antwort, nachdem man sie gewählt hat. */
  outcome: string
}

export interface AppointmentTemplate {
  id: string
  /** Wer um das Gespräch bittet. */
  caller: string
  title: string
  body: string
  /** Wie viele Monate er offen steht, bevor er verfällt. */
  patience: number
  options: AppointmentOption[]
}

/** Wie stark ein Termin ein Verhältnis bewegt. Weniger als eine Verhandlung — es ist ein Gespräch. */
export const APPOINTMENT_SWING = 0.3

export const APPOINTMENTS: AppointmentTemplate[] = [
  {
    id: 'traders',
    caller: 'Handelsverein Altstadt',
    title: 'Der Handelsverein bittet um ein Gespräch',
    body: 'Vierhundert Mitglieder, ein guter Draht zur Lokalzeitung, und eine einzige Frage: wo stehst du bei den Parkgebühren in der Altstadt?',
    patience: 2,
    options: [
      {
        id: 'side-with',
        label: 'Ich stelle mich vor euch.',
        capital: 14,
        warms: ['cdu', 'fdp'],
        cools: ['gruene', 'linke'],
        outcome: 'Der Verein stellt sich hinter dich — und die Verkehrswende im Rat wird teurer.',
      },
      {
        id: 'listen',
        label: 'Ich höre zu und verspreche nichts.',
        capital: 4,
        warms: [],
        cools: [],
        outcome: 'Man hat sich getroffen. Mehr steht nachher in keiner Zeitung.',
      },
      {
        id: 'refuse',
        label: 'Die Gebühren bleiben, wie sie sind.',
        capital: -9,
        warms: ['gruene', 'linke'],
        cools: ['cdu', 'fdp'],
        outcome: 'Der Verein geht zur Presse. Dafür weiß der halbe Rat jetzt, dass du standhältst.',
      },
    ],
  },
  {
    id: 'tenants',
    caller: 'Mieterbund Lindenhafen',
    title: 'Der Mieterbund lädt zur Mitgliederversammlung',
    body: 'Zweihundert Leute in einem Gemeindesaal, und die Frage lautet, ob die Stadt beim Verkauf kommunaler Wohnungen weitermacht.',
    patience: 2,
    options: [
      {
        id: 'promise',
        label: 'Kein Quadratmeter wird mehr verkauft.',
        capital: 15,
        warms: ['linke', 'spd'],
        cools: ['fdp', 'cdu'],
        outcome: 'Standing Ovations im Saal — und die FDP erinnert dich in jeder Sitzung daran.',
      },
      {
        id: 'careful',
        label: 'Jeder Fall wird einzeln geprüft.',
        capital: 5,
        warms: ['spd'],
        cools: [],
        outcome: 'Niemand ist begeistert, niemand geht wütend nach Hause.',
      },
      {
        id: 'decline',
        label: 'Ich komme gar nicht erst hin.',
        capital: -4,
        warms: ['fdp'],
        cools: ['linke', 'spd'],
        outcome: 'Der leere Stuhl auf dem Podium steht am nächsten Tag im Blatt.',
      },
    ],
  },
  {
    id: 'press',
    caller: 'Lindenhafener Tageblatt',
    title: 'Die Lokalzeitung will ein Interview',
    body: 'Eine Doppelseite im Wochenendteil. Die Redakteurin fragt nicht freundlich, aber fair — und sie hat den Haushalt gelesen.',
    patience: 1,
    options: [
      {
        id: 'open',
        label: 'Offene Bilanz, auch beim Unangenehmen.',
        capital: 11,
        warms: ['gruene', 'spd'],
        cools: [],
        outcome: 'Ein Text, den man zitiert. Die Zahlen darin sind deine.',
      },
      {
        id: 'attack',
        label: 'Die Amtszeit davor hat die Löcher gerissen.',
        capital: 6,
        warms: ['linke'],
        cools: ['cdu', 'spd'],
        outcome: 'Die Schlagzeile zieht, die Zusammenarbeit im Rat wird rauer.',
      },
      {
        id: 'pass',
        label: 'Kein Interview, nur eine Pressemitteilung.',
        capital: -6,
        warms: [],
        cools: ['gruene'],
        outcome: 'Die Doppelseite erscheint trotzdem. Mit deinem Stuhl leer darauf.',
      },
    ],
  },
  {
    id: 'firefighters',
    caller: 'Feuerwehrverband',
    title: 'Der Feuerwehrverband bittet zum Jahresappell',
    body: 'Freiwillige, vierhundert Ehrenamtliche, zwei Drehleitern von 1998. Sie wollen nicht, dass du etwas versprichst — sie wollen, dass du kommst.',
    patience: 3,
    options: [
      {
        id: 'attend',
        label: 'Ich stehe den ganzen Abend dort.',
        capital: 9,
        warms: ['cdu', 'spd', 'afd'],
        cools: [],
        outcome: 'Kein Beschluss, kein Euro. Aber die Fotos hängen ein Jahr im Gerätehaus.',
      },
      {
        id: 'greeting',
        label: 'Ein Grußwort, dann weiter.',
        capital: 3,
        warms: [],
        cools: [],
        outcome: 'Höflich, kurz, vergessen.',
      },
    ],
  },
  {
    id: 'unions',
    caller: 'Gewerkschaftsbund',
    title: 'Der Gewerkschaftsbund fragt nach den Stadtwerken',
    body: 'Die Tarifrunde steht an, und die Stadtwerke gehören der Stadt. Sie wollen wissen, auf wessen Seite der Rat steht, bevor sie verhandeln.',
    patience: 2,
    options: [
      {
        id: 'back',
        label: 'Die Stadt zahlt, was vereinbart wird.',
        capital: 13,
        warms: ['linke', 'spd', 'gruene'],
        cools: ['fdp', 'cdu'],
        outcome: 'Der Bund stellt sich hinter dich — und der Haushalt bekommt einen Gegner mehr.',
      },
      {
        id: 'neutral',
        label: 'Der Rat mischt sich in Tarifsachen nicht ein.',
        capital: 2,
        warms: ['fdp'],
        cools: ['linke'],
        outcome: 'Formal richtig. Es merkt sich trotzdem jeder.',
      },
    ],
  },
  {
    id: 'church',
    caller: 'Kirchenkreis und Moscheeverein',
    title: 'Zwei Gemeinden laden gemeinsam ein',
    body: 'Sie machen seit Jahren Nachbarschaftsarbeit in Kleinfeld und wollen, dass das jemand aus dem Rat sieht. Ohne Kamera, ohne Rede.',
    patience: 3,
    options: [
      {
        id: 'visit',
        label: 'Ich komme, und zwar ohne Presse.',
        capital: 10,
        warms: ['spd', 'gruene', 'linke'],
        cools: ['afd'],
        outcome: 'Ein Nachmittag, von dem niemand berichtet, und über den ein halbes Viertel redet.',
      },
      {
        id: 'staff',
        label: 'Jemand aus der Fraktion geht hin.',
        capital: 3,
        warms: [],
        cools: [],
        outcome: 'Der Termin ist wahrgenommen. Mehr aber auch nicht.',
      },
    ],
  },
  {
    id: 'sports',
    caller: 'Stadtsportbund',
    title: 'Der Sportbund will über die Hallenzeiten reden',
    body: 'Neunzehn Vereine teilen sich sieben Hallen, und der Verteilschlüssel ist von 1994. Sie haben einen eigenen Vorschlag mitgebracht.',
    patience: 2,
    options: [
      {
        id: 'adopt',
        label: 'Euer Schlüssel geht so in die Verwaltung.',
        capital: 12,
        warms: ['spd', 'cdu'],
        cools: ['gruene'],
        outcome: 'Die großen Vereine gewinnen, die kleinen schreiben Briefe.',
      },
      {
        id: 'mediate',
        label: 'Ich setze euch mit den kleinen Vereinen an einen Tisch.',
        capital: 6,
        warms: ['gruene'],
        cools: [],
        outcome: 'Es dauert länger, und am Ende trägt es jeder mit.',
      },
    ],
  },
  {
    id: 'industry',
    caller: 'Hafenwirtschaft',
    title: 'Die Hafenbetriebe bitten um einen Termin',
    body: 'Zweitausend Arbeitsplätze am Wasser, und eine Ausweisung als Gewerbefläche, die seit vier Jahren liegt. Sie kommen zu dritt und mit Unterlagen.',
    patience: 2,
    options: [
      {
        id: 'support',
        label: 'Ich bringe die Ausweisung auf den Weg.',
        capital: 14,
        warms: ['cdu', 'fdp', 'spd'],
        cools: ['gruene', 'linke'],
        outcome: 'Der Hafen hat einen Fürsprecher — und die Grünen eine Gegenkampagne.',
      },
      {
        id: 'conditions',
        label: 'Nur mit Auflagen für Lärm und Zufahrt.',
        capital: 5,
        warms: ['gruene'],
        cools: ['fdp'],
        outcome: 'Man geht auseinander, ohne sich einig zu sein, und redet weiter.',
      },
    ],
  },
]

export function appointmentTemplate(id: string): AppointmentTemplate | undefined {
  return APPOINTMENTS.find(entry => entry.id === id)
}
