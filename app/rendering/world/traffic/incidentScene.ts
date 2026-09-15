import type { Relief } from '../../../world/relief'
import type { CityModel, CityModels } from '../../cityModels'
import type { Incident } from './dispatch'
import type { Fires } from './fire'
import type { Service } from './incidents'
import * as THREE from 'three/webgpu'
import { CREW_IDS } from '../../cityModels'
import { AXIS_Y, FLAT, WHITE } from '../../shared'
import { carProxyGeometry, carProxyMaterial } from '../streets/carProxy'
import { addFires, updateFires } from './fire'
import { CALL_LIMIT_MAX, SHAPE } from './incidents'

/**
 * What an incident looks like from the street.
 *
 * Until now a call was audible and nothing more: a blue light drove somewhere, stood still for half
 * a minute and drove off again. From a thousand metres up that is a moving dot. The point of giving
 * the city events at all is that the player can look down and see what their decisions did, so an
 * open call has to be a place you can recognise — a cordon across the road, a crowd that gathers
 * around it while the crew is there, and a marker on the ground in the colour of whoever was called.
 *
 * The budget is fixed rather than proportional: six scenes, each with a ring of barriers and a small
 * crowd, is four instanced draws for the whole city no matter how bad a month it is having. Nothing
 * here is animated per frame except the marker's pulse and the crowd's arrival, both of which are
 * one matrix write per instance and only while the camera is close enough to make them out.
 */

/** As many scenes as there can be open calls. Anything past that is not a city, it is a film. */
const SCENE_LIMIT = CALL_LIMIT_MAX
const BARRIER_HEIGHT = 1.1
const PERSON_HEIGHT = 1.75
const CROWD_RADIUS = 12
/** The most of anything one scene may put on the street, which is what fixes the instance budget. */
const MAX_CORDON = 8
const MAX_CROWD = 6
const MAX_WRECKS = 2
/** How many of the crew are out of the vehicle and standing at the scene. */
const MAX_CREW = 3
const CREW_RADIUS = 4.6

/**
 * What a crew wears, over the uniform the model already has.
 *
 * The first version tinted an ordinary civilian navy and called it police, which is what you do when
 * you think the kit has no uniforms in it. It has six: reading each character's body UVs against the
 * shared atlas shows `character-female-a` head to foot in blues and four more in dark greys and
 * dark-with-white. Those are the crews now, and this only finishes the job — a touch of blue on the
 * police, and high-visibility orange on a fire crew, which no character in the kit is wearing.
 *
 * Above one on purpose where it has to be: an instance colour multiplies, so anything below one only
 * darkens, and a fire crew has to be brighter than the street rather than dimmer.
 */
const CREW_COLOUR = {
  police: /* @__PURE__ */ new THREE.Color(0.85, 0.92, 1.15),
  ambulance: /* @__PURE__ */ new THREE.Color(1.1, 1, 0.95),
  fire: /* @__PURE__ */ new THREE.Color(1.5, 0.78, 0.3),
} as const

/** One instanced mesh per service, each built from the models that service actually wears. */
function crewMeshes(scene: THREE.Scene, models: CityModels): IncidentScenes['crews'] {
  const meshes: IncidentScenes['crews'] = {}
  for (const [service, ids] of Object.entries(CREW_IDS) as [Exclude<Service, 'none'>, readonly string[]][]) {
    const model = models.crew.find(entry => ids.includes(entry.id)) ?? models.people[0]
    if (model)
      meshes[service] = addModel(scene, model, models.peopleMaterial, SCENE_LIMIT * MAX_CREW)
  }
  return meshes
}

