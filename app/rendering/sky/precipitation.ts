import type { Weather } from '../../core/weather'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'

/**
 * Rain and snow, for two draw calls.
 *
 * The obvious way to do weather is a particle system: a few thousand drops, each with a position and
 * a velocity, all of it integrated on the CPU and uploaded every frame. That is thousands of vertex
 * writes a frame for something the player never looks at twice.
 *
 * This does it the other way round. The drops never move relative to each other — the whole curtain
 * falls, as one object, and wraps when it has fallen a step. A field of identical drops is
 * statistically the same field after the wrap, so the wrap is invisible, and the entire animation is
 * one position per frame, whatever the rain is doing.
 *
 * ## Three things this got wrong, in order, and what each taught
 *
 * **Lines.** Each drop was a `LineSegments` segment, which is the cheapest thing a GPU can draw and
 * was very nearly invisible: WebGPU, like WebGL before it, renders every line exactly one pixel wide
 * however close it is and whatever `linewidth` says. A hairline against a bright sky is nothing.
 *
 * **Flat quads.** A flat quad seen along its own plane has no area, so the rain thinned out and
 * vanished as the camera came round. Each drop is now two quads crossed at right angles: from any
 * direction round the compass one of the two is facing you, and the pair never disappears.
 *
 * **Turning the curtain to face the camera.** That fixed the geometry and broke the world: a field
 * that swings with the view is a field the player can feel is hanging off the lens, and the moment
 * they pan, the illusion that it is raining *on the city* is gone. Nothing here turns any more. The
 * curtain stands in the world and only steps — by whole `STEP` metres, so it never rides along with
 * a moving camera — and the drops solve the angle problem by being crossed rather than by aiming.
 *
 * Looking straight down at rain there genuinely is little to see: a falling streak seen from above
 * is a dot. The curtain thins as the view tips over rather than pretending otherwise, but it never
 * goes out entirely, because rain that vanishes when the player tilts the camera is a bug however
 * well it is argued for.
 */

/**
 * How far the curtain reaches around the camera, and how far above and below it.
 *
 * Small, and deliberately so. Rain is a near-field effect: drops within thirty metres already fill
 * the whole screen, because they are close enough to the lens to subtend it. Reaching further would
 * multiply the geometry by the cube of the radius to add drops that land on a pixel each.
 */
const REACH = 26
const LIFT = 22
/**
 * And how close a drop may come. Without a floor, the nearest drops sit a hand's breadth from the
 * lens, where a streak forty centimetres long is drawn across half the screen — which is where the
 * first version's white poles came from.
 */
const CLOSEST = 2.5

/**
 * How far the curtain is allowed to fall, drift or be left behind before it steps.
 *
 * Everything about the curtain's position is quantised to this. It is what makes the rain belong to
 * the city rather than to the camera: between steps the curtain does not move with the player at
 * all, and a step is four metres — an eighth of a second of falling, over in two frames, among
 * thousands of identical streaks that are already moving.
 */
const STEP = 4

/*
 * How many. Twenty-six thousand of them in a volume of about ninety thousand cubic metres is one
 * drop every three and a half — which sounds absurd until you look at rain. Fewer read as scratches
 * on the lens rather than as weather: individually legible streaks with dark between them. Rain is a
 * veil, and a veil needs enough threads.
 *
 * Four triangles each, so a hundred thousand: four per cent of what this city already draws, and
 * only while it is actually raining.
 */
const DROPS = 26_000
const FLAKES = 6_000

/** Metres a second. Rain falls at terminal velocity; snow does not. */
const RAIN_FALL = 30
const SNOW_FALL = 1.4
/** How far a gale pushes what is falling, sideways, per second. */
const RAIN_DRIFT = 15
const SNOW_DRIFT = 6

/**
 * How long a drop is drawn, in metres, which is what makes it a streak rather than a dot.
 *
 * This is the length of the blur a falling drop leaves in an exposure, not the length of the drop:
 * a few tens of centimetres. The first attempt used metres, which at three metres from the lens is
 * a pole across a quarter of the screen.
 */
const STREAK_MIN = 0.3
const STREAK_MAX = 0.8
/** And how wide at the head. About three pixels at ten metres, which is what rain looks like. */
const STREAK_WIDTH = 0.032
/** Narrower at the tail than at the head, which is what makes a streak read as falling. */
const STREAK_TAPER = 0.35

