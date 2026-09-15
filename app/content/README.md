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

| Feld | Bedeutung |
| --- | --- |
| `requiresEventIds` | taucht erst auf, wenn eines davon schon entschieden wurde |
| `blockedByMeasureIds` | taucht nicht mehr auf, wenn eine dieser Maßnahmen läuft |
| `unlocksEventIds` | macht beim Entscheiden diese Ereignisse möglich |

Wer ein Ereignis hinzufügt, fragt sich: **was wird dadurch unmöglich?** Eine Entscheidung ohne
Antwort darauf ist eine Meldung, keine Entscheidung.

## Belege

Jede modellierte Wirkung nennt über `EvidenceReference`, woher ihre Größenordnung stammt. Das ist
keine Zierde: die Zahlen sind gekennzeichnete Modellannahmen und keine Prognose, und der einzige
Weg, das ehrlich zu halten, ist, die Herkunft neben die Zahl zu schreiben.
