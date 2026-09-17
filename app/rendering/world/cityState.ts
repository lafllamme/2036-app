import type { CityBlueprint, RenewalView, SimulationSnapshot } from '../../core/contracts'
import type { WorldVisuals } from './index'
import type { CityPressure } from './traffic/incidents'
import * as THREE from 'three/webgpu'
import { RENEWAL_RADIUS, RENEWAL_RECOVERY } from '../../simulation/renewal'
import { updateProtest } from './life/protest'
import { updateRoughSleeping } from './life/roughSleeping'
import { wearOf } from './structures/buildings'
import { fitShopfronts } from './structures/shopfronts'

/**
 * The city reacting to the simulation.
 *
 * Everything here reads the derived `cityVisuals` block of a snapshot, never a raw indicator and
 * never a policy identifier: the renderer is told that a share of the stock is derelict, not which
 * measure made it so. The state it keeps is the state needed to notice that something has changed
 * and skip the work when it has not.
 */

const DRY = /* @__PURE__ */ new THREE.Color('#8d8548')
const LUSH = /* @__PURE__ */ new THREE.Color('#ffffff')
/** A change smaller than this is not worth rewriting every instance colour in the city for. */
const BLIGHT_EPSILON = 0.02

export class CityState {
  /** How busy the roads are, and how lit the city is after dark. */
  trafficFactor = 1
  /**
   * Der zuletzt gezeichnete Einzelhandelsbestand, als Anteil seines Ausgangswertes.
   *
   * Beginnt bei −1 und nicht bei 1, damit der erste Schnappschuss die Schilder **immer** einmal
   * setzt: gebaut werden sie grau, und ohne diesen ersten Durchgang bliebe eine Stadt, in der nichts
   * passiert ist, eine Stadt ohne einen einzigen offenen Laden.
   */
  private vitality = -1
  nightLife = 0.67
  /**
   * What share of the housing stock is lived in, 0 … 1.
   *
   * Frictional vacancy is a healthy two per cent — somebody is always moving — so only what stands
   * empty *beyond* that counts as a dark window. Capped well short of black: a city with a seventh
   * of its flats empty is a bleak place, not an unlit one.
   */
  occupancy = 1
  /** How much is in the air, 0 … 1. Thickens the fog and nothing else — no mesh, no draw. */
  haze = 0
  /**
   * How unsettled the city is: how polarised, times how unhappy.
   *
   * It was computed by the simulation, copied into here and read by **nothing** for the life of the
   * project. It now decides how many people are standing outside the town hall, which is what an
   * unhappy city that has split into camps actually does — see `life/protest.ts`.
   */
  unrest = 0
  /** How many are out there, so the sound knows there is a crowd the fleet has not counted. */
  protesters = 0
  /**
   * What the city is under, handed to the agents unchanged.
   *
   * These used to be one number — unrest — standing in for everything that could go wrong, so a
   * council could not tell a policing decision from a transport one by looking out of the window.
   * Each pressure now has its own driver in `visualsFrom`, and each is visible as a different kind
   * of call. See `docs/CITY_LIFE.md`.
   */
  pressure: CityPressure = { burglary: 0, fire: 0, accident: 0, violent: 0, response: 0.6, building: 0 }
  /**
   * Who is on the pavement: the share of people whose family came from somewhere else, and how many
   * are out during working hours because there is no work. Appearance only, never behaviour.
   */
  originMix = 0
  idleness = 0
  /**
   * Die Verkehrsmittelwahl, wie der Rat sie hinterlassen hat — siehe `cycling` in `CityVisualState`.
   *
   * Startwerte so, dass eine Stadt vor der ersten Übernahme genau so aussieht wie bisher: voller
   * Autoverkehr, ein Viertel auf dem Rad.
   */
  cycling = 0.25
  carTraffic = 1
  /** Wie viel Bahn fährt. Gelesen von `updateRailway`, das bis hierher gar nichts davon wusste. */
  transitDensity = 0.7
  /** How many growth parcels the simulation has filled, kept so the warm-up can hand them back. */
  delivered = 0

