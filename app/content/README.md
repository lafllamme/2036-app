# `content/` — die Inhalte

Daten, keine Logik. Was hier steht, wird von `simulation/` gelesen und nie von ihr geschrieben.

| Datei | Was |
| --- | --- |
| `events.ts` | was passieren kann: Entscheidungen, Vorfälle, Ketten, äußere Lagen, Meilensteine |
| `parties.ts` | die sechs fiktiven Parteien mit Positionen, roten Linien und Kennzahlen |
| `policies.ts` | die stehenden Vorlagen, die der Spieler selbst einbringen kann |

## Wie ein Ereignis eine Tür zumacht

Drei Felder auf `EventTrigger`, und sie sind der Unterschied zwischen einer Liste von Vorfällen und
einem Weg durch ein Jahrzehnt:

Vier Felder auf `EventTrigger`, alle am **verschlossenen** Ereignis geschrieben — nicht an dem, das
öffnet. Eine Tür liest sich von der Tür aus leichter: wer einen Trigger liest, weiß alles darüber,
wann das Ereignis auftauchen kann, und niemand muss den ganzen Graphen im Kopf haben, um „warum habe
ich das nie gesehen?" zu beantworten.

| Feld | Bedeutung |
| --- | --- |
| `requiresEventIds` | erst, nachdem der Rat danach *gefragt* wurde |
| `requiresChoiceIds` | erst, nachdem die Stadt es tatsächlich *getan* hat (`eventId:optionId`) |
| `blockedByChoiceIds` | nie wieder, sobald diese Entscheidung getragen wurde |
| `blockedByMeasureIds` | nicht, solange eine dieser Maßnahmen läuft |

Der Unterschied zwischen den ersten beiden trägt das ganze Konzept: eine Vorlage, die eingebracht
und abgelehnt wurde, ist keine eingeschlagene Richtung. Sie verändert, was die Straße vom Spieler
hält — und keine einzige Straße.

Wer ein Ereignis hinzufügt, fragt sich: **was wird dadurch unmöglich?** Eine Entscheidung ohne
Antwort darauf ist eine Meldung, keine Entscheidung.

Das schärfste Beispiel steht im Bestand: `env-green-offensive` und `eco-datacenter` sperren sich
gegenseitig. Ein Grundstück, zwei Zukünfte — was der Rat zuerst nimmt, nimmt dem anderen die
Grundlage. Nicht verschoben, weg.

`tests/unit/branching.test.ts` prüft, dass jede Tür eine Kennung nennt, die es wirklich gibt. Ein
Tippfehler dort stürzt nicht ab und warnt nicht: das Ereignis erscheint einfach für den Rest des
Jahrzehnts in keiner einzigen Kampagne.

## Belege

Jede modellierte Wirkung nennt über `EvidenceReference`, woher ihre Größenordnung stammt. Das ist
keine Zierde: die Zahlen sind gekennzeichnete Modellannahmen und keine Prognose, und der einzige
Weg, das ehrlich zu halten, ist, die Herkunft neben die Zahl zu schreiben.