/**
 * Where the drops stop being drawn, by how high the camera is.
 *
 * Low, and that is the point. Every drop is within thirty metres of the lens, so from four hundred
 * metres up they are not rain over the city — they are streaks on the glass, sitting in front of a
 * skyline they have no relation to. That is the thing that looks wrong from the overview, and no
 * amount of tuning the streaks fixes it, because it is true.
 *
 * From up there the weather is carried by everything else instead, and carried better: the sky
 * closes, the fog comes in, the roads go black and wet, the crowd thins out. All of that is visible
 * from any height, none of it costs a draw call, and it is what a rainy city actually looks like
 * from above. The drops are for street level, where they are what rain looks like.
 */
const FADE_FROM = 110
const FADE_TO = 460
/** How much of the rain is left when the view is pointing straight down. Never nothing. */
const STEEP_FLOOR = 0.38

export interface Precipitation {
  group: THREE.Group
  rain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  snow: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  /** Seconds of fall, kept here so the curtain does not jump when the camera does. */
  elapsed: number
  /** How much has settled on the ground, 0 … 1. Eased, because snow neither falls nor melts at once. */
  cover: number
  /** How wet the ground is, 0 … 1. Rises with the rain and dries off well after it has stopped. */
  wetness: number
  /** Scratch vector for the camera's facing, so that a frame allocates nothing. */
  facing: THREE.Vector3
}

export function addPrecipitation(scene: THREE.Scene): Precipitation {
  const group = new THREE.Group()
  group.frustumCulled = false
  scene.add(group)

  /*
   * Unlit on purpose. A drop of water is not a diffuse surface — what you see of it is the sky
   * through it — so lighting it makes it darkest at exactly the hour the rain matters most. The tone
   * is taken off the sky instead, in `updatePrecipitation`.
   */
  const rain = new THREE.Mesh(dropGeometry(), new THREE.MeshBasicMaterial({
    color: '#dfe9f4',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  }))
  rain.frustumCulled = false
  rain.visible = false
  group.add(rain)

  const snow = new THREE.Points(flakeGeometry(), new THREE.PointsMaterial({
    color: '#ffffff',
    size: 0.24,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  }))
  snow.frustumCulled = false
  snow.visible = false
  group.add(snow)

  return { group, rain, snow, elapsed: 0, cover: 0, wetness: 0, facing: new THREE.Vector3() }
}

/**
 * Where the curtain stands this frame, and how hard it is coming down.
 *
 * Runs on the frame clock rather than the slow one: this integrates, and five updates a second would
 * make the rain fall in steps a metre high.
 */
export function updatePrecipitation(
  sky: Precipitation,
  delta: number,
  camera: THREE.Camera,
  weather: Weather,
  daylight: number,
): void {
  sky.elapsed += delta

  /*
   * What has settled. Snow lying on the city is the half of winter that is actually visible from the
   * overview, and it has to arrive and go slowly or a passing shower turns the map white and back
   * again between two frames.
   */
  const settling = weather.temperature <= 1.5 ? Math.min(1, weather.snow * 2.4 + (weather.temperature <= -2 ? 0.25 : 0)) : 0
  sky.cover += (settling - sky.cover) * Math.min(1, delta * (settling > sky.cover ? 0.05 : 0.02))

  /*
   * And how wet it is. A road soaks in seconds and dries in a quarter of an hour, which is the one
   * piece of weather the player sees from street level long after the sky has cleared.
   */
  const soaking = Math.min(1, weather.rain * 1.9)
  sky.wetness += (soaking - sky.wetness) * Math.min(1, delta * (soaking > sky.wetness ? 0.5 : 0.06))

  const eye = camera.position
  const nearness = 1 - THREE.MathUtils.smoothstep(Math.max(0, eye.y), FADE_FROM, FADE_TO)
  /*
   * And how far the view has tipped over. A falling streak seen from above is a dot, so the curtain
   * thins as the camera looks down on the city — down to a floor rather than to nothing.
   */
  camera.getWorldDirection(sky.facing)
  const level = Math.sqrt(Math.max(0, 1 - sky.facing.y * sky.facing.y))
  const tilt = STEEP_FLOOR + (1 - STEEP_FLOOR) * THREE.MathUtils.smoothstep(level, 0.1, 0.55)

  const rainfall = weather.rain * nearness
  const snowfall = weather.snow * nearness

  sky.rain.visible = rainfall > 0.008
  sky.snow.visible = snowfall > 0.008
  if (!sky.rain.visible && !sky.snow.visible)
    return

  /*
   * Where the curtain stands. Quantised in all three axes, so that between steps it is nailed to the
   * city and not to the camera — pan, orbit or zoom and the rain stays exactly where it was.
   *
   * The fall and the drift are wrapped to the same step, which is what lets one object be an endless
   * curtain: the field is uniform, so a curtain that has fallen four metres and stepped back up is
   * the same curtain, and there is nothing in it to see the seam in.
   */
  const anchorX = Math.round(eye.x / STEP) * STEP
  const anchorY = Math.round(eye.y / STEP) * STEP
  const anchorZ = Math.round(eye.z / STEP) * STEP
  const falling = sky.rain.visible ? RAIN_FALL : SNOW_FALL
  const sideways = sky.rain.visible ? RAIN_DRIFT : SNOW_DRIFT
  const drift = wrap(sky.elapsed * sideways * weather.wind, STEP)
  sky.group.position.set(
    anchorX + drift,
    anchorY - wrap(sky.elapsed * falling, STEP),
    anchorZ + drift * 0.4,
  )

  /*
   * The tone comes off the sky. Rain at noon is a bright silver against grey cloud; the same rain at
   * midnight is barely lighter than the air, and a white curtain there reads as static on a screen.
   */
  const tone = 0.34 + daylight * 0.66

  if (sky.rain.visible)
    sky.rain.material.opacity = (0.1 + rainfall * 0.3) * tone * tilt

  if (sky.snow.visible) {
    // A flake is a point, which faces the camera by construction: nothing to aim and nothing to tip.
    sky.snow.material.opacity = (0.35 + snowfall * 0.65) * Math.max(0.45, tone)
    sky.snow.material.size = 0.16 + snowfall * 0.2
  }
}

