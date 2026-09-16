import * as THREE from 'three/webgpu'

/**
 * The face of a building, drawn once into a texture rather than modelled.
 *
 * Twelve thousand real footprints are cheap as geometry — sixty thousand vertices for the whole city
 * — but putting a window on each of them as geometry is not. The walls are tiled with this instead:
 * one storey tall, four metres wide, so a UV is nothing more than "how far along this wall, and how
 * many floors up". A building three storeys high gets three rows of windows because its UVs say so.
 */

/** One tile is one storey by one window bay, in metres. The extruder maps UVs in these units. */
export const STOREY_HEIGHT = 3.1
export const BAY_WIDTH = 4.2

const TILE = 128
/** Tag- wie Nachtkachel halten vier Fenster, sind also doppelt so groß und halb so schnell gemappt. */
const WALL_TILE = TILE * 2
const LIGHT_TILE = TILE * 2
const ROOF_TILE = 256
/** Wie hoch der Sockel in der Erdgeschosskachel steht. */
const PLINTH_BAND = TILE * 0.13

/**
 * Wie schnell die beiden Wandkacheln gemappt werden, in Achsen und Geschossen.
 *
 * Die Fensterkachel hält zwei Achsen und zwei Geschosse, die Erdgeschosskachel zwei Achsen und genau
 * **ein** Geschoss — sie steht ja nur einmal je Haus. Der Wandshader rechnet mit diesen Zahlen
 * selbst, statt sich auf `texture.repeat` zu verlassen, weil er beide Kacheln in einem Durchgang
 * liest; die Werte stehen deshalb hier und nicht zweimal.
 */
export const FACADE_REPEAT: readonly [number, number] = [0.5, 0.5]
export const GROUND_REPEAT: readonly [number, number] = [0.5, 0.5]

/**
 * Der Versatz, mit dem eine Wand sagt: ich bin die Rückseite.
 *
 * Ein Haus sah von allen vier Seiten gleich aus — vier Mal dieselbe Ladenfront, auch dort, wo in
 * Wirklichkeit die Mülltonnen stehen. Nötig wäre dafür ein zusätzliches Attribut, und das wäre ein
 * ganzer Buffer über die ganze Stadt für ein einziges Bit.
 *
 * Es geht ohne. Eine Rückwand bekommt schlicht **eine um diesen Betrag verschobene u-Koordinate**.
 * Der Betrag ist ein Vielfaches der Kachelbreite, die Wiederholung ändert sich also um kein Texel;
 * der Shader liest ihn aber als Schalter und greift eine Kachelzeile höher, wo die Rückseite liegt.
 * Kein Attribut, kein Dreieck, kein Draw, und nicht einmal ein zusätzlicher Texturzugriff.
 */
export const REAR_U = 512

/**
 * Wie groß die Dachkachel in der Welt ist, in Metern.
 *
 * Sie liegt über der Stadt und nicht über dem einzelnen Dach, also ist das eine echte Länge und keine
 * Wiederholungszahl. Sieben Meter: fein genug, dass auf jedem Dach mehrere Kacheln liegen, grob
 * genug, dass die Körnung aus der Überblickskamera noch als Struktur und nicht als Rauschen ankommt.
 */
export const ROOF_GRAIN = 7

/**
 * Die Wandtextur: vier Fenster statt einem.
 *
 * Die ganze Stadt teilte sich **eine** 128er-Kachel — jedes Haus in Lindenhafen hatte damit exakt
 * dasselbe Fenster, und das ist die Hälfte davon, warum es sich anfühlte wie ein Haus, achtzigmal
 * kopiert.
 *
 * Die Nachttextur macht es längst richtig vor: vier Fenster in einer doppelt so großen Kachel, halb
 * so schnell gemappt, und vier Stockwerke bekommen ein anderes Muster als die vier darüber. Dasselbe
 * hier, nur für den Tag — und mit dem, was ein Fenster bei Tag unterscheidet: der eine Rollladen ist
 * ganz oben, der nächste halb heruntergelassen, dahinter hängt eine Gardine, und eins steht auf
 * Kipp.
 *
 * Das kostet **keinen zusätzlichen Draw und kein zweites Material** — es ist dieselbe eine Textur,
 * nur größer und mit mehr darin. Innerhalb eines Hauses zu mischen ist dabei nicht falsch, sondern
 * richtig: in einem Mietshaus macht jede Wohnung ihre Rollläden selbst.
 */
