/**
 * Who the people on the pavement are.
 *
 * Nobody is stored. A citizen is a pure function of the index of the figure walking down the street
 * and the seed of the city, so five hundred people cost five hundred integers and a player who
 * points at the same one twice is told the same thing twice. Nothing is generated until somebody
 * asks, which is what makes it affordable to give every figure in the city a life.
 *
 * Two rules hold here and they are the same two rules the rest of the game runs on.
 *
 * The first: appearance and origin are drawn from different streams and neither is read from the
 * other. A figure's complexion says nothing about where their family came from and where their
 * family came from says nothing about their complexion — because in a real city it does not, and
 * because a game that quietly linked them would be teaching the player that it does.
 *
 * The second: none of this is ever read back. A citizen's origin, job and age exist to be looked at
 * and for no other purpose. No event weight, no metric, no incident, no score. `docs/CITY_LIFE.md`
 * states it and `tests/architecture/boundaries.test.ts` holds it.
 */

/** Where a household came from. Europe only, as the city's own history would have it. */
export interface Origin {
  /** The country, in German. */
  country: string
  /** Whether this person was born in Lindenhafen, or came themselves. */
  born: 'here' | 'there'
}

export interface Citizen {
  name: string
  age: number
  origin: Origin
  job: string
  /** The year the household arrived, or the year they were born here. */
  since: number
}

/**
 * The places Lindenhafen's people come from, and roughly how many.
 *
 * A north German port city's actual post-war history: Turkish and Polish labour migration, Italian
 * and Greek before it, the former Yugoslavia in the nineties, Romania and Bulgaria after 2007,
 * Ukraine after 2022. The weights are relative and rounded; they are a plausible composition, not a
 * statistic, and nothing is calculated from them.
 */
const ORIGINS: { country: string, weight: number }[] = [
  { country: 'Deutschland', weight: 100 },
  { country: 'Türkei', weight: 13 },
  { country: 'Polen', weight: 11 },
  { country: 'Ukraine', weight: 7 },
  { country: 'Rumänien', weight: 6 },
  { country: 'Italien', weight: 5 },
  { country: 'Bulgarien', weight: 4 },
  { country: 'Griechenland', weight: 4 },
  { country: 'Kroatien', weight: 3 },
  { country: 'Serbien', weight: 3 },
  { country: 'Portugal', weight: 2 },
  { country: 'Spanien', weight: 2 },
  { country: 'Frankreich', weight: 2 },
  { country: 'Niederlande', weight: 2 },
  { country: 'Ungarn', weight: 2 },
  { country: 'Litauen', weight: 1 },
  { country: 'Dänemark', weight: 1 },
]

/** First names, from everywhere the city's people are from. Paired with surnames at random. */
const FIRST_NAMES = [
  'Anna',
  'Lukas',
  'Mehmet',
  'Sofia',
  'Jonas',
  'Elif',
  'Paul',
  'Katarzyna',
  'Emre',
  'Marie',
  'Dragan',
  'Lena',
  'Ana',
  'Tobias',
  'Fatma',
  'Piotr',
  'Julia',
  'Nikos',
  'Hannah',
  'Vlad',
  'Irina',
  'Felix',
  'Ayşe',
  'Milan',
  'Greta',
  'Andrei',
  'Mateusz',
  'Zeynep',
  'Karl',
  'Olena',
]
const SURNAMES = [
  'Brandt',
  'Yılmaz',
  'Nowak',
  'Schröder',
  'Kowalski',
  'Demir',
  'Petersen',
  'Popescu',
  'Meyer',
  'Horvat',
  'Kaya',
  'Wagner',
  'Jankowski',
  'Rossi',
  'Hansen',
  'Öztürk',
  'Kovačević',
  'Bauer',
  'Ivanov',
  'Lehmann',
  'Marković',
  'Ferreira',
  'Weber',
  'Szabó',
  'Koval',
  'Fischer',
]

/**
 * What people in a city this size do.
 *
 * Weighted toward the trades and services a port city of a hundred and twenty thousand actually
 * runs on rather than toward the jobs that sound interesting.
 */
const JOBS: { title: string, weight: number }[] = [
  { title: 'Einzelhandel', weight: 12 },
  { title: 'Pflege', weight: 10 },
  { title: 'Handwerk', weight: 10 },
  { title: 'Logistik', weight: 9 },
  { title: 'Hafenbetrieb', weight: 8 },
  { title: 'Gastronomie', weight: 8 },
  { title: 'Büro und Verwaltung', weight: 8 },
  { title: 'Kita und Schule', weight: 6 },
  { title: 'Industrie', weight: 6 },
  { title: 'Baugewerbe', weight: 5 },
  { title: 'Reinigung', weight: 4 },
  { title: 'Rente', weight: 6 },
  { title: 'Studium', weight: 5 },
  { title: 'Ausbildung', weight: 3 },
]

/**
 * A pure hash from an integer to a number in [0, 1).
 *
 * Not the seeded stream the simulation uses — that is stateful and is deliberately kept out of the
 * renderer — but the same discipline: the same index and the same salt always give the same answer,
 * on any machine, in any session.
 */
function hash(index: number, salt: number): number {
  let value = (index * 2_654_435_761 + salt * 40_503) >>> 0
  value ^= value >>> 15
  value = Math.imul(value, 2_246_822_519) >>> 0
  /*
   * Unsigned after every step, not only after the multiply.
   *
   * XOR in JavaScript works on signed 32-bit integers, so the last one can hand back a negative
   * number — and a negative roll raised to a fractional power is NaN, which is how every person in
   * the city briefly ended up with an age of NaN.
   */
  value = (value ^ (value >>> 13)) >>> 0
  return value / 0x1_0000_0000
}

function pick<T>(list: T[], roll: number): T {
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))]!
}

function weighted<T extends { weight: number }>(list: T[], roll: number): T {
  const total = list.reduce((sum, entry) => sum + entry.weight, 0)
  let point = roll * total
  for (const entry of list) {
    point -= entry.weight
    if (point <= 0)
      return entry
  }
  return list[list.length - 1]!
}

/**
 * Who the figure with this index is.
 *
 * `share` is the simulation's `originMix` — the share of the city whose family came from somewhere
 * else. It decides how many of the people on the pavement have a family history from abroad and
 * nothing else about them: not their job, not their age, and not what they are doing there.
 */
export function citizenAt(index: number, seed: number, share: number): Citizen {
  const salt = seed & 0xFFFF
  const roll = (stream: number): number => hash(index + 1, salt + stream)

  const age = 16 + Math.floor(roll(1) ** 1.35 * 68)
  const abroad = roll(2) < Math.min(0.6, Math.max(0, share))

  /*
   * Drawn from the list without Germany when the household came from elsewhere, and as Germany when
   * it did not. The country's own weight is skipped rather than the roll being retried, so the
   * distribution stays flat however high the share goes.
   */
  const foreign = ORIGINS.slice(1)
  const country = abroad ? weighted(foreign, roll(3)).country : 'Deutschland'
  // Somebody who came themselves arrived within their own lifetime; a second generation did not.
  const born = !abroad || roll(4) < 0.55 ? 'here' : 'there'
  const since = born === 'here'
    ? 2026 - age
    : 2026 - Math.max(1, Math.floor(roll(5) * Math.max(2, age - 14)))

  const job = age > 66 ? 'Rente' : weighted(JOBS, roll(6)).title

  return {
    name: `${pick(FIRST_NAMES, roll(7))} ${pick(SURNAMES, roll(8))}`,
    age,
    origin: { country, born },
    job: age < 19 && job !== 'Studium' ? 'Schule' : job,
    since,
  }
}
