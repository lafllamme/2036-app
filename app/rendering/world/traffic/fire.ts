import * as THREE from 'three/webgpu'
import { glowTexture } from '../../sky/textures'

/**
 * A building on fire: flames at the bottom, smoke going up.
 *
 * The first and only particle system in the project, and it is deliberately the cheapest kind there
 * is. Every particle is one quad out of one instanced mesh, and where each one is at any moment is a
 * function of its own index and the clock — no velocities, no state, nothing integrated between
 * frames. That means a fire can start, stop and move with no bookkeeping at all, and a hundred
 * particles cost a hundred matrix writes on the slow tick rather than a simulation.
 *
 * Two meshes rather than one because they need different blending. Flame is light being emitted, so
 * it adds; smoke is light being blocked, so it does not. Doing both additively gives you a bright
 * cloud, which is what a fire looks like to nobody.
 *
 * Both are billboards — turned to face the camera every pass. A flat quad seen edge-on disappears,
 * and a fire that vanishes when you walk round it is worse than no fire.
 */

/**
 * How close the camera has to be for the flame to be worth drawing.
 *
 * Only the flame. Smoke has no range gate at all, which is the whole point of it: a column over the
 * city is the one thing a player can see from the overview and go and look at.
 */
const FLAME_RANGE = 1_400

/** How many of each, per fire. The budget is fixed: six fires at once is the most there can be. */
const FLAMES = 16
const SMOKE = 46

/** How long one particle takes to run its life, in seconds, and how far it gets. */
const FLAME_LIFE = 1.1
const FLAME_RISE = 5.5
const SMOKE_LIFE = 7
const SMOKE_RISE = 95
/** How wide the column is at the bottom, and how much the smoke spreads as it climbs. */
const BASE_SPREAD = 3.4
const SMOKE_DRIFT = 16

/** Sizes in metres at birth, and how much each grows over its life. */
const FLAME_SIZE = 4
const SMOKE_SIZE = 16
const SMOKE_GROWTH = 3.4

const FLAME_COLOUR = /* @__PURE__ */ new THREE.Color('#ff7a1c')
const EMBER_COLOUR = /* @__PURE__ */ new THREE.Color('#ffd25e')
/*
 * Dark at the base and pale at the top, and both lighter than they were.
 *
 * The first values were nearly black, on the reasoning that smoke blocks light. What that ignores is
 * that a column is seen against the sky, and against anorth German sky in February anything that dark
 * is a smudge nobody reads as smoke. A real plume is lit from the side by the whole dome.
 */
const SMOKE_COLOUR = /* @__PURE__ */ new THREE.Color('#3f3a34')
/** Pale at the top, where smoke has thinned enough to be lit rather than to block. */
const WHITE_SMOKE = /* @__PURE__ */ new THREE.Color('#c0b9ae')

export interface Fires {
  flame: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  smoke: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
}

export function addFires(scene: THREE.Scene, sites: number): Fires {
  return {
    flame: addCloud(scene, sites * FLAMES, THREE.AdditiveBlending, 0.9, 2),
    smoke: addCloud(scene, sites * SMOKE, THREE.NormalBlending, 0.62, 1),
  }
}

function addCloud(scene: THREE.Scene, count: number, blending: THREE.Blending, opacity: number, order: number): Fires['flame'] {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      opacity,
      blending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
    count,
  ) as Fires['flame']
  /*
   * Give every instance a colour before the first frame. `setColorAt` creates the buffer lazily, and
   * a node material compiled without one ignores it when it appears later — which is how the cordon
   * ring came out white whatever service it belonged to.
   */
  for (let index = 0; index < count; index += 1) mesh.setColorAt(index, SMOKE_COLOUR)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = order
  scene.add(mesh)
  return mesh
}

const matrix = /* @__PURE__ */ new THREE.Matrix4()
const position = /* @__PURE__ */ new THREE.Vector3()
const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
const tint = /* @__PURE__ */ new THREE.Color()

/**
 * Draw every fire that is burning.
 *
 * `sites` is where they are and how long each has been going, so a fire that has just started is a
 * few flames and one that has been burning for a minute has a column over it — the smoke reaches
 * full height over the first half minute rather than appearing all at once.
 */
export function updateFires(
  fires: Fires,
  sites: { x: number, y: number, z: number, age: number }[],
  elapsed: number,
  facing: THREE.Quaternion,
  cameraDistance: number,
): void {
  let flames = 0
  let smoke = 0
  /*
   * Smoke carries and flame does not, so they are gated separately. From the overview a fire is a
   * column of smoke and nothing else, which is exactly what a fire looks like from a hill — and it
   * saves the more expensive of the two meshes at the distance where the city is busiest.
   */
  const showFlame = cameraDistance <= FLAME_RANGE

  sites.forEach((site, index) => {
    // A column takes half a minute to build. Before that it is a fire somebody might still put out.
    const grown = Math.min(1, site.age / 30)

    for (let particle = 0; particle < (showFlame ? FLAMES : 0); particle += 1) {
      /*
       * Where this one is in its own life, from its index and the clock. Offsetting by the index
       * spreads the whole set evenly through the cycle, so the column is continuous rather than
       * pulsing — which is what happens when every particle is born at the same moment.
       */
      const life = ((elapsed / FLAME_LIFE) + particle / FLAMES + index * 0.37) % 1
      const angle = particle * 2.39996 + index
      const reach = BASE_SPREAD * (0.3 + 0.7 * ((particle * 7 % FLAMES) / FLAMES))
      position.set(
        site.x + Math.cos(angle) * reach * (1 - life * 0.55),
        site.y + life * FLAME_RISE + 0.4,
        site.z + Math.sin(angle) * reach * (1 - life * 0.55),
      )
      // Flames narrow as they rise, and go from yellow at the base to orange at the top.
      scale.setScalar(FLAME_SIZE * (1 - life * 0.65) * (0.6 + grown * 0.4))
      fires.flame.setMatrixAt(flames, matrix.compose(position, facing, scale))
      fires.flame.setColorAt(flames, tint.copy(EMBER_COLOUR).lerp(FLAME_COLOUR, life))
      flames += 1
    }

    for (let particle = 0; particle < SMOKE; particle += 1) {
      const life = ((elapsed / SMOKE_LIFE) + particle / SMOKE + index * 0.61) % 1
      const angle = particle * 2.39996 + index * 1.7
      position.set(
        site.x + Math.cos(angle) * (BASE_SPREAD + life * SMOKE_DRIFT),
        site.y + 1 + life * SMOKE_RISE * grown,
        site.z + Math.sin(angle) * (BASE_SPREAD + life * SMOKE_DRIFT),
      )
      // Smoke spreads and thins as it climbs; the thinning is the scale, the fading is the colour.
      scale.setScalar(SMOKE_SIZE + life * SMOKE_GROWTH * SMOKE_SIZE * 0.4)
      fires.smoke.setMatrixAt(smoke, matrix.compose(position, facing, scale))
      fires.smoke.setColorAt(smoke, tint.copy(SMOKE_COLOUR).lerp(WHITE_SMOKE, life * 0.8))
      smoke += 1
    }
  })

  settle(fires.flame, flames)
  settle(fires.smoke, smoke)
}

function settle(mesh: Fires['flame'], count: number): void {
  mesh.count = Math.min(count, mesh.instanceMatrix.count)
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor)
    mesh.instanceColor.needsUpdate = true
}
