<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useSound } from '~/composables/useSound'
import { formatClock } from '~/core/daylight'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'

const game = useGameStore()
const { snapshot, daylight, railOpen } = storeToRefs(game)
const expanded = ref(false)
const sound = useSound()

function toggleRail(): void {
  expanded.value = !expanded.value
  sound.play(expanded.value ? 'hud.railExpanded' : 'hud.railCollapsed')
}

const metrics = computed(() => snapshot.value?.metrics)
const previous = computed(() => snapshot.value?.previousMetrics)
const baseline = computed(() => snapshot.value?.baselineMetrics)
const months = computed(() => snapshot.value?.month ?? 0)

/**
 * What a number has done since the player took office.
 *
 * The complaint this answers: pressing "nächster Monat" a dozen times and being unable to tell that
 * anything happened. A value on its own cannot say that — "Kriminalität 52 / 1.000" is a fact about
 * the city and not about the player. The same number against the day they started is the whole
 * story, and the baseline for it has been sitting unused in the simulation since the first month.
 */
function sinceStart(key: keyof NonNullable<typeof metrics.value>, goodDirection: 1 | -1, unit = ''): string {
  const now = metrics.value?.[key]
  const then = baseline.value?.[key]
  if (now === undefined || then === undefined)
    return ''
  const term = months.value < 1 ? 'Seit Amtsantritt' : `In ${months.value} ${months.value === 1 ? 'Monat' : 'Monaten'}`
  const delta = now - then
  // Below a twentieth of a per cent there is nothing to report, and saying so is also an answer.
  if (Math.abs(delta) < Math.abs(then || 1) * 0.0005)
    return `${term} unverändert.`
  const share = then === 0 ? null : (delta / Math.abs(then)) * 100
  const direction = Math.sign(delta) === goodDirection ? 'die Richtung, die du wolltest' : 'die Gegenrichtung'
  const amount = share === null
    ? `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta), 1)}${unit}`
    : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(share), 1)} %`
  return `Bei Amtsantritt ${formatNumber(then, 2)}${unit}. ${term} ${amount} — ${direction}.`
}

function compact(value: number): string {
  return new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** Arrow plus a word, because status must never be colour-only. */
function trend(key: keyof NonNullable<typeof metrics.value>, goodDirection: 1 | -1) {
  const now = metrics.value?.[key]
  const before = previous.value?.[key]
  if (now === undefined || before === undefined)
    return { mark: '·', tone: 'flat', word: 'unverändert' }
  const delta = now - before
  if (Math.abs(delta) < Math.abs(now) * 0.0004)
    return { mark: '·', tone: 'flat', word: 'stabil' }
  const good = Math.sign(delta) === goodDirection
  return { mark: delta > 0 ? '▲' : '▼', tone: good ? 'good' : 'bad', word: good ? 'verbessert' : 'verschlechtert' }
}

const headline = computed(() => {
  if (!metrics.value)
    return []
  const m = metrics.value
  const vacancy = (m.vacantUnits / Math.max(1, m.housingUnits)) * 100
  return [
    { label: 'Einwohner', value: compact(m.population), trend: trend('population', 1), since: sinceStart('population', 1) },
    { label: 'Beschäftigung', value: `${formatNumber(m.employment, 1)} %`, trend: trend('employment', 1), since: sinceStart('employment', 1, ' %') },
    { label: 'Ø Angebotsmiete', value: `${formatNumber(m.averageRent, 2)} €/m²`, trend: trend('averageRent', -1), since: sinceStart('averageRent', -1, ' €/m²') },
    { label: 'Freie Wohnungen', value: `${formatNumber(m.vacantUnits)} · ${formatNumber(vacancy, 1)} %`, trend: trend('vacantUnits', 1), since: sinceStart('vacantUnits', 1) },
    { label: 'Kriminalität', value: `${formatNumber(m.crimeRate)} / 1.000`, trend: trend('crimeRate', -1), since: sinceStart('crimeRate', -1, ' / 1.000') },
    { label: 'Haushaltsspielraum', value: `${formatNumber(m.cityBudget)} Mio. €`, trend: trend('cityBudget', 1), since: sinceStart('cityBudget', 1, ' Mio. €') },
  ]
})

const detail = computed(() => {
  if (!metrics.value)
    return []
  const m = metrics.value
  return [
    { label: 'Wanderungssaldo', value: `${m.netMigration >= 0 ? '+' : ''}${formatNumber(m.netMigration)} / Monat` },
    { label: 'Wohnungsbestand', value: formatNumber(m.housingUnits) },
    { label: 'Davon Sozialbindung', value: `${formatNumber(m.socialUnits)} · ${formatNumber((m.socialUnits / m.housingUnits) * 100, 1)} %` },
    { label: 'Im Bau', value: `${formatNumber(m.unitsUnderConstruction)} Wohnungen` },
    { label: 'Einbrüche', value: `${formatNumber(m.burglaryRate, 1)} / 1.000 Haushalte` },
    { label: 'Ordnungsdienst', value: `${formatNumber(m.orderServiceCapacity, 1)} VZÄ / 10.000` },
    { label: 'Jugendarbeitslosigkeit', value: `${formatNumber(m.youthUnemployment, 1)} %` },
    { label: 'Kitaplätze', value: `${formatNumber(m.childcareCoverage)} % des Anspruchs` },
    { label: 'Schulauslastung', value: `${formatNumber(m.schoolUtilisation)} %` },
    { label: 'Integrationsplätze', value: `${formatNumber(m.integrationCapacity * 100)} % des Bedarfs` },
    { label: 'Zuwanderungsanteil', value: `${formatNumber(m.internationalShare, 1)} %`, note: true },
    { label: 'ÖPNV-Pünktlichkeit', value: `${formatNumber(m.transitReliability)} %` },
    { label: 'Stadtgrün', value: `${formatNumber(m.greenSpacePerCapita, 1)} m² / Kopf` },
    { label: 'Kassenkredite', value: `${formatNumber(m.debt)} Mio. €` },
    { label: 'Sanierungsstau', value: `${formatNumber(m.investmentBacklog)} Mio. €` },
    { label: 'Tag im Monat', value: `${daylight.value.dayOfMonth} von 30` },
    { label: 'Sonnenaufgang', value: formatClock(daylight.value.sunriseHour) },
    { label: 'Sonnenuntergang', value: formatClock(daylight.value.sunsetHour) },
    { label: 'Tageslänge', value: `${formatNumber(daylight.value.sunsetHour - daylight.value.sunriseHour, 1)} Stunden` },
    { label: 'Temperatur', value: `${formatNumber(daylight.value.temperature, 1)} °C` },
  ]
})

const healthRows = computed(() => {
  const health = snapshot.value?.health
  if (!health)
    return []
  return [
    ['Wohnen', health.housing],
    ['Arbeit', health.employment],
    ['Sicherheit', health.safety],
    ['Infrastruktur', health.infrastructure],
    ['Umwelt', health.environment],
    ['Bildung', health.education],
    ['Zusammenhalt', health.cohesion],
    ['Lebenshaltung', health.costOfLiving],
    ['Finanzen', health.fiscalHealth],
  ] as const
})

const perception = computed(() => snapshot.value?.perception)
</script>

<template>
  <aside class="metric-rail panel" :class="{ expanded, 'is-folded': !railOpen }" aria-label="Stadtkennzahlen">
    <header class="section-heading">
      <span>Lagebild</span>
      <button v-if="railOpen" type="button" class="rail-toggle" :aria-expanded="expanded" @click="toggleRail">
        {{ expanded ? 'Kurzlage' : 'Lagebericht' }}
      </button>
      <button
        type="button"
        class="fold-toggle"
        :aria-expanded="railOpen"
        :title="railOpen ? 'Lagebild einklappen' : 'Lagebild ausklappen'"
        :aria-label="railOpen ? 'Lagebild einklappen' : 'Lagebild ausklappen'"
        @click="game.railOpen = !railOpen"
      >
        {{ railOpen ? '−' : '+' }}
      </button>
    </header>

    <dl v-if="metrics" class="metric-list">
      <div v-for="item in headline" :key="item.label" :title="item.since">
        <dt>{{ item.label }}</dt>
        <dd>
          {{ item.value }}
          <i class="trend" :class="item.trend.tone" :title="`${item.trend.word} gegenüber dem Vormonat`">{{ item.trend.mark }}</i>
        </dd>
      </div>
    </dl>

    <template v-if="expanded">
      <dl class="metric-list detail-list">
        <div v-for="item in detail" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd :class="{ neutral: item.note }">
            {{ item.value }}
          </dd>
        </div>
      </dl>
      <p class="rail-note">
        Der Zuwanderungsanteil ist eine reine Zusammensetzungsangabe. Er geht in keine Bewertung und in keinen Ereignisauslöser ein –
        wirksam sind die finanzierten Kapazitäten.
      </p>
      <div v-if="perception" class="perception-block">
        <h3>Wahrnehmung</h3>
        <div class="health-row">
          <span>Sicherheitsgefühl</span><div class="health-track">
            <i :style="{ width: `${perception.safety}%` }" />
          </div><b>{{ perception.safety.toFixed(0) }}</b>
        </div>
        <div class="health-row">
          <span>Mietdruck gefühlt</span><div class="health-track">
            <i class="inverse" :style="{ width: `${perception.housingPressure}%` }" />
          </div><b>{{ perception.housingPressure.toFixed(0) }}</b>
        </div>
        <div class="health-row">
          <span>Vertrauen</span><div class="health-track">
            <i :style="{ width: `${perception.trust}%` }" />
          </div><b>{{ perception.trust.toFixed(0) }}</b>
        </div>
      </div>
    </template>

    <div v-if="snapshot" class="health-block">
      <div class="health-title">
        <span>Stadtgesundheit</span><strong>{{ snapshot.health.satisfaction.toFixed(0) }}</strong>
      </div>
      <div v-for="row in (expanded ? healthRows : healthRows.slice(0, 4))" :key="row[0]" class="health-row">
        <span>{{ row[0] }}</span>
        <div class="health-track">
          <i :style="{ width: `${row[1]}%` }" />
        </div>
        <b>{{ row[1].toFixed(0) }}</b>
      </div>
    </div>
  </aside>
</template>