/** A crowd does not appear the moment something happens; it takes a few seconds to gather. */
const GATHER_DELAY = 6
const GATHER_SPREAD = 9
/**
 * The marker on the ground: a ring, not a glow, and how fast it breathes.
 *
 * Three tries to get here. A radial glow at full strength was a floodlight that washed out the very
 * thing it was pointing at — crew, barriers and crowd all vanished into a white disc. Dimming it and
 * blending it normally made it worse the other way: a colour darker than the tarmac painted a grey
 * crater at midday. Dimming it and adding it gave a grey dome, because a soft blob has no edge, and
 * a shape without an edge is not read as a shape at all.
 *
 * A ring has an edge. It sits just outside the barriers, so it ties them together into one place
 * rather than decorating the middle of it, and it never covers anything worth looking at.
 */
const MARKER_SIZE = 23
const MARKER_LIFT = 0.6
const MARKER_OPACITY = 0.85
const PULSE_RATE = 0.8

/** How close the camera has to be for each part to be worth drawing at all. */
const CORDON_RANGE = 1_400
const CROWD_RANGE = 800

/**
 * What happened, in colour. The same four values the interface uses — see `--call-*` in styles.css —
 * so a call read on the news bar and the same call seen from the camera are recognisably one thing.
 */
const MARKER_COLOUR = {
  burglary: /* @__PURE__ */ new THREE.Color('#ffc65c'),
  assault: /* @__PURE__ */ new THREE.Color('#6f9dff'),
  accident: /* @__PURE__ */ new THREE.Color('#ff7063'),
  fire: /* @__PURE__ */ new THREE.Color('#ff8f3d'),
} as const

export interface IncidentScenes {
  marker: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null
  cordon: THREE.InstancedMesh | null
  crowd: THREE.InstancedMesh[]
  /** One mesh per service: the crew standing at the scene, in that service's own uniform. */
  crews: Partial<Record<Exclude<Service, 'none'>, THREE.InstancedMesh>>
  /** The two cars left in the road after a collision. Nothing else in the city uses them. */
  wrecks: THREE.InstancedMesh
  /**
   * Flame and smoke, for the one kind of call that is visible from anywhere in the city.
   *
   * A column of smoke is the only thing in Lindenhafen a player can see from the overview and go
   * and look at. Everything else about a call — the cordon, the crowd, the marker — has to be
   * found first.
   */
  fires: Fires
}

/** Scratch, reused across every write: a scene loop that allocates is a scene loop that stutters. */
const matrix = /* @__PURE__ */ new THREE.Matrix4()
const quaternion = /* @__PURE__ */ new THREE.Quaternion()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

export function createIncidentScenes(scene: THREE.Scene, models: CityModels): IncidentScenes {
  const barrier = models.furniture.find(model => model.id === 'construction-barrier')
    ?? models.furniture.find(model => model.id === 'construction-cone')
    ?? null

  return {
    marker: addMarker(scene),
    cordon: barrier ? addModel(scene, barrier, models.roadsMaterial, SCENE_LIMIT * MAX_CORDON) : null,
    crowd: crowdModels(models).map(model => addModel(scene, model, models.peopleMaterial, SCENE_LIMIT * MAX_CROWD)),
    crews: crewMeshes(scene, models),
    wrecks: addWrecks(scene),
    fires: addFires(scene, SCENE_LIMIT),
  }
}

/**
 * The two people the crowd is made of.
 *
 * Picked by position in the kit rather than by name, and picked once: which two they are says
 * nothing about the call. Appearance never carries meaning here — see `docs/CITY_LIFE.md`.
 */
function crowdModels(models: CityModels): CityModel[] {
  if (models.people.length === 0)
    return []
  return [models.people[0]!, models.people[Math.min(1, models.people.length - 1)]!]
}

function addModel(scene: THREE.Scene, model: CityModel, material: THREE.Material, count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(model.geometry, material, count)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  for (let index = 0; index < count; index += 1) mesh.setColorAt(index, WHITE)
  scene.add(mesh)
  return mesh
}

/**
 * The glow on the tarmac. One flat quad per scene, unlit and out of the depth buffer, so it reads
 * from directly above — which is where the player usually is — without being a light source.
 */