/**
 * A drop is two quads crossed at right angles, wide at the head and narrow at the tail.
 *
 * Four triangles each, built once and never touched again. Crossed rather than aimed, because aiming
 * means turning the curtain, and a curtain that turns is a curtain hanging off the camera.
 */
function dropGeometry(): THREE.BufferGeometry {
  const rng = createRandomStream(2_036, 'rain')
  const position = new Float32Array(DROPS * 2 * 4 * 3)
  const index: number[] = []
  let vertex = 0

  for (let drop = 0; drop < DROPS; drop += 1) {
    const { x, y, z } = place(rng)
    const streak = STREAK_MIN + rng.next() * (STREAK_MAX - STREAK_MIN)
    // Slightly different widths, so that the near ones do not read as a printed pattern.
    const half = STREAK_WIDTH * (0.7 + rng.next() * 0.6) * 0.5
    const tip = half * STREAK_TAPER
    for (const across of [false, true]) {
      const wide = across ? 0 : half
      const deep = across ? half : 0
      const wideTip = across ? 0 : tip
      const deepTip = across ? tip : 0
      position.set([
        x - wide,
        y,
        z - deep,
        x + wide,
        y,
        z + deep,
        x + wideTip,
        y + streak,
        z + deepTip,
        x - wideTip,
        y + streak,
        z - deepTip,
      ], vertex * 3)
      index.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
      vertex += 4
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setIndex(index)
  return geometry
}

function flakeGeometry(): THREE.BufferGeometry {
  const rng = createRandomStream(2_036, 'snow')
  const position = new Float32Array(FLAKES * 3)
  for (let index = 0; index < FLAKES; index += 1) {
    const { x, y, z } = place(rng)
    position[index * 3] = x
    position[index * 3 + 1] = y
    position[index * 3 + 2] = z
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  return geometry
}

/**
 * One drop's place in the curtain, around its own centre.
 *
 * A cylinder rather than a cube, because the corners of a cube are half again as far away as its
 * faces: in a cube the rain is visibly thinner straight ahead than at forty-five degrees off it,
 * which is the kind of wrongness that has no name and is read instantly as "off".
 *
 * Spread by area rather than evenly along the radius, so that the density is the same everywhere in
 * it. Crowding the drops into the middle sounds like the thrifty choice and is not: what it actually
 * produces is a clump of enormous streaks at the lens and a thin drizzle everywhere else.
 */
function place(rng: { next: () => number }): { x: number, y: number, z: number } {
  const angle = rng.next() * Math.PI * 2
  const radius = CLOSEST + Math.sqrt(rng.next()) * (REACH - CLOSEST)
  return {
    x: Math.cos(angle) * radius,
    y: (rng.next() * 2 - 1) * LIFT,
    z: Math.sin(angle) * radius,
  }
}

/** A positive remainder, which `%` is not for the negative drift of a westerly. */
function wrap(value: number, period: number): number {
  return ((value % period) + period) % period
}
