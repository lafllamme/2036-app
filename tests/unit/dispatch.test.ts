import { describe, expect, it } from 'vitest'
import {
  CALL_INTERVAL_BUSY,
  CALL_INTERVAL_CALM,
  callLimit,
  callWait,
  pickKind,
  responseSpeed,
  SERVICE_FOR,
  SHAPE,
} from '../../app/rendering/world/incidents'

/**
 * What a siren is allowed to mean.
 *
 * The first version held a share of the emergency fleet on blue lights permanently, scaled by a
 * single "unrest" number — so the sirens never stopped and told the player nothing about what they
 * had decided. A siren now belongs to a call, a call belongs to a pressure, and every pressure comes
 * from something the council did. These pin that chain down without needing a GPU.
 */

const CALM = { burglary: 0, fire: 0, accident: 0, violent: 0, response: 0.6, building: 0 }
const WORST = { burglary: 1, fire: 1, accident: 1, violent: 1, response: 0.2, building: 1 }

describe('emergency dispatch', () => {
  it('leaves a well-run city quiet for minutes at a time', () => {
    // A floor of ordinary calls, but nowhere near the busy end: silence is the norm.
    expect(callWait(CALM)).toBeGreaterThan(CALL_INTERVAL_CALM * 0.7)
    expect(callWait(CALM)).toBeLessThanOrEqual(CALL_INTERVAL_CALM)
  })

  it('stacks them up when the city is in trouble, but never without pause', () => {
    expect(callWait(WORST)).toBe(CALL_INTERVAL_BUSY)
    // Even at its worst, half a minute passes between one call and the next.
    expect(callWait(WORST)).toBeGreaterThan(30)
  })

  it('gets louder with every pressure separately, so a policy is legible', () => {
    for (const driver of ['burglary', 'accident', 'violent'] as const) {
      let previous = Infinity
      for (const level of [0, 0.25, 0.5, 0.75, 1]) {
        const wait = callWait({ ...CALM, [driver]: level })
        expect(wait).toBeLessThan(previous)
        previous = wait
      }
    }
  })

  it('sends the right service, and only ever a kind the city has', () => {
    expect(SERVICE_FOR[pickKind(WORST, 0)]).toBe('police')
    for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
      const kind = pickKind(WORST, roll)
      expect(['burglary', 'accident', 'assault', 'fire']).toContain(kind)
      expect(SERVICE_FOR[kind]).toMatch(/police|ambulance|fire/)
    }
  })

  it('keeps fires rare, and follows neglected maintenance when it raises one', () => {
    /*
     * Measured against a city that has the other pressures too, because a share is a share of
     * something. The first weight tried here looked reasonable against a city with nothing else
     * wrong with it and made half of a neglected one's emergency traffic house fires.
     */
    const LIVED_IN = { ...CALM, burglary: 0.3, accident: 0.3, violent: 0.15 }
    const rate = (fire: number): number => {
      const steps = 600
      let fires = 0
      for (let step = 0; step < steps; step += 1) {
        if (pickKind({ ...LIVED_IN, fire }, step / steps) === 'fire')
          fires += 1
      }
      return fires / steps
    }

    // A well-kept city still has the odd one; a neglected one has several times as many.
    expect(rate(0)).toBeLessThan(0.03)
    expect(rate(1)).toBeGreaterThan(rate(0) * 3)
    // And never a common call. A brigade attends a fraction of what the police do.
    expect(rate(1)).toBeLessThan(0.14)
  })

  it('draws break-ins where policing is outrun, and collisions where the traffic is', () => {
    // The same roll, two different cities: what happens follows what the council starved.
    const policing = { ...CALM, burglary: 1 }
    const traffic = { ...CALM, accident: 1 }
    const mid = 0.55
    expect(pickKind(policing, mid)).toBe('burglary')
    expect(pickKind(traffic, mid)).toBe('accident')
  })

  it('keeps violence rare even in the worst city it can model', () => {
    let assaults = 0
    const steps = 200
    for (let step = 0; step < steps; step += 1) {
      if (pickKind(WORST, step / steps) === 'assault')
        assaults += 1
    }
    expect(assaults / steps).toBeLessThan(0.2)
  })

  it('lets an understaffed city fall behind rather than have fewer emergencies', () => {
    // Staffing does not change how much happens; it changes how fast anyone gets there.
    expect(responseSpeed({ ...CALM, response: 1 })).toBeGreaterThan(responseSpeed({ ...CALM, response: 0 }))
    expect(callWait({ ...WORST, response: 1 })).toBe(callWait({ ...WORST, response: 0 }))
    // And a city under pressure has more open at once, because nobody has cleared the last one.
    expect(callLimit(WORST)).toBeGreaterThan(callLimit(CALM))
  })
})

describe('what a call looks like on the ground', () => {
  it('gives every kind its own shape, not just its own colour', () => {
    const shapes = Object.values(SHAPE).map(shape => `${shape.cordon}/${shape.radius}/${shape.crowd}/${shape.wrecks}`)
    // Four kinds, four different scenes. A burglary must not read as a collision in another colour.
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('puts wrecked cars at collisions and nowhere else', () => {
    expect(SHAPE.accident.wrecks).toBeGreaterThan(0)
    expect(SHAPE.burglary.wrecks).toBe(0)
    expect(SHAPE.assault.wrecks).toBe(0)
    expect(SHAPE.fire.wrecks).toBe(0)
  })

  it('closes more of the street the bigger the call', () => {
    // A break-in is three barriers at a door; a fire shuts the road.
    expect(SHAPE.burglary.radius).toBeLessThan(SHAPE.accident.radius)
    expect(SHAPE.accident.radius).toBeLessThan(SHAPE.fire.radius)
  })

  it('stays inside the instance budget the renderer reserves', () => {
    for (const shape of Object.values(SHAPE)) {
      expect(shape.cordon).toBeLessThanOrEqual(8)
      expect(shape.crowd).toBeLessThanOrEqual(6)
      expect(shape.wrecks).toBeLessThanOrEqual(2)
    }
  })
})
