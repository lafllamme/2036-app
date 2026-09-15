import type { AxisId, PartyId } from '../core/contracts'
import type { Citizen } from './citizens'
import { PARTIES } from '../content/parties'
import { citizenHash } from './citizens'

/**
 * Who a person on the pavement would vote for.
 *
 * The city already computes a whole electorate — six shares that move with every decision — and the
 * player can only read it as a percentage in the corner of the screen. Meanwhile four hundred and
 * twenty people with names, ages and biographies walk past, and not one of them has an opinion.
 * These are the same thing seen from two ends, and joining them is what turns a number into
 * something you walk past.
 *
 * The model is deliberately two-part, because a person is not a dice roll and an electorate is not a
 * crowd of identical voters:
 *
 * - **a position of their own,** fixed for life and derived from who they are. A pensioner is not a
 *   student and a household that arrived in 1974 is not one that arrived last year. This never
 *   changes: people do not become different people because the council did something;
 * - **the weather,** which is the current support. A party the city is turning toward wins the
 *   people who were nearly there anyway, and loses them again when it turns back. That is what an
 *   electorate actually does — the committed do not move and the margin does.
 *
 * Nothing here ever branches on a party identifier. A person has a position on the same seven axes
 * every party and every motion carries, and the answer is whichever party is nearest, weighted by
 * how the city is leaning. `tests/architecture/boundaries.test.ts` holds that rule.
 *
 * The crowd does **not** reproduce the poll exactly, and it is not supposed to. `support` is the
 * whole electorate; the crowd is the few hundred people who happen to be on the pavement near the
 * camera at this hour, which in any real city is a different sample. What has to hold is that every
 * party has visible voters and that the crowd moves when the city does.
 */

/**
 * How much the mood of the city can outweigh a person's own position, and how far that is allowed
 * to go.
 *
 * The first attempt let it run free at 0.55 and a party polling sixty per cent took **over ninety
 * per cent of the crowd** — which is not an electorate, it is a stampede. Nearness spans about half
 * a point either way, so the weather has to span less than that or nobody is committed to anything.
 * At 0.55 a party on sixty per cent took over ninety per cent of the crowd; at 0.25 the smallest
 * party got no voters at all, because a large party's boost outweighed everything its own people
 * felt. Clamped to 0.8 … 1.3 the swing is worth about half what nearness is: a small party keeps the
 * people who are genuinely nearest it, and a party the city is turning toward takes the margin.
 */
const WEATHER = 0.15
const WEATHER_FLOOR = 0.8
const WEATHER_CEILING = 1.3
/** How sharply being nearer wins. See `leaningOf`. */
const SHARPNESS = 4

/**
 * Where a person stands, on the same seven axes as everything else.
 *
 * Not seven independent rolls. The first attempt was exactly that — a little noise on each axis
 * around zero — and it produced a city of six thousand centrists in which **one party got no voters
 * at all**: nobody was ever near a position that is far out on three axes at once, because
 * independent noise on seven axes puts everybody in the middle of the cloud and nobody in a corner
 * of it.
 *
 * So it is built the way political scientists actually describe an electorate: **one dominant
 * dimension, one weaker second one, and idiosyncrasy on top.**
 *
 * - `lean` runs from a public-spending, redistributive end to a market, fiscally restrained one;
 * - `authority` runs from open and permissive to closed and order-first.
 *
 * Every axis is a fixed combination of those two plus its own noise. That is what makes somebody who
 * is far out on climate *also* likely to be far out on openness — which is what a real position
 * looks like, and what gives every party somebody to represent.
 */
export function positionOf(citizen: Citizen, index: number, seed: number): Record<AxisId, number> {
  const roll = (stream: number): number => citizenHash(index + 1, (seed & 0xFFFF) + 900 + stream)

  /*
   * A draw with weight at the ends rather than a flat one. An electorate is not uniform and it is
   * not a bell either: it has committed people at both edges, and they are the ones who never move.
   */
  const shaped = (value: number): number => {
    const centred = value * 2 - 1
    return Math.sign(centred) * Math.abs(centred) ** 0.55
  }

  // Older on average means more cautious with money and more attached to order. Half a lifetime is
  // worth about a quarter of the scale — a tendency, never a rule about a person.
  const age = (citizen.age - 45) / 45
  /*
   * A household that arrived itself, or whose parents did, has more at stake in how open the city
   * is. Ordinary, and not a claim about anybody's politics beyond that.
   */
  const arrived = citizen.origin.country === 'Deutschland' ? 0 : citizen.origin.born === 'there' ? 1 : 0.55

  const lean = clamp(shaped(roll(1)) * 0.95 + 0.22 * age - 0.15 * arrived)
  const authority = clamp(shaped(roll(2)) * 0.95 + 0.24 * age - 0.5 * arrived)
  const noise = (stream: number): number => (roll(stream) - 0.5) * 0.36

  return {
    fiscalRestraint: clamp(0.8 * lean + noise(3)),
    marketVsPublic: clamp(0.9 * lean + noise(4)),
    growthVsPreservation: clamp(0.3 * lean + 0.3 * authority + noise(5)),
    climateAmbition: clamp(-0.6 * lean - 0.5 * authority + noise(6)),
    redistribution: clamp(-0.85 * lean + noise(7)),
    securityAuthority: clamp(0.3 * lean + 0.8 * authority + noise(8)),
    opennessIntegration: clamp(-0.3 * lean - 0.85 * authority + noise(9)),
  }
}

/**
 * Which party this person would vote for today.
 *
 * Nearest position wins, weighted by how the city is currently leaning. `support` is a share, so a
 * party at five per cent has to be much closer to somebody than one at thirty before it takes them —
 * which is exactly why a small party's voters are its committed ones.
 */
export function leaningOf(citizen: Citizen, index: number, seed: number, support: Record<PartyId, number>): PartyId {
  const position = positionOf(citizen, index, seed)
  const axes = Object.keys(position) as AxisId[]

  let best = PARTIES[0]!.id
  let bestScore = -Infinity
  for (const party of PARTIES) {
    const distance = axes.reduce((sum, axis) => sum + Math.abs(position[axis] - party.axes[axis]), 0) / axes.length
    /*
     * Nearness falls away sharply rather than linearly, and that is not a detail.
     *
     * Written as `1 - distance / 2` it spans 0.7 … 0.95 across every position a real person holds —
     * a thirty-five per cent range against a weather swing of sixty, so the biggest party simply won
     * everybody and the smallest got **no voters at all**, including the people plainly nearest to
     * it. An exponential is the standard shape for this and it earns its place: at four, being a
     * little nearer is worth more than being a little more fashionable, which is what being
     * committed to a party means.
     */
    const nearness = Math.exp(-distance * SHARPNESS)
    // A share of nought would silence a party entirely, so it is floored.
    const share = Math.max(0.01, support[party.id] ?? 0)
    const weather = Math.min(WEATHER_CEILING, Math.max(WEATHER_FLOOR, 1 + WEATHER * (share * PARTIES.length - 1)))
    const score = nearness * weather
    if (score > bestScore) {
      bestScore = score
      best = party.id
    }
  }
  return best
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value))
}
