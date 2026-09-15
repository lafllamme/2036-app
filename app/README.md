# `app/` — wo was hingehört

Nuxt 4, also ist `app/` die Wurzel des Anwendungscodes und `~/` zeigt hierher. Die Ordner sind nach
**Verantwortung** geschnitten, nicht nach Dateityp, und die Grenzen dazwischen sind in
`tests/architecture/boundaries.test.ts` festgeschrieben — sie brechen den Build, wenn jemand sie
überschreitet.

## Der Fluss

```
world/ ──> core/contracts ──> simulation/ ──> stores/ ──> components/
  │                               │                           │
  │ Grundriss                     │ Kennzahlen                │
  └───────────────> rendering/ <──┘                           │
                        │  Geometrie                          │
                      audio/ <────────────────────────────────┘
```

| Ordner | Verantwortet | Darf nicht |
| --- | --- | --- |
| `core/` | Verträge und reine Rechnungen, die alle brauchen: Typen, Zeit, Wetter, Zufall | three.js, Vue, DOM |
| `world/` | Den Grundriss: Relief, Stadtdaten, Vororte, Einwohner. Rein und geseedet. | three.js, Vue, Sound |
| `simulation/` | Was aus der Stadt in einem Monat wird. Läuft im Worker. | three.js, Vue, Pinia, Browser-APIs, Sound — **und keine Verzweigung auf eine Parteikennung** |
| `content/` | Die Inhalte: Ereignisse, Parteien, Maßnahmen. Daten, keine Logik. | Rechnen |
| `rendering/` | Aus Grundriss und Kennzahlen Geometrie machen | in die Simulation zurückschreiben |
| `audio/` | Was die Stadt und die Oberfläche klingen lassen | irgendwo sonst aufgerufen werden als über die beiden Instrumente |
| `stores/` | Pinia: den Worker bedienen, den Zustand halten, die Uhr führen | rechnen, was die Simulation rechnet |
| `components/` | Vue: das, was der Spieler sieht und anfasst | three.js direkt (das macht `CityCanvas` über den Renderer) |
| `composables/`, `utils/` | Kleines Geteiltes für die Oberfläche | Zustand halten |
| `workers/` | Der Simulations-Worker, ein Dünnbrett über `simulation/` | Logik |

## Zwei Namen, die sich ähneln

`app/world/` und `app/rendering/world/` sind **nicht** dasselbe und werden regelmäßig verwechselt:

- **`app/world/`** erzeugt den Grundriss. Rein, geseedet, ohne three.js, testbar in Node. Es weiß,
  *wo* ein Haus steht — nicht, wie es aussieht.
- **`app/rendering/world/`** macht daraus Dreiecke. Es weiß, wie ein Haus aussieht — und nie, warum
  es dort steht.

## Die Regel, die am meisten wert ist

Keine Simulationsrechnung verzweigt auf eine Parteikennung. Parteien tragen Positionen und rote
Linien; das Modell liest die, nie den Namen. Ein Test hält das durch — siehe
`decisions/active/0002-fictional-party-identities.md`.
