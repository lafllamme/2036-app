# Design — Batzen

## Richtung

Die Stadt ist der Held. Die Oberfläche ist kein Dashboard über einem 3D-Bild, sondern eine Handvoll
**Körper**, die über dem unteren Bildrand schweben und der Stadt alles andere überlassen. Der
Einstieg darf monumental sein; das laufende Spiel ist leise und kantennah.

Die Arbeitsteilung, die alles trägt: **die Karte sagt wo, die Kante sagt was.** Was ein Ort ist,
gehört in die Stadt; was man vergleicht, entscheidet und drückt, gehört an den Rand. Eine Zahl klebt
nie an etwas, das sich bei jeder Kamerabewegung verschiebt.

## Schrift

| Rolle | Familie | Quelle | Anmerkung |
| --- | --- | --- | --- |
| Display | Supreme | Fontshare | 700, enge Laufweite. Überschriften, die Marke, große Kennzahlen. |
| Text | Switzer | Fontshare | Fließtext, **und alle Beschriftungen**. |
| Zahlen | Geist Mono | Google Fonts | Jede Zahl, die ein Spieler vergleicht: Geld, Sitze, Raten, Uhrzeiten. |

Zwei Regeln, und die zweite ist neu:

**Zahlen deutsch.** `13,20 €/m²`, nie `13.20`. Eine vergleichbare Zahl steht nie in der Textschrift.

**Beschriftung ist Sprache, keine Technik.** Eine Beschriftung heißt „Rückhalt", nicht `RÜCKHALT` in
8 px gesperrten Mono-Versalien. Die alte Oberfläche setzte jedes Label so, und genau das ließ sie
wie ein Datenblatt aussehen statt wie ein Spiel — Mono ist für Zahlen da, nicht als Kostüm für
„technisch".

## Farbrollen

Farbe trägt Bedeutung, also tun das genau zwei, und alles andere ist Papier, Grau und Tiefe. Papier
kommt in drei Stufen, nicht in fünf Einzelfarben.

| Rolle | Token | Bedeutet |
| --- | --- | --- |
| Positiv | `--positive` `#86d8b8` | Zustimmung, ein Gewinn, eine Kennzahl in die Richtung, die die Stadt will |
| Negativ | `--negative` `#ff8f6b` | Ablehnung, ein Verlust, ein Risiko, eine Frist |
| Papier | `--ink` `#f4f2ec` | Schrift, und die eine gefüllte Aktion je Region |
| Beschriftung | `--ink-2` | alles, was benannt wird |
| Beiwerk | `--ink-3` | Einheiten, Fußnoten, Zusammenhang ohne Wertung |

Drei Regeln folgen. **Kosten stehen nie in der Ablehnungsfarbe** — „teuer" und „wird scheitern" sind
verschiedene Tatsachen, nach denen man verschieden handelt; Geld steht in Papier und Mono.
**Zusammensetzungsangaben, die das Modell bewusst nicht wertet** — `internationalShare` vor allem —
sind grau, nie positiv oder negativ. Und **Parteifarben sind Identität, kein Urteil**: sie erscheinen
ausschließlich als kleiner runder Punkt neben einem Kürzel, nie als Fläche, weil Rot sonst
gleichzeitig „SPD", „Ablehnung" und „dringend" hieße.

Die vier Einsatzfarben (`--call-*`) gehören dem Renderer: sie sind die Kopie der Farben, in denen der
Ring auf der Fahrbahn gezeichnet wird, damit ein Einsatz im Stadtfunk und derselbe Einsatz aus der
Kamera erkennbar dieselbe Sache sind. `tests/unit/callColours.test.ts` hält beide Kopien zusammen.

## Oberfläche

**Kein Blur.** Die Vorgängerversion legte acht `backdrop-filter: blur(42px)` über eine Canvas, die
bei Auflösungsfaktor 1,65 in 2,7-facher Pixelzahl rendert — der teuerste Effekt im ganzen Frontend,
achtmal. Er ist ersatzlos gestrichen. Schrift, die direkt auf der Stadt steht, wird über
`--lift` lesbar, einen zweistufigen Schlagschatten; Flächen, die etwas verdecken dürfen, sind fast
undurchsichtig.

