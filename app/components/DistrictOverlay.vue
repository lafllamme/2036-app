<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { screenPoint } from '~/rendering/screen'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'
import { DISTRICT_BY_ID } from '~/world/model/lindenhafen'

/**
 * Die zwanzig Viertel, über die Stadt gelegt.
 *
 * Miete, Einbrüche und Leerstand gelten seit einem Tag je Bezirk — und man sah sie **nur**, wenn man
 * zufällig ein Haus anklickte. Die Standortwahl fragt aber „Hafen, Vorstadt West oder Gründerzeit
 * Nord?", und der Spieler hatte keine Möglichkeit zu sehen, wo die Miete hoch ist. Das ist eine
 * Entscheidung ohne die Auskunft, die sie beantwortet.
 *
 * ## Warum das kein 3D ist
 *
 * Naheliegend wäre eine eingefärbte Fläche auf dem Boden. Der Boden ist aber **eine einzige Fläche
 * mit Relief** — eine flache Platte darüber schneidet jeden Hügel, und eine, die dem Relief folgt,
 * ist ein Netz je Viertel plus Z-Fighting mit allem, was darauf steht.
 *
 * Projiziert man stattdessen die Stützpunkte der Grenze einzeln, kommt derselbe Umriss auf dem
 * Schirm heraus — perspektivisch korrekt, ohne ein einziges Dreieck in der Szene und ohne
 * Tiefenkonflikt. Dass die Fläche dabei über den Häusern liegt statt zwischen ihnen, ist richtig:
 * eine Auskunft, die hinter der Stadt verschwindet, ist keine.
 *
 * ## Und warum die Grenze für den Schirm noch einmal ausgedünnt wird
 *
 * Seit den echten Ortsteilgrenzen ist ein Viertel kein Rechteck mehr, sondern ein Polygon mit bis zu
 * achtzig Stützpunkten — zwanzig davon sind rund siebenhundert Projektionen **je Bild**. Das wäre
 * noch tragbar und trotzdem verschenkt: aus der Überblickskamera liegen drei aufeinanderfolgende
 * Punkte einer Grenze regelmäßig im selben Pixel. Ausgedünnt wird deshalb einmal beim Laden, nach
 * Länge in Metern, auf höchstens 28 Punkte je Viertel — das ist der Unterschied zwischen 700 und
 * 400 Projektionen, und auf dem Schirm sieht man ihn nicht.
 */

const game = useGameStore()
const { overlay, snapshot, walking, experienceStage, project, districtShapes } = storeToRefs(game)

/** Was die drei Lagen anzeigen — und wie man die Zahl schreibt. */
const READINGS = {
  averageRent: { label: 'Miete', unit: '€/m²', digits: 2 },
  burglaryRate: { label: 'Einbrüche', unit: '/ 1.000', digits: 1 },
  vacantUnits: { label: 'Leerstand', unit: 'Wohnungen', digits: 0 },
} as const

const showing = computed(() =>
  overlay.value !== 'none' && experienceStage.value === 'gameplay' && !walking.value
    ? overlay.value
    : null)

const reading = computed(() => (showing.value ? READINGS[showing.value] : null))

/**
 * Je Bezirk: seine vier Ecken, sein Wert, und wie weit er vom Stadtschnitt abweicht.
 *
 * Die Abweichung ist die eigentliche Auskunft. „14,20 €/m²" sagt wenig; „ein Fünftel über dem
 * Schnitt" sagt, wo man baut.
 */
/**
 * Die Grenze auf so viele Stützpunkte eindampfen, wie sie auf dem Schirm noch braucht.
 *
 * Nicht nach Winkel, sondern nach **Länge**: eine Grenze, die einen Häuserblock umfährt, hat dort
 * zwanzig Punkte auf achtzig Metern, und keiner davon ist aus zwei Kilometern Entfernung von seinem
 * Nachbarn zu unterscheiden. Behalten wird jeder Punkt, der weiter als ein Zwanzigstel des Umfangs
 * vom letzten behaltenen entfernt ist — dabei bleibt die Form, und die Zackerei fällt weg.
 */
