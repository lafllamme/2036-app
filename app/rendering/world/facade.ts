import * as THREE from 'three/webgpu'

/**
 * The face of a building, drawn once into a texture rather than modelled.
 *
 * Twelve thousand real footprints are cheap as geometry — sixty thousand vertices for the whole city
 * — but putting a window on each of them as geometry is not. The walls are tiled with this instead:
 * one storey tall, four metres wide, so a UV is nothing more than "how far along this wall, and how
 * many floors up". A building three storeys high gets three rows of windows because its UVs say so.
 */

/** One tile is one storey by one window bay, in metres. The extruder maps UVs in these units. */
export const STOREY_HEIGHT = 3.1
export const BAY_WIDTH = 4.2

const TILE = 128

/** A window with a frame and a sill, painted into one tile of the wall texture. */
export function facadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const context = canvas.getContext('2d')

  if (context) {
    // The wall itself is white so the per-building vertex colour decides what the wall is made of.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, TILE, TILE)

    // A band at the floor line: the shadow gap between one storey's render and the next.
    context.fillStyle = 'rgba(0, 0, 0, 0.16)'
    context.fillRect(0, TILE - 5, TILE, 5)
    context.fillStyle = 'rgba(255, 255, 255, 0.55)'
    context.fillRect(0, TILE - 9, TILE, 4)

    const left = TILE * 0.26
    const top = TILE * 0.2
    const width = TILE * 0.48
    const height = TILE * 0.46

    // The reveal: the wall's own thickness around the opening, which is what reads as depth.
    context.fillStyle = 'rgba(0, 0, 0, 0.34)'
    context.fillRect(left - 4, top - 4, width + 8, height + 8)

    const glass = context.createLinearGradient(left, top, left + width, top + height)
    glass.addColorStop(0, '#5b7380')
    glass.addColorStop(0.45, '#8ba3ae')
    glass.addColorStop(0.46, '#4d6472')
    glass.addColorStop(1, '#3d515e')
    context.fillStyle = glass
    context.fillRect(left, top, width, height)

    // Frame, mullion and sill.
    context.strokeStyle = 'rgba(250, 250, 248, 0.9)'
    context.lineWidth = 3
    context.strokeRect(left, top, width, height)
    context.beginPath()
    context.moveTo(left + width / 2, top)
    context.lineTo(left + width / 2, top + height)
    context.stroke()
    context.fillStyle = 'rgba(252, 252, 250, 0.95)'
    context.fillRect(left - 4, top + height, width + 8, 4)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

/**
 * What a window emits after dark, as a mask on the same tiles. The wall is black here and only the
 * glass is lit, so raising the material's emissive lights the windows rather than the whole façade —
 * which is what a single flat emissive did, and why the city read as a row of lanterns.
 */
export function windowLightTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const context = canvas.getContext('2d')

  if (context) {
    context.fillStyle = '#000000'
    context.fillRect(0, 0, TILE, TILE)
    const left = TILE * 0.26
    const top = TILE * 0.2
    const width = TILE * 0.48
    const height = TILE * 0.46
    const glow = context.createRadialGradient(left + width / 2, top + height / 2, 2, left + width / 2, top + height / 2, width * 0.8)
    glow.addColorStop(0, 'rgba(255, 228, 170, 1)')
    glow.addColorStop(0.55, 'rgba(255, 210, 140, 0.85)')
    glow.addColorStop(1, 'rgba(255, 190, 110, 0)')
    context.fillStyle = glow
    context.fillRect(left - 10, top - 10, width + 20, height + 20)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}
