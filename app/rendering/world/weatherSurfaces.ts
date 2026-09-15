import * as THREE from 'three/webgpu'

/**
 * What the weather does to the ground, for no draw calls and no geometry.
 *
 * Rain that only falls is half a rain: the thing that actually reads as weather from street level is
 * the road going dark and glossy under it, and the thing that reads from the overview is snow lying
 * on the parks. Both are the same material the city was already drawn with, with a different colour
 * and a different roughness — a handful of uniforms, once a tick, for every paved and planted metre
 * of Lindenhafen.
 *
 * Each surface keeps the colour and roughness it was built with, because these are eased toward and
 * away from: reading the current value back and darkening *that* compounds, and after a month of
 * rain the city would be black.
 */

/** What tarmac goes toward when it is wet: darker, and glossy enough to hold a reflection. */
const WET = /* @__PURE__ */ new THREE.Color('#16191c')
/** And what everything goes toward under snow. Not white — snow in a city never is. */
const SNOW = /* @__PURE__ */ new THREE.Color('#e8ecf1')

export interface WeatherSurface {
  material: THREE.MeshStandardMaterial
  /** The colour and roughness the city was built with, which is what the weather works from. */
  readonly base: THREE.Color
  readonly roughness: number
  /** How much the rain shows on it, 0 … 1. Tarmac shows it; grass does not. */
  readonly soaks: number
  /** How much snow settles on it. A park keeps it; a road that is being driven on does not. */
  readonly settles: number
}

export interface CitySurfaces {
  entries: WeatherSurface[]
  /** The last values dressed, so an unchanged sky writes no uniforms at all. */
  dressed: { wetness: number, cover: number }
}

/**
 * Paved surfaces soak and shed; soft ones stay matt and hold the snow.
 *
 * The order the two lists arrive in is the order they were built in — `roads.ts` hands back
 * pavement, carriageway, junction and cycle lane, and `ground.ts` the land and the painted areas.
 */
export function trackSurfaces(paved: THREE.MeshStandardMaterial[], soft: THREE.MeshStandardMaterial[]): CitySurfaces {
  const entries: WeatherSurface[] = []
  for (const material of paved)
    entries.push(surface(material, 1, 0.35))
  for (const material of soft)
    entries.push(surface(material, 0.3, 1))
  return { entries, dressed: { wetness: -1, cover: -1 } }
}

/**
 * Put the weather on the ground.
 *
 * `wetness` and `cover` both run 0 … 1 and both are already eased — this only paints. It returns
 * early when nothing has moved, which is most ticks of most months: the sky over Lindenhafen is dry
 * about two days in three.
 */
export function dressSurfaces(surfaces: CitySurfaces, wetness: number, cover: number): void {
  const { dressed } = surfaces
  if (Math.abs(wetness - dressed.wetness) < 0.002 && Math.abs(cover - dressed.cover) < 0.002)
    return
  dressed.wetness = wetness
  dressed.cover = cover

  for (const entry of surfaces.entries) {
    const wet = wetness * entry.soaks
    const white = cover * entry.settles
    entry.material.color.copy(entry.base).lerp(WET, wet * 0.55).lerp(SNOW, white * 0.82)
    /*
     * Wet asphalt is nearly a mirror and fresh snow is nearly matt, so the two pull in opposite
     * directions. Roughness is never taken below a fifth: a perfectly smooth road under a single
     * directional sun is a black road with one white stripe on it.
     */
    entry.material.roughness = THREE.MathUtils.clamp(entry.roughness - wet * 0.62 + white * 0.04, 0.2, 1)
  }
}

function surface(material: THREE.MeshStandardMaterial, soaks: number, settles: number): WeatherSurface {
  return { material, base: material.color.clone(), roughness: material.roughness, soaks, settles }
}