function outlineOf(polygon: number[]): { x: number, z: number }[] {
  const points: { x: number, z: number }[] = []
  for (let at = 0; at < polygon.length; at += 2)
    points.push({ x: polygon[at]!, z: polygon[at + 1]! })
  if (points.length <= 12)
    return points

  let perimeter = 0
  for (let at = 0; at < points.length; at += 1) {
    const from = points[at]!
    const to = points[(at + 1) % points.length]!
    perimeter += Math.hypot(to.x - from.x, to.z - from.z)
  }
  const step = perimeter / 26

  const kept = [points[0]!]
  for (const point of points.slice(1)) {
    const last = kept[kept.length - 1]!
    if (Math.hypot(point.x - last.x, point.z - last.z) >= step)
      kept.push(point)
  }
  return kept.length >= 4 ? kept : points
}

/**
 * Je Viertel: sein Umriss, sein Wert, und wie weit er vom Stadtschnitt abweicht.
 *
 * Die Abweichung ist die eigentliche Auskunft. „14,20 €/m²" sagt wenig; „ein Fünftel über dem
 * Schnitt" sagt, wo man baut.
 */
const outlines = computed(() => new Map(districtShapes.value.map(shape => [shape.id, outlineOf(shape.polygon)])))

const districts = computed(() => {
  const metric = showing.value
  const city = metric ? snapshot.value?.metrics[metric] ?? 0 : 0
  if (!metric || !snapshot.value || city === 0)
    return []

  return districtShapes.value.map((shape) => {
    const value = snapshot.value!.districtMetrics[shape.id][metric]
    return {
      id: shape.id,
      name: DISTRICT_BY_ID.get(shape.id)?.shortName ?? shape.id,
      value,
      /** −1 … 1, geklemmt: ein Drittel Abweichung ist voller Ausschlag. */
      tilt: Math.max(-1, Math.min(1, (value / city - 1) / 0.33)),
      corners: outlines.value.get(shape.id) ?? [],
      centre: shape.centre,
    }
  })
})

/**
 * Über dem Schnitt warm, darunter kühl — **und im Schnitt trotzdem eine Fläche.**
 *
 * Vorher war die Deckkraft `alpha × tilt`, und ein Viertel, das genau auf dem Stadtwert liegt, wurde
 * damit vollständig durchsichtig. In der Kartenansicht fehlte deshalb ein Drittel der Flächen — nicht
 * weil sie nicht gezeichnet wurden, sondern weil sie mit Deckkraft null gezeichnet wurden. Eine Lage,
 * die „unauffällig" durch „nicht vorhanden" darstellt, beantwortet die Frage „welche Viertel gibt es
 * überhaupt?" gar nicht mehr.
 *
 * Jetzt liegt unter allem ein Grundschleier, und der Ausschlag kommt oben drauf: jedes Viertel ist
 * eine Fläche, und wie stark sie gefärbt ist, sagt, wie weit es vom Schnitt weg ist.
 */
const NEUTRAL: readonly [number, number, number] = [188, 190, 186]
const HIGH: readonly [number, number, number] = [214, 106, 70]
const LOW: readonly [number, number, number] = [108, 199, 138]

