<script setup lang="ts">
import type { DistrictId } from '~/core/contracts'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { screenPoint } from '~/rendering/screen'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'
import { LINDENHAFEN } from '~/world/model/lindenhafen'

/**
 * Die acht Bezirke, über die Stadt gelegt.
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
 * ist ein Netz je Bezirk plus Z-Fighting mit allem, was darauf steht.
 *
 * Die Bezirksgrenzen sind achsenparallele Rechtecke in Weltkoordinaten. Projiziert man ihre vier
 * Ecken, kommt ein Viereck auf dem Schirm heraus — perspektivisch korrekt, ohne ein einziges
 * Dreieck in der Szene und ohne Tiefenkonflikt. 32 Projektionen je Bild sind nichts.
 *
 * Dass die Fläche dabei über den Häusern liegt statt zwischen ihnen, ist richtig: eine Auskunft, die
 * hinter der Stadt verschwindet, ist keine.
 */

const game = useGameStore()
const { overlay, snapshot, walking, experienceStage, project } = storeToRefs(game)

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
const districts = computed(() => {
  const metric = showing.value
  const city = metric ? snapshot.value?.metrics[metric] ?? 0 : 0
  if (!metric || !snapshot.value || city === 0)
    return []

  return LINDENHAFEN.districts.map((district) => {
    const value = snapshot.value!.districtMetrics[district.id as DistrictId][metric]
    return {
      id: district.id,
      name: district.shortName,
      value,
      /** −1 … 1, geklemmt: ein Drittel Abweichung ist voller Ausschlag. */
      tilt: Math.max(-1, Math.min(1, (value / city - 1) / 0.33)),
      corners: [
        { x: district.bounds.minX, z: district.bounds.minZ },
        { x: district.bounds.maxX, z: district.bounds.minZ },
        { x: district.bounds.maxX, z: district.bounds.maxZ },
        { x: district.bounds.minX, z: district.bounds.maxZ },
      ],
      centre: { x: (district.bounds.minX + district.bounds.maxX) / 2, z: (district.bounds.minZ + district.bounds.maxZ) / 2 },
    }
  })
})

/** Über dem Schnitt warm, darunter kühl. Bei allen dreien ist „viel" das, was auffällt. */
function tint(tilt: number, alpha: number): string {
  return tilt >= 0
    ? `rgba(214, 106, 70, ${(alpha * tilt).toFixed(3)})`
    : `rgba(108, 199, 138, ${(alpha * -tilt).toFixed(3)})`
}

const shapes = ref<{ id: string, points: string, fill: string, at: { x: number, y: number } | null }[]>([])
const point = screenPoint()
let frame = 0

/**
 * Einmal je Bild: vier Ecken projizieren, ein Polygon daraus schreiben.
 *
 * Ein Bezirk zählt nur, wenn **alle vier** Ecken vor der Kamera liegen. Mit einer Ecke im Rücken
 * springt das Viereck über den halben Schirm — der Punkt hinter der Kamera projiziert gespiegelt,
 * und das Polygon wird zu einem Papierflieger. Lieber nicht zeichnen als falsch zeichnen.
 */
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
    const points: string[] = []
    let visible = true
    for (const corner of district.corners) {
      projector(corner.x, 0, corner.z, point)
      if (!point.onScreen && point.away === 0) {
        visible = false
        break
      }
      points.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    }
    if (!visible || points.length < 4)
      continue

    projector(district.centre.x, 0, district.centre.z, point)
    next.push({
      id: district.id,
      points: points.join(' '),
      fill: tint(district.tilt, 0.42),
      at: point.onScreen ? { x: point.x, y: point.y } : null,
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
        stroke="rgba(255, 255, 255, 0.22)"
        stroke-width="1"
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
