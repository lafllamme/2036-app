import type { CityMetrics, MetricId, PartyId } from '../../app/core/contracts'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../../app/content/events'
import { advanceMonths, createInitialState, motionOnTheAgenda, resolveDecision, voteOnMotion } from '../../app/simulation/model'

/**
 * Kann das überhaupt passieren?
 *
 * Vier der dramatischsten Ereignisse im Spiel — die Sturmflut, der Anschlag auf den Wochenmarkt, die
 * gesperrte Hafenbrücke, der Cyberangriff — konnten **nie** eintreten. Ihre Schwellen lagen über dem,
 * was die Stadt in einem Jahrzehnt je erreicht: `investmentBacklog > 210` gegen einen Höchstwert von
 * 127, `polarisation > 58` gegen ein Band von vier Punkten. Geschrieben hatte sie jemand nach Gefühl,
 * nachgerechnet nie, und auffallen konnte es nicht: ein Ereignis, das nicht kommt, sieht aus wie ein
 * Ereignis, das man diesmal nicht gezogen hat.
 *
 * Deshalb wird hier nicht geprüft, ob die Zahlen plausibel *aussehen*, sondern ob die Stadt sie
 * jemals erreicht. Gespielt wird breit: sechs Parteien, drei Haltungen, damit auch die Extreme
 * vorkommen — eine Stadt, die zu allem Ja sagt, und eine, die zu allem Nein sagt.
 */

const PARTIES: PartyId[] = ['spd', 'cdu', 'gruene', 'linke', 'fdp', 'afd']

function play(seed: number, party: PartyId, mode: 'ja' | 'nein' | 'nichts', seen: (metrics: CityMetrics) => void) {
  let state = createInitialState(seed, party, [])
  for (let month = 0; month < 131; month += 1) {
    state = advanceMonths(state, 1)
    seen(state.metrics)
    if (mode === 'nichts')
      continue
    for (const entry of [...state.pending]) {
      if (motionOnTheAgenda(state, entry.eventId)) {
        state = voteOnMotion(state, entry.eventId, mode === 'ja' ? 'yes' : 'no').state
        continue
      }
      const options = EVENTS.find(event => event.id === entry.eventId)?.options ?? []
      const option = mode === 'ja' ? options[0] : options[options.length - 1]
      if (option)
        state = resolveDecision(state, entry.eventId, option.id).state
    }
  }
}

/** Min und Max jeder Kennzahl über eine Reihe unterschiedlich gespielter Jahrzehnte. */
function ranges(): Record<string, { min: number, max: number }> {
  const span: Record<string, { min: number, max: number }> = {}
  const seen = (metrics: CityMetrics): void => {
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value))
        continue
      const entry = span[key] ??= { min: value, max: value }
      entry.min = Math.min(entry.min, value)
      entry.max = Math.max(entry.max, value)
    }
  }
  for (const party of PARTIES) {
    for (const mode of ['ja', 'nein', 'nichts'] as const)
      play(2036, party, mode, seen)
  }
  return span
}

describe('every trigger the content writes', () => {
  const span = ranges()

  it('names a threshold the city actually reaches', () => {
    const unreachable: string[] = []
    for (const event of EVENTS) {
      for (const condition of event.trigger.conditions) {
        const range = span[condition.metric as MetricId]
        if (!range)
          continue
        const reachable = condition.operator.startsWith('>')
          ? range.max > condition.value
          : range.min < condition.value
        if (!reachable) {
          unreachable.push(
            `${event.id} (${event.title}): ${condition.metric} ${condition.operator} ${condition.value}`
            + ` — erreicht wird nur ${range.min.toFixed(1)} … ${range.max.toFixed(1)}`,
          )
        }
      }
    }
    expect(unreachable, 'diese Ereignisse können niemals eintreten').toEqual([])
  })

  it('leaves room above the threshold rather than sitting on it', () => {
    // Eine Schwelle, die nur ganz knapp erreicht wird, feuert in einem von zwanzig Läufen. Das ist
    // kein Ereignis, das ist ein Gerücht. Verlangt wird ein Zehntel der Spannweite Luft.
    const tight: string[] = []
    for (const event of EVENTS) {
      for (const condition of event.trigger.conditions) {
        const range = span[condition.metric as MetricId]
        if (!range)
          continue
        const headroom = condition.operator.startsWith('>')
          ? range.max - condition.value
          : condition.value - range.min
        const width = range.max - range.min
        if (width > 0 && headroom > 0 && headroom < width * 0.1)
          tight.push(`${event.id}: ${condition.metric} ${condition.operator} ${condition.value} (nur ${headroom.toFixed(1)} Luft auf ${width.toFixed(1)} Spannweite)`)
      }
    }
    expect(tight, 'diese Schwellen liegen so knapp am Rand, dass sie praktisch nie feuern').toEqual([])
  })

  /*
   * Eine Kennzahl, die sich nicht regieren lässt, ist Dekoration.
   *
   * Gemessen über achtzehn durchgespielte Jahrzehnte lag die Beschäftigung zwischen 70,8 und 74,1 —
   * ±2 % um den Startwert, während Betriebe, ÖPNV und Kitas sich um ein Vielfaches bewegten; das
   * Ziel „über 75 %" war damit unerreichbar. Und zwischen „zu allem Ja" und „zu allem Nein" lagen
   * 0,6 Punkte Zufriedenheit, also der Zahl, die Wahlen entscheidet.
   */
  it('lets the player move the numbers that decide the campaign', () => {
    const employment = span.employment!
    expect(employment.max, 'Beschäftigung erreicht das Ziel „über 75" nie').toBeGreaterThan(75)
    expect(employment.max - employment.min, 'Beschäftigung ist wieder eingefroren').toBeGreaterThan(4)

    const satisfaction = span.satisfaction!
    expect(satisfaction.max - satisfaction.min, 'Zufriedenheit bewegt sich kaum').toBeGreaterThan(12)

    // Und keine Kennzahl darf an einer unrealistischen Null kleben.
    expect(span.youthUnemployment!.min, 'Jugendarbeitslosigkeit fällt auf null').toBeGreaterThan(0)
  })

  it('moves polarisation far enough to be worth triggering on', () => {
    // Sie lag ein Jahrzehnt lang zwischen 36,5 und 40,2 und war damit als Auslöser wertlos.
    const range = span.polarisation!
    expect(range.max - range.min, 'polarisation bewegt sich wieder kaum').toBeGreaterThan(8)
  })
})
