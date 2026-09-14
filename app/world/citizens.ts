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

export type Gender = 'male' | 'female'

export interface Citizen {
  name: string
  gender: Gender
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

/**
 * Names, paired at random within a gender.
 *
 * Two lists rather than one, and the reason is a defect a player found: the figure and the card
 * disagreed. The crowd's models carry a gender in their own filename, the names were drawn from one
 * pooled list, and the result was a woman called Jonas often enough to notice. Whatever is on the
 * card now has to match what is standing in the street — which means gender is derived from the
 * citizen's number, in `genderAt`, and both the model and the name are read from it.
 *
 * Family names are shared, and paired without regard to origin — a Yılmaz called Lena and a Brandt
 * called Emre are both entirely ordinary in a German city, and a generator that matched them up
 * would be inventing a rule that does not exist.
 *
 * Wide enough that a player walking down a street does not meet the same person twice — thirty
 * given names a side against fifty family names — and not so wide that a repeat is impossible,
 * because a city of a hundred and twenty thousand has several Anna Meyers in it.
 */
const MALE_NAMES = [
  'Lukas',
  'Mehmet',
  'Jonas',
  'Paul',
  'Emre',
  'Dragan',
  'Tobias',
  'Piotr',
  'Nikos',
  'Vlad',
  'Felix',
  'Milan',
  'Andrei',
  'Mateusz',
  'Karl',
  'Leon',
  'Hüseyin',
  'Finn',
  'Matteo',
  'Yusuf',
  'Ben',
  'Goran',
  'Ivan',
  'Jakob',
  'Henrik',
  'Oskar',
  'Jan',
  'Deniz',
  'Til',
  'Samir',
]
const FEMALE_NAMES = [
  'Anna',
  'Sofia',
  'Elif',
  'Katarzyna',
  'Marie',
  'Lena',
  'Ana',
  'Fatma',
  'Julia',
  'Hannah',
  'Irina',
  'Ayşe',
  'Greta',
  'Zeynep',
  'Olena',
  'Mia',
  'Charlotte',
  'Aleksandra',
  'Emilia',
  'Clara',
  'Nora',
  'Theresa',
  'Maja',
  'Kristina',
  'Selin',
  'Bianca',
  'Amina',
  'Ruth',
  'Magda',
  'Vera',
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
  'Albrecht',
  'Çelik',
  'Wójcik',
  'Lorenzen',
  'Novák',
  'Schulte',
  'Aydın',
  'Kaminski',
  'Esposito',
  'Jensen',
  'Bergmann',
  'Dimitrov',
  'Krause',
  'Wiśniewski',
  'Arslan',
  'Schmitz',
  'Melnyk',
  'Radić',
  'Voigt',
  'Nagy',
  'Sousa',
  'Thiele',
  'Kurz',
  'Bakker',
]

/**
 * How old the city is, in bands.
 *
 * Germany's actual age structure, rounded: a fifth of the country is past retirement and roughly one
 * in six is a child. The first version of this drew an age off a power curve starting at sixteen,
 * which is not a city — it is a city with no children in it, and the schools the council funds had
 * nobody in them.
 *
 * Bands rather than a formula because a formula that produces this shape is harder to read and
 * impossible to correct against a statistic.
 */
const AGE_BANDS: { from: number, to: number, weight: number }[] = [
  { from: 0, to: 6, weight: 5.5 },
  { from: 6, to: 10, weight: 3.5 },
  { from: 10, to: 18, weight: 7.5 },
  { from: 18, to: 25, weight: 8 },
  { from: 25, to: 30, weight: 6 },
  { from: 30, to: 50, weight: 25 },
  { from: 50, to: 67, weight: 24 },
  { from: 67, to: 80, weight: 14 },
  { from: 80, to: 92, weight: 6.5 },
]

/**
 * What people in a city this size do.
 *
 * Weighted toward the trades and services a port city of a hundred and twenty thousand actually runs
 * on rather than toward the jobs that sound interesting. Only for people of working age — everyone
 * else has their occupation decided by how old they are, which is what `occupationFor` is about.
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
  { title: 'Gesundheit', weight: 4 },
  { title: 'Arbeitsuchend', weight: 4 },
]

/**
 * What somebody that age is doing with their day.
 *
 * Age decides it outright at both ends of a life and only in the middle is it a question — which is
 * both true and the reason the council's childcare and school places have somebody to be for.
 */
function occupationFor(age: number, roll: number): string {
  if (age < 1)
    return 'zu Hause'
  if (age < 6)
    return 'Kita'
  if (age < 10)
    return 'Grundschule'
  if (age < 18)
    return 'Schule'
  if (age < 25)
    return roll < 0.42 ? 'Ausbildung' : roll < 0.74 ? 'Studium' : weighted(JOBS, roll).title
  if (age >= 67)
    return 'Rente'
  return weighted(JOBS, roll).title
}

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

