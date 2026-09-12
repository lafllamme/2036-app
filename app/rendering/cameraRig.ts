import type { BuildingRecord } from '../core/contracts'
import { MapControls } from 'three/addons/controls/MapControls.js'
import * as THREE from 'three/webgpu'

/**
 * The camera and how it is moved: the player's own panning, and the flight it takes when a building
 * is selected.
 *
 * It also answers the one question the rest of the renderer keeps asking — how far the camera is
 * from what it is looking at — which is what every distance gate in the scene is keyed on.
 */

/** Seconds a focus flight takes. Long enough to read as travel, short enough not to be waited out. */
const FOCUS_DURATION = 1.15

interface FocusTween {
  started: number
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromCamera: THREE.Vector3
  toCamera: THREE.Vector3
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: MapControls
  private tween: FocusTween | null = null

  constructor(canvas: HTMLCanvasElement) {
    /*
     * The far plane reaches past the land now that the land has hills on it, and the near plane was
     * raised with it: the depth buffer's precision is set by their ratio, and at 2 : 8 000 anything
     * two kilometres out was resolved in steps of a quarter of a metre — which is how two ground
     * planes five centimetres apart came to flicker against each other.
     */
    this.camera = new THREE.PerspectiveCamera(46, 1, 6, 16_000)
    /*
     * Low enough that the horizon sits inside the frame. The opening shot used to look almost
     * straight down, which put the entire sky — and with it the sun, the moon and every hour of the
     * day — outside the picture: the cycle was running the whole time and could not be seen.
     */
    this.camera.position.set(1_720, 1_030, 1_800)

    this.controls = new MapControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.screenSpacePanning = false
    this.controls.minDistance = 34
    this.controls.maxDistance = 3_800
    this.controls.maxPolarAngle = Math.PI * 0.475
    this.controls.minPolarAngle = Math.PI * 0.09
    this.controls.target.set(0, 0, 0)
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    this.controls.touches.ONE = THREE.TOUCH.PAN
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE
  }

  /** How far the camera stands from what it is looking at. Every distance gate reads this. */
  get distance(): number {
    return this.camera.position.distanceTo(this.controls.target)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  focusOn(building: BuildingRecord): void {
    const target = new THREE.Vector3(building.x, building.height * 0.35, building.z)
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    const distance = Math.max(95, building.height * 3.5)
    this.tween = {
      started: performance.now(),
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      fromCamera: this.camera.position.clone(),
      toCamera: target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, distance * 0.32, 0)),
    }
  }

  update(now: number): void {
    if (this.tween) {
      const raw = Math.min(1, (now - this.tween.started) / (FOCUS_DURATION * 1_000))
      const eased = 1 - (1 - raw) ** 3
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased)
      this.camera.position.lerpVectors(this.tween.fromCamera, this.tween.toCamera, eased)
      if (raw >= 1)
        this.tween = null
    }
    this.controls.update()
  }

  dispose(): void {
    this.controls.dispose()
  }
}
