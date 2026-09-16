import type { BuildingRecord } from '../core/contracts'
import type { Relief } from '../world/relief'
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
/**
 * Where the opening shot stands, and what it looks at. The overview button returns to exactly this.
 *
 * Stand auf 1.030 Höhe bei 2.490 Grundabstand, also **22,5° Neigung** — und damit war Lindenhafen
 * ein Teppich: die Gebäude lagen flach, die obere Bildhälfte trug nichts, und wo die Stadt den
 * Himmel hätte treffen sollen, löste sie sich im Dunst auf. Bei 700 auf 2.320 sind es **16,8°**: die
 * ganze Flussschleife und beide Ufer bleiben im Bild, die Häuser bekommen Höhe, und am oberen Rand
 * steht endlich eine Geländekante gegen den Himmel. Verglichen wurden vier Stände nebeneinander.
 */
const OVERVIEW_POSITION = /* @__PURE__ */ new THREE.Vector3(1_600, 700, 1_680)
const OVERVIEW_TARGET = /* @__PURE__ */ new THREE.Vector3(0, 0, 0)
/** How far above the land the camera is kept, in metres. About the height of a first-floor window. */
const GROUND_CLEARANCE = 6
/** How high above the ground the camera looks when it is sent to a place, and how far back. */
const PLACE_EYE = 5
const PLACE_DISTANCE = 130

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

  constructor(canvas: HTMLCanvasElement, private readonly relief: Relief) {
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
    this.camera.position.copy(OVERVIEW_POSITION)

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

  /**
   * Fly back out to the shot the campaign opens on.
   *
   * There is no other way back. Panning is unbounded by design — the player can follow a street to
   * the edge of the extract — and finding the middle again by hand after ten minutes of that is a
   * chore, which is what the pause button's place in the bar is now spent on.
   */
  frameCity(): void {
    this.tween = {
      started: performance.now(),
      fromTarget: this.controls.target.clone(),
      toTarget: OVERVIEW_TARGET.clone(),
      fromCamera: this.camera.position.clone(),
      toCamera: OVERVIEW_POSITION.clone(),
    }
  }

  /**
   * Fly to a point on the ground.
   *
   * The same move as flying to a building, without one: an incident happens at a junction, not at
   * an address, and a player told "Einbruch · Hafenviertel" should not have to go looking for it.
   */
  focusOnPlace(x: number, z: number): void {
    this.flyTo(new THREE.Vector3(x, this.relief.height(x, z) + PLACE_EYE, z), PLACE_DISTANCE)
  }

  focusOn(building: BuildingRecord): void {
    /*
     * On the ground the building stands on. Reading the height off the record alone put the camera's
     * target metres underground wherever the city is on a rise, and flying to a building on the
     * higher bank ended with the camera inside the hill looking at the underside of the city.
     */
    const ground = this.relief.height(building.x, building.z)
    const target = new THREE.Vector3(building.x, ground + building.height * 0.35, building.z)
    this.flyTo(target, Math.max(95, building.height * 3.5))
  }

  /** One tween, shared: keep the bearing the player already has and close to `distance`. */
  private flyTo(target: THREE.Vector3, distance: number): void {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    this.tween = {
      started: performance.now(),
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      fromCamera: this.camera.position.clone(),
      toCamera: target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, distance * 0.32, 0)),
    }
  }

  /**
   * Die Kamera hart an einen Punkt stellen, ohne Tween und ohne Dämpfung.
   *
   * Nur für den Messstand (`?bench`): eine Messfahrt muss jedes Mal denselben Weg nehmen, sonst
   * vergleicht man zwei verschiedene Bilder miteinander. Steht hier und nicht im Renderer, weil die
   * Kamera hier wohnt — und weil ein laufender Anflug sonst mitten in die Messfahrt hineinzöge.
   */
  placeFor(targetX: number, targetZ: number, bearing: number, reach: number, height: number): void {
    this.tween = null
    this.controls.target.set(targetX, 0, targetZ)
    this.camera.position.set(targetX + Math.cos(bearing) * reach, height, targetZ + Math.sin(bearing) * reach)
    this.controls.update()
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
    this.keepAboveGround()
  }

  /**
   * Never let the camera under the land.
   *
   * Panning is unbounded and the land has hills on it now, so a low camera pushed toward a rise went
   * straight through it — and from under the ground the city is drawn from below, which reads as the
   * whole world having flipped over. A floor a few metres above the surface costs one sample of the
   * relief per frame and makes the state unreachable.
   */
  private keepAboveGround(): void {
    const floor = this.relief.height(this.camera.position.x, this.camera.position.z) + GROUND_CLEARANCE
    if (this.camera.position.y < floor) {
      this.controls.target.y += floor - this.camera.position.y
      this.camera.position.y = floor
    }
  }

  dispose(): void {
    this.controls.dispose()
  }
}
