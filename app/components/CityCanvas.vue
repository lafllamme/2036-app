<script setup lang="ts">
import type { CityRenderer } from '~/rendering/CityRenderer'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from '~/stores/game'
import { loadCityBlueprint } from '~/world/cityData'

const canvas = ref<HTMLCanvasElement | null>(null)
const game = useGameStore()
const { snapshot, daylight, experienceStage } = storeToRefs(game)
let cityRenderer: CityRenderer | null = null

const MENU_FRAME_CAP = 30

onMounted(async () => {
  if (!canvas.value)
    return
  try {
    const [{ CityRenderer: Renderer }, { loadCityModels }] = await Promise.all([
      import('../rendering/CityRenderer'),
      import('../rendering/cityModels'),
    ])
    /*
     * The ground plan and the kit both have to be on hand before the first frame: a model arriving
     * late is a building popping into a city the player is already looking at.
     */
    const [blueprint, models] = await Promise.all([loadCityBlueprint(2036), loadCityModels()])
    if (!canvas.value)
      return
    cityRenderer = new Renderer({
      canvas: canvas.value,
      blueprint,
      models,
      onBuildingSelected: (building) => { game.selectedBuilding = building },
      onReady: (stats) => { game.rendererStats = stats },
      onStats: (stats) => { game.rendererStats = stats },
      onError: (message) => { game.error = message },
    })
    cityRenderer.setFrameCap(experienceStage.value === 'gameplay' ? null : MENU_FRAME_CAP)
    if (snapshot.value)
      cityRenderer.applySnapshot(snapshot.value)
  }
  catch (cause) {
    /*
     * Without this the title screen simply never finished loading: the button is gated on the
     * renderer reporting in, and a model that failed to arrive left the promise rejected and the
     * city permanently "wird aufgebaut", with nothing anywhere saying why.
     */
    game.error = `Das Stadtmodell konnte nicht geladen werden: ${cause instanceof Error ? cause.message : String(cause)}`
  }
})

watch(snapshot, (next) => {
  if (next)
    cityRenderer?.applySnapshot(next)
})

/*
 * Behind the entry flow the city is a backdrop: nothing is being played, the camera does not move
 * and the panels cover most of it. Half the frames there are half the GPU for no visible loss.
 */
watch(experienceStage, (stage) => {
  cityRenderer?.setFrameCap(stage === 'gameplay' ? null : MENU_FRAME_CAP)
})

// The sky follows campaign time: this stops updating the moment the player pauses.
watch(daylight, (reading) => {
  cityRenderer?.setSky({
    hourOfDay: reading.hourOfDay,
    elevation: reading.elevation,
    arc: reading.arc,
    sweep: reading.sweep,
    phase: reading.phase,
    temperature: reading.temperature,
  })
}, { immediate: true })

watch(() => game.selectedBuilding?.id, (buildingId) => {
  if (buildingId)
    cityRenderer?.focusBuilding(buildingId)
})

onBeforeUnmount(() => cityRenderer?.dispose())
</script>

<template>
  <canvas ref="canvas" class="city-canvas" aria-label="Interaktive 3D-Stadt Lindenhafen" />
</template>
