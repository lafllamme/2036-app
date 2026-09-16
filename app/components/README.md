# `components/` — was der Spieler sieht

Vue, UnoCSS, deutschsprachig. Kein three.js außer über `CityCanvas`, das den Renderer hält und ihm
den Zustand reicht.

| Datei | Was |
| --- | --- |
| `CityCanvas.vue` | die einzige Brücke zum Renderer: Snapshot, Himmel, Wetter hinein, Auswahl heraus |
| `EntryExperience.vue` | Titel, Parteienhalle, Parteiprofil, Prioritäten, Mandat |
| `MetricRail.vue` | das Lagebild links, mit „seit Amtsantritt" auf jedem Wert |
| `DecisionPanel.vue`, `VoteSheet.vue`, `VoteResult.vue` | Vorlagen, Abstimmung, Ergebnis |
| `NewsTicker.vue`, `SettingsSheet.vue` | Stadtfunk und Einstellungen |

## Zwei Regeln, die hier gelten

**Status nie nur über Farbe.** Jede Richtungsangabe trägt ein Zeichen und ein Wort, nicht bloß Grün
oder Rot — `▲ verbessert`, `▼ verschlechtert`.

**Eine Zahl allein ist keine Auskunft.** „Kriminalität 52 / 1.000" ist eine Tatsache über die Stadt
und keine über den Spieler. Deshalb trägt jeder Wert im Lagebild, was er seit Amtsantritt getan hat,
in welche Richtung das geht und welche **eigene** Entscheidung am stärksten darauf gewirkt hat. Die
Dynamik der Stadt bewegt jede Zahl jeden Monat; gefragt ist, was *ich* getan habe.
