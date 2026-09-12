import * as THREE from 'three/webgpu'

/**
 * The ground's own grain, painted once into a tile.
 *
 * The land was a single flat colour, which from any height reads as a carpet and from close up as
 * nothing at all — and at night, with nothing for the light to catch, as black. This gives it a
 * texture: value noise at three scales, plus a scatter of darker flecks, in greys that multiply the
 * colour the surface already has rather than replacing it. One 256² tile serves the whole country.
 */

const TILE = 256

export function groundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const context = canvas.getContext('2d')

  if (context) {
    const image = context.createImageData(TILE, TILE)
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        /*
         * Three octaves of a hash that wraps on the tile, so the seam is invisible however far the
         * texture repeats — which over twenty kilometres is three hundred times.
         */
        const value = wrapped(x, y, 4) * 0.5 + wrapped(x, y, 16) * 0.32 + wrapped(x, y, 64) * 0.18
        const shade = 168 + (value - 0.5) * 96
        const offset = (y * TILE + x) * 4
        image.data[offset] = shade
        image.data[offset + 1] = shade
        image.data[offset + 2] = shade * 0.99
        image.data[offset + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)

    // Flecks: gravel, dry patches, the odd stone. Enough to give the eye something at close range.
    for (let i = 0; i < 900; i += 1) {
      const x = hash(i, 7) * TILE
      const y = hash(i, 13) * TILE
      const radius = 0.6 + hash(i, 19) * 1.8
      context.fillStyle = `rgba(${hash(i, 23) > 0.5 ? '92, 88, 80' : '196, 192, 178'}, ${0.12 + hash(i, 29) * 0.2})`
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

/** A deterministic hash in 0 … 1. */
function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43_758.5453
  return h - Math.floor(h)
}

/** Value noise on a lattice that divides the tile exactly, so opposite edges match. */
function wrapped(x: number, y: number, cells: number): number {
  const step = TILE / cells
  const gx = x / step
  const gy = y / step
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const fx = smooth(gx - x0)
  const fy = smooth(gy - y0)
  const a = hash((x0 + cells) % cells, (y0 + cells) % cells)
  const b = hash((x0 + 1 + cells) % cells, (y0 + cells) % cells)
  const c = hash((x0 + cells) % cells, (y0 + 1 + cells) % cells)
  const d = hash((x0 + 1 + cells) % cells, (y0 + 1 + cells) % cells)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return top + (bottom - top) * fy
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}