function addMarker(scene: THREE.Scene): THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(MARKER_SIZE, MARKER_SIZE),
    new THREE.MeshBasicMaterial({
      map: cordonRing(),
      transparent: true,
      opacity: MARKER_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
    SCENE_LIMIT,
  ) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  /*
   * Give every instance a colour now, before the first frame.
   *
   * `setColorAt` creates the instance-colour buffer lazily, and a node material that was already
   * compiled without one ignores it when it appears later — so the ring was drawn white whatever
   * service it belonged to, while the buffer sitting behind it held the right colour all along. The
   * beacons do the same thing for the same reason.
   */
  for (let index = 0; index < SCENE_LIMIT; index += 1) mesh.setColorAt(index, WHITE)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  scene.add(mesh)
  return mesh
}

/** Two ordinary cars. Nothing about the colour says anything; it only stops them being twins. */
const WRECK_PAINT = [
  /* @__PURE__ */ new THREE.Color('#b9bec4'),
  /* @__PURE__ */ new THREE.Color('#6d3f38'),
]

/**
 * The cars left where they hit each other.
 *
 * The thirty-triangle proxy rather than a kit model, for the same reason the parked cars use it: a
 * Kenney car is two thousand triangles, and nothing about a wreck seen from above needs them. They
 * sit at an angle to the road and to each other, which is the whole of what a collision looks like.
 */
function addWrecks(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(carProxyGeometry(), carProxyMaterial(), SCENE_LIMIT * MAX_WRECKS)
  mesh.count = 0
  mesh.frustumCulled = false
  for (let index = 0; index < SCENE_LIMIT * MAX_WRECKS; index += 1)
    mesh.setColorAt(index, WRECK_PAINT[index % WRECK_PAINT.length]!)
  scene.add(mesh)
  return mesh
}

/**
 * Put a scene at every open call.
 *
 * Everything is placed from the incident's own position and the time it was raised, so nothing has
 * to be remembered between frames: a scene is a pure function of the call, which is why calls can
 * appear and clear in any order without leaving anything behind on the street.
 */
