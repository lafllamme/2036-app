import type { BuildingRecord } from '../core/contracts'
import type { Agents, PersonAt } from './world/agents'
import type { CityBuildings } from './world/buildings'
import * as THREE from 'three/webgpu'
import { peopleMeshes, personAt } from './world/agents'

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

const HOVER = /* @__PURE__ */ new THREE.Color('#f0c65a')
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

  find(buildingId: string): BuildingRecord | undefined {
    for (const records of this.buildings.buildingRecords.values()) {
      const result = records.find(building => building.id === buildingId)
      if (result)
        return result
    }
    return undefined
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
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
    const hit = this.raycaster.intersectObjects(this.buildings.buildingMeshes, false)[0]
    const owners = hit?.object instanceof THREE.Mesh ? this.buildings.buildingOfTriangle.get(hit.object) : undefined
    const next = hit?.object instanceof THREE.Mesh && owners && typeof hit.faceIndex === 'number'
      ? { mesh: hit.object, index: owners[hit.faceIndex] ?? 0 }
      : null
    if (this.hovered && next && this.hovered.mesh === next.mesh && this.hovered.index === next.index)
      return

    this.restore()
    this.hovered = next
    if (next)
      paint(this.buildings, next.mesh, next.index, HOVER)
    this.canvas.style.cursor = next ? 'pointer' : 'grab'
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
    this.pressed = { x: event.clientX, y: event.clientY, button: event.button }
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
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
