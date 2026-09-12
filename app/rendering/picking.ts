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

export class BuildingPicker {
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private hovered: { mesh: THREE.InstancedMesh, index: number } | null = null

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
    const hit = this.raycaster.intersectObjects(this.buildings.buildingMeshes, false)[0]
    const next = hit?.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined
      ? { mesh: hit.object, index: hit.instanceId }
      : null
    if (this.hovered && next && this.hovered.mesh === next.mesh && this.hovered.index === next.index)
      return

    this.restore()
    this.hovered = next
    if (next) {
      next.mesh.setColorAt(next.index, HOVER)
      if (next.mesh.instanceColor)
        next.mesh.instanceColor.needsUpdate = true
    }
    this.canvas.style.cursor = next ? 'pointer' : 'grab'
  }

  private readonly handlePointerLeave = (): void => {
    this.restore()
    this.canvas.style.cursor = 'grab'
  }

  private readonly handleClick = (): void => {
    if (!this.hovered) {
      this.callbacks.onSelected(null)
      return
    }
    const records = this.buildings.buildingRecords.get(this.hovered.mesh)
    const building = records?.[this.hovered.index] ?? null
    this.callbacks.onSelected(building)
    if (building)
      this.callbacks.onFocus(building)
  }

  private restore(): void {
    if (!this.hovered)
      return
    const colour = this.buildings.buildingColors.get(this.hovered.mesh)?.[this.hovered.index]
    if (colour) {
      this.hovered.mesh.setColorAt(this.hovered.index, colour)
      if (this.hovered.mesh.instanceColor)
        this.hovered.mesh.instanceColor.needsUpdate = true
    }
    this.hovered = null
  }
}
