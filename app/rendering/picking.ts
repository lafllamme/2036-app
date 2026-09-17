import type { BuildingRecord } from '../core/contracts'
import type { CityBuildings } from './world/structures/buildings'
import type { Agents, PersonAt } from './world/traffic/agents'
import * as THREE from 'three/webgpu'
import { peopleMeshes, personAt } from './world/traffic/agents'

/**
 * Which building the pointer is on, and what that looks like.
 *
 * Hover is drawn by writing the building's own vertex colours rather than by a second pass or an
 * outline, so pointing at one costs a single buffer update and nothing per frame.
 *
 * The two buttons do different things on purpose. The left button pans the map, so a pan that
 * happens to end over a building must not count as clicking it — that is what made the camera dive
 * into a building every time the player dragged across the city. A press that moves further than a
 * few pixels is a drag and selects nothing at all. A left click that stays put opens the building;
 * a right click flies the camera to it.
 */

/** Wohin `intersectBox` seinen Treffer schreibt. Ein Vektor je Probe wäre ein Vektor je Probe. */
const SCRATCH = /* @__PURE__ */ new THREE.Vector3()

/**
 * Die Markierung unter dem Zeiger — heller als Farbe.
 *
 * Die Wandfarbe ist im Shader ein **Faktor** auf die Fassadentextur, kein Anstrich: `#f0c65a` auf ein
 * cremefarbenes Haus gerechnet ergibt ein etwas wärmeres cremefarbenes Haus, und in einer Stadt aus
 * Sand, Putz und Ziegel sieht man das aus dreihundert Metern nicht. Deshalb steht hier ein Wert
 * **über eins**: das Haus wird heller als seine Textur und leuchtet damit aus der Zeile heraus,
 * ohne dass der Shader etwas davon wissen muss.
 *
 * Direkt als lineare Komponenten geschrieben und nicht als Hex — ein Hex-Wert kann nicht über eins
 * liegen, und die Umrechnung aus sRGB würde genau das wegnehmen, worum es hier geht.
 */
const HOVER = /* @__PURE__ */ new THREE.Color(1.7, 1.02, 0.06)
/** How far the pointer may travel between press and release and still count as a click, in pixels. */
const DRAG_SLOP = 5

export interface PickerCallbacks {
  onSelected: (building: BuildingRecord | null) => void
  onFocus: (building: BuildingRecord) => void
  /** Somebody in the street was pointed at. Null clears whoever was.  */
  onPerson: (person: PersonAt | null) => void
}

/** Write one building's colour across the span of vertices it owns inside its tile. */
export function paint(buildings: CityBuildings, mesh: THREE.Mesh, index: number, colour: THREE.Color): void {
  const range = buildings.buildingRanges.get(mesh)?.[index]
  const attribute = mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!range || !attribute)
    return
  for (let vertex = range.start; vertex < range.start + range.count; vertex += 1)
    attribute.setXYZ(vertex, colour.r, colour.g, colour.b)
  attribute.addUpdateRange(range.start * 3, range.count * 3)
  attribute.needsUpdate = true
}