  /** Dwellings one rendered building stands for, so the skyline scales with the real stock. */
  private readonly unitsPerBuilding: number
  private appliedBlight = -1
  /** Wie weit die Sanierungen zuletzt waren, in Vierundsechzigsteln summiert — der Auslöser. */
  private appliedRenewal = -1
  /** Der Verschleiß, wie er gerade im Puffer steht — je Gebäude, nicht je Eckpunkt. */
  private readonly wearNow = new Map<THREE.Mesh, Float32Array>()
  /** Die Gebäude einer Kachel, nach Bauzustand aufsteigend. Einmal sortiert, dann nur gelesen. */
  private readonly weakest = new Map<THREE.Mesh, number[]>()
  private readonly scratch = new THREE.Color()

  /**
   * In welcher Reihenfolge die freien Parzellen bebaut werden.
   *
   * Bis hierher war das die Reihenfolge, in der sie entstanden sind: von der Mitte nach außen. Das
   * ist eine vernünftige Voreinstellung und war zugleich der Grund, warum der Standortbeschluss
   * unsichtbar blieb — der Rat entschied, **wo** gebaut wird, und gebaut wurde trotzdem in der Mitte.
   *
   * Die Liste zeigt auf Parzellen, nicht auf Instanzen: an Instanzplatz *i* steht die Parzelle
   * `order[i]`. Umsortiert wird immer nur der Teil, der **noch nicht geliefert** ist — hätte eine
   * neue Standortwahl auch den vorderen Teil berührt, wären fertige Häuser quer durch die Stadt
   * gesprungen.
   */
  private order: number[]
  /** Die Matrizen in ihrer ursprünglichen Reihenfolge, damit Umsortieren nur Kopieren ist. */
  private readonly pristine: Float32Array
  /** Die zuletzt umgesetzte Standortfolge, damit nicht jedes Bild sortiert wird. */
  private sited: string[] = []

  constructor(private readonly blueprint: CityBlueprint, private readonly visuals: WorldVisuals) {
    this.unitsPerBuilding = 62_000 / Math.max(1, blueprint.buildings.length + blueprint.growthSlots.length)
    this.order = blueprint.growthSlots.map((_, index) => index)
    this.pristine = new Float32Array(visuals.growth.instanceMatrix.array)
  }

  /**
   * Die Bauparzellen nach den beschlossenen Standorten sortieren.
   *
   * Läuft nur, wenn sich die Standortfolge wirklich geändert hat — das ist ein paarmal je Amtszeit
   * und nicht je Bild. Parzellen in Bezirken, für die es einen Beschluss gibt, kommen nach vorn, in
   * der Reihenfolge der Beschlüsse; alles andere behält seine Ordnung von der Mitte nach außen.
   */
  private fitSites(sites: Partial<Record<string, string>>): void {
    const wanted = Object.values(sites).filter((id): id is string => Boolean(id))
    if (wanted.length === this.sited.length && wanted.every((id, at) => this.sited[at] === id))
      return
    this.sited = wanted

    const slots = this.blueprint.growthSlots
    this.order = deliveryOrder(this.order, this.delivered, slot => slots[slot]?.districtId ?? '', wanted)

    const matrix = this.visuals.growth.instanceMatrix
    const target = matrix.array as Float32Array
    for (let at = this.delivered; at < this.order.length; at += 1)
      target.set(this.pristine.subarray(this.order[at]! * 16, this.order[at]! * 16 + 16), at * 16)
    matrix.needsUpdate = true
  }

