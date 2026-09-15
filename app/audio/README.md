# `audio/` — wie die Stadt klingt

Zwei Instrumente, die nichts voneinander wissen, und eine Stelle, die weiß, dass es zwei sind.

| Datei | Was |
| --- | --- |
| `AudioBus.ts` | die Oberfläche: kurze Töne, einer pro Handlung des Spielers |
| `cues.ts` | der Tonvertrag — welche Handlung welchen Ton bekommt (ADR-0004) |
| `cityAmbience.ts` | die Stadt selbst: Betten, Einzelgeräusche, Sirene, Zug, Wetter |
| `citySounds.ts` | **eine Tabelle** mit jeder Aufnahme, ihrer Rolle und ihrem Pegel |
| `cityScore.ts` | die Musik, die sich nach dem richtet, was in Sichtweite passiert |
| `mixer.ts` | die einzige Stelle, die weiß, dass es mehrere Instrumente gibt |
| `storeSounds.ts`, `interactionSounds.ts` | Brücken vom Zustand zum Ton |

## Aufnahme oder Synthese — die Entscheidung

**Aufgenommen wird**, was aus tausend überlagerten Einzelereignissen besteht: eine Straße, eine
Menschenmenge, ein Park, Regen. Gefiltertes Rauschen kann davon nur eine Textur sein, und jede
Modulation, die man darauflegt, damit sie nicht stillsteht, hat eine Periode — und alles Periodische
in einem Geräusch, das nie aufhört, findet das Ohr als Erstes und lässt es als Letztes los. Zwei
Versuche wurden daran repariert, bevor der Schluss angenommen wurde.

**Synthetisiert wird**, was dem Spiel antworten muss: Die Sirene springt zwischen zwei Tönen und
wird danach platziert, wie weit der nächste Einsatz weg ist. Der Zug ist ein Rumpeln mit einem Takt
darunter. Beides sind Dinge, die das Spiel ausrechnet und die niemand aufgenommen hat.

Jede Aufnahme ist CC0 und wurde einzeln auf ihrer eigenen Seite geprüft — Belege in
`public/audio/city/LICENSE.md`.

## Die Grenze

Simulation und Welt dürfen **keinen** Ton kennen; ein Architekturtest hält das durch. Der Zustand
macht kein Geräusch — `storeSounds.ts` schaut ihm zu und antwortet darauf.

Pegel: nichts darf lauter sein als die Oberfläche (0,6). Ein Test prüft das für jede Aufnahme.