export function facadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = WALL_TILE
  canvas.height = WALL_TILE
  const context = canvas.getContext('2d')

  if (context) {
    // The wall itself is white so the per-building vertex colour decides what the wall is made of.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, WALL_TILE, WALL_TILE)

    // Vier Fenster: offen, halb verschattet, Gardine, fast geschlossen.
    const blinds = [0, 0.42, 0.14, 0.78]
    const curtain = [false, false, true, false]
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      paintWindow(
        context,
        (quadrant % 2) * TILE,
        Math.floor(quadrant / 2) * TILE,
        blinds[quadrant]!,
        curtain[quadrant]!,
      )
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Zwei Achsen und zwei Geschosse je Kachel — dieselbe Zuordnung wie beim Licht.
  texture.repeat.set(...FACADE_REPEAT)
  texture.anisotropy = 8
  return texture
}

/** Ein Fenster bei Tag: Sturz, Glas, Rahmen, Sohlbank — und was davor hängt. */
function paintWindow(context: CanvasRenderingContext2D, originX: number, originY: number, blind: number, curtain: boolean): void {
  // A band at the floor line: the shadow gap between one storey's render and the next.
  context.fillStyle = 'rgba(0, 0, 0, 0.16)'
  context.fillRect(originX, originY + TILE - 5, TILE, 5)
  context.fillStyle = 'rgba(255, 255, 255, 0.55)'
  context.fillRect(originX, originY + TILE - 9, TILE, 4)

  const left = originX + TILE * 0.26
  const top = originY + TILE * 0.2
  const width = TILE * 0.48
  const height = TILE * 0.46

  // The reveal: the wall's own thickness around the opening, which is what reads as depth.
  context.fillStyle = 'rgba(0, 0, 0, 0.34)'
  context.fillRect(left - 4, top - 4, width + 8, height + 8)

  const glass = context.createLinearGradient(left, top, left + width, top + height)
  glass.addColorStop(0, '#5b7380')
  glass.addColorStop(0.45, '#8ba3ae')
  glass.addColorStop(0.46, '#4d6472')
  glass.addColorStop(1, '#3d515e')
  context.fillStyle = glass
  context.fillRect(left, top, width, height)

  // Die Gardine: ein heller Schleier hinter dem Glas, der die Spiegelung schluckt.
  if (curtain) {
    context.fillStyle = 'rgba(236, 233, 224, 0.62)'
    context.fillRect(left + 2, top + 2, width - 4, height - 4)
  }

  // Der Rollladen, von oben. Der Panzer ist matt und ein gutes Stück heller als das Glas.
  if (blind > 0.02) {
    const drop = height * blind
    context.fillStyle = '#b9b2a4'
    context.fillRect(left, top, width, drop)
    context.strokeStyle = 'rgba(0, 0, 0, 0.14)'
    context.lineWidth = 1
    for (let slat = 4; slat < drop; slat += 4) {
      context.beginPath()
      context.moveTo(left, top + slat)
      context.lineTo(left + width, top + slat)
      context.stroke()
    }
    // Die Kante des Panzers wirft einen Schatten auf das, was darunter noch Glas ist.
    context.fillStyle = 'rgba(0, 0, 0, 0.22)'
    context.fillRect(left, top + drop, width, 3)
  }

  // Frame, mullion and sill.
  context.strokeStyle = 'rgba(250, 250, 248, 0.9)'
  context.lineWidth = 3
  context.strokeRect(left, top, width, height)
  context.beginPath()
  context.moveTo(left + width / 2, top)
  context.lineTo(left + width / 2, top + height)
  context.stroke()
  context.fillStyle = 'rgba(252, 252, 250, 0.95)'
  context.fillRect(left - 4, top + height, width + 8, 4)
}

