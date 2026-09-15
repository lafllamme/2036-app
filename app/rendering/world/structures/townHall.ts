import type { BuildingRecord } from '../../../core/contracts'

/**
 * Which building is the town hall.
 *
 * The ground plan comes from OpenStreetMap and does not say. What it does say is which buildings are
 * civic, and a hundred and forty-six of Lindenhafen's are — so the answer is the biggest one in the
 * middle of town, which in any German city of this size is the Rathaus or near enough to stand
 * outside of.
 *
 * It lives in its own module because two very different parts need the same answer and must not
 * disagree: `buildings.ts` gives it the tower that makes it look like one, and `life/protest.ts`
 * puts the demonstration outside it. A city with a clock tower on one building and a crowd outside
 * another is worse than a city with neither.
 *
 * Deterministic, because a campaign that protests at a different building each time it loads is not
 * a campaign.
 */

/** How close it has to be to the middle of the city to be the town hall rather than a school. */
const CENTRAL = 600

export function findTownHall(buildings: BuildingRecord[]): BuildingRecord | null {
  const civic = buildings.filter(building => building.type === 'civic')
  if (civic.length === 0)
    return null
  const central = civic.filter(building => Math.hypot(building.x, building.z) <= CENTRAL)
  const field = central.length > 0 ? central : civic
  return field.reduce((best, building) =>
    building.width * building.depth > best.width * best.depth ? building : best)
}
