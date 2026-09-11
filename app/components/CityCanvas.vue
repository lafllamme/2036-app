<script setup lang="ts">
import type { CityRenderer } from '~/rendering/CityRenderer'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from '~/stores/game'
import { generateCity } from '~/world/generation/generateCity'

const canvas = ref<HTMLCanvasElement | null>(null)
const game = useGameStore()
const { snapshot } = storeToRefs(game)
let cityRenderer: CityRenderer | null = null

onMounted(async () => {
  if (!canvas.value)
    return
  const { CityRenderer: Renderer } = await import('../rendering/CityRenderer')
  const blueprint = generateCity(2036)
  cityRenderer = new Renderer({
    canvas: canvas.value,
    blueprint,
    onBuildingSelected: (building) => { game.selectedBuilding = building },
    onReady: (stats) => { game.rendererStats = stats },
    onStats: (stats) => { game.rendererStats = stats },
    onError: (message) => { game.error = message },
  })
  if (snapshot.value)
    cityRenderer.applySnapshot(snapshot.value)
})

watch(snapshot, (next) => {
  if (next)
    cityRenderer?.applySnapshot(next)
})

watch(() => game.selectedBuilding?.id, (buildingId) => {
  if (buildingId)
    cityRenderer?.focusBuilding(buildingId)
})

onBeforeUnmount(() => cityRenderer?.dispose())
</script>

<template>
  <canvas ref="canvas" class="city-canvas" aria-label="Interaktive 3D-Stadt Lindenhafen" />
</template>