/**
 * Das Erdgeschoss, und warum es eine eigene Textur braucht.
 *
 * Ein Haus in Lindenhafen hatte fünf Mal dasselbe Geschoss übereinander — das fünfte sah aus wie das
 * erste, es gab keine Tür, kein Schaufenster, keinen Sockel. Und das ist der Grund, aus dem eine
 * Wand wie eine *Fläche* wirkt und nicht wie ein Gebäude: an einem echten Haus ist unten alles
 * anders. Da ist der Eingang, da ist der Laden, da steht der Putz auf einem Sockel, da lehnt der
 * Dreck, da klebt das Plakat, da steht die Tags.
 *
 * Es kostet **kein Dreieck und keinen Draw**. Die Wand trägt ihre Geschosszahl längst in der
 * v-Koordinate — `v` ist null am Fußboden und zählt von dort aufwärts —, also weiß der Shader ohne
 * jedes zusätzliche Attribut, ob ein Fragment im Erdgeschoss steht: `v < 1`. Dort wird diese Kachel
 * gelesen statt der Fensterkachel, und weil beide ihre eigene Wiederholung haben, gibt es keinen
 * Atlas, keine Naht und keine kaputte Ableitung an der Kante.
 *
 * Zwei Achsen: ein Ladenlokal und ein Hauseingang. Beides multipliziert die Wandfarbe des Hauses,
 * wie die Fensterkachel auch.
 */
export function groundFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TILE * 2
  canvas.height = TILE * 2
  const context = canvas.getContext('2d')

  if (context) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, TILE * 2, TILE * 2)
    plaster(context, TILE * 2, TILE * 2)
    /*
     * Untere Kachelzeile ist die Straßenseite, obere die Rückseite. `v` läuft im Erdgeschoss immer
     * zwischen null und eins — es gibt ja nur ein Erdgeschoss —, also kann die zweite Zeile hier
     * liegen, ohne dass irgendetwas umlaufen könnte.
     */
    shopfront(context, 0, TILE)
    shuttered(context, TILE, TILE)
    backyard(context, 0, 0)
    backyard(context, TILE, 0)
    // Der Sockel läuft unter beiden Achsen durch — er gehört dem Haus und nicht der Achse.
    for (const originY of [0, TILE]) {
      for (const originX of [0, TILE])
        plinth(context, originX, originY)
    }
    graffiti(context)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...GROUND_REPEAT)
  texture.anisotropy = 8
  return texture
}

/** Ein Ladenlokal: Sturz, Schaufenster über Brüstung, Tür daneben. */
function shopfront(context: CanvasRenderingContext2D, originX: number, originY: number): void {
  const fasciaTop = originY + TILE * 0.12
  const fasciaHeight = TILE * 0.13
  // Die Schaufensterfront: eine dunkle Glasfläche, die bis fast auf den Boden geht.
  const glassTop = fasciaTop + fasciaHeight + 3
  const glassBottom = originY + TILE - PLINTH_BAND - TILE * 0.06
  const left = originX + TILE * 0.1
  const width = TILE * 0.62

  // Sturz und Fries über dem Laden — die waagerechte Linie, die ein Erdgeschoss abschließt.
  context.fillStyle = 'rgba(0, 0, 0, 0.2)'
  context.fillRect(originX, fasciaTop, TILE, fasciaHeight)
  context.fillStyle = 'rgba(0, 0, 0, 0.32)'
  context.fillRect(originX, fasciaTop + fasciaHeight, TILE, 4)

  context.fillStyle = 'rgba(0, 0, 0, 0.3)'
  context.fillRect(left - 4, glassTop - 4, width + 8, glassBottom - glassTop + 8)
  const glass = context.createLinearGradient(left, glassTop, left + width, glassBottom)
  glass.addColorStop(0, '#39454c')
  glass.addColorStop(0.5, '#4f5f68')
  glass.addColorStop(1, '#2d383e')
  context.fillStyle = glass
  context.fillRect(left, glassTop, width, glassBottom - glassTop)
  // Der Pfosten in der Mitte und die Brüstung darunter.
  context.fillStyle = 'rgba(245, 243, 238, 0.8)'
  context.fillRect(left + width / 2 - 2, glassTop, 4, glassBottom - glassTop)
  context.fillRect(left - 4, glassBottom, width + 8, 5)

  // Die Ladentür rechts daneben, schmal und ganz aus Glas.
  const doorLeft = originX + TILE * 0.78
  const doorWidth = TILE * 0.14
  context.fillStyle = '#2f3a40'
  context.fillRect(doorLeft, glassTop, doorWidth, originY + TILE - PLINTH_BAND - glassTop)
  context.strokeStyle = 'rgba(240, 238, 232, 0.75)'
  context.lineWidth = 3
  context.strokeRect(doorLeft, glassTop, doorWidth, originY + TILE - PLINTH_BAND - glassTop)
}

