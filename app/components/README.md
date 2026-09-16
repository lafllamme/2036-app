# `components/` — was der Spieler sieht

Vue, UnoCSS, deutschsprachig. Kein three.js außer über `CityCanvas`, das den Renderer hält und ihm
den Zustand reicht.

| Datei | Was |
| --- | --- |
| `CityCanvas.vue` | die einzige Brücke zum Renderer: Snapshot, Himmel, Wetter hinein, Auswahl heraus |
| `CommandDeck.vue` | die vier Körper am unteren Rand: Amt, Stand, Zeit, Bedienung |
| `EntryExperience.vue` | Titel, Parteienhalle, Parteiprofil, Prioritäten, Mandat |
| `MetricRail.vue` | das Lagebild links, mit „seit Amtsantritt" auf jedem Wert |
| `DecisionPanel.vue`, `VoteSheet.vue`, `VoteResult.vue` | Vorlagen, Abstimmung, Ergebnis |
| `NewsTicker.vue`, `SettingsSheet.vue` | Stadtfunk und Einstellungen |

## Drei Regeln, die hier gelten

**Jede Komponente bringt ihr CSS mit.** Das Feature-CSS steht im `<style scoped>` daneben, nicht in
einer gemeinsamen Datei. Geteilt sind nur die Token und die Primitive aus
`app/assets/css/styles.css` — `.pod`, `.groove`, `.btn`, `.round`. Wer eine Fläche braucht, nimmt
`.pod` und denkt sich keine eigene aus.

**Status nie nur über Farbe.** Jede Richtungsangabe trägt eine Form und ein Wort, nicht bloß Grün
oder Rot. Die Form ist gezeichnet und das Wort steht für Screenreader daneben — ein `▲` im Text wäre
ein Icon aus Zeichen, und das macht dieses System nirgends.

**Eine Zahl allein ist keine Auskunft.** „Kriminalität 52 / 1.000" ist eine Tatsache über die Stadt
und keine über den Spieler. Deshalb trägt jeder Wert im Lagebild, was er seit Amtsantritt getan hat,
in welche Richtung das geht und welche **eigene** Entscheidung am stärksten darauf gewirkt hat. Die
Dynamik der Stadt bewegt jede Zahl jeden Monat; gefragt ist, was *ich* getan habe.