**Ein Flächen-Primitiv: `.pod`.** Ein Körper, kein Rechteck — Licht auf der Oberkante, ein Verlauf,
der ihn nach unten schwerer macht, 26 px Radius und ein Schatten mit Versatz. Keine Komponente denkt
sich ihre eigene Fläche aus. Innerhalb eines Körpers kommt Struktur aus Haarlinien und Abstand, nicht
aus verschachtelten Kästen.

**Kein Körper spannt sich von Kante zu Kante.** Eine durchgehende Leiste liest wie eine Symbolleiste
im Browser und nimmt dem Bild eine ganze Kante. Jeder Körper ist so breit wie sein Inhalt, mit Luft
dazwischen — und keiner darf aus dem Bild laufen.

**Was weicht, weicht in dieser Reihenfolge**, und die Reihenfolge ist nicht beliebig: erst Luft
(Abstände, Polster), dann Ausschmückung (die Rinne unter den Zahlen, das Wetterwort, der Name der
Amtsinhaberin), dann Größe (Knöpfe und Ziffern), und **erst zuletzt ein ganzer Körper**. Nichts, was
man drücken kann, verschwindet dabei je: Speichern und Einstellungen sind im laufenden Spiel nur an
einer Stelle erreichbar, und ausgeblendet sind sie schlicht nicht erreichbar. Die Uhr geht nie.

Der erste Entwurf blendete den Stand — Rückhalt, Mehrheit, Stand im Jahrzehnt — schon unter 1.620 px
aus und die beiden Knöpfe unter 1.320 px, also auf so gut wie jedem Laptop. Drei Zahlen, um die das
ganze Spiel geht, waren im normalen Spiel nie zu sehen, und zwei Funktionen gar nicht zu erreichen.

**Genau eine gefüllte Aktion je Region.** Die gefüllte ist Papier auf Dunkel, vollrund. Jede andere
ist dieselbe Pille in leise.

**Eine Vertiefung für alles, was einen Füllstand hat** (`.groove`): Segmente, Balken, Fortschritt.

**Icons werden gezeichnet.** Eine Strichstärke, ein Satz. Nie `▲`, `▼`, `·` oder ein Emoji als
Ersatz — auch eine Richtungsangabe ist eine gezeichnete Form und trägt ihr Wort für Screenreader
daneben.

## Wo das CSS liegt

Jedes Feature-CSS liegt im `<style scoped>` seiner Komponente. `app/assets/css/styles.css` trägt nur
noch drei Dinge: die Token, den Reset und die geteilten Primitive (`.pod`, `.groove`, `.btn`,
`.round`, `.modal-backdrop`, `.close-button`) — also genau das, was eine gekapselte Regel nicht
leisten kann. Eine Regel für einen Knopf gehört neben den Knopf.

UnoCSS trägt das Theme (Farben, die drei Schriftfamilien, Radien) und sonst nichts. Die Primitive
stehen absichtlich **nicht** als Shortcuts dort: sie bestehen aus mehrlagigen Schatten und Verläufen
und wären als Utility-Kette 200 Zeichen im Template.

## Bewegung und Zugänglichkeit

Kameraflug ist gedämpft und unterbrechbar. UI-Bewegung benutzt Deckkraft und Transform. Es gibt genau
zwei gestaltete Momente — das Blatt einer Vorlage steigt einmal herein, der Schlussbericht auch — und
sonst keine laufende Animation: das Laufband des Stadtfunks ist ersatzlos weg. Reduzierte Bewegung
schaltet den Puls einer Meldung ab. Fokusringe, skalierbare Schrift, klare Zahlenbeschriftungen und
Status, der nie nur über Farbe geht, sind Pflicht.

## Vermeiden

Keine generischen SaaS-Karten, kein Neon-Cyberpunk, keine zufälligen Verläufe, keine kopierte
Fernsehgrafik, keine flache GIS-Darstellung. Keine durchgehende Leiste. Keine gesperrten
Mono-Versalien als Beschriftung. Kein Blur.