/**
 * Die zweite Achse im Erdgeschoss — **und warum hier kein Hauseingang steht.**
 *
 * Hier stand einer, und das war Unsinn: die Kachel wiederholt sich alle zwei Achsen, also bekam ein
 * dreißig Meter langer Block **vier Haustüren**. Ein Haus hat einen Eingang. Eine gekachelte Textur
 * kann so etwas grundsätzlich nicht leisten — was nur einmal je Gebäude vorkommt, muss Geometrie
 * sein, und die Tür steht jetzt dort, wo auch die Treppe steht: in der Mitte der Straßenwand.
 *
 * Was sich dagegen sehr wohl wiederholen darf, ist das, was an einer Geschäftsstraße wirklich alle
 * paar Meter kommt: das nächste Ladenlokal. Dieses hier ist zu — Rollgitter runter, Werbeband leer.
 */
function shuttered(context: CanvasRenderingContext2D, originX: number, originY: number): void {
  const top = originY + TILE * 0.3
  const bottom = originY + TILE - PLINTH_BAND
  const left = originX + TILE * 0.12
  const width = TILE * 0.74

  // Das leere Werbeband über dem Laden.
  context.fillStyle = 'rgba(0, 0, 0, 0.22)'
  context.fillRect(originX, originY + TILE * 0.13, TILE, TILE * 0.13)

  context.fillStyle = 'rgba(0, 0, 0, 0.3)'
  context.fillRect(left - 4, top - 4, width + 8, bottom - top + 4)
  // Der Rollgitterpanzer: waagerechte Lamellen, matt, deutlich heller als eine Fensteröffnung.
  context.fillStyle = '#8d8983'
  context.fillRect(left, top, width, bottom - top)
  context.strokeStyle = 'rgba(0, 0, 0, 0.26)'
  context.lineWidth = 2
  for (let slat = 5; slat < bottom - top; slat += 6) {
    context.beginPath()
    context.moveTo(left, top + slat)
    context.lineTo(left + width, top + slat)
    context.stroke()
  }
  // Die Führungsschienen links und rechts.
  context.fillStyle = 'rgba(0, 0, 0, 0.24)'
  context.fillRect(left - 3, top, 4, bottom - top)
  context.fillRect(left + width - 1, top, 4, bottom - top)
}

/**
 * Die Rückseite: was hinten am Haus ist, wenn vorne der Laden ist.
 *
 * Kein Schaufenster, kein Hauseingang, keine Auslage. Stattdessen das, wofür an einer Straßenseite
 * kein Platz wäre: eine Stahltür für die Anlieferung, ein Fallrohr über die ganze Höhe, ein
 * Kellerfenster über dem Boden und ein Kasten für den Zähler. Genau daran erkennt man von oben, wo
 * ein Block seine Vorder- und wo er seine Rückseite hat.
 */
