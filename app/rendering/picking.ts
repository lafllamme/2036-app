import type { BuildingRecord } from '../core/contracts'
import type { CityBuildings } from './world/buildings'
import * as THREE from 'three/webgpu'

/**
 * Which building the pointer is on, and what that looks like.
 *
 * Hover is drawn by writing the instance's colour rather than by a second pass or an outline, so
 * pointing at a building costs one buffer update and nothing per frame.
 */

const HOVER = /* @__PURE__ */ new THREE.Color('#f0c65a')

export interface PickerCallbacks {
  onSelected: (building: BuildingRecord | null) => void
  onFocus: (building: BuildingRecord) => void
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly buildings: CityBuildings,
    private readonly callbacks: PickerCallbacks,
  ) {
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.addEventListener('click', this.handleClick)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.removeEventListener('click', this.handleClick)
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
    this.canvas.style.cursor = 'grab'
  }

  private readonly handleClick = (): void => {
    const hovered = this.hovered
    if (!hovered) {
      this.callbacks.onSelected(null)
      return
    }
    const building = this.buildings.buildingRecords.get(hovered.mesh)?.[hovered.index] ?? null
    this.callbacks.onSelected(building)
    if (building)
      this.callbacks.onFocus(building)
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
