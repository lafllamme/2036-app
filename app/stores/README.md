# `stores/` — der Zustand der Oberfläche

Pinia. Bedient den Worker, hält, was zurückkommt, und führt die Uhr.

| Datei | Was |
| --- | --- |
| `game.ts` | die Kampagne: Kommandos an den Worker, Snapshot, Uhr, Geschwindigkeit, Abstimmungen |
| `saveStore.ts` | Spielstände in `localStorage`, mit Migration statt Versionszweig |
| `cityReports.ts` | die Meldungen, die der Renderer meldet, für den Nachrichtenticker |

## Was hier nicht hingehört

**Rechnen, was die Simulation rechnet.** Der Store darf ableiten, was nur die Oberfläche angeht
(„welcher Monatsname", „wie weit im Monat"), aber keine Kennzahl selbst fortschreiben. Alles, was
den Zustand der Stadt betrifft, geht als Kommando in den Worker und kommt als Snapshot zurück.

## Die Uhr

Ein Monat ist ein Tag. `monthProgress` läuft aus dem Simulationsfortschritt, nicht aus einem
Render-Timer — deshalb bleiben Uhr, Himmel und Wetter stehen, wenn der Spieler pausiert.

Was die Uhr anhält, hält sie nur so lange an, wie etwas im Weg steht: `holdClock` merkt sich die
gewählte Geschwindigkeit und `resumeIfClear` gibt sie zurück, sobald weder eine Vorlage noch ein
Ergebnis offen ist. Wer selbst pausiert hat, bleibt pausiert.

## Migration

Ein alter Spielstand wird **gefüllt, nicht abgelehnt**. `migrateState` setzt fehlende Felder auf
Vorgaben, statt auf eine Versionsnummer zu verzweigen. Der Grund: ein fehlendes Feld hat einmal die
gesamte Oberfläche mit einer einzigen Konsolenzeile umgebracht, während die Stadt weiterlief.