function backyard(context: CanvasRenderingContext2D, originX: number, originY: number): void {
  // Das Fallrohr — die eine senkrechte Linie, die jede Hofwand hat.
  context.fillStyle = 'rgba(0, 0, 0, 0.26)'
  context.fillRect(originX + TILE * 0.09, originY, 7, TILE - PLINTH_BAND)
  context.fillStyle = 'rgba(255, 255, 255, 0.28)'
  context.fillRect(originX + TILE * 0.09, originY, 2, TILE - PLINTH_BAND)

  // Die Stahltür: schmal, ohne Glas, mit einem Riegel.
  const doorLeft = originX + TILE * 0.3
  const doorWidth = TILE * 0.17
  const doorTop = originY + TILE * 0.42
  const doorBottom = originY + TILE - PLINTH_BAND
  context.fillStyle = 'rgba(0, 0, 0, 0.3)'
  context.fillRect(doorLeft - 4, doorTop - 4, doorWidth + 8, doorBottom - doorTop + 4)
  context.fillStyle = '#5c5c58'
  context.fillRect(doorLeft, doorTop, doorWidth, doorBottom - doorTop)
  context.fillStyle = 'rgba(0, 0, 0, 0.3)'
  context.fillRect(doorLeft + doorWidth * 0.6, doorTop + (doorBottom - doorTop) * 0.45, doorWidth * 0.3, 4)

  // Ein kleines Fenster hoch oben, wie es ein Treppenhaus oder ein Bad hat.
  const left = originX + TILE * 0.62
  const top = originY + TILE * 0.3
  const width = TILE * 0.17
  const height = TILE * 0.22
  context.fillStyle = 'rgba(0, 0, 0, 0.32)'
  context.fillRect(left - 3, top - 3, width + 6, height + 6)
  context.fillStyle = '#4b5f69'
  context.fillRect(left, top, width, height)
  context.strokeStyle = 'rgba(244, 242, 236, 0.8)'
  context.lineWidth = 2
  context.strokeRect(left, top, width, height)

  // Der Zählerkasten neben der Tür.
  context.fillStyle = 'rgba(0, 0, 0, 0.18)'
  context.fillRect(originX + TILE * 0.86, originY + TILE * 0.5, TILE * 0.08, TILE * 0.12)
}

/**
 * Der Sockel.
 *
 * Ein Haus steht auf etwas. Ohne diese Bank wächst eine Putzfläche aus dem Gehweg, und das ist der
 * kürzeste Weg, ein Gebäude wie ein gestelltes Volumen aussehen zu lassen.
 */
function plinth(context: CanvasRenderingContext2D, originX: number, originY: number): void {
  const top = originY + TILE - PLINTH_BAND
  context.fillStyle = 'rgba(0, 0, 0, 0.26)'
  context.fillRect(originX, top, TILE, PLINTH_BAND)
  // Die Kante oben: eine helle Fase, an der das Licht bricht.
  context.fillStyle = 'rgba(255, 255, 255, 0.35)'
  context.fillRect(originX, top, TILE, 3)
  // Spritzwasser: was von unten hochzieht, dunkel und ungleichmäßig.
  context.fillStyle = 'rgba(0, 0, 0, 0.16)'
  for (let x = 0; x < TILE; x += 7) {
    const rise = 4 + ((x * 37) % 11)
    context.fillRect(originX + x, originY + TILE - rise, 7, rise)
  }
}

/**
 * Und das, was an einer Wand steht, die niemand bewacht.
 *
 * Bewusst schwach und unregelmäßig. Ein sauber gezeichnetes Tag wäre bei zwei Achsen Wiederholung
 * ein Stempel; ein Schmierer ist bei jeder Wiederholung nur wieder eine schmutzige Wand. Er sitzt
 * auf dem Sockel und darüber, also genau dort, wo man von der Straße aus hinlangt.
 */