function tint(tilt: number): string {
  const strength = Math.min(1, Math.abs(tilt))
  const towards = tilt >= 0 ? HIGH : LOW
  const channel = (at: 0 | 1 | 2): number => Math.round(NEUTRAL[at] + (towards[at] - NEUTRAL[at]) * strength)
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${(0.13 + strength * 0.3).toFixed(3)})`
}

const shapes = ref<{ id: string, points: string, fill: string, at: { x: number, y: number } | null }[]>([])
const point = screenPoint()
const probe = screenPoint()
let frame = 0

/**
 * Einmal je Bild: die Stützpunkte der Grenze projizieren, ein Polygon daraus schreiben.
 *
 * Ein Punkt hinter der Kamera projiziert gespiegelt, und aus dem Umriss wird ein Papierflieger.
 * Die erste Fassung hat deshalb jedes Viertel **weggelassen**, bei dem auch nur ein Stützpunkt im
 * Rücken lag — mit acht Rechtecken war das selten, mit zwanzig Vierteln und einer tiefen Kamera ist
 * es die halbe Vordergrundstadt. „Lieber nicht zeichnen als falsch zeichnen" ist richtig; „gar nicht
 * zeichnen" war die faule Hälfte davon.
 *
 * Geschnitten wird stattdessen an der Kamerabene: läuft eine Kante von vorn nach hinten, wird der
 * Durchstoßpunkt gesucht und die Kante dort abgeschnitten. Gesucht wird ihn per Intervallhalbierung
 * über denselben Projektor — acht Schritte, und man braucht weder die Kameraposition noch ihre
 * Blickrichtung dafür. Zwei Durchstöße je Polygon sind der Normalfall, also sechzehn zusätzliche
 * Projektionen für ein Viertel, das sonst ganz gefehlt hätte.
 */
const CLIP_STEPS = 8
/**
 * Wie groß der sichtbare Teil eines Viertels sein muss, um beschriftet zu werden, in Pixeln.
 *
 * Zwanzig Namen auf einem Schirm sind zu viele, und die überflüssigen sind immer dieselben: das
 * Viertel, von dem gerade ein Zipfel am Bildrand hereinragt. Zwölftausend Pixel sind ein Fleck von
 * 110 × 110 — darunter steht der Name über einer Fläche, die man ohnehin nicht als Fläche liest.
 */
const LABEL_AREA = 12_000
/** Und wie weit vom Rand weg er stehen muss. Geklemmt wird **nicht**: siehe `labelAt`. */
const LABEL_MARGIN = 70
/** Was das Deck unten verdeckt. Ein Name dahinter ist kein Name. */
const BOTTOM_DECK = 150

/** Liegt dieser Weltpunkt vor der Kamera? `away === 0` heißt: dahinter — siehe `rendering/screen.ts`. */
function ahead(projector: NonNullable<typeof project.value>, x: number, z: number): boolean {
  projector(x, 0, z, probe)
  return probe.onScreen || probe.away > 0
}

/**
 * Der Punkt auf der Strecke, an dem sie die Kamerabene durchstößt — **mit Abstand davor.**
 *
 * Der Abstand ist der ganze Trick. Genau auf der Ebene ist die homogene Koordinate `w` null, und
 * `x / w` läuft gegen unendlich: die erste Fassung hat bis auf die Ebene halbiert und damit weiße
 * Striche quer über den Himmel gezogen, weil eine Polygonecke bei ±200.000 Pixeln lag. Zurückgesetzt
 * wird deshalb ein Zwanzigstel der Strecke zur sichtbaren Seite hin — auf dem Schirm ist das
 * unsichtbar, und `w` bleibt weit genug von null weg.
 */
const CLIP_BACKOFF = 0.05

function crossing(projector: NonNullable<typeof project.value>, from: { x: number, z: number }, to: { x: number, z: number }): { x: number, z: number } {
  let good = from
  let bad = to
  for (let step = 0; step < CLIP_STEPS; step += 1) {
    const middle = { x: (good.x + bad.x) / 2, z: (good.z + bad.z) / 2 }
    if (ahead(projector, middle.x, middle.z))
      good = middle
    else bad = middle
  }
  return {
    x: good.x + (from.x - good.x) * CLIP_BACKOFF,
    z: good.z + (from.z - good.z) * CLIP_BACKOFF,
  }
}
/**
 * Das projizierte Vieleck auf den Schirm schneiden.
 *
 * Für die **Beschriftung**, nicht fürs Zeichnen — das übernimmt das SVG von allein. Ohne diesen
 * Schnitt liegt der Schwerpunkt eines Vordergrundviertels tausende Pixel unter dem Bildrand: sein
 * sichtbarer Teil ist ein Streifen am unteren Rand, sein projizierter reicht bis ins Nirgendwo, weil
 * die an der Kamerabene abgeschnittene Kante dorthin läuft. Gemessen: ein Viertel kam auf 44
 * Millionen Pixel Fläche bei einem Schirm von 763.000. Von zwanzig Vierteln bekamen so vier einen
 * Namen, und die sechzehn anderen lagen als namenlose Farbflächen da.
 *
 * Sutherland–Hodgman gegen das Rechteck, vier Durchgänge, einer je Kante. Zwanzig Vielecke je Bild
 * mit je dreißig Punkten sind nichts gegen die Projektionen, die ohnehin schon laufen.
 */
function clipToScreen(points: { x: number, y: number }[], width: number, height: number): { x: number, y: number }[] {
  const inside = (point: { x: number, y: number }, edge: number): boolean =>
    [point.x >= 0, point.x <= width, point.y >= 0, point.y <= height][edge]!
  const cut = (from: { x: number, y: number }, to: { x: number, y: number }, edge: number): { x: number, y: number } => {
    if (edge < 2) {
      const x = edge === 0 ? 0 : width
      return { x, y: from.y + ((x - from.x) / (to.x - from.x)) * (to.y - from.y) }
    }
    const y = edge === 2 ? 0 : height
    return { x: from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x), y }
  }

  let out = points
  for (let edge = 0; edge < 4 && out.length > 0; edge += 1) {
    const input = out
    out = []
    for (let at = 0; at < input.length; at += 1) {
      const previous = input[(at - 1 + input.length) % input.length]!
      const current = input[at]!
      if (inside(current, edge)) {
        if (!inside(previous, edge))
          out.push(cut(previous, current, edge))
        out.push(current)
      }
      else if (inside(previous, edge)) {
        out.push(cut(previous, current, edge))
      }
    }
  }
  return out
}

/**
 * Und daraus der Platz für den Namen: der Flächenschwerpunkt des sichtbaren Teils.
 *
 * Der Flächenschwerpunkt und nicht das Mittel der Ecken: ein Viertel, das am Bildrand angeschnitten
 * ist, hat dort viele Stützpunkte auf kurzer Strecke, und das Eckenmittel zöge den Namen genau
 * dorthin.
 */
function labelAt(screen: { x: number, y: number }[]): { x: number, y: number } | null {
  const visible = clipToScreen(screen, window.innerWidth, window.innerHeight - BOTTOM_DECK)
  if (visible.length < 3)
    return null

  let twice = 0
  let x = 0
  let y = 0
  for (let at = 0; at < visible.length; at += 1) {
    const from = visible[at]!
    const to = visible[(at + 1) % visible.length]!
    const cross = from.x * to.y - to.x * from.y
    twice += cross
    x += (from.x + to.x) * cross
    y += (from.y + to.y) * cross
  }
  if (Math.abs(twice) / 2 < LABEL_AREA || twice === 0)
    return null

  const at = { x: x / (3 * twice), y: y / (3 * twice) }
  // Randnah heißt halb abgeschnitten; dann lieber die Fläche allein, die hat ihre Farbe.
  const room = at.x > LABEL_MARGIN && at.x < window.innerWidth - LABEL_MARGIN && at.y > 40
  return room ? at : null
}

function trace(): void {
  frame = requestAnimationFrame(trace)
  const projector = project.value
  if (!projector || districts.value.length === 0) {
    if (shapes.value.length > 0)
      shapes.value = []
    return
  }

  const next: typeof shapes.value = []
  for (const district of districts.value) {
    /*
     * Erst schneiden, dann projizieren. Der Ring wird einmal umlaufen; wo er die Kamerabene
     * kreuzt, kommt der Durchstoßpunkt hinein und der Punkt dahinter fällt weg.
     */
    const ring = district.corners
    const visible: { x: number, z: number }[] = []
    for (let at = 0; at < ring.length; at += 1) {
      const previous = ring[(at - 1 + ring.length) % ring.length]!
      const current = ring[at]!
      const currentAhead = ahead(projector, current.x, current.z)
      const previousAhead = ahead(projector, previous.x, previous.z)
      if (currentAhead) {
        if (!previousAhead)
          visible.push(crossing(projector, current, previous))
        visible.push(current)
      }
      else if (previousAhead) {
        visible.push(crossing(projector, previous, current))
      }
    }
    if (visible.length < 3)
      continue

    const points: string[] = []
    const screen: { x: number, y: number }[] = []
    for (const corner of visible) {
      projector(corner.x, 0, corner.z, point)
      points.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      screen.push({ x: point.x, y: point.y })
    }

    /*
     * Der Name steht in der Mitte des **sichtbaren** Teils, nicht in der Mitte des Viertels.
     *
     * Er hing am Beschriftungspunkt aus der Kartendatei, und der liegt bei elf von zwanzig Vierteln
     * außerhalb des Bildes — gezeichnet waren die Flächen dann, aber ohne Namen, und eine Fläche
     * ohne Namen beantwortet keine Frage. Der Schwerpunkt des projizierten Vielecks liegt dagegen
     * immer dort, wo man auch hinschaut.
     */
    next.push({
      id: district.id,
      points: points.join(' '),
      fill: tint(district.tilt),
      at: labelAt(screen),
    })
  }
  shapes.value = next
}

onMounted(() => {
  frame = requestAnimationFrame(trace)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))

// Eine Lage, die niemand sehen kann, ist keine: beim Umschalten schließt das Lagebild.
watch(showing, (now) => {
  if (now)
    game.railOpen = false
})
</script>

<template>
  <div v-if="showing && reading" class="districts" aria-hidden="true">
    <svg class="sheet">
      <polygon
        v-for="shape in shapes"
        :key="shape.id"
        :points="shape.points"
        :fill="shape.fill"
        stroke="rgba(255, 255, 255, 0.34)"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>

    <span
      v-for="shape in shapes"
      :key="`tag-${shape.id}`"
      class="tag"
      :style="shape.at ? { left: `${shape.at.x}px`, top: `${shape.at.y}px` } : { display: 'none' }"
    >
      <b>{{ districts.find(entry => entry.id === shape.id)?.name }}</b>
      <i>{{ formatNumber(districts.find(entry => entry.id === shape.id)?.value ?? 0, reading.digits) }} {{ reading.unit }}</i>
    </span>

    <p class="legend">
      <span>{{ reading.label }} je Bezirk</span>
      <em class="low">unter dem Schnitt</em>
      <em class="high">darüber</em>
    </p>
  </div>
</template>

<style scoped>
.districts {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.sheet {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* Der Name steht in der Mitte der Fläche, damit man ihn dem Viereck zuordnet, ohne zu raten. */
.tag {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  transform: translate(-50%, -50%);
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(10, 14, 18, 0.82);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.10);
  white-space: nowrap;
}

.tag b {
  font-family: var(--display);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink);
}

.tag i {
  font-family: var(--mono);
  font-style: normal;
  font-size: 11px;
  color: var(--ink-2);
}

.legend {
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(10, 14, 18, 0.9);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.10);
  font-size: 12px;
  white-space: nowrap;
}

.legend span { color: var(--ink); }

.legend em {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-style: normal;
  color: var(--ink-3);
}

.legend em::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend .low::before { background: rgba(108, 199, 138, 0.55); }
.legend .high::before { background: rgba(214, 106, 70, 0.55); }
</style>
