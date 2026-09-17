import type { Relief } from '../world/relief'
import type { CityBuildings } from './world/structures/buildings'
import * as THREE from 'three/webgpu'
import { pointInside } from './world/structures/buildings'
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
 * Keine Kapsel, kein Starrkörper, keine Bibliothek. Was hier gebraucht wird, sind drei Dinge: auf dem
 * Boden bleiben, nicht durch Wände laufen, und springen können. Das erste ist eine Geländeabfrage,
 * das zweite ein Test gegen die Kästen, die das Anklicken von Gebäuden ohnehin schon führt
 * (`buildingBoxes`), und das dritte eine Zahl, die nach oben zeigt und jedes Bild kleiner wird.
 * Zusammen kosten sie einen Bruchteil eines Frames und sparen eine Physikbibliothek.
 */

/** Augenhöhe über dem Boden. Eine erwachsene Person, keine Kamera auf einem Stativ. */
const EYE = 1.72
/**
 * Gehen und Laufen, in Metern je Sekunde.
 *
 * Erst standen hier 1,7 und 3,1 — echtes Fußgänger- und Jogging-Tempo. Gemessen an einer Stadt von
 * drei Kilometern Kante ist das unbenutzbar: eine Straße hat sechzig Meter, und die abzulaufen
 * dauerte fünfunddreißig Sekunden. Gemeldet als „kann mich kaum bewegen", und das war keine
 * Übertreibung. Spiele laufen schneller als Menschen, weil eine Spielstunde keine echte Stunde ist.
 *
 * Auch 4,6 und 10,5 waren noch zu wenig — „die Geschwindigkeit mit Shift ist immer noch lame“. Der
 * Maßstab ist nicht der Mensch, sondern die Karte: von der Hafenkante zum Rathaus sind es achthundert
 * Meter, und die sollen im Sprint eine knappe Minute dauern und keine anderthalb.
 */
const WALK = 6.4
const RUN = 17
/**
 * Wie schnell die Geschwindigkeit dem Willen folgt.
 *
 * Das ist der Unterschied zwischen „knackig“ und „träge“, und er sitzt nicht im Tempo. Bei 9 lag die
 * Zeitkonstante bei 110 ms: man drückt, und eine Zehntelsekunde später geht es los — gemeldet als
 * „fühlt sich nicht smooth an“, obwohl die Endgeschwindigkeit stimmte. Bei 26 sind es 38 ms, also
 * knapp über vier Bilder bei 120 Hz. Immer noch gedämpft, damit ein Antritt keine Stufe ist, aber
 * unterhalb dessen, was jemand als Verzögerung wahrnimmt.
 */
const EASE = 26
/**
 * Springen: Anfangsgeschwindigkeit nach oben und die Schwerkraft, die einen wiederholt.
 *
 * Hier gibt es sonst keine Physik, und das bleibt auch so — ein Sprung ist eine Zahl, die nach oben
 * zeigt, und eine, die sie jeden Frame kleiner macht. Erst waren es 5,2 m/s gegen 17, also 0,8 m
 * Sprunghöhe: das reicht über einen Bordstein und sonst nirgendwohin. Jetzt 8,4 gegen 21, das sind
 * 1,68 m — auf eine Freitreppe, auf eine Mauer, auf einen Lieferwagen.
 */
const JUMP = 8.4
const GRAVITY = 21
/**
 * Und der zweite Sprung, in der Luft.
 *
 * Kein realistischer Mensch springt zweimal, und genau deshalb ist es hier richtig: Lindenhafen ist
 * auf Augenhöhe eine Stadt aus Kanten — Kaimauern, Freitreppen, Rampen, Böschungen —, und mit einem
 * einzigen Sprung kommt man an keine davon heran. Etwas schwächer als der erste, weil er vom Scheitel
 * aus zählt: zusammen knapp drei Meter.
 */
const AIR_JUMP = 7.6
/** Wie viele Sprünge zwischen zwei Bodenberührungen. Zwei: einer vom Boden, einer aus der Luft. */
const JUMPS = 2
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
  /** Anteil der letzten Frames, in denen die Bewegung an einer Wand abgelehnt wurde, 0 … 1. */
  refused: number
}

export class WalkAbout {
  readonly state: FirstPerson = { active: false, yaw: 0, pitch: 0, x: 0, z: 0, ground: 0, eye: 0, stuck: false, refused: 0 }

