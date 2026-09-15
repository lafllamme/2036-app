import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Where a demonstration stands, checked against the real ground plan.
 *
 * None of this needs a renderer: the question is geometry, and the geometry comes out of
 * `public/city/lindenhafen.json`. What it has to get right is that the crowd is outside a building
 * rather than inside one, in front of the town hall rather than behind it, and in the same place
 * every time the campaign is loaded.
 */

interface Raw { x: number, z: number, w: number, d: number, h: number, r: number, t: string }

const CITY = JSON.parse(readFileSync('public/city/lindenhafen.json', 'utf8')) as { buildings: Raw[] }
const CENTRAL = 600

/** The same choice `townHall()` makes: the biggest civic building in the middle of town. */
function townHall(): Raw {
  const civic = CITY.buildings.filter(building => building.t === 'civic')
  const central = civic.filter(building => Math.hypot(building.x, building.z) <= CENTRAL)
  const field = central.length > 0 ? central : civic
  return field.reduce((best, building) => building.w * building.d > best.w * best.d ? building : best)
}

describe('the town hall a demonstration stands outside of', () => {
  it('is a civic building, and the same one every time', () => {
    const first = townHall()
    const second = townHall()
    expect(first.t).toBe('civic')
    expect({ x: second.x, z: second.z }).toEqual({ x: first.x, z: first.z })
  })

  it('is in the middle of town rather than in a village on the edge', () => {
    expect(Math.hypot(townHall().x, townHall().z)).toBeLessThanOrEqual(CENTRAL)
  })

  it('is big enough to have a square in front of it', () => {
    const hall = townHall()
    expect(hall.w * hall.d, 'a Rathaus with no forecourt is a shed').toBeGreaterThan(2_000)
  })

  /*
   * The check that caught the first version. The square is a fan out from one façade and the ground
   * plan is dense — in the middle of Lindenhafen a building's neighbours are a few metres away.
   * Taking "the side facing the city centre" put the crowd against a wall: that façade of the
   * Rathaus is seventy-eight per cent blocked and two of the other three are completely clear.
   */
  it('stands on the façade with the most room, not the one pointing at the city', () => {
    const hall = townHall()
    const near = CITY.buildings.filter(building =>
      building !== hall && Math.hypot(building.x - hall.x, building.z - hall.z) < 90)
    const blocked = (x: number, z: number): boolean => near.some(building =>
      Math.abs(x - building.x) < building.w / 2 && Math.abs(z - building.z) < building.d / 2)

    const free = [0, 1, 2, 3].map((quarter) => {
      const facing = quarter * (Math.PI / 2)
      const out = { x: Math.sin(facing), z: Math.cos(facing) }
      const edge = (Math.abs(out.z) > 0.5 ? hall.d : hall.w) / 2
      let open = 0
      for (let step = 0; step < 60; step += 1) {
        const back = 5 + (step / 60) * 26
        const local = { x: out.x * (edge + back), z: out.z * (edge + back) }
        const x = hall.x + local.x * Math.cos(hall.r) - local.z * Math.sin(hall.r)
        const z = hall.z + local.x * Math.sin(hall.r) + local.z * Math.cos(hall.r)
        if (!blocked(x, z))
          open += 1
      }
      return open
    })

    const best = Math.max(...free)
    expect(best, 'the Rathaus has no open side at all').toBeGreaterThan(40)

    // What `openestSide` picks, mirrored: the most open side, ties to the one facing the centre.
    const toCentre = Math.atan2(-hall.x, -hall.z) - hall.r
    const preferred = ((Math.round(toCentre / (Math.PI / 2)) % 4) + 4) % 4
    let chosen = preferred
    let mostFree = -1
    for (let quarter = 0; quarter < 4; quarter += 1) {
      if (free[quarter]! > mostFree || (free[quarter] === mostFree && quarter === preferred)) {
        mostFree = free[quarter]!
        chosen = quarter
      }
    }
    expect(free[chosen], 'the chosen façade is not the open one').toBe(best)
  })
})
