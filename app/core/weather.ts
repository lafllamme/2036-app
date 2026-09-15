/**
 * What the sky is doing, from a real climate rather than from dice.
 *
 * Rolling for rain gives a city where it rains as often in July as in November, and a player who
 * cannot tell January from June by looking out of the window. Lindenhafen stands on Bremen's ground
 * plan, so it gets Bremen's weather: the monthly normals below are the 1991–2020 reference period,
 * rounded, and every one of them is a number you could look up.
 *
 * Deterministic, like everything else here. The same campaign seed and the same month give the same
 * weather, so a reloaded save is not a different autumn.
 *
 * Pure, and free of THREE, because what it is worth testing is the climate and not the raindrops.
 */

/** Days a month with a millimetre of rain or more, Bremen 1991–2020. */
const WET_DAYS = [12, 10, 10, 9, 9, 10, 11, 10, 10, 11, 12, 13]
/** Mean wind speed in m/s: the North German plain is windier in winter than in summer. */
const MEAN_WIND = [4.6, 4.5, 4.3, 3.8, 3.5, 3.4, 3.4, 3.3, 3.6, 4.1, 4.4, 4.6]
/** Mean cloud cover as a share of the sky. */
const MEAN_CLOUD = [0.78, 0.74, 0.69, 0.63, 0.60, 0.60, 0.62, 0.61, 0.64, 0.71, 0.79, 0.80]

/** How many spells of weather a month is divided into. A month is one day of play. */
const SPELLS = 7
/** Below this the air is cold enough for it to fall as snow rather than rain. */
const SNOW_BELOW = -0.5
/** And above this none of it does, whatever the roll says. */
const SNOW_NEVER_ABOVE = 2.2
/**
 * How far a spell of weather pulls the thermometer off the seasonal curve, in °C.
 *
 * Without this, a month is a single temperature curve and the coldest Lindenhafen ever gets is its
 * January mean — which on this coast is +2.6 °C, so it could never once snow. Real winters are not
 * their own average: they are a fortnight of grey drizzle and then five days under freezing, and the
 * five days are the ones anybody remembers.
 */
const SPELL_SWING = 7

export interface Weather {
  /**
   * The air temperature in °C: the season's own curve plus whatever spell of weather this is.
   *
   * This rather than the seasonal reading is what the city displays and what decides snow, because a
   * cold snap is weather and the curve it sits on is climate.
   */
  temperature: number
  /** How hard it is raining, 0 … 1. Zero whenever it is snowing. */
  rain: number
  /** How hard it is snowing, 0 … 1. Zero whenever it is raining. */
  snow: number
  /** How much of the sky is covered, 0 … 1. */
  cloud: number
  /** How hard it is blowing, 0 … 1, against a gale rather than against nothing. */
  wind: number
}

export const CALM: Weather = { temperature: 10, rain: 0, snow: 0, cloud: 0.5, wind: 0.3 }

/**
 * The weather at a moment in the campaign.
 *
 * `monthOfYear` runs 1 … 12 and `progress` runs 0 … 1 through the month, which in this game is one
 * day. The month decides the climate; the progress and the seed decide which spell of it this is.
 * `baseTemperature` is what the season and the hour alone would give — `readDaylight` already works
 * that out — and this adds the spell's own anomaly on top of it.
 */
export function weatherAt(monthOfYear: number, progress: number, month: number, seed: number, baseTemperature = 10): Weather {
  const index = ((Math.round(monthOfYear) - 1) % 12 + 12) % 12
  const wetDays = WET_DAYS[index] ?? 10
  const baseCloud = MEAN_CLOUD[index] ?? 0.7
  const baseWind = MEAN_WIND[index] ?? 4

  /*
   * Which spell of weather this is, and how far into it. Spells rather than a fresh roll every frame
   * — weather that flickers is not weather — and interpolated across the join so one does not switch
   * into the next between two frames.
   */
  const position = clamp01(progress) * SPELLS
  const spell = Math.floor(position)
  const blend = smooth(position - spell)
  const here = spellNoise(month, spell, seed)
  const next = spellNoise(month, spell + 1, seed)
  const roll = here + (next - here) * blend
  const gust = mix(spellNoise(month, spell + 11, seed), spellNoise(month, spell + 12, seed), blend)
  const swing = mix(spellNoise(month, spell + 23, seed), spellNoise(month, spell + 24, seed), blend)
  /*
   * Squared about its middle, so that most spells sit close to the season and the hard frosts are
   * rare. A flat roll put a fifth of every November below freezing, which is a Lapland November.
   */
  const anomaly = (swing - 0.5) * 2
  const temperature = baseTemperature + anomaly * Math.abs(anomaly) * SPELL_SWING

  /*
   * Twelve wet days in thirty-one is a chance of falling, not a promise. The spell rolls against
   * that chance; how far *under* it the roll lands is how hard it comes down, so a wet month has more
   * spells of rain and the heavy ones stay rare in any month.
   *
   * There is deliberately no threshold in that: a roll exactly on the chance gives exactly nothing,
   * and the rain grows from there. A step — "below this it pours, above it nothing" — is what makes
   * weather switch on between two frames, which is the one thing a sky must never do.
   */
  const chance = wetDays / 31
  const depth = clamp01((chance - roll) / Math.max(0.0001, chance))
  const falling = smooth(depth) * (0.35 + depth * 0.65)

  // Cold enough and it comes down as snow instead. Between the two thresholds it is sleet: both.
  const asSnow = temperature <= SNOW_BELOW
    ? 1
    : temperature >= SNOW_NEVER_ABOVE
      ? 0
      : (SNOW_NEVER_ABOVE - temperature) / (SNOW_NEVER_ABOVE - SNOW_BELOW)

  return {
    temperature,
    rain: falling * (1 - asSnow),
    snow: falling * asSnow,
    // It is cloudier when it is raining, which is not a coincidence and should not look like one.
    cloud: clamp01(baseCloud * (0.72 + gust * 0.5) + falling * 0.35),
    // Twelve metres a second is a gale; that is the top of this scale rather than the mean.
    wind: clamp01((baseWind * (0.6 + gust * 0.9) + falling * 2.5) / 12),
  }
}

/** One spell's roll: a hash of the campaign seed, the month and which spell it is. */
function spellNoise(month: number, spell: number, seed: number): number {
  let value = (Math.imul(month + 1, 0x9E37_79B9) ^ Math.imul(spell + 1, 0x85EB_CA6B) ^ Math.imul(seed, 0xC2B2_AE35)) >>> 0
  value ^= value >>> 15
  value = Math.imul(value, 0x2545_F491) >>> 0
  value = (value ^ (value >>> 13)) >>> 0
  return value / 0x1_0000_0000
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
