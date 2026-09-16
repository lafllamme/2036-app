<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useSound } from '~/composables/useSound'
import { getGoal } from '~/content/goals'
import { formatClock } from '~/core/daylight'
import { situationReading } from '~/simulation/situation'
import { useGameStore } from '~/stores/game'
import { formatNumber } from '~/utils/labels'

const game = useGameStore()
const { snapshot, daylight, weather, railOpen } = storeToRefs(game)
const expanded = ref(false)
const sound = useSound()

function toggleRail(): void {
  expanded.value = !expanded.value
  sound.play(expanded.value ? 'hud.railExpanded' : 'hud.railCollapsed')
}

const metrics = computed(() => snapshot.value?.metrics)
const previous = computed(() => snapshot.value?.previousMetrics)
const baseline = computed(() => snapshot.value?.baselineMetrics)
const drivers = computed(() => snapshot.value?.drivers ?? {})
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
  /*
   * And who did it, when it was the player rather than the city.
   *
   * Only their own decisions are named. The city's dynamics move every number every month, and
   * saying "Modellursache: Jugendarbeitslosigkeit, Leerstand und Präventionskapazität" answers a
   * question nobody asked — the one being asked is what *I* did.
   */
  const strongest = drivers.value[key]?.[0]
  const because = strongest
    ? ` Stärkste eigene Entscheidung darauf: ${strongest.label} (${strongest.delta > 0 ? '+' : '−'}${formatNumber(Math.abs(strongest.delta), 1)}${unit}).`
    : ' Bisher hat keine eigene Entscheidung darauf gewirkt.'
  return `Bei Amtsantritt ${formatNumber(then, 2)}${unit}. ${term} ${amount} — ${direction}.${because}`
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
    // Der Bestand darüber sagt, wie viel noch da ist; diese Zeile, wie schnell es sich ändert. Ohne
    // sie sieht eine fallende Rücklage aus, als käme nichts herein, während 26 Mio. € im Monat kommen.
    { label: 'Monatssaldo', value: `${m.monthlyBalance >= 0 ? '+' : '−'}${formatNumber(Math.abs(m.monthlyBalance), 1)} Mio. €`, trend: trend('monthlyBalance', 1), since: sinceStart('monthlyBalance', 1, ' Mio. €') },
  ]
})

/**
 * Die Lage in Worten.
 *
 * Ein Index von 134 sagt niemandem etwas; „teuer" schon. Die Zahl steht trotzdem dahinter, damit die
 * Richtung ablesbar bleibt — und eingefärbt wird nur, was von der Normallage abweicht.
 */
const situation = computed(() => {
  const state = snapshot.value?.situation
  if (!state)
    return []
  return situationReading(state).map(entry => ({
    ...entry,
    tone: entry.value > 118 || entry.value < 84 ? 'off-normal' : '',
  }))
})

/**
 * Die drei Ziele mit dem Stand von heute.
 *
 * Die Simulation sagt, ob ein Ziel gerade gilt; der Katalog sagt, wie man es liest. Nichts davon
 * wird hier ausgerechnet.
 */
const goals = computed(() => (snapshot.value?.goals ?? []).flatMap((progress) => {
  const goal = getGoal(progress.id)
  if (!goal)
    return []
  const format = (value: number): string => formatNumber(value, goal.decimals)
  return [{
    id: progress.id,
    name: goal.name,
    met: progress.met,
    reading: `${format(progress.value)}${goal.unit}`,
    target: `${goal.direction === 'above' ? 'über' : 'unter'} ${format(goal.threshold)}`,
  }]
}))

