<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const { snapshot } = storeToRefs(game)
const items = computed(() => snapshot.value?.news ?? [])

const SCOPE_LABELS = { city: 'LINDENHAFEN', national: 'DEUTSCHLAND', world: 'WELT' } as const

const windowRef = ref<HTMLElement | null>(null)
const cycleRef = ref<HTMLElement | null>(null)
/** True only once the headlines are genuinely wider than the bar. */
const scrolls = ref(false)

/**
 * The marquee duplicates one cycle and slides by half its width, which only reads as a loop while a
 * single cycle is wider than the bar. In January 2026 there is one headline, so the old ticker left
 * half the bar empty and looked broken. Now short news simply sits still.
 */
function measure(): void {
  const bar = windowRef.value
  const cycle = cycleRef.value
  if (!bar || !cycle) return
  scrolls.value = cycle.scrollWidth > bar.clientWidth + 8
}

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (windowRef.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(windowRef.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(items, () => void nextTick(measure))

/** Constant reading speed regardless of how much history is in the loop. */
const duration = computed(() => `${Math.max(38, items.value.length * 8)}s`)
</script>

<template>
  <section class="news-ticker" aria-label="Aktuelle Meldungen">
    <div class="news-label"><span></span> STADTFUNK</div>
    <button ref="windowRef" class="ticker-window" type="button" @click="items[0] && (game.selectedNews = items[0])">
      <span class="ticker-track" :class="{ 'is-static': !scrolls }" :style="{ '--ticker-duration': duration }">
        <span ref="cycleRef" class="ticker-cycle">
          <span v-for="item in items" :key="item.id" class="ticker-item">
            <b>{{ SCOPE_LABELS[item.scope] }}</b>{{ item.headline }}
          </span>
        </span>
        <span v-if="scrolls" class="ticker-cycle" aria-hidden="true">
          <span v-for="item in items" :key="`echo-${item.id}`" class="ticker-item">
            <b>{{ SCOPE_LABELS[item.scope] }}</b>{{ item.headline }}
          </span>
        </span>
      </span>
    </button>
  </section>
</template>
