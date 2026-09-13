import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three/webgpu'

/**
 * A bicycle, written out rather than loaded.
 *
 * Kenney's kits have no bike, and a bike is not worth taking on a second asset source and a second
 * licence for — so it is built here the same way the parked-car proxy is, out of boxes. About fifty
 * triangles: two wheels as flat rings would be three hundred, so they are octagons seen from the
 * side, which at the only distance anyone ever sees a cyclist from is a wheel.
 *
 * The rider is a kit character standing on it, drawn by the pedestrian fleet. Nothing here knows
 * about that: this is the machine, and the person is somebody else's problem.
 */

/** The proportions of an ordinary town bike, in metres. */
const WHEELBASE = 1.02
const WHEEL_RADIUS = 0.34
const TYRE = 0.05
const FRAME_TOP = 0.78
const BAR_HEIGHT = 1
const WIDTH = 0.06

export function bicycleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  // Two wheels, each an octagon of spokes-worth of rim and nothing inside it.
  for (const along of [WHEELBASE / 2, -WHEELBASE / 2]) {
    for (let step = 0; step < 8; step += 1) {
      const angle = (step / 8) * Math.PI * 2
      const next = ((step + 1) / 8) * Math.PI * 2
      parts.push(bar(
        along + Math.sin(angle) * WHEEL_RADIUS,
        WHEEL_RADIUS + Math.cos(angle) * WHEEL_RADIUS,
        along + Math.sin(next) * WHEEL_RADIUS,
        WHEEL_RADIUS + Math.cos(next) * WHEEL_RADIUS,
        TYRE,
      ))
    }
  }

  // The frame: down tube, top tube, seat tube, and the fork the bars sit on.
  parts.push(bar(-WHEELBASE / 2, WHEEL_RADIUS, 0.12, FRAME_TOP * 0.55, WIDTH))
  parts.push(bar(0.12, FRAME_TOP * 0.55, WHEELBASE / 2, BAR_HEIGHT * 0.82, WIDTH))
  parts.push(bar(-WHEELBASE / 2, WHEEL_RADIUS, -0.26, FRAME_TOP, WIDTH))
  parts.push(bar(-0.26, FRAME_TOP, 0.12, FRAME_TOP * 0.55, WIDTH))
  // Handlebars, across the direction of travel.
  parts.push(across(WHEELBASE / 2, BAR_HEIGHT, 0.42, WIDTH))

  const merged = mergeGeometries(parts, false)
  merged.computeVertexNormals()
  merged.computeBoundingSphere()
  return merged
}

/** The material every bike in the city shares. Dark, matt, and nobody looks at it twice. */
export function bicycleMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#2c3034', roughness: 0.55, metalness: 0.35 })
}

/** A square-section bar between two points in the bike's own side-on plane. */
function bar(x0: number, y0: number, x1: number, y1: number, thickness: number): THREE.BufferGeometry {
  const length = Math.hypot(x1 - x0, y1 - y0)
  const geometry = new THREE.BoxGeometry(length, thickness, thickness)
  geometry.rotateZ(Math.atan2(y1 - y0, x1 - x0))
  geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, 0)
  return geometry
}

/** The one part that is not in that plane. */
function across(x: number, y: number, span: number, thickness: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(thickness, thickness, span)
  geometry.translate(x, y, 0)
  return geometry
}
