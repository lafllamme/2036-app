import type { Relief } from '../world/relief'
import type { CityBuildings } from './world/structures/buildings'
import * as THREE from 'three/webgpu'
import { WATER_LEVEL } from './world/terrain/water'

/**
 * Durch Lindenhafen laufen, statt darüber zu schweben.
 *
 * Die Kamera des Spiels ist eine Karte: sie schaut aus der Höhe auf eine Stadt, und alles, was
 * gebaut wurde — Türen, Treppen, Markisen, Ladenschilder, Grasbüschel —, ist auf dieser Entfernung
 * bestenfalls ein Pixel. Erst auf Augenhöhe wird aus dem Modell ein **Ort**: man steht vor einer
 * Haustür, die Traufe ist über einem, und die Straße hat eine Länge, die man gehen muss.
 *
 * ## Wie das an der Kartenkamera vorbeikommt
 *
 * `MapControls` besitzt die Kamera, und zwei Steuerungen auf derselben Kamera streiten sich jeden
 * Frame. Also wird umgeschaltet statt ergänzt: beim Betreten übernimmt dieser Regler die Kamera,
 * `MapControls` wird abgeschaltet, und beim Verlassen bekommt die Karte ihren Blick zurück — genau
 * den, den sie vorher hatte. Wer aus dem Begehen herauskommt, steht wieder da, wo er hineingegangen
 * ist; alles andere wäre ein Sprung, den niemand gewollt hat.
 *
 * ## Und warum es keine Physik gibt
 *
 * Kein Schwerkraftmodell, keine Kapsel, kein Sprung. Ein Mensch auf einem Gehweg fällt nicht, und
 * was hier gebraucht wird, sind zwei Dinge: auf dem Boden bleiben und nicht durch Wände laufen. Das
 * erste ist eine Geländeabfrage, das zweite ein Test gegen die Kästen, die das Anklicken von
 * Gebäuden ohnehin schon führt (`buildingBoxes`). Beides kostet einen Bruchteil eines Frames und
 * spart eine Physikbibliothek.
 */

/** Augenhöhe über dem Boden. Eine erwachsene Person, keine Kamera auf einem Stativ. */
const EYE = 1.72
/** Gehen und Laufen, in Metern je Sekunde. Sechs km/h und elf km/h. */
const WALK = 1.7
const RUN = 3.1
/** Wie schnell die Geschwindigkeit dem Willen folgt. Kein Eis, aber auch kein Schalter. */
const EASE = 9
/** Wie weit der Blick nach oben und unten darf. Kein Salto. */
const PITCH_LIMIT = Math.PI / 2 - 0.05
/** Wie empfindlich die Maus ist, in Radiant je Pixel. */
const LOOK = 0.0022
/**
 * Wie nah man an eine Wand herankommt.
 *
 * Eine Schulterbreite. Ohne das steht die Kamera *in* der Fassade, und weil sie innen liegt, sieht
 * man die Rückseiten der Wände — also von innen in ein Haus hinein, das keine Innenräume hat.
 */
const SHOULDER = 0.55

export interface FirstPerson {
  active: boolean
  /** Wohin geschaut wird. Getrennt gehalten, weil die Kamera beim Verlassen zurückgegeben wird. */
  yaw: number
  pitch: number
  /**
   * Wo man steht, wie hoch der Boden dort ist, und ob man in etwas steckt.
   *
   * Sichtbar in der Kamerahilfe, solange man zu Fuß unterwegs ist. Das ist kein Luxus: an dieser
   * Stelle sind zwei Reparaturen hintereinander ins Leere gegangen, weil „es sieht komisch aus"
   * und „ich stecke fest" für ein halbes Dutzend verschiedener Ursachen gleich aussehen. Drei
   * Zahlen im Bild unterscheiden sie in einer Sekunde.
   */
  x: number
  z: number
  ground: number
  eye: number
  stuck: boolean
}

export class WalkAbout {
  readonly state: FirstPerson = { active: false, yaw: 0, pitch: 0, x: 0, z: 0, ground: 0, eye: 0, stuck: false }

