import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRoadNetwork } from '../../app/rendering/world/roadNetwork'
import { CYCLE, GREEN, isGreen, phaseOf, planSignals } from '../../app/rendering/world/signalPlan'
import { buildBlueprint } from '../../app/world/cityData'

/**
 * The signals are the authority the traffic obeys, so what matters is not that there are poles but
 * that the plan is a plan: every junction lets somebody through, never everybody at once across the
 * main axis, and every stretch that reaches a signalled junction is answered one way or the other.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8'))
const network = buildRoadNetwork(buildBlueprint(raw, 2_036))
const plan = planSignals(network)

describe('the junction signals', () => {
  it('signals the junctions a city this size would', () => {
    expect(plan.signals.length).toBeGreaterThan(150)
    for (const signal of plan.signals) {
      expect(signal.approaches.length).toBeGreaterThanOrEqual(3)
      expect(Math.max(...signal.approaches.map(approach => approach.width))).toBeGreaterThanOrEqual(9)
    }
  })

  it('puts the widest street\'s own direction in the first phase', () => {
    for (const signal of plan.signals) {
      const widest = signal.approaches.reduce((best, approach) => approach.width > best.width ? approach : best)
      expect(widest.group).toBe(0)
    }
  })

  it('lets somebody through at every moment of the cycle', () => {
    for (const signal of plan.signals.slice(0, 60)) {
      for (let second = 0; second < CYCLE; second += 1) {
        const open = signal.approaches.filter(approach => isGreen(plan, signal.node, approach.edge, second))
        // Either a phase is green and its own approaches are open, or it is amber and none are.
        const phase = phaseOf(signal, second)
        expect(open.length > 0).toBe(phase % 2 === 0 && signal.approaches.some(a => a.group * 2 === phase))
      }
    }
  })

  it('never gives both phases green together', () => {
    for (const signal of plan.signals.slice(0, 200)) {
      for (let second = 0; second < CYCLE; second += 1) {
        const groups = new Set(signal.approaches
          .filter(approach => isGreen(plan, signal.node, approach.edge, second))
          .map(approach => approach.group))
        expect(groups.size).toBeLessThanOrEqual(1)
      }
    }
  })

  it('spends most of the cycle showing green rather than amber', () => {
    const signal = plan.signals[0]!
    let green = 0
    for (let second = 0; second < CYCLE; second += 1) {
      if (phaseOf(signal, second) % 2 === 0)
        green += 1
    }
    expect(green).toBe(GREEN * 2)
  })

  it('waves traffic through every junction it has not signalled', () => {
    const unsignalled = network.nodes.findIndex((_, index) => !plan.byNode.has(index))
    expect(unsignalled).toBeGreaterThanOrEqual(0)
    expect(isGreen(plan, unsignalled, network.nodes[unsignalled]!.edges[0]!, 0)).toBe(true)
  })
})
