import { describe, expect, it } from 'vitest'
import { POLICIES } from '../../app/content/policies'
import { BUILDABLE_BY_COST, SITE_PROFILES, SITES_BY_COST } from '../../app/content/sites'
import { applyPolicy, chooseSite, createInitialState, snapshotOf } from '../../app/simulation/model'
import { costAt, needsSite, offered, paceAt, sitesFor, unrestAt } from '../../app/simulation/siting'

/**
 * Das Angebot an Standorten.
 *
 * Die eine Eigenschaft, die dieses Feature trägt und die man ihm nicht ansieht: **das Angebot muss
 * immer eine Spanne haben.** Drei zufällig gezogene Bezirke wären in jedem dritten Fall drei
 * ähnliche, und dann steht der Spieler vor drei Knöpfen, die dasselbe tun — eine Entscheidung, die
 * keine ist, und zwar genau dann, wenn er sie zum ersten Mal trifft.
 */

const SEED = 2036

describe('standortwahl', () => {
  it('spannt das Angebot immer vom günstigsten bis zum teuersten Bezirk', () => {
    for (const sourceId of ['housing-accelerator', 'transit-network', 'shared-maintenance', 'x']) {
      const sites = sitesFor(sourceId, SEED)
      expect(sites, sourceId).toHaveLength(3)
      expect(sites[0]!.districtId).toBe(BUILDABLE_BY_COST[0]!.districtId)
      expect(sites[2]!.districtId).toBe(BUILDABLE_BY_COST[BUILDABLE_BY_COST.length - 1]!.districtId)
      // Von günstig nach teuer, und drei verschiedene Bezirke.
      expect(sites[0]!.cost).toBeLessThan(sites[1]!.cost)
      expect(sites[1]!.cost).toBeLessThan(sites[2]!.cost)
      expect(new Set(sites.map(site => site.districtId)).size).toBe(3)
    }
  })

  it('bietet derselben Vorlage immer dasselbe an und verschiedenen Vorlagen Verschiedenes', () => {
    expect(sitesFor('housing-accelerator', SEED).map(site => site.districtId))
      .toEqual(sitesFor('housing-accelerator', SEED).map(site => site.districtId))

    const middles = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => sitesFor(id, SEED)[1]!.districtId),
    )
    // Wäre die Mitte fest, gäbe es hier genau einen Bezirk — und das Angebot wäre immer dasselbe.
    expect(middles.size).toBeGreaterThan(1)
  })

  it('nimmt nur einen Standort an, der auch angeboten wurde', () => {
    const sites = sitesFor('housing-accelerator', SEED)
    expect(offered('housing-accelerator', SEED, sites[1]!.districtId)).toBe(true)

    const notOffered = SITES_BY_COST.find(site => !sites.some(offer => offer.districtId === site.districtId))!
    expect(offered('housing-accelerator', SEED, notOffered.districtId)).toBe(false)
  })

  /** Die Spanne muss sich im Preis wiederfinden, sonst ist sie nur eine Beschriftung. */
  it('macht den teuren Standort spürbar teurer als den billigen', () => {
    const cheap = costAt(28, 'marschland')
    const dear = costAt(28, 'neustadt')
    expect(dear).toBeGreaterThan(cheap * 2)
    expect(cheap).toBeLessThan(28)
  })

  it('rundet auf Zehntelmillionen, weil der Haushalt so gelesen wird', () => {
    expect(costAt(28, 'altstadt')).toBe(51.8)
    expect(Number.isInteger(costAt(28, 'neustadt') * 10)).toBe(true)
  })

  it('lässt kein Vorhaben in null Monaten fertig werden', () => {
    for (const site of SITES_BY_COST)
      expect(paceAt(0, site.districtId), site.districtId).toBeGreaterThanOrEqual(1)
    expect(paceAt(10, 'altstadt')).toBeGreaterThan(paceAt(10, 'marschland'))
  })

  it('kostet Zufriedenheit dort, wo Nachbarn sind, und fast nichts im Hafen', () => {
    expect(unrestAt('altstadt')).toBeGreaterThan(unrestAt('marschland') * 5)
    // Ein Ärgernis, keine Krise: der größte Ausschlag bleibt unter drei Punkten.
    for (const site of SITES_BY_COST)
      expect(unrestAt(site.districtId), site.districtId).toBeLessThan(3)
  })

  it('kennt für jeden Bezirk ein Profil mit einem Satz, der es begründet', () => {
    for (const profile of Object.values(SITE_PROFILES)) {
      expect(profile.name.length, profile.districtId).toBeGreaterThan(3)
      expect(profile.note.length, profile.districtId).toBeGreaterThan(20)
      expect(profile.resistance).toBeGreaterThanOrEqual(0)
      expect(profile.resistance).toBeLessThanOrEqual(1)
    }
  })

  /**
   * Die Quote ist selbst eine Gestaltungsfrage.
   *
   * Zu wenige verortbare Vorlagen, und die Karte bleibt Kulisse; zu viele, und jeder Beschluss wird
   * zur Standortsuche. Der erste Versuch hat es aus den Wirkungen abgeleitet und kam auf 19 von 26 —
   * inklusive Haushaltskonsolidierung. Ein knappes Drittel ist das, was gemeint war.
   */
  it('lässt ein knappes Drittel der Vorlagen nach einem Ort fragen', () => {
    const sited = POLICIES.filter(policy => needsSite(policy))
    expect(sited.length).toBeGreaterThanOrEqual(6)
    expect(sited.length).toBeLessThanOrEqual(12)

    // Was Geld verschiebt, hat keinen Bauplatz.
    for (const id of ['shared-consolidation', 'fdp-holdings-review', 'cdu-debt-brake', 'spd-social-ticket'])
      expect(needsSite(POLICIES.find(policy => policy.id === id)!), id).toBe(false)
    // Und was steht, schon.
    for (const id of ['housing-accelerator', 'cdu-commercial-land', 'shared-maintenance'])
      expect(needsSite(POLICIES.find(policy => policy.id === id)!), id).toBe(true)
  })

  /**
   * Der ganze Weg, einmal: beschließen, warten, verorten.
   *
   * Der Punkt, an dem die Pflicht wirklich Pflicht ist — solange kein Ort genannt wurde, darf
   * **nichts** passiert sein: kein Geld weg, keine Maßnahme in der Liste, keine Nachricht im
   * Stadtfunk. Ein Vorhaben, das schon wirkt und trotzdem noch auf seinen Bauplatz wartet, wäre
   * genau die Halbheit, die die Entscheidung entwertet.
   */
  it('hält eine verortbare Vorlage an, bis der Ort feststeht', () => {
    const before = createInitialState(SEED)
    const waiting = applyPolicy(before, 'housing-accelerator')

    expect(waiting.siting[0]?.policyId).toBe('housing-accelerator')
    expect(waiting.measures).toHaveLength(before.measures.length)
    expect(waiting.metrics.cityBudget).toBe(before.metrics.cityBudget)
    expect(waiting.policies).toHaveLength(0)

    const sites = snapshotOf(waiting).pendingSiting!.sites
    expect(sites).toHaveLength(3)
    expect(sites[0]!.cost).toBeLessThan(sites[2]!.cost)

    const done = chooseSite(waiting, sites[0]!.districtId)
    expect(done.siting).toHaveLength(0)
    expect(done.sites['housing-accelerator']).toBe(sites[0]!.districtId)
    expect(done.measures.length).toBeGreaterThan(before.measures.length)
    expect(done.metrics.cityBudget).toBeLessThan(before.metrics.cityBudget)
  })

  it('lässt eine ortlose Vorlage sofort durch', () => {
    const done = applyPolicy(createInitialState(SEED), 'spd-social-ticket')
    expect(done.siting).toHaveLength(0)
    expect(done.policies).toHaveLength(1)
  })

  it('weist einen Bezirk ab, der nie angeboten wurde', () => {
    const waiting = applyPolicy(createInitialState(SEED), 'housing-accelerator')
    const offers = sitesFor('housing-accelerator', SEED).map(site => site.districtId)
    const outside = SITES_BY_COST.find(site => !offers.includes(site.districtId))!

    expect(chooseSite(waiting, outside.districtId)).toBe(waiting)
    expect(chooseSite(waiting, outside.districtId).siting).toHaveLength(1)
  })

  /** Der teure Standort muss im Haushalt und in der Stimmung wehtun, sonst wählt ihn jeder. */
  it('macht den teuren Standort im Haushalt und in der Zufriedenheit spürbar', () => {
    const waiting = applyPolicy(createInitialState(SEED), 'housing-accelerator')
    const offers = sitesFor('housing-accelerator', SEED)
    const cheap = chooseSite(waiting, offers[0]!.districtId)
    const dear = chooseSite(waiting, offers[2]!.districtId)

    expect(dear.metrics.cityBudget).toBeLessThan(cheap.metrics.cityBudget)
    expect(dear.metrics.satisfaction).toBeLessThan(cheap.metrics.satisfaction)
  })

  /**
   * Der Fehler, den erst das Spiel gezeigt hat: die Altstadt war die teure Wahl mit der größten
   * Wirkung — und hat **eine** freie Bauparzelle. Gewählt, bezahlt, und dann kein einziger Kran.
   */
  it('bietet nur Bezirke an, in denen überhaupt Platz ist', () => {
    for (const sourceId of ['housing-accelerator', 'gruene-unsealing', 'cdu-family-land']) {
      for (const site of sitesFor(sourceId, SEED))
        expect(site.parcels, `${sourceId} → ${site.districtId}`).toBeGreaterThanOrEqual(5)
    }
    // Und die vollen Viertel stehen nie im Angebot — vierzehn der zwanzig haben drei Lücken oder weniger.
    const everOffered = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap(id => sitesFor(id, SEED).map(site => site.districtId)))
    for (const full of ['altstadt', 'bahnhofsviertel', 'lindentor', 'westerfeld', 'kleinfeld'] as const)
      expect(everOffered.has(full), full).toBe(false)
  })

  it('behält trotz der Auswahl eine Spanne von mehr als dem Doppelten', () => {
    expect(BUILDABLE_BY_COST.length).toBeGreaterThanOrEqual(3)
    const cheapest = BUILDABLE_BY_COST[0]!
    const dearest = BUILDABLE_BY_COST[BUILDABLE_BY_COST.length - 1]!
    expect(dearest.cost / cheapest.cost).toBeGreaterThan(2)
  })
})
