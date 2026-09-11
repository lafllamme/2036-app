<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const { snapshot } = storeToRefs(game)
const items = computed(() => snapshot.value?.news ?? [])
</script>

<template>
  <section class="news-ticker" aria-label="Aktuelle Meldungen">
    <div class="news-label"><span></span> STADTFUNK</div>
    <button class="ticker-window" type="button" @click="items[0] && (game.selectedNews = items[0])">
      <span class="ticker-track">
        <template v-for="cycle in 2" :key="cycle">
          <span v-for="item in items" :key="`${cycle}-${item.id}`" class="ticker-item">
            <b>{{ item.scope === 'city' ? 'LINDENHAFEN' : item.scope === 'national' ? 'DEUTSCHLAND' : 'WELT' }}</b>
            {{ item.headline }} <i>◆</i>
          </span>
        </template>
      </span>
    </button>
  </section>
</template>
