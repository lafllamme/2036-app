import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bearingFrom, buildRoadNetwork, sampleEdge } from '../../app/rendering/world/roadNetwork'
import { buildBlueprint } from '../../app/world/cityData'

/**
 * The street plan as a graph. This is what turned traffic from things sliding along lines into
 * traffic: a car holds one stretch between two junctions and chooses the next one when it gets
 * there, instead of running a whole way end to end and snapping back to the start of it.
 */
const raw = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8'))
const city = buildBlueprint(raw, 2_036)
const network = buildRoadNetwork(city, city.relief)

describe('the road network', () => {
  it('cuts the ways into stretches between junctions', () => {
    expect(network.edges.length).toBeGreaterThan(raw.roads.length)
    expect(network.nodes.length).toBeGreaterThan(1_000)
  })

  it('joins every stretch to junctions that know about it', () => {
    for (const [index, edge] of network.edges.entries()) {
      expect(network.nodes[edge.from]!.edges).toContain(index)
      expect(network.nodes[edge.to]!.edges).toContain(index)
    }
  })

  it('has real crossroads in it, so the signals have something to control', () => {
    const crossroads = network.nodes.filter(node => new Set(node.edges).size >= 3)
    expect(crossroads.length).toBeGreaterThan(400)
  })

  it('puts a junction where a stretch begins and where it ends', () => {
    for (const edge of network.edges.slice(0, 400)) {
      const from = network.nodes[edge.from]!
      const to = network.nodes[edge.to]!
      expect(Math.hypot(from.x - edge.points[0]!, from.z - edge.points[1]!)).toBeLessThan(0.001)
      expect(Math.hypot(to.x - edge.points.at(-2)!, to.z - edge.points.at(-1)!)).toBeLessThan(0.001)
    }
  })

  it('reads a position anywhere along a stretch', () => {
    const at = { x: 0, y: 0, z: 0, ux: 0, uz: 0 }
    for (const edge of network.edges.slice(0, 200)) {
      sampleEdge(edge, 0, at)
      expect(Math.hypot(at.x - edge.points[0]!, at.z - edge.points[1]!)).toBeLessThan(0.001)
      sampleEdge(edge, edge.length, at)
      expect(Math.hypot(at.x - edge.points.at(-2)!, at.z - edge.points.at(-1)!)).toBeLessThan(0.001)
      // The heading is a unit vector wherever it is read.
      sampleEdge(edge, edge.length / 2, at)
      expect(Math.hypot(at.ux, at.uz)).toBeCloseTo(1, 3)
    }
  })

  it('reports a stretch leaving a junction in the direction it actually leaves in', () => {
    // Both ends point away from their own junction, which is what lets a turn be judged by its angle.
    for (const edge of network.edges.slice(0, 200)) {
      expect(bearingFrom(edge, edge.from)).toBeCloseTo(
        Math.atan2(edge.points[2]! - edge.points[0]!, edge.points[3]! - edge.points[1]!),
        6,
      )
      const away = bearingFrom(edge, edge.to)
      expect(Math.sin(away)).toBeCloseTo(-Math.sin(edge.inBearing), 6)
      expect(Math.cos(away)).toBeCloseTo(-Math.cos(edge.inBearing), 6)
    }
  })
})