export function updateIncidentScenes(
  scenes: IncidentScenes,
  incidents: Incident[],
  relief: Relief,
  elapsed: number,
  cameraDistance: number,
  /** Which way the camera is looking, because flame and smoke are billboards. */
  facing: THREE.Quaternion,
): void {
  const showCordon = cameraDistance <= CORDON_RANGE
  const showCrowd = cameraDistance <= CROWD_RANGE
  const open = Math.min(incidents.length, SCENE_LIMIT)

  let markers = 0
  let barriers = 0
  let wrecks = 0
  const crew: Partial<Record<Exclude<Service, 'none'>, number>> = {}
  const onlookers = scenes.crowd.map(() => 0)
  /** Collected rather than drawn in the loop: the fire is one pass over one pair of meshes. */
  const burning: { x: number, y: number, z: number, age: number }[] = []

  for (let index = 0; index < open; index += 1) {
    const incident = incidents[index]!
    const shape = SHAPE[incident.kind]
    const ground = relief.height(incident.x, incident.z)
    const age = elapsed - incident.raised
    if (incident.kind === 'fire')
      burning.push({ x: incident.x, y: ground, z: incident.z, age })

    if (scenes.marker) {
      // Breathing rather than flashing: a flashing ground plane at this size is a strobe.
      const pulse = 0.72 + Math.sin(elapsed * PULSE_RATE * Math.PI * 2) * 0.28
      position.set(incident.x, ground + MARKER_LIFT, incident.z)
      scale.set(pulse, pulse, pulse)
      scenes.marker.setMatrixAt(markers, matrix.compose(position, FLAT, scale))
      scenes.marker.setColorAt(markers, MARKER_COLOUR[incident.kind])
      markers += 1
    }

    if (showCordon && scenes.cordon) {
      for (let step = 0; step < shape.cordon; step += 1) {
        // Offset by the index so two scenes near each other do not stand in identical rings.
        const angle = (step / shape.cordon) * Math.PI * 2 + index * 0.4
        const x = incident.x + Math.cos(angle) * shape.radius
        const z = incident.z + Math.sin(angle) * shape.radius
        position.set(x, relief.height(x, z), z)
        // A barrier faces across the way in, so the ring reads as a ring rather than as six posts.
        quaternion.setFromAxisAngle(AXIS_Y, -angle)
        scale.setScalar(BARRIER_HEIGHT / Math.max(0.001, barrierHeight(scenes)))
        scenes.cordon.setMatrixAt(barriers, matrix.compose(position, quaternion, scale))
        barriers += 1
      }
    }

    if (showCrowd && scenes.crowd.length > 0) {
      for (let slot = 0; slot < shape.crowd; slot += 1) {
        /*
         * They arrive one at a time over the first few seconds. Nobody walks there — they are
         * standing when they appear, which is what `docs/CITY_LIFE.md` rules out pathfinding for.
         */
        if (age < GATHER_DELAY + slot * (GATHER_SPREAD / MAX_CROWD))
          continue
        // Alternating models, so a crowd is never six of the same person.
        const model = slot % scenes.crowd.length
        const mesh = scenes.crowd[model]!
        const angle = (slot / shape.crowd) * Math.PI * 2 + index * 1.1
        const reach = CROWD_RADIUS + (slot % 3) * 1.6
        const x = incident.x + Math.cos(angle) * reach
        const z = incident.z + Math.sin(angle) * reach
        position.set(x, relief.height(x, z), z)
        // Facing in, because that is the one thing everybody at a cordon has in common.
        quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(incident.x - x, incident.z - z))
        scale.setScalar(PERSON_HEIGHT / Math.max(0.001, personHeight(mesh)))
        mesh.setMatrixAt(onlookers[model]!, matrix.compose(position, quaternion, scale))
        onlookers[model] = onlookers[model]! + 1
      }
    }

    /*
     * The crew, but only once they are actually there.
     *
     * This is the whole reason the renderer tracks whether a vehicle arrived: a cordon with officers
     * standing at it before anybody has driven there is a stage set, and the player has no way to
     * tell a call that was answered from one that was not.
     */
    const onDuty = scenes.crews[incident.service]
    if (showCrowd && onDuty && incident.arrived !== null) {
      const at = crew[incident.service] ?? 0
      for (let step = 0; step < MAX_CREW; step += 1) {
        const angle = (step / MAX_CREW) * Math.PI * 2 + index * 0.7
        const x = incident.x + Math.cos(angle) * CREW_RADIUS
        const z = incident.z + Math.sin(angle) * CREW_RADIUS
        position.set(x, relief.height(x, z), z)
        // Facing outward, at the cordon rather than at whatever is inside it.
        quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(x - incident.x, z - incident.z))
        scale.setScalar(PERSON_HEIGHT / Math.max(0.001, measure(onDuty.geometry)))
        onDuty.setMatrixAt(at + step, matrix.compose(position, quaternion, scale))
        onDuty.setColorAt(at + step, CREW_COLOUR[incident.service])
      }
      crew[incident.service] = at + MAX_CREW
    }

    for (let step = 0; step < shape.wrecks; step += 1) {
      /*
       * Nose to nose and slewed across the line, which is the shape of a collision and the reason
       * the cordon closes the carriageway rather than standing beside it.
       */
      const angle = index * 0.9 + step * 2.3
      const reach = 3.4
      const x = incident.x + Math.cos(angle) * reach
      const z = incident.z + Math.sin(angle) * reach
      position.set(x, relief.height(x, z), z)
      quaternion.setFromAxisAngle(AXIS_Y, -angle + (step === 0 ? 0.5 : -0.7))
      scale.setScalar(1)
      scenes.wrecks.setMatrixAt(wrecks, matrix.compose(position, quaternion, scale))
      wrecks += 1
    }
  }

  if (scenes.marker) {
    scenes.marker.count = markers
    scenes.marker.instanceMatrix.needsUpdate = true
    if (scenes.marker.instanceColor)
      scenes.marker.instanceColor.needsUpdate = true
  }
  if (scenes.cordon) {
    scenes.cordon.count = barriers
    scenes.cordon.instanceMatrix.needsUpdate = true
  }
  scenes.crowd.forEach((mesh, model) => {
    mesh.count = onlookers[model]!
    mesh.instanceMatrix.needsUpdate = true
  })
  scenes.wrecks.count = wrecks
  scenes.wrecks.instanceMatrix.needsUpdate = true
  for (const [service, mesh] of Object.entries(scenes.crews)) {
    mesh.count = crew[service as Exclude<Service, 'none'>] ?? 0
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor)
      mesh.instanceColor.needsUpdate = true
  }
  /*
   * And the fire, in one pass over one pair of meshes rather than inside the loop above.
   *
   * It is the only part of a scene that is not distance-gated the way the rest is. A cordon at two
   * kilometres is four pixels and worth dropping; a column of smoke at two kilometres is the reason
   * the player goes and looks.
   */
  updateFires(scenes.fires, burning, elapsed, facing, cameraDistance)
}

