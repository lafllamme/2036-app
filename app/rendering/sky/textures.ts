import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'

/** Everything in the sky that is painted rather than modelled, drawn once into a canvas. */

/** How much of the sun sprite is solid core before the bloom starts, and the same for the moon's face. */
const SUN_CORE = 0.26
const MOON_FACE = 0.34

/** One square canvas, painted by the caller and handed back as a texture. */
export function paint(draw: (context: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context)
    draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Sun and moon are sprites, not spheres: at three degrees across a sphere is a disc anyway, and a
 * sprite never turns its lit side away from the player. They sit outside the ground plane so they
 * rise and set at the true horizon, write no depth, and are lit by nothing.
 */

/**
 * The sun: a solid core out to a sixth of the sprite, then light thinning into the sky around it.
 * Painting the bloom into the texture is what makes the sun read as a source rather than a sticker.
 */
export function sunTexture(): THREE.CanvasTexture {
  return paint((context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(SUN_CORE, 'rgba(255, 255, 255, 1)')
    for (let step = 1; step <= 20; step += 1) {
      const k = step / 20
      gradient.addColorStop(SUN_CORE + (1 - SUN_CORE) * k, `rgba(255, 255, 255, ${0.94 * (1 - k) ** 2.6})`)
    }
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  })
}

/**
 * The moon's face, drawn once: a pale disc with a handful of soft maria and a faint halo beyond its
 * rim. Seeded, so the same city always gets the same moon, and stylised rather than photographic —
 * it is read at three degrees wide.
 */

/**
 * The moon's face, drawn once: a pale disc with a handful of soft maria and a faint halo beyond its
 * rim. Seeded, so the same city always gets the same moon, and stylised rather than photographic —
 * it is read at three degrees wide.
 */
export function moonTexture(seed: number): THREE.CanvasTexture {
  return paint((context, size) => {
    const rng = createRandomStream(seed, 'moon')
    const centre = size / 2
    const face = size * MOON_FACE

    // The glow first, so the face paints over it.
    const glow = context.createRadialGradient(centre, centre, face * 0.9, centre, centre, centre)
    glow.addColorStop(0, 'rgba(198, 214, 240, 0.42)')
    glow.addColorStop(0.45, 'rgba(178, 196, 226, 0.12)')
    glow.addColorStop(1, 'rgba(170, 190, 222, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, size, size)

    const disc = context.createRadialGradient(centre, centre, 0, centre, centre, face)
    disc.addColorStop(0, 'rgba(250, 250, 246, 1)')
    disc.addColorStop(0.84, 'rgba(228, 230, 234, 1)')
    disc.addColorStop(0.97, 'rgba(206, 212, 222, 1)')
    disc.addColorStop(1, 'rgba(206, 212, 222, 0)')
    context.fillStyle = disc
    context.beginPath()
    context.arc(centre, centre, face, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.beginPath()
    context.arc(centre, centre, face * 0.98, 0, Math.PI * 2)
    context.clip()
    for (let index = 0; index < 9; index += 1) {
      const angle = rng.next() * Math.PI * 2
      const distance = rng.next() ** 0.6 * face * 0.72
      const radius = face * (0.08 + rng.next() * 0.2)
      const x = centre + Math.cos(angle) * distance
      const y = centre + Math.sin(angle) * distance
      const mare = context.createRadialGradient(x, y, 0, x, y, radius)
      mare.addColorStop(0, 'rgba(158, 167, 181, 0.55)')
      mare.addColorStop(1, 'rgba(158, 167, 181, 0)')
      context.fillStyle = mare
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  })
}

/** A soft round glow with no edge, used for the pool a street lamp throws on the road. */

/** A soft round glow with no edge, used for the pool a street lamp throws on the road. */
export function glowTexture(): THREE.CanvasTexture {
  return paint((context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (let step = 0; step <= 16; step += 1) {
      const t = step / 16
      gradient.addColorStop(t, `rgba(255, 255, 255, ${(1 - t) ** 2.4})`)
    }
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  })
}

/** One square canvas, painted by the caller and handed back as a texture. */