  apply(snapshot: SimulationSnapshot): void {
    const city = snapshot.cityVisuals
    const slots = this.blueprint.growthSlots

    this.trafficFactor = THREE.MathUtils.clamp(
      0.62 + snapshot.metrics.employment / 230 - city.transitDensity * 0.22 + (snapshot.metrics.population / 120_000 - 1) * 0.6,
      0.5,
      1.25,
    )
    this.nightLife = city.nightLife
    this.occupancy = 1 - THREE.MathUtils.clamp((city.vacancyRate - 0.02) / 0.1, 0, 1) * 0.55
    this.haze = city.haze
    this.unrest = THREE.MathUtils.clamp(city.unrest, 0, 1)
    this.protesters = updateProtest(this.visuals.protest, this.unrest)
    this.pressure = {
      burglary: city.burglaryPressure,
      fire: city.fireRisk,
      accident: city.accidentPressure,
      violent: city.violentPressure,
      response: city.responseCapacity,
      building: city.buildingActivity,
    }
    this.originMix = city.originMix
    this.idleness = city.idleness
    this.cycling = city.cycling
    this.carTraffic = city.carTraffic
    this.transitDensity = city.transitDensity

    // Erst der Ort, dann die Menge: was beschlossen ist, bestimmt, welche Parzellen als Nächstes dran sind.
    this.fitSites(snapshot.sites)

    // Delivered housing fills the free parcels — in der Reihenfolge, die `fitSites` gesetzt hat.
    this.delivered = THREE.MathUtils.clamp(Math.round(city.completedUnitsSinceStart / this.unitsPerBuilding), 0, slots.length)
    this.visuals.growth.count = this.delivered

    // Cranes stand on the next parcels in line, so building is visible before buildings are.
    const sites = Math.min(city.constructionSites, this.visuals.constructionSites.children.length)
    this.visuals.constructionSites.children.forEach((site, index) => {
      const slot = slots[this.order[(this.delivered + index) % Math.max(1, this.order.length)] ?? 0]
      site.visible = index < sites && slot !== undefined
      if (slot)
        site.position.set(slot.x, this.blueprint.relief.height(slot.x, slot.z), slot.z)
    })

    this.applyBlight(city.blight, snapshot.renewals)
    this.applyGreenery(city.greenery)
    /*
     * Und wer noch offen hat.
     *
     * Der Einzelhandelsbestand gegen seinen Ausgangswert — 1 heißt, es steht so viel wie am Anfang
     * der Amtszeit. Fällt er, gehen sichtbar Schilder aus. Nur bei Änderung, weil das einmal im
     * Monat kommt und zwölftausend Farben je Bild zu setzen sinnlos wäre.
     */
    const vitality = snapshot.baselineMetrics.businessStock > 0
      ? snapshot.metrics.businessStock / snapshot.baselineMetrics.businessStock
      : 1
    if (Math.abs(vitality - this.vitality) > 0.001) {
      this.vitality = vitality
      fitShopfronts(this.visuals.shopfronts, this.blueprint.definition.seed, vitality)
    }
    /*
     * And who the housing market has left outside. One number, one prefix of the doorways — the
     * most direct line in the game between a council decision and something the player can see.
     */
    updateRoughSleeping(this.visuals.roughSleeping, city.roughSleeping)
  }

  /**
   * Leerstand über der Schwelle lässt einen Teil des Bestands verfallen — und zwar den Teil, der
   * ohnehin schon am schlechtesten dasteht.
   *
   * Zwei Dinge sind hier anders als vorher, und beide waren falsch. Es wurde die **Farbe** eines
   * Hauses grau gezogen — dieselbe Farbe, die das Überfahren mit der Maus benutzt und die eigentlich
   * sagt, aus was für einem Material die Wand ist —, und getroffen hat es schlicht die ersten *n*
   * Gebäude der Kachelliste, also eine beliebige Auswahl ohne Zusammenhang mit ihrem Zustand.
   *
   * Jetzt schreibt es in den Verschleiß, wo es hingehört: die Farbe gehört wieder allein dem Material
   * und dem Zeiger, und verfallen tut, was schon vorher am nächsten dran war. Damit sammelt sich der
   * Verfall dort, wo die Stadt ihn ohnehin hat — im Hafen, in Gewerbe-Ost — statt gleichmäßig über
   * acht Viertel gesprenkelt zu sein.
   */
  private applyBlight(blight: number, renewals: RenewalView[]): void {
    /*
     * Und was saniert wird, holt sich seinen Zustand zurück.
     *
     * Derselbe Durchgang wie der Verfall, weil beide in dasselbe Attribut schreiben. Getrennt
     * wären es zwei Läufe, die sich gegenseitig überschreiben — wer zuletzt schreibt, gewinnt, und
     * das ist die Art Fehler, die man erst nach achtzehn Spielmonaten sieht.
     *
     * Ausgelöst wird er, wenn der Verfall sich bewegt **oder** eine Sanierung weitergekommen ist.
     * Der Fortschritt läuft in Achtzehnteln, also höchstens einmal im Monat — kein Grund, 26.000
     * Gebäude je Bild durchzugehen.
     */
    const progress = renewals.reduce((sum, renewal) => sum + Math.round(renewal.progress * 64), 0)
    if (Math.abs(blight - this.appliedBlight) <= BLIGHT_EPSILON && progress === this.appliedRenewal)
      return
    this.appliedBlight = blight
    this.appliedRenewal = progress
    for (const mesh of this.visuals.buildingMeshes) {
      const records = this.visuals.buildingRecords.get(mesh)
      const ranges = this.visuals.buildingRanges.get(mesh)
      const attribute = this.visuals.buildingWear.get(mesh)
      if (!records || !ranges || !attribute)
        continue

      let now = this.wearNow.get(mesh)
      if (!now) {
        now = Float32Array.from(records, record => wearOf(record.condition))
        this.wearNow.set(mesh, now)
        this.weakest.set(
          mesh,
          records.map((_, index) => index).sort((a, b) => records[a]!.condition - records[b]!.condition),
        )
      }

      const order = this.weakest.get(mesh) ?? []
      const affected = Math.round(records.length * blight)
      const buffer = attribute.array as Float32Array
      let touched = false
      for (let rank = 0; rank < order.length; rank += 1) {
        const index = order[rank]!
        const record = records[index]!
        const base = wearOf(record.condition)
        // Ein aufgegebenes Haus ist aufgegeben; sein Ausgangszustand hebt es nur noch wenig davon ab.
        const decayed = rank < affected ? Math.min(1, 0.68 + base * 0.32) : base
        /*
         * Die Sanierung kommt **nach** dem Verfall und gewinnt: ein Block, an dem gerade achtzehn
         * Monate gearbeitet wird, ist nicht gleichzeitig verwahrlost. Der stärkste Fortschritt
         * gewinnt, wenn zwei Blöcke sich überlappen — zweimal saniert ist nicht doppelt saniert.
         */
        let recovery = 0
        for (const renewal of renewals) {
          if (Math.hypot(record.x - renewal.x, record.z - renewal.z) <= RENEWAL_RADIUS)
            recovery = Math.max(recovery, renewal.progress)
        }
        const target = decayed * (1 - recovery * RENEWAL_RECOVERY)
        if (Math.abs(target - now[index]!) < 0.004)
          continue
        now[index] = target
        const range = ranges[index]!
        buffer.fill(target, range.start, range.start + range.count)
        touched = true
      }
      /*
       * Ganzer Puffer statt Teilbereichen, und das ist hier die billigere Wahl: `blight` ändert sich
       * höchstens einmal im Monat und meistens gar nicht, und die Alternative wären hunderte
       * Einzelbereiche pro Kachel, die der Treiber ohnehin zu einem Upload zusammenzieht.
       */
      if (touched)
        attribute.needsUpdate = true
    }
  }