/** What is coming down, in words, because "0,42" is not a thing anybody can picture. */
const precipitation = computed(() => {
  const { rain, snow } = weather.value
  if (snow > 0.08 && rain > 0.08)
    return 'Schneeregen'
  if (snow > 0.5)
    return 'Schneefall'
  if (snow > 0.08)
    return 'Leichter Schnee'
  if (rain > 0.5)
    return 'Regen'
  if (rain > 0.08)
    return 'Nieselregen'
  return 'Trocken'
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
    { label: 'Ohne Wohnung', value: `${formatNumber(m.homelessPeople)} Personen` },
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
    { label: 'Temperatur', value: `${formatNumber(weather.value.temperature, 1)} °C` },
    { label: 'Niederschlag', value: precipitation.value },
    { label: 'Bewölkung', value: `${formatNumber(weather.value.cloud * 100, 0)} %` },
    // Twelve metres a second is the top of the scale, which is a gale rather than a breeze.
    { label: 'Wind', value: `${formatNumber(weather.value.wind * 12, 1)} m/s` },
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
  <!--
    Das Lagebild wird gerufen, nicht ausgehalten.

    Vorher stand hier eine bildschirmhohe Platte, die den ganzen linken Rand besetzt hat — den
    größten Teil der Kampagne, um Zahlen zu zeigen, die sich im Monat einmal ändern. Jetzt ist es
    ein Körper, der über dem Bild schwebt, so hoch wie sein Inhalt, und der Knopf, der ihn holt,
    steht unten in der Bedienung.
  -->
  <aside v-if="railOpen" class="pod rail" :class="{ 'is-wide': expanded }" aria-label="Stadtkennzahlen">
    <header>
      <h2>Lagebild</h2>
      <button type="button" class="link" :aria-expanded="expanded" @click="toggleRail">
        {{ expanded ? 'Kurzlage' : 'Alles zeigen' }}
      </button>
      <button type="button" class="close-button" aria-label="Lagebild schließen" @click="game.railOpen = false">
        <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </header>

    <div class="body">
      <dl v-if="metrics" class="figures">
        <div v-for="item in headline" :key="item.label" :title="item.since">
          <dt>{{ item.label }}</dt>
          <dd>
            {{ item.value }}
            <i class="trend" :class="item.trend.tone" :title="`${item.trend.word} gegenüber dem Vormonat`" aria-hidden="true">
              <svg viewBox="0 0 10 9"><path v-if="item.trend.mark === '▲'" d="M5 0 10 9H0z" /><path v-else-if="item.trend.mark === '▼'" d="M5 9 0 0h10z" /><circle v-else cx="5" cy="5" r="1.6" /></svg>
            </i>
            <span class="sr">{{ item.trend.word }}</span>
          </dd>
        </div>
      </dl>

      <template v-if="expanded">
        <dl class="figures detail">
          <div v-for="item in detail" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd :class="{ muted: item.note }">
              {{ item.value }}
            </dd>
          </div>
        </dl>
        <p class="note">
          Der Zuwanderungsanteil ist eine reine Zusammensetzungsangabe. Er geht in keine Bewertung und in keinen
          Ereignisauslöser ein – wirksam sind die finanzierten Kapazitäten.
        </p>
        <section v-if="perception" class="block">
          <h3>Wahrnehmung</h3>
          <div class="gauge">
            <span>Sicherheitsgefühl</span><div class="track groove">
              <i :style="{ width: `${perception.safety}%` }" />
            </div><b>{{ perception.safety.toFixed(0) }}</b>
          </div>
          <div class="gauge">
            <span>Mietdruck gefühlt</span><div class="track groove">
              <i class="inverse" :style="{ width: `${perception.housingPressure}%` }" />
            </div><b>{{ perception.housingPressure.toFixed(0) }}</b>
          </div>
          <div class="gauge">
            <span>Vertrauen</span><div class="track groove">
              <i :style="{ width: `${perception.trust}%` }" />
            </div><b>{{ perception.trust.toFixed(0) }}</b>
          </div>
        </section>
      </template>

      <section v-if="snapshot" class="block">
        <div class="block-head">
          <h3>Stadtgesundheit</h3><strong>{{ snapshot.health.satisfaction.toFixed(0) }}</strong>
        </div>
        <div v-for="row in (expanded ? healthRows : healthRows.slice(0, 4))" :key="row[0]" class="gauge">
          <span>{{ row[0] }}</span>
          <div class="track groove">
            <i :style="{ width: `${row[1]}%` }" />
          </div>
          <b>{{ row[1].toFixed(0) }}</b>
        </div>
      </section>

      <!--
        Die Welt über der Stadt. Vier Zahlen, die niemand hier beantwortet — aber die erklären, warum
        derselbe Beschluss in diesem Jahrzehnt etwas anderes kostet als im letzten.
      -->
      <section v-if="situation.length > 0" class="block">
        <div class="block-head">
          <h3>Die Lage</h3>
        </div>
        <div v-for="entry in situation" :key="entry.label" class="reading" :class="entry.tone">
          <span>{{ entry.label }}</span>
          <b>{{ entry.word }}</b>
        </div>
      </section>

      <!--
        Die drei Ziele, das ganze Jahrzehnt sichtbar. Vorher wählte man beim Antritt drei
        „Prioritäten" und sah sie nie wieder — eine Wertung, an die man nicht erinnert wird, ist keine.
      -->
      <section v-if="goals.length > 0" class="block">
        <div class="block-head">
          <h3>Ziele 2036</h3><strong>{{ goals.filter(goal => goal.met).length }} / {{ goals.length }}</strong>
        </div>
        <div v-for="goal in goals" :key="goal.id" class="reading goal" :class="{ met: goal.met }">
          <span>{{ goal.name }}</span>
          <b>{{ goal.reading }}</b>
          <small>{{ goal.target }}{{ goal.met ? ' · erreicht' : '' }}</small>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  /*
   * Höher als das Deck, aber nie bis an die Oberkante.
   *
   * Vorher lief die Schublade bis 620 px hoch und begann damit 58 px unter dem Bildrand — sie las
   * als Wand neben der Stadt und nicht als dasselbe Möbel wie die Körper darunter. Ein Körper hat
   * Luft über sich; eine Wand nicht.
   */
  position: absolute; bottom: 152px; left: 34px; z-index: 5;
  display: flex; flex-direction: column;
  /*
   * `--pick-space` ist der Platz, den eine offene Auswahlkarte über dem Lagebild braucht.
   *
   * Beide sitzen in derselben linken Spalte und beide sind absolut gesetzt, also überlappten sie:
   * gemessen ragte die Karte 70 px in das Lagebild hinein und die Zahlen darunter lasen sich wie
   * ihre eigenen. Die Schale setzt den Wert, wenn etwas ausgewählt ist; hier wird er nur abgezogen.
   */
  width: 352px; max-height: min(524px, calc(100% - 320px - var(--pick-space, 0px)));
  padding: 24px 0 18px;
}
.rail.is-wide { width: 392px; }

header { display: flex; align-items: center; gap: 12px; padding: 0 24px 16px; }
h2 { margin: 0; font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -0.03em; }
.link {
  margin-left: auto; padding: 0; border: 0; background: none; cursor: pointer;
  color: var(--ink-3); font-family: var(--text); font-size: 12.5px;
}
.link:hover { color: var(--ink); }
header .close-button { width: 32px; height: 32px; }
header .close-button svg { width: 14px; height: 14px; }

/*
 * Nur der Inhalt rollt, nicht der Körper — und die letzte Zeile verläuft, damit die Kante „da ist
 * mehr" sagt statt „hier ist Schluss". Einen Rollbalken sieht ohnehin nur eine Maus.
 */
.body {
  flex: 1; min-height: 0; padding: 0 24px; overflow-y: auto;
  mask-image: linear-gradient(to bottom, #000 calc(100% - 20px), transparent 100%);
  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
}
.body::-webkit-scrollbar { width: 5px; }
.body::-webkit-scrollbar-track { background: transparent; }
.body::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }

.figures { margin: 0; }
.figures > div {
  display: flex; align-items: baseline; justify-content: space-between; gap: 14px;
  padding: 9px 0; border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.figures > div:first-child { border-top: 0; }
.figures dt { color: var(--ink-2); font-size: 12.5px; }
.figures dd {
  display: flex; align-items: center; gap: 7px; margin: 0;
  font-family: var(--mono); font-size: 12.5px; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.figures dd.muted { color: var(--ink-3); }
.detail { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); }

/* Richtung wird gezeichnet, nicht getippt — und trägt daneben immer noch ihr Wort für Screenreader. */
.trend { display: inline-flex; width: 9px; height: 9px; color: var(--ink-3); }
.trend svg { width: 100%; height: 100%; fill: currentcolor; }
.trend.good { color: var(--positive); }
.trend.bad { color: var(--negative); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.note { margin: 12px 0 0; color: var(--ink-3); font-size: 11.5px; line-height: 1.55; }

.block { margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.block-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
h3 { margin: 0; color: var(--ink-3); font-family: var(--text); font-size: 12.5px; font-weight: 400; }
.block-head strong {
  font-family: var(--display); font-size: 30px; font-weight: 700; letter-spacing: -0.035em; line-height: 0.85;
}

.gauge { display: grid; grid-template-columns: 96px 1fr 26px; align-items: center; gap: 11px; padding: 5px 0; }
.gauge span { color: var(--ink-2); font-size: 12px; }
.gauge b { color: var(--ink-3); font-family: var(--mono); font-size: 11px; font-weight: 400; text-align: right; }
.track { position: relative; height: 4px; overflow: hidden; }
.track i { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: linear-gradient(180deg, #9ce0c6, #6cc9a7); }
.track i.inverse { background: linear-gradient(180deg, #ffb59c, #f0805f); }

.reading { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; align-items: baseline; padding: 7px 0; }
.reading span { overflow: hidden; color: var(--ink-2); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.reading b { font-family: var(--mono); font-size: 11.5px; font-weight: 400; font-variant-numeric: tabular-nums; }
.reading small { grid-column: 1 / -1; color: var(--ink-3); font-size: 11px; }
.reading.off-normal b { color: var(--negative); }
.goal.met b { color: var(--positive); }

/*
 * Keine eigene Regel für niedrige Fenster mehr.
 *
 * Es gab eine, die dort `calc(100% - 210px)` erlaubte — also **mehr** Höhe, je enger es wird, und
 * auf einem 900 px hohen Fenster lief die Schublade damit bis 58 px unter den Bildrand. Die
 * Obergrenze oben macht das überflüssig: 524 px, solange sie passen, sonst was nach dem Deck übrig
 * bleibt. Eine Regel, beide Richtungen.
 */
</style>