  private readonly held = new Set<string>()
  private readonly velocity = new THREE.Vector3()
  /** Geschwindigkeit nach oben, solange jemand in der Luft ist. Null heißt: steht auf dem Boden. */
  private lift = 0
  /** Wie viele Sprünge noch übrig sind, bis der Boden sie zurückgibt. */
  private jumps = JUMPS
  /**
   * Ein Tastendruck, der noch nicht verbraucht ist.
   *
   * Der zweite Sprung braucht eine **Flanke** und keinen gehaltenen Zustand: aus `held.has('Space')`
   * würde in der Luft sofort auch der zweite Sprung gezündet, und wer die Taste festhält, bliebe am
   * Boden hüpfen wie auf einem Trampolin. Gemerkt wird also das Drücken, und das Bild verbraucht es.
   */
  private wantsJump = false
  /** Ziehen mit gedrücktem Knopf, wenn die Zeigersperre nicht greift. Siehe `onPointerDown`. */
  private drag: { id: number, x: number, y: number, travelled: number } | null = null
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
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
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
    // Zur Blickrichtung oben passend: aus (−sin, −cos) folgt atan2(away.x, away.z).
    this.state.yaw = Math.atan2(away.x, away.z)
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
    this.lift = 0
    this.jumps = JUMPS
    this.wantsJump = false
    this.drag = null
    this.held.clear()
    this.aim()
    this.grab()
  }

  /** Zurück auf die Karte, und zwar auf genau den Blick, aus dem man gekommen ist. */
  leave(): THREE.Vector3 | null {
    if (!this.state.active)
      return null
    this.state.active = false
    this.held.clear()
    this.drag = null
    this.wantsJump = false
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

    /*
     * Eine Kamera in three schaut entlang ihrer **negativen** Z-Achse. Nach der Drehung um Y ist
     * ihre Blickrichtung also (−sin, 0, −cos) und nicht (+sin, 0, +cos) — mit dem falschen Vorzeichen
     * lief W rückwärts und S vorwärts, während A und D stimmten. Genau so wurde es gemeldet:
     * „die Controls sind vertauscht".
     */
    const wanted = this.step.set(
      -Math.sin(this.state.yaw) * forward + Math.cos(this.state.yaw) * sideways,
      0,
      -Math.cos(this.state.yaw) * forward - Math.sin(this.state.yaw) * sideways,
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
    const freeX = inside || !this.blocked(nextX, this.camera.position.z, eye)
    const freeZ = inside || !this.blocked(this.camera.position.x, nextZ, eye)
    if (freeX)
      this.camera.position.x = nextX
    if (freeZ)
      this.camera.position.z = nextZ

    /*
     * Wie oft eine Wand die Bewegung ablehnt, über die letzten Sekunden gemittelt.
     *
     * Gemeldet wurde „ich bleibe beim Sprinten immer wieder stehen", und dafür gibt es zwei ganz
     * verschiedene Erklärungen: entweder greift die Kollision auf offener Straße, oder die Eingabe
     * kommt nicht durch. Die beiden sehen gleich aus und haben nichts miteinander zu tun. Diese Zahl
     * trennt sie: steht sie bei null, während man steht, liegt es nicht an den Wänden.
     */
    const refusedNow = wanted.lengthSq() > 0 && (!freeX || !freeZ) ? 1 : 0
    this.state.refused += (refusedNow - this.state.refused) * Math.min(1, delta * 2)

    /*
     * Und nie unter die Wasserlinie.
     *
     * Das Gelände unter dem Hafenbecken liegt mehrere Meter unter dem Meeresspiegel. Wer dort steht,
     * hat die Wasserfläche **über** sich — und schaut von unten gegen sie und gegen das Ufer
     * dahinter. Das ist der zweite Weg, auf dem man unter die Welt gerät, und er hat mit Gebäuden
     * nichts zu tun.
     */
    const ground = Math.max(this.relief.height(this.camera.position.x, this.camera.position.z), WATER_LEVEL)

    /*
     * Und der Sprung. Steigen, fallen, aufkommen — und einmal in der Luft noch einmal.
     *
     * Der Boden bleibt die Führung: solange niemand springt, klebt das Auge an `ground + EYE`, und
     * das ist auch der Grund, warum es keine Sprungerkennung braucht. Wer aufkommt, ist wieder auf
     * dem Boden, und ein Hang trägt einen dabei von selbst mit — dieselbe Bodenberührung gibt auch
     * die beiden Sprünge zurück.
     */
    const floor = ground + EYE
    const standing = this.lift === 0 && this.camera.position.y <= floor + 0.001
    if (standing) {
      this.camera.position.y = floor
      this.jumps = JUMPS
    }
    if (this.wantsJump && this.jumps > 0) {
      this.lift = standing ? JUMP : AIR_JUMP
      this.jumps -= 1
    }
    // Verbraucht oder nicht — ein Druck gilt für ein Bild. Sonst springt man eine Sekunde später.
    this.wantsJump = false
    if (this.lift !== 0 || this.camera.position.y > floor) {
      this.lift -= GRAVITY * delta
      this.camera.position.y += this.lift * delta
      if (this.camera.position.y <= floor) {
        this.camera.position.y = floor
        this.lift = 0
      }
    }

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
      const records = this.buildings.buildingRecords.get(mesh)
      if (!boxes || !records)
        continue
      for (let index = 0; index < boxes.length; index += 1) {
        const box = boxes[index]!
        /*
         * Der Kasten ist nur die Vorauswahl, nicht die Antwort.
         *
         * Er ist achsenparallel, und ein schräg zur Straße stehendes Haus hat einen Kasten, der die
         * halbe Fahrbahn mit abdeckt. Als Hindernis genommen stand man auf offener Straße vor einer
         * Wand, die es nicht gibt — gemeldet als „kann mich kaum bewegen". Der Kasten sortiert also
         * nur die Häuser aus, die weit weg sind, und geprüft wird gegen den **echten Grundriss**,
         * den derselbe Datensatz mitbringt und aus dem die Fassade gebaut wurde.
         */
        if (x < box.min.x - SHOULDER || x > box.max.x + SHOULDER
          || z < box.min.z - SHOULDER || z > box.max.z + SHOULDER
          || eye < box.min.y || eye > box.max.y) {
          continue
        }
        const record = records[index]
        if (record && pointInside(x, z, record.footprint))
          return true
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
    if (event.code === 'Space' && !event.repeat)
      this.wantsJump = true
    // Wer läuft, scrollt nicht die Seite weg.
    if (event.code.startsWith('Arrow') || event.code === 'Space')
      event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code)
  }

  /**
   * Umsehen — mit gesperrtem Zeiger, und wenn der nicht zu haben ist, mit gedrücktem Knopf.
   *
   * Die Zeigersperre ist der eigentliche Weg, aber sie ist nichts, worauf man bauen kann: der Browser
   * gibt sie bei Escape von sich aus zurück, verweigert sie eine Sekunde lang danach, und
   * `requestPointerLock` aus einem Klick auf einen **Knopf der Oberfläche** heraus geht je nach
   * Browser leer aus. Dann steht man im Begehen-Modus und kann sich nicht umsehen — genau so
   * gemeldet: „Kamera schwenken mit Cursor klappt in dem Mode auch nicht“.
   *
   * Also beides, und beide lesen dasselbe: `movementX` gibt es an jedem Mausereignis und nicht nur
   * unter der Sperre. Gesperrt bewegt schon das Schieben der Maus den Kopf; sonst tut es der
   * gedrückte Knopf, so wie auf der Karte auch. Und ein Klick, der nicht gezogen hat, holt die
   * Sperre zurück.
   */
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.state.active || event.button !== 0)
      return
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, travelled: 0 }
    this.canvas.setPointerCapture?.(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.state.active)
      return
    const locked = document.pointerLockElement === this.canvas
    const drag = this.drag?.id === event.pointerId ? this.drag : null
    if (!locked && !drag)
      return
    if (drag) {
      drag.travelled += Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y)
      drag.x = event.clientX
      drag.y = event.clientY
    }
    this.state.yaw -= event.movementX * LOOK
    this.state.pitch = THREE.MathUtils.clamp(this.state.pitch - event.movementY * LOOK, -PITCH_LIMIT, PITCH_LIMIT)
    this.aim()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag
    if (!drag || drag.id !== event.pointerId)
      return
    this.drag = null
    this.canvas.releasePointerCapture?.(event.pointerId)
    // Ein Klick, der stehen geblieben ist, war kein Schwenk, sondern die Bitte um die Sperre.
    if (this.state.active && drag.travelled <= 4)
      this.grab()
  }

  /**
   * Die Zeigersperre holen, ohne daran zu scheitern.
   *
   * Der Aufruf wirft, wenn der Browser gerade nicht will — kurz nach einem Escape etwa —, und das
   * darf hier nichts heißen: wer sie nicht bekommt, sieht sich eben mit gedrücktem Knopf um. Eine
   * abgewiesene Sperre ist kein Fehler, sondern der andere Weg.
   *
   * Dass Escape die Sperre löst, beendet dabei **nicht** das Begehen: man will die Maus zurück, um
   * auf einen Knopf zu drücken, und nicht auf die Karte geschleudert werden. Das Verlassen macht der
   * Knopf.
   */
  private grab(): void {
    try {
      const lock = this.canvas.requestPointerLock?.() as unknown
      if (lock instanceof Promise)
        lock.catch(() => {})
    }
    catch {
      // Kein Umsehen ohne Knopf, und das ist in Ordnung.
    }
  }
}