function graffiti(context: CanvasRenderingContext2D): void {
  context.save()
  context.globalAlpha = 0.5
  context.lineCap = 'round'
  context.lineJoin = 'round'

  // Ein Zug in der ersten Achse: hoch angesetzt, schnell gezogen, ohne abzusetzen.
  context.strokeStyle = '#2f3b6b'
  context.lineWidth = 5
  context.beginPath()
  context.moveTo(TILE * 0.06, TILE * 0.82)
  context.bezierCurveTo(TILE * 0.16, TILE * 0.7, TILE * 0.2, TILE * 0.95, TILE * 0.3, TILE * 0.8)
  context.bezierCurveTo(TILE * 0.37, TILE * 0.7, TILE * 0.42, TILE * 0.92, TILE * 0.52, TILE * 0.83)
  context.stroke()

  // In der zweiten Achse nur noch Reste: ein übermalter Fleck und ein Plakatrest.
  context.globalAlpha = 0.34
  context.fillStyle = '#6b4a3a'
  context.beginPath()
  context.ellipse(TILE * 1.72, TILE * 0.86, TILE * 0.17, TILE * 0.07, 0.2, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#7a2f3a'
  context.lineWidth = 4
  context.beginPath()
  context.moveTo(TILE * 1.5, TILE * 0.9)
  context.quadraticCurveTo(TILE * 1.6, TILE * 0.78, TILE * 1.7, TILE * 0.91)
  context.stroke()
  context.restore()
}

/**
 * Putz ist keine Fläche.
 *
 * Die Kachel war zwischen den Fenstern reines Weiß — also nahm die Wand die Vertexfarbe des Hauses
 * völlig gleichmäßig an, und eine zwanzig Meter breite Wand war ein einziger, toter Farbwert. Ein
 * bisschen Körnung und ein paar ausgebesserte Stellen kosten nichts (es wird einmal beim Aufbau
 * gezeichnet) und nehmen der Fläche genau das, was sie flach macht.
 */
function plaster(context: CanvasRenderingContext2D, width: number, height: number): void {
  // Körnung: schwacher Wertrauschteppich, deterministisch, damit der Aufbau reproduzierbar bleibt.
  let seed = 0x2F6E2B1
  const random = (): number => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    return seed / 0x100000000
  }
  for (let i = 0; i < width * height * 0.06; i += 1) {
    const shade = random() < 0.5 ? 0 : 255
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.05)`
    context.fillRect(Math.floor(random() * width), Math.floor(random() * height), 2, 2)
  }
  // Ausgebesserte Stellen: wo einmal etwas zugeputzt wurde, steht der Ton bis heute daneben.
  for (let i = 0; i < 5; i += 1) {
    const w = 12 + random() * 34
    const h = 10 + random() * 26
    context.fillStyle = random() < 0.5 ? 'rgba(0, 0, 0, 0.055)' : 'rgba(255, 255, 255, 0.07)'
    context.fillRect(random() * (width - w), random() * (height - h), w, h)
  }
}

/**
 * Die Dachhaut — und warum sie über die Weltkoordinate gelegt wird, nicht über eine UV.
 *
 * Von der Überblickskamera aus ist die Dachfläche **die** Fläche von Lindenhafen: man schaut von
 * schräg oben, man sieht Dächer. Sie hatten überhaupt keine Textur, sondern eine einzige Vertexfarbe
 * — eine große, vollkommen ebene, tote Fläche, und das ist es, was ein Haus wie ein Kunststoffklotz
 * aussehen lässt, ganz gleich welche Farbe daraufliegt.
 *
 * Dachflächen haben aber keine UVs. Sie tragen `(0, 0)` auf jedem Eckpunkt, weil sie nie eine Textur
 * brauchten, und ihnen nachträglich welche zu geben hieße, für Walm, Sattel, Pyramide, Attika,
 * Schornstein und Treppe je eine eigene Abwicklung zu rechnen.
 *
 * Es geht ohne. Ein Dach liegt fast waagerecht, also ist seine Position in der Welt bereits eine
 * brauchbare Textur­koordinate: **x und z genügen.** Der Shader nimmt sie direkt, die Kachel liegt
 * über der ganzen Stadt wie ein Raster, und zwei benachbarte Dächer bekommen dadurch sogar
 * verschiedene Ausschnitte. Kein Attribut, kein Dreieck, kein Draw.
 *
 * Bewusst richtungslos. Eine Ziegelreihe hätte eine Richtung, und die wäre über die ganze Stadt
 * dieselbe — tausend Dächer, alle mit demselben Strich. Was hier liegt, ist Körnung, Fleckigkeit und
 * ein paar Flicken: das, was eine Dachfläche auf zweihundert Meter Entfernung von einer Ebene
 * unterscheidet.
 */
export function roofTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = ROOF_TILE
  canvas.height = ROOF_TILE
  const context = canvas.getContext('2d')

  if (context) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, ROOF_TILE, ROOF_TILE)

    let seed = 0x51ED270B
    const random = (): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
      return seed / 0x100000000
    }
    // Die Körnung: feiner Wertrauschteppich über die ganze Kachel.
    for (let i = 0; i < ROOF_TILE * ROOF_TILE * 0.22; i += 1) {
      const shade = random() < 0.5 ? 0 : 255
      context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.07)`
      context.fillRect(Math.floor(random() * ROOF_TILE), Math.floor(random() * ROOF_TILE), 2, 2)
    }
    // Die Fleckigkeit: was Regen, Moos und Ausbesserungen über Jahrzehnte aus einer Fläche machen.
    for (let i = 0; i < 26; i += 1) {
      const radius = 5 + random() * 22
      const blot = context.createRadialGradient(
        random() * ROOF_TILE,
        random() * ROOF_TILE,
        0,
        0,
        0,
        radius,
      )
      const dark = random() < 0.62
      blot.addColorStop(0, dark ? 'rgba(0, 0, 0, 0.11)' : 'rgba(255, 255, 255, 0.12)')
      blot.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.save()
      context.translate(random() * ROOF_TILE, random() * ROOF_TILE)
      context.fillStyle = blot
      context.fillRect(-radius, -radius, radius * 2, radius * 2)
      context.restore()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

/**
 * What a window emits after dark, as a mask on the same tiles.
 *
 * The wall is black here and only the glass is lit, so raising the material's emissive lights the
 * windows rather than the whole façade — which is what a single flat emissive did, and why the city
 * read as a row of lanterns.
 *
 * Two things it has to get right and did not. A window is a rectangle with a frame across it, and
 * this was a radial gradient: every lit window came out as a soft oval blob, which from the pavement
 * is the one thing that gave the whole city away. And a block of flats never has every window lit —
 * so the tile holds four of them at four different brightnesses, one of them dark, and is mapped at
 * half the rate of the wall texture. Four storeys of a building get a different pattern from the
 * four above them without a second material or a second draw.
 */
export function windowLightTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = LIGHT_TILE
  canvas.height = LIGHT_TILE
  const context = canvas.getContext('2d')

  if (context) {
    context.fillStyle = '#000000'
    context.fillRect(0, 0, LIGHT_TILE, LIGHT_TILE)
    // Bottom left, bottom right, top left, top right. One of the four is out.
    const brightness = [1, 0.34, 0, 0.72]
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const lit = brightness[quadrant]!
      if (lit <= 0)
        continue
      const originX = (quadrant % 2) * TILE
      const originY = Math.floor(quadrant / 2) * TILE
      paintLitWindow(context, originX, originY, lit)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Two bays and two storeys to a tile, which is what puts four different windows on a wall.
  texture.repeat.set(0.5, 0.5)
  texture.anisotropy = 4
  return texture
}

/** One lit window: warm glass, a dark frame across it, and a little spill onto the reveal. */
function paintLitWindow(context: CanvasRenderingContext2D, originX: number, originY: number, lit: number): void {
  const left = originX + TILE * 0.26
  const top = originY + TILE * 0.2
  const width = TILE * 0.48
  const height = TILE * 0.46
  const warm = (alpha: number): string => `rgba(255, 214, 150, ${alpha})`

  // The spill: what the room throws onto the wall around the opening. Soft, and much weaker.
  const spill = context.createRadialGradient(left + width / 2, top + height / 2, width * 0.5, left + width / 2, top + height / 2, width * 1.05)
  spill.addColorStop(0, warm(0.3 * lit))
  spill.addColorStop(1, warm(0))
  context.fillStyle = spill
  context.fillRect(originX, originY, TILE, TILE)

  context.fillStyle = warm(lit)
  context.fillRect(left, top, width, height)

  // Frame and mullion, unlit, so the shape of a window survives however bright the room is.
  context.strokeStyle = 'rgba(0, 0, 0, 0.85)'
  context.lineWidth = 3
  context.strokeRect(left, top, width, height)
  context.beginPath()
  context.moveTo(left + width / 2, top)
  context.lineTo(left + width / 2, top + height)
  context.moveTo(left, top + height * 0.46)
  context.lineTo(left + width, top + height * 0.46)
  context.stroke()
}
