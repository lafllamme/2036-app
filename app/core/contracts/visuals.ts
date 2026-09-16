/**
 * What the renderer is told about the state of the city.
 *
 * The one-way valve between the simulation and the picture. Everything here is derived, nothing here
 * is authoritative, and the renderer may read no other part of the simulation — see
 * `docs/VISIBLE_CITY.md` for what each signal is allowed to cost.
 */

/** Where the sun and the moon stand, handed to the renderer so it never owns its own clock. */
export interface SkyState {
  /** Hours since midnight, 0 … 24. */
  hourOfDay: number
  /** The sine of the sun's true altitude: it peaks near 0.24 in January and 0.86 in June. */
  elevation: number
  /** 1 at solar noon in any month, −1 at solar midnight; this is what brightness reads. */
  arc: number
  /** 0 at sunrise … 1 at sunset and on to 2 at the next sunrise. */
  sweep: number
  phase: string
  temperature: number
}

/**
 * What the renderer needs in order to show the city reacting. Derived, never authored.
 *
 * This is the whole seam between the two halves of the game. The renderer never reads `CityMetrics`;
 * it reads this, and everything it shows — how often something catches fire, how many patrol cars are
 * out, who is on the pavement — is one of these numbers. That means no part of the city has a rate of
 * its own: a house fire is maintenance spending and blight, not a dice roll with a constant behind
 * it, so funding the building inspectorate is visible on the street without a constant being touched.
 *
 * It also means the flow is one-way, which is the same rule that keeps party identity out of the
 * simulation's arithmetic: what is shown may never feed what is computed. See `docs/CITY_LIFE.md`.
 */
export interface CityVisualState {
  constructionSites: number
  completedUnitsSinceStart: number
  vacancyRate: number
  blight: number
  /**
   * Wie viel Bahn fährt, 0 … 1. Aus der Erschließung.
   *
   * Stand seit jeher in diesem Vertrag und wurde von **niemandem gelesen** — die Züge fuhren in
   * fester Zahl, ganz gleich was der Rat für den Nahverkehr beschlossen hatte.
   */
  transitDensity: number
  /**
   * Wie viele in die Pedale treten, 0 … 1 — und wie viele im Auto sitzen.
   *
   * Der Anteil der Radfahrer hing an Uhrzeit und Wetter und an sonst nichts. Eine Radachse zu
   * beschließen änderte eine Zahl in einer Kachel und auf der Karte kein einziges Fahrrad. Das ist
   * die billigste Verbindung zwischen Beschluss und Bild, die es gibt: die Flotten stehen bereits im
   * Speicher, es wird nur ein anderer Anteil davon bewegt — **kein Modell, kein Draw, kein Dreieck.**
   *
   * Und sie hängen zusammen. Wer aufs Rad steigt, sitzt nicht im Auto: `carTraffic` fällt, wenn
   * `cycling` und `transitDensity` steigen. Ein Verkehrsbeschluss verschiebt damit, *was* auf der
   * Straße zu sehen ist, und nicht nur, wie viel.
   */
  cycling: number
  carTraffic: number
  nightLife: number
  greenery: number
  unrest: number
  /** How likely a building is to catch fire: neglected fabric in a city that stopped maintaining it. */
  fireRisk: number
  /** Burglaries against the order service's ability to answer them. */
  burglaryPressure: number
  /** Collisions: how much traffic there is and how badly the network is coping with it. */
  accidentPressure: number
  /** The rare serious call — crime, polarisation and young people with nothing to do. */
  violentPressure: number
  /** How quickly anybody gets there, which is staff and nothing else. */
  responseCapacity: number
  /** How much is being built, which is what puts trades and deliveries on the street. */
  buildingActivity: number
  /** The share of people on the pavement whose family came from somewhere else. */
  originMix: number
  /**
   * How much is in the air, 0 … 1.
   *
   * The cheapest visible signal in the whole game: it is the fog the scene already has, thickened
   * and yellowed. No mesh, no draw, no triangle — and from any distance it is the difference between
   * a city you can see across and one you cannot.
   */
  haze: number
  /** How many are out during working hours because there is no work. */
  idleness: number
  /**
   * How many people the housing market has left outside, as a share of the worst this city gets.
   *
   * The most legible consequence in the game: rents that ran away and bindings nobody renewed are a
   * number in a panel, and somebody sitting in a doorway is not.
   */
  roughSleeping: number
}