export class BuildingPicker {
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private hovered: { mesh: THREE.Mesh, index: number } | null = null
  /** The figure under the pointer, if the pointer is on one rather than on a building. */
  private person: PersonAt | null = null
  /** Whoever is lit up, and the colour they were before. */
  private marked: { mesh: THREE.InstancedMesh, instance: number, own: THREE.Color } | null = null
  private pressed: { x: number, y: number, button: number } | null = null
  /** Wo der Zeiger zuletzt stand, solange noch kein Bild ihn ausgewertet hat. */
  private wanted: { x: number, y: number } | null = null
  /** Solange jemand zu Fuß unterwegs ist, zeigt der Zeiger auf nichts — er dreht den Kopf. */
  private paused = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly buildings: CityBuildings,
    private readonly agents: Agents,
    private readonly callbacks: PickerCallbacks,
  ) {
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
  }

  /**
   * Das Anfassen der Stadt aus- und wieder einschalten.
   *
   * Im Begehen-Modus ist ein Klick ins Bild kein Zeigen, sondern das Zurückholen der Mauszeigersperre
   * — und ein Klick, der dabei noch das Haus auswählt, auf das die **Kartenkamera** vor dem Einstieg
   * gezeigt hat, öffnet mitten im Laufen eine Gebäudekarte. Dieselbe Sperre spart nebenbei den Strahl
   * je Bild, den zu Fuß ohnehin niemand liest.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused)
      return
    this.paused = paused
    this.pressed = null
    this.wanted = null
    this.person = null
    this.restore()
    this.unmarkPerson()
  }

  find(buildingId: string): BuildingRecord | undefined {
    for (const records of this.buildings.buildingRecords.values()) {
      const result = records.find(building => building.id === buildingId)
      if (result)
        return result
    }
    return undefined
  }

  /**
   * Die Maus bewegt sich — gerechnet wird deswegen noch nichts.
   *
   * Hier stand der teuerste Code des ganzen Spiels, und er lief an der schlechtesten Stelle. Jeder
   * `pointermove` schoss einen Strahl gegen die Stadt, und die Stadt sind 36 zusammengelegte Meshes
   * mit **1,37 Millionen Dreiecken** ohne Beschleunigungsstruktur — also 1,37 Millionen
   * Dreiecksproben je Ereignis. Chrome liefert `pointermove` mit der Abtastrate der Maus, bei einer
   * gewöhnlichen 125-mal und bei einer Spielmaus bis zu 1.000-mal je Sekunde.
   *
   * Beim **Ziehen** ist das am schlimmsten: da kommen die Ereignisse ununterbrochen, und gemeldet
   * waren 24 FPS. Meine eigene Messfahrt hat das nie gesehen, weil sie die Kamera bewegt und nie die
   * Maus — ein Messfehler, der genau diesen Fall strukturell übersprungen hat.
   *
   * Zwei Regeln jetzt. Beim gedrückten Knopf wird **gar nicht** geprüft: wer zieht, schwenkt die
   * Kamera und zeigt auf nichts. Und sonst wird die Position nur gemerkt; der Strahl fliegt einmal
   * je Bild aus `update()`. Ein Zeiger kann sich zwischen zwei Bildern nicht zweimal woandershin
   * bewegen, also war jede Probe darüber hinaus ohnehin verworfen.
   */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.paused || this.pressed) {
      this.wanted = null
      return
    }
    const rect = this.canvas.getBoundingClientRect()
    this.wanted = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    }
  }

  /** Einmal je Bild: der Strahl, den `handlePointerMove` nur vorgemerkt hat. */
  update(): void {
    const wanted = this.wanted
    if (this.paused || !wanted)
      return
    this.wanted = null
    this.pointer.x = wanted.x
    this.pointer.y = wanted.y
    this.raycaster.setFromCamera(this.pointer, this.camera)
    /*
     * People first, and only then buildings.
     *
     * A figure is always standing in front of the building behind it, and a person is a much smaller
     * target than a wall — so whoever is under the pointer wins, and the building is what is left.
     * The people are instanced, so a hit comes back with an instance rather than a triangle.
     */
    const figure = this.raycaster.intersectObjects(peopleMeshes(this.agents), false)[0]
    const found = figure && typeof figure.instanceId === 'number' && figure.object instanceof THREE.InstancedMesh
      ? { mesh: figure.object, instance: figure.instanceId }
      : null

    if (found) {
      this.person = personAt(this.agents, found.mesh, found.instance)
      if (this.person) {
        this.restore()
        this.markPerson(found.mesh, found.instance)
        this.canvas.style.cursor = 'pointer'
        return
      }
    }
    this.person = null
    this.unmarkPerson()

    /*
     * The city is merged into a handful of tiles, so a hit gives back a triangle rather than an
     * instance. The lookup from triangle to building is built once when the tile is; walking twelve
     * thousand ranges per pointer move would be the only expensive thing in the frame.
     */
    const next = this.buildingUnder()
    if (this.hovered && next && this.hovered.mesh === next.mesh && this.hovered.index === next.index)
      return

    this.restore()
    this.hovered = next
    if (next)
      paint(this.buildings, next.mesh, next.index, HOVER)
    this.canvas.style.cursor = next ? 'pointer' : 'grab'
  }

  /**
   * Welches Haus unter dem Zeiger liegt — über Kästen, nicht über Dreiecke.
   *
   * `intersectObjects` gegen die Stadt prüft jedes der 1,37 Millionen Dreiecke, weil die Kacheln
   * keine Beschleunigungsstruktur haben; gemessen hat das **15 ms** gekostet, bei einem Bild von
   * 2,3 ms Median. Jedes Haus hat aber einen Kasten, der beim Bau ohnehin entsteht, und ein Haus ist
   * ein extrudierter Grundriss — es füllt seinen Kasten fast aus. Zwölftausend Kästen statt 1,37
   * Millionen Dreiecke, und der Fehler dabei ist ein Pixel am Dachrand.
   *
   * Die Hüllkugel der Kachel zuerst, damit die Kacheln hinter der Kamera nichts kosten.
   */
  private buildingUnder(): { mesh: THREE.Mesh, index: number } | null {
    let best: { mesh: THREE.Mesh, index: number } | null = null
    let nearest = Number.POSITIVE_INFINITY

    for (const mesh of this.buildings.buildingMeshes) {
      const sphere = mesh.geometry.boundingSphere
      if (sphere && !this.raycaster.ray.intersectsSphere(sphere))
        continue
      const boxes = this.buildings.buildingBoxes.get(mesh)
      if (!boxes)
        continue
      for (let index = 0; index < boxes.length; index += 1) {
        const box = boxes[index]!
        if (!this.raycaster.ray.intersectBox(box, SCRATCH))
          continue
        const away = this.raycaster.ray.origin.distanceToSquared(SCRATCH)
        if (away >= nearest)
          continue
        nearest = away
        best = { mesh, index }
      }
    }
    return best
  }

  private readonly handlePointerLeave = (): void => {
    this.restore()
    this.unmarkPerson()
    this.canvas.style.cursor = 'grab'
  }

  /**
   * Light up whoever is under the pointer.
   *
   * A person is a small, moving target, and without this the only sign that one is under the pointer
   * is the cursor — which is not enough to aim at somebody walking. Their own instance colour is
   * kept so it can be put back: the crowd's colours are written once at build and never again, so
   * there is nothing else that would restore it.
   */
  private markPerson(mesh: THREE.InstancedMesh, instance: number): void {
    if (!mesh.instanceColor)
      return
    if (this.marked?.mesh === mesh && this.marked.instance === instance)
      return
    this.unmarkPerson()
    const own = new THREE.Color()
    mesh.getColorAt(instance, own)
    this.marked = { mesh, instance, own }
    mesh.setColorAt(instance, HOVER)
    mesh.instanceColor.needsUpdate = true
  }

  private unmarkPerson(): void {
    const marked = this.marked
    if (!marked)
      return
    this.marked = null
    marked.mesh.setColorAt(marked.instance, marked.own)
    if (marked.mesh.instanceColor)
      marked.mesh.instanceColor.needsUpdate = true
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.paused)
      return
    this.pressed = { x: event.clientX, y: event.clientY, button: event.button }
    // Was beim Drücken noch vorgemerkt war, ist mit dem Ziehen hinfällig.
    this.wanted = null
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.paused)
      return
    const pressed = this.pressed
    this.pressed = null
    if (!pressed || pressed.button !== event.button)
      return
    // A press that travelled is a pan or an orbit. It is not a click on anything.
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > DRAG_SLOP)
      return

    // Somebody in the street, and nothing else happens: the camera stays where the player put it.
    if (this.person) {
      this.callbacks.onPerson(this.person)
      return
    }

    const hovered = this.hovered
    if (!hovered) {
      this.callbacks.onSelected(null)
      this.callbacks.onPerson(null)
      return
    }
    const building = this.buildings.buildingRecords.get(hovered.mesh)?.[hovered.index] ?? null
    this.callbacks.onSelected(building)
    // Only the right button moves the camera. The left one opens the building and leaves the view be.
    if (building && event.button === 2)
      this.callbacks.onFocus(building)
  }

  /** The right button belongs to the game; the browser's own menu would land on top of the city. */
  private readonly handleContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private restore(): void {
    if (!this.hovered)
      return
    const colour = this.buildings.buildingColors.get(this.hovered.mesh)?.[this.hovered.index]
    if (colour)
      paint(this.buildings, this.hovered.mesh, this.hovered.index, colour)
    this.hovered = null
  }
}