  /** Green space is a stock the player can spend or build: fewer hectares, fewer and drier trees. */
  private applyGreenery(raw: number): void {
    const greenery = THREE.MathUtils.clamp(raw, 0.45, 1.3)
    /*
     * The stock is split across one mesh per species, so each is thinned against its own capacity.
     * Setting a count past what a mesh actually holds hands the GPU an instance range longer than its
     * buffers, and every draw in the frame is rejected.
     */
    const share = Math.min(1, greenery)
    for (const mesh of this.visuals.planting)
      mesh.count = Math.round(mesh.instanceMatrix.count * share)
    // One material behind every species, so the whole city's greenery dries out together.
    this.visuals.treeCrowns.material.color.copy(this.scratch.copy(DRY).lerp(LUSH, THREE.MathUtils.clamp(greenery, 0, 1)))
  }
}

/**
 * Welche Bauparzelle als Nächstes bebaut wird, nach dem, was der Rat beschlossen hat.
 *
 * Eigene Funktion, weil an ihr genau eine Sache hängt, die man im Bild erst nach Monaten sieht: der
 * **gelieferte Teil darf sich nie ändern**. Sortiert man die ganze Liste um, springen fertige Häuser
 * quer durch die Stadt, sobald ein neuer Standort beschlossen wird — und das passiert zum ersten Mal
 * im dritten Spieljahr, wo es niemand mehr mit dieser Zeile in Verbindung bringt.
 *
 * Alles hinter dem gelieferten Teil wird nach den beschlossenen Bezirken vorgezogen, in der
 * Reihenfolge der Beschlüsse. Parzellen ohne Beschluss behalten ihre ursprüngliche Ordnung — von
 * der Mitte nach außen —, denn eine Stadt wächst von innen, solange niemand etwas anderes sagt.
 */
export function deliveryOrder(
  order: number[],
  delivered: number,
  districtOf: (slot: number) => string,
  sited: string[],
): number[] {
  const rank = (slot: number): number => {
    const at = sited.indexOf(districtOf(slot))
    return at === -1 ? sited.length : at
  }
  const head = order.slice(0, delivered)
  const tail = order.slice(delivered).sort((a, b) => rank(a) - rank(b) || a - b)
  return [...head, ...tail]
}