/**
 * The ring, painted once.
 *
 * A bright annulus just inside the edge of the quad, and a faint wash inside it, both white so that
 * the instance colour is the only thing deciding which service this is. Everything outside is fully
 * transparent, so added to the scene it lifts the tarmac toward the colour and darkens nothing.
 */
const RING_SIZE = 256
let ring: THREE.CanvasTexture | null = null

function cordonRing(): THREE.CanvasTexture {
  if (ring)
    return ring
  const canvas = document.createElement('canvas')
  canvas.width = RING_SIZE
  canvas.height = RING_SIZE
  const context = canvas.getContext('2d')
  if (context) {
    const image = context.createImageData(RING_SIZE, RING_SIZE)
    const middle = (RING_SIZE - 1) / 2
    for (let y = 0; y < RING_SIZE; y += 1) {
      for (let x = 0; x < RING_SIZE; x += 1) {
        const radius = Math.hypot(x - middle, y - middle) / middle
        // The band itself, falling away over a tenth of the radius to either side.
        const band = Math.max(0, 1 - Math.abs(radius - 0.84) / 0.1) ** 1.6
        // And a wash inside it, so the road it encloses reads as part of the same place.
        const fill = radius < 0.84 ? 0.1 * (1 - radius / 0.84) : 0
        const offset = (y * RING_SIZE + x) * 4
        image.data[offset] = 255
        image.data[offset + 1] = 255
        image.data[offset + 2] = 255
        image.data[offset + 3] = Math.min(1, band + fill) * 255
      }
    }
    context.putImageData(image, 0, 0)
  }
  ring = new THREE.CanvasTexture(canvas)
  return ring
}

/**
 * A model's own height, read off its geometry once and kept.
 *
 * The kits are not in metres and are not consistent with each other, so scaling by a guessed factor
 * is how the outskirts ended up as forty-metre tower blocks. Measure, then scale to the real size.
 */
const heights = /* @__PURE__ */ new WeakMap<THREE.BufferGeometry, number>()

function measure(geometry: THREE.BufferGeometry): number {
  const known = heights.get(geometry)
  if (known !== undefined)
    return known
  geometry.computeBoundingBox()
  const height = geometry.boundingBox ? geometry.boundingBox.max.y - geometry.boundingBox.min.y : 1
  heights.set(geometry, height)
  return height
}

function barrierHeight(scenes: IncidentScenes): number {
  return scenes.cordon ? measure(scenes.cordon.geometry) : 1
}

function personHeight(mesh: THREE.InstancedMesh): number {
  return measure(mesh.geometry)
}
