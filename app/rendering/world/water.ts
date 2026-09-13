import type { CityBlueprint } from '../../core/contracts'
import * as THREE from 'three/webgpu'

/**
 * The river.
 *
 * It used to be a land-use polygon painted blue — flat, matt and as still as a car park. Water is
 * the one surface in a city that is never still, and a river city whose river does not move reads as
 * a photograph. This gives it its own mesh, its own material and two scrolling ripple maps, one
 * drifting slightly against the other so the pattern never repeats visibly.
 *
 * It sits at a fixed level rather than following the ground, because that is what water does: the
 * relief was built from the distance to this water precisely so the banks rise away from it.
 */

/** The water's surface, in metres. The relief is zero on the floodplain, so this is just above it. */
export const WATER_LEVEL = 0.45
const RIPPLE_TILE = 256
/**
 * How far the river runs on past the edge of the extract, and how wide it is out there.
 *
 * The map stops at fifteen hundred metres and the water stopped with it — the Weser ended at a
 * straight line in the middle of the landscape, which is the one thing a river never does. The
 * channel the converter traced down the middle of the water carries on from both ends to the
 * horizon, widening a little as it goes.
 */
const RIVER_REACH = 9_000
const RIVER_STEP = 400
const RIVER_WIDTH = 150
const RIVER_FLARE = 0.06

export interface Water {
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
}

export function addWater(scene: THREE.Scene, blueprint: CityBlueprint): Water | null {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const contour: THREE.Vector2[] = []

  for (const area of blueprint.areas) {
    if (area.kind !== 'water')
      continue
    const ring = area.polygon
    if (ring.length < 6)
      continue

    contour.length = 0
    for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []) as [number, number, number][]
    if (triangles.length === 0)
      continue

    const base = position.length / 3
    for (let i = 0; i < ring.length; i += 2) {
      position.push(ring[i]!, WATER_LEVEL, ring[i + 1]!)
      normal.push(0, 1, 0)
      // One ripple tile every eighteen metres, which is about the wavelength of river chop.
      uv.push(ring[i]! / 18, ring[i + 1]! / 18)
    }
    // Wound the same way as everything else that lies flat and is read from above.
    for (const triangle of triangles)
      index.push(base + triangle[2], base + triangle[1], base + triangle[0])
  }

  addRiverTails(blueprint.waterway, position, normal, uv, index)

  if (index.length === 0)
    return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()

  const material = new THREE.MeshStandardMaterial({
    color: '#2b4f63',
    roughness: 0.18,
    metalness: 0.28,
    normalMap: rippleTexture(),
    normalScale: new THREE.Vector2(0.42, 0.42),
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  scene.add(mesh)
  return { mesh, material }
}

/** Drift the ripples. Two speeds that do not divide into each other, so nothing ever lines up. */
export function updateWater(water: Water | null, elapsed: number): void {
  if (!water?.material.normalMap)
    return
  water.material.normalMap.offset.set(elapsed * 0.014, elapsed * 0.009)
}

/**
 * A tangent-space normal map of small waves, built from two sine fields crossing at an angle. It
 * tiles exactly, because the frequencies are whole numbers of cycles across the tile.
 */
function rippleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = RIPPLE_TILE
  canvas.height = RIPPLE_TILE
  const context = canvas.getContext('2d')

  if (context) {
    const image = context.createImageData(RIPPLE_TILE, RIPPLE_TILE)
    const waves = [
      { fx: 3, fz: 1, amplitude: 1 },
      { fx: -2, fz: 4, amplitude: 0.7 },
      { fx: 7, fz: 5, amplitude: 0.32 },
      { fx: 5, fz: -9, amplitude: 0.18 },
    ]
    for (let y = 0; y < RIPPLE_TILE; y += 1) {
      for (let x = 0; x < RIPPLE_TILE; x += 1) {
        let slopeX = 0
        let slopeY = 0
        for (const wave of waves) {
          const phase = 2 * Math.PI * ((x / RIPPLE_TILE) * wave.fx + (y / RIPPLE_TILE) * wave.fz)
          slopeX += Math.cos(phase) * wave.amplitude * wave.fx
          slopeY += Math.cos(phase) * wave.amplitude * wave.fz
        }
        const scale = 0.045
        const nx = -slopeX * scale
        const ny = -slopeY * scale
        const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny))
        const offset = (y * RIPPLE_TILE + x) * 4
        image.data[offset] = (nx * 0.5 + 0.5) * 255
        image.data[offset + 1] = (ny * 0.5 + 0.5) * 255
        image.data[offset + 2] = (nz * 0.5 + 0.5) * 255
        image.data[offset + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/**
 * Carry the river off the map at both ends.
 *
 * A ribbon laid along the channel's own direction where it leaves the extract, stepped out to the
 * horizon and flared slightly, so the water reads as going somewhere rather than as a pond cut to
 * the shape of the data we happen to have.
 */
function addRiverTails(waterway: number[], position: number[], normal: number[], uv: number[], index: number[]): void {
  const count = waterway.length / 2
  if (count < 2)
    return

  const ends: { x: number, z: number, ux: number, uz: number }[] = []
  for (const outward of [false, true]) {
    const tip = outward ? count - 1 : 0
    const inner = outward ? count - 2 : 1
    const dx = waterway[tip * 2]! - waterway[inner * 2]!
    const dz = waterway[tip * 2 + 1]! - waterway[inner * 2 + 1]!
    const length = Math.hypot(dx, dz) || 1
    ends.push({ x: waterway[tip * 2]!, z: waterway[tip * 2 + 1]!, ux: dx / length, uz: dz / length })
  }

  for (const end of ends) {
    const first = position.length / 3
    let written = 0
    for (let along = 0; along <= RIVER_REACH; along += RIVER_STEP) {
      const half = (RIVER_WIDTH / 2) * (1 + (along / RIVER_REACH) * RIVER_FLARE * 10)
      const x = end.x + end.ux * along
      const z = end.z + end.uz * along
      const ox = -end.uz * half
      const oz = end.ux * half
      position.push(x + ox, WATER_LEVEL, z + oz, x - ox, WATER_LEVEL, z - oz)
      normal.push(0, 1, 0, 0, 1, 0)
      uv.push((x + ox) / 18, (z + oz) / 18, (x - ox) / 18, (z - oz) / 18)
      written += 1
      if (written > 1) {
        const a = first + (written - 2) * 2
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
  }
}