  private readonly held = new Set<string>()
  private readonly velocity = new THREE.Vector3()
  private readonly step = new THREE.Vector3()
  private readonly probe = new THREE.Vector3()
  /** Der Blick der Karte, während jemand zu Fuß unterwegs ist. */
  private parked: { position: THREE.Vector3, target: THREE.Vector3 } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly relief: Relief,
    private readonly buildings: CityBuildings,
  ) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.canvas.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onLockChange)
  }

  /**
   * Hinein und wieder hinaus.
   *
   * Der Einstieg setzt die Person dorthin, wohin die Karte gerade schaut — nicht dorthin, wo die
   * Kamera steht. Das ist der Unterschied zwischen „ich stehe da, wo ich hingesehen habe" und „ich
   * stehe achthundert Meter schräg über der Stadt in der Luft".
   */
  enter(target: THREE.Vector3): void {
    if (this.state.active)
      return
    this.parked = { position: this.camera.position.clone(), target: target.clone() }

    // Die Blickrichtung beim Einstieg ist die, die die Karte gerade hatte.
    const away = this.camera.position.clone().sub(target)
    this.state.yaw = Math.atan2(-away.x, -away.z)
    this.state.pitch = 0
    this.state.active = true

    /*
     * Und zwar auf einen Platz, auf dem man **stehen** kann.
     *
     * Der Blickpunkt der Karte liegt oft mitten auf einem Haus — man schaut ja auf die Stadt, nicht
     * auf die Lücken darin. Dort abgesetzt steckte man in der Fassade: die Wände sind von innen
     * weggeschnitten, also sah man das Gelände von unten, und weil ringsum alles blockiert war, ging
     * es auch nicht mehr weiter. Gemeldet als „bin stuck und sieht so komisch aus", und genau so
     * sah es aus.
     */
    const free = this.freeSpot(target.x, target.z)
    this.camera.position.set(free.x, Math.max(this.relief.height(free.x, free.z), WATER_LEVEL) + EYE, free.z)
    this.velocity.set(0, 0, 0)
    this.held.clear()
    this.aim()
    void this.canvas.requestPointerLock?.()
  }

  /** Zurück auf die Karte, und zwar auf genau den Blick, aus dem man gekommen ist. */
  leave(): THREE.Vector3 | null {
    if (!this.state.active)
      return null
    this.state.active = false
    this.held.clear()
    if (document.pointerLockElement === this.canvas)
      document.exitPointerLock()
    const parked = this.parked
    this.parked = null
    if (!parked)
      return null
    this.camera.position.copy(parked.position)
    return parked.target
  }

  /** Einen Schritt gehen. Läuft nur, wenn jemand zu Fuß unterwegs ist. */
  update(delta: number): void {
    if (!this.state.active)
      return

    /*
     * Die Richtung aus den Tasten, in der Ebene. Kein Y: wer nach oben schaut und vorwärts geht,
     * geht vorwärts und nicht in den Himmel — das ist der Unterschied zwischen Gehen und Fliegen.
     */
    const forward = (this.held.has('KeyW') || this.held.has('ArrowUp') ? 1 : 0)
      - (this.held.has('KeyS') || this.held.has('ArrowDown') ? 1 : 0)
    const sideways = (this.held.has('KeyD') || this.held.has('ArrowRight') ? 1 : 0)
      - (this.held.has('KeyA') || this.held.has('ArrowLeft') ? 1 : 0)

    const wanted = this.step.set(
      Math.sin(this.state.yaw) * forward + Math.cos(this.state.yaw) * sideways,
      0,
      Math.cos(this.state.yaw) * forward - Math.sin(this.state.yaw) * sideways,
    )
    if (wanted.lengthSq() > 0)
      wanted.normalize().multiplyScalar(this.held.has('ShiftLeft') || this.held.has('ShiftRight') ? RUN : WALK)

    // Gedämpft statt geschaltet, sonst ruckt jeder Antritt und jeder Halt.
    this.velocity.lerp(wanted, Math.min(1, delta * EASE))

    const nextX = this.camera.position.x + this.velocity.x * delta
    const nextZ = this.camera.position.z + this.velocity.z * delta
    /*
     * Wände halten nur auf, solange man **draußen** steht.
     *
     * Wer aus irgendeinem Grund doch einmal in einer Fassade landet — ein Haus, das die Stadt
     * nachträglich baut, ein Kasten, der nicht ganz passt —, muss wieder herauslaufen können. Eine
     * Kollision, die auch von innen greift, ist kein Schutz, sondern eine Falle: sie hält genau den
     * fest, dem sie helfen sollte.
     */
    const eye = this.camera.position.y
    const inside = this.blocked(this.camera.position.x, this.camera.position.z, eye)
    /*
     * Achsenweise geprüft, nicht als ein Schritt. Wer schräg gegen eine Wand läuft, soll an ihr
     * entlanggleiten und nicht kleben — und das ist der ganze Unterschied zwischen den beiden.
     */
    if (inside || !this.blocked(nextX, this.camera.position.z, eye))
      this.camera.position.x = nextX
    if (inside || !this.blocked(this.camera.position.x, nextZ, eye))
      this.camera.position.z = nextZ

    /*
     * Und nie unter die Wasserlinie.
     *
     * Das Gelände unter dem Hafenbecken liegt mehrere Meter unter dem Meeresspiegel. Wer dort steht,
     * hat die Wasserfläche **über** sich — und schaut von unten gegen sie und gegen das Ufer
     * dahinter. Das ist der zweite Weg, auf dem man unter die Welt gerät, und er hat mit Gebäuden
     * nichts zu tun.
     */
    const ground = Math.max(this.relief.height(this.camera.position.x, this.camera.position.z), WATER_LEVEL)
    this.camera.position.y = ground + EYE

    this.state.x = this.camera.position.x
    this.state.z = this.camera.position.z
    this.state.ground = ground
    this.state.eye = this.camera.position.y
    this.state.stuck = inside
    this.aim()
  }

  /**
   * Der nächste Platz, auf dem man stehen kann.
   *
   * Spirale nach außen in Zwei-Meter-Ringen. Vierzig Meter reichen, um aus jedem Haus in Lindenhafen
   * auf die Straße zu kommen; findet sie nichts, wird der gewünschte Punkt genommen, und die Regel
   * „von innen hält keine Wand" bringt einen dann selbst hinaus.
   */
  private freeSpot(x: number, z: number): { x: number, z: number } {
    /*
     * Die Augenhöhe wird **je Punkt** aus dem Gelände gerechnet, nicht von der Kamera abgelesen.
     *
     * Genau daran ist der erste Versuch gescheitert, und zwar lautlos. `blocked` nahm die Höhe aus
     * `camera.position.y` — und die stand beim Einsteigen noch achthundert Meter über der Stadt. In
     * dieser Höhe liegt kein einziger Gebäudekasten, also war **nichts** blockiert, die Suche gab
     * sofort den Ausgangspunkt zurück, und man landete wieder in der Fassade. Eine Prüfung, die die
     * falsche Höhe fragt, antwortet nicht falsch, sondern immer „frei".
     */
    const at = (spotX: number, spotZ: number): boolean =>
      this.blocked(spotX, spotZ, Math.max(this.relief.height(spotX, spotZ), WATER_LEVEL) + EYE)

    if (!at(x, z))
      return { x, z }
    for (let reach = 2; reach <= 40; reach += 2) {
      for (let step = 0; step < 12; step += 1) {
        const bearing = (step / 12) * Math.PI * 2
        const spotX = x + Math.cos(bearing) * reach
        const spotZ = z + Math.sin(bearing) * reach
        if (!at(spotX, spotZ))
          return { x: spotX, z: spotZ }
      }
    }
    return { x, z }
  }

  /**
   * Steht dort eine Wand?
   *
   * Über dieselben Kästen, die das Anklicken eines Hauses benutzt — je Haus einer, beim Bauen
   * angelegt. Geprüft werden nur die Kacheln, deren Hüllkugel den Punkt überhaupt umfasst; das sind
   * auf der Straße eine oder zwei von sechsunddreißig.
   */
  private blocked(x: number, z: number, eye: number): boolean {
    for (const mesh of this.buildings.buildingMeshes) {
      const sphere = mesh.geometry.boundingSphere
      if (sphere && this.probe.set(x, sphere.center.y, z).distanceTo(sphere.center) > sphere.radius + SHOULDER)
        continue
      const boxes = this.buildings.buildingBoxes.get(mesh)
      if (!boxes)
        continue
      for (const box of boxes) {
        if (x > box.min.x - SHOULDER && x < box.max.x + SHOULDER
          && z > box.min.z - SHOULDER && z < box.max.z + SHOULDER
          && eye > box.min.y && eye < box.max.y) {
          return true
        }
      }
    }
    return false
  }

  private aim(): void {
    this.camera.rotation.set(0, 0, 0)
    this.camera.rotateY(this.state.yaw)
    this.camera.rotateX(this.state.pitch)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.state.active)
      return
    this.held.add(event.code)
    // Wer läuft, scrollt nicht die Seite weg.
    if (event.code.startsWith('Arrow') || event.code === 'Space')
      event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.state.active || document.pointerLockElement !== this.canvas)
      return
    this.state.yaw -= event.movementX * LOOK
    this.state.pitch = THREE.MathUtils.clamp(this.state.pitch - event.movementY * LOOK, -PITCH_LIMIT, PITCH_LIMIT)
    this.aim()
  }

  /**
   * Wer die Maus freigibt, hört nicht auf zu gehen.
   *
   * Escape gibt den Zeiger frei — das nimmt der Browser einem ab und ist nicht verhandelbar. Daraus
   * aber „Modus verlassen" zu machen, wäre falsch: man will die Maus zurück, um auf einen Knopf zu
   * drücken, und nicht zurück auf die Karte geschleudert werden. Das Verlassen macht der Knopf.
   */
  private readonly onLockChange = (): void => {}
}