  const age = ageAt(index, seed)
  const abroad = roll(2) < Math.min(0.6, Math.max(0, share))

  /*
   * Drawn from the list without Germany when the household came from elsewhere, and as Germany when
   * it did not. The country's own weight is skipped rather than the roll being retried, so the
   * distribution stays flat however high the share goes.
   */
  const foreign = ORIGINS.slice(1)
  const country = abroad ? weighted(foreign, roll(3)).country : 'Deutschland'
  /*
   * Somebody who came themselves arrived within their own lifetime; a second generation did not. A
   * child is almost always the second generation, because a four-year-old did not move here alone.
   */
  const born = !abroad || roll(4) < (age < 16 ? 0.85 : 0.55) ? 'here' : 'there'
  const since = born === 'here'
    ? 2026 - age
    : 2026 - Math.max(1, Math.floor(roll(5) * Math.max(2, age - 14)))

  const gender = genderAt(index, seed)
  return {
    name: `${pick(gender === 'male' ? MALE_NAMES : FEMALE_NAMES, roll(7))} ${pick(SURNAMES, roll(8))}`,
    gender,
    age,
    origin: { country, born },
    job: occupationFor(age, roll(6)),
    since,
  }
}

/**
 * How old the figure with this index is.
 *
 * Apart from the rest because two things need it and only one of them wants a whole biography: the
 * renderer scales a child's figure smaller than an adult's, and it has no business building a name
 * and a nationality to find that out. Age does not depend on the city's composition, so both can
 * work it out and always agree.
 */
export function ageAt(index: number, seed: number): number {
  const roll = hash(index + 1, (seed & 0xFFFF) + 1)
  const band = weighted(AGE_BANDS, roll)
  // A second stream for the position inside the band, or everyone in a band would be the same age.
  const within = hash(index + 1, (seed & 0xFFFF) + 9)
  return band.from + Math.floor(within * (band.to - band.from))
}

/**
 * Whether the figure with this index is drawn as a man or a woman.
 *
 * Apart from the rest for the same reason `ageAt` is: the renderer has to pick a model from it and
 * has no business building a whole biography to do so, and the card has to agree with the figure the
 * player is pointing at. One answer, read by both.
 */
export function genderAt(index: number, seed: number): Gender {
  return hash(index + 1, (seed & 0xFFFF) + 11) < 0.5 ? 'male' : 'female'
}

/**
 * How tall somebody that age is, against a grown adult.
 *
 * A rough growth curve: about half height at four, most of the way there by fourteen, full by
 * eighteen, and a couple of centimetres back by eighty. It is the one thing about a citizen the
 * renderer reads, and it reads it from age and nothing else.
 */
export function statureAt(index: number, seed: number): number {
  const age = ageAt(index, seed)
  if (age >= 18)
    return age > 75 ? 0.98 : 1
  return 0.34 + 0.66 * (Math.min(age, 18) / 18) ** 0.62
}
