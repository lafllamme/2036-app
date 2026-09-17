<script setup lang="ts">
import type { CityRenderer } from '~/rendering/CityRenderer'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from '~/stores/game'
import { loadCityBlueprint } from '~/world/cityData'

const canvas = ref<HTMLCanvasElement | null>(null)
const game = useGameStore()
const { snapshot, daylight, weather, experienceStage, overviewRequest, focusRequest, walking } = storeToRefs(game)
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
    /*
     * Beide Meilensteine einzeln melden, obwohl sie parallel laufen.
     *
     * Der Grundriss ist vier Megabyte über das Netz und der Modellsatz ein Dutzend Dateien von der
     * Platte — die beiden sind verschieden schnell, und welcher gerade fehlt, ist die einzige
     * Auskunft, die einen Ladebildschirm ehrlich macht. `Promise.all` wartet weiter auf beide; nur
     * meldet jetzt jeder für sich, wann er da ist.
     */
    const [blueprint, models] = await Promise.all([
      loadCityBlueprint(2036).then((plan) => {
        game.buildStageDone('plan', `${plan.buildings.length.toLocaleString('de-DE')} Gebäude · ${plan.districts.length} Viertel`)
        return plan
      }),
      loadCityModels().then((kit) => {
        game.buildStageDone('kit', null)
        return kit
      }),
    ])
    if (!canvas.value)
      return
    cityRenderer = new Renderer({
      canvas: canvas.value,
      blueprint,
      models,
      /*
       * Solange eine Blocksanierung auf ihren Häuserzug wartet, **ist** der Klick auf ein Haus der
       * Beschluss. Kein zweiter Knopf und kein Bestätigungsblatt: die Frage steht oben im Bild, die
       * Antwort ist ein Zeigefinger. Danach ist es wieder eine Gebäudekarte wie immer.
       */
      onBuildingSelected: (building) => {
        if (building && game.snapshot?.pendingBlock)
          game.chooseBlock(building)
        else game.selectedBuilding = building
      },
      onReady: (stats) => {
        game.rendererStats = stats
        game.buildStageDone('scene', `${stats.drawCalls} Draws · ${Math.round(stats.triangles / 1000).toLocaleString('de-DE')}k Dreiecke`)
      },
      onStats: (stats) => { game.rendererStats = stats },
      // Wo der Fußgänger steht. Eigener Rückruf, weil `onStats` nur einmal je Sekunde läuft.
      onWalk: (state) => { game.walkState = state },
      onIncident: report => game.reportIncident(report),
      onPersonSelected: person => game.selectPerson(person),
      onError: (message) => { game.error = message },
    })
    // Die Brücke von einem Ort in der Stadt zu einem Punkt auf dem Schirm. Siehe `rendering/screen.ts`.
    game.project = (x, y, z, out) => cityRenderer!.project(x, y, z, out)
    game.districtShapes = blueprint.districts
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

// Taking the player back to the whole city. The store only asks; the camera lives here.
watch(overviewRequest, () => cityRenderer?.showOverview())
// Zu Fuß oder über der Stadt. Siehe `rendering/firstPerson.ts`.
watch(walking, on => cityRenderer?.setWalking(on))

// And taking them to a place they asked to see — an incident read off the news bar.
watch(focusRequest, (request) => {
  if (request)
    cityRenderer?.focusOnPlace(request.x, request.z)
})

// The sky follows campaign time: this stops updating the moment the player pauses.
watch(daylight, (reading) => {
  cityRenderer?.setSky({
    hourOfDay: reading.hourOfDay,
    elevation: reading.elevation,
    arc: reading.arc,
    sweep: reading.sweep,
    phase: reading.phase,
    // The thermometer is the weather's, not the season's: a cold snap is what makes it snow.
    temperature: weather.value.temperature,
  })
}, { immediate: true })

// And what is falling out of it. Same clock, same pause, and nothing at all to draw on a dry day.
watch(weather, (reading) => {
  cityRenderer?.setWeather(reading)
}, { immediate: true })

onBeforeUnmount(() => {
  game.project = null
  game.districtShapes = []
  cityRenderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" class="city-canvas" aria-label="Interaktive 3D-Stadt Lindenhafen" />
</template>
