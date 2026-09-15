import * as THREE from 'three/webgpu'

/**
 * A city of people who look like different people.
 *
 * The kit's characters share one palette atlas, and their faces are drawn from a handful of patches
 * in it — the same handful for most of them, so out of twelve characters there are about two skin
 * tones. The first attempt at fixing that multiplied each figure's whole instance colour, which is
 * the only thing an instanced mesh can change per figure. It also multiplies the clothes: a dark
 * skin tone arrived with a brown shirt, and everybody ended up looking like the same person under
 * different lighting, which is exactly what a player said.
 *
 * So the atlas is recoloured instead, once, at load. The nineteen patches the head meshes use and
 * the body meshes do not are shifted in lightness and a little in hue, and everything else in the
 * image is left exactly as it was. Six copies of the atlas, six materials, and a character is drawn
 * with one of them for the life of the session — which costs six materials and not one extra draw,
 * because the meshes were already split per character.
 *
 * Which tone belongs to whom says nothing and is read by nothing. `docs/CITY_LIFE.md` states the
 * rule and `tests/unit/citizens.test.ts` holds it: appearance and origin come out of different
 * streams, because in a city they do not predict each other and a game that linked them would be
 * teaching the player that they do.
 */

/**
 * Every patch of the atlas that is skin.
 *
 * Found rather than guessed: sample each mesh's UVs against the image, keep the colours the heads
 * use and the bodies do not, and take the warm ones — hue between eight and thirty-five degrees. The
 * blue-ish rest is hair and eyes. It has to be this exact list rather than a hue rule applied to the
 * whole image, because the kit dresses people in orange too, and an orange shirt sits in the same
 * band as a face.
 */
const SKIN = [
  '#ecb690',
  '#e9b28c',
  '#e78f65',
  '#ffab42',
  '#d28f68',
  '#ce8b63',
  '#eb6246',
  '#d6805a',
  '#d27d58',
  '#cb7752',
  '#c6724f',
  '#bc6a49',
  '#b76646',
  '#ad5f41',
  '#a55d41',
  '#9e5b41',
  '#9b5a41',
  '#985941',
  '#935841',
]

/**
 * The tones, as a shift applied to whatever the patch already is.
 *
 * A shift rather than a replacement, so the shading ramp inside a face survives: the kit draws a lit
 * side and a shaded side out of two patches, and replacing both with one colour gives a flat mask
 * where a face was. From paler than the kit's own to a good deal deeper, with the hue easing very
 * slightly warmer as it darkens, which is what skin does.
 */
const TONES: { lightness: number, hue: number }[] = [
  { lightness: 1.14, hue: 0.004 },
  { lightness: 1, hue: 0 },
  { lightness: 0.86, hue: -0.003 },
  { lightness: 0.72, hue: -0.006 },
  { lightness: 0.58, hue: -0.009 },
  { lightness: 0.46, hue: -0.012 },
]

/**
 * Build one material per tone, each with its own copy of the atlas.
 *
 * The source material is cloned so that everything about it other than the map — the roughness, the
 * side, the emissive the night lighting drives — stays in one place and cannot drift between tones.
 */
export function complexions(source: THREE.MeshStandardMaterial, atlas: THREE.Texture): THREE.MeshStandardMaterial[] {
  const image = atlas.image as ImageBitmap | HTMLImageElement | undefined
  if (!image || typeof document === 'undefined')
    return [source]

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return [source]
  context.drawImage(image as CanvasImageSource, 0, 0)
  const original = context.getImageData(0, 0, canvas.width, canvas.height)

  return TONES.map((tone) => {
    const shifted = new ImageData(new Uint8ClampedArray(original.data), canvas.width, canvas.height)
    recolour(shifted, tone)
    context.putImageData(shifted, 0, 0)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = atlas.colorSpace
    // Same as the atlas it came from: the palette is read by exact texel and the UVs come from glTF.
    texture.flipY = false
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 4
    texture.needsUpdate = true

    const material = source.clone()
    material.map = texture
    return material
  })
}

/** Shift every skin patch in one image, and nothing else in it. */
function recolour(image: ImageData, tone: { lightness: number, hue: number }): void {
  const table = new Map<number, [number, number, number]>()
  for (const hex of SKIN) {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    table.set((r << 16) | (g << 8) | b, shift(r, g, b, tone))
  }

  const data = image.data
  for (let at = 0; at < data.length; at += 4) {
    const key = (data[at]! << 16) | (data[at + 1]! << 8) | data[at + 2]!
    const to = table.get(key)
    if (!to)
      continue
    data[at] = to[0]
    data[at + 1] = to[1]
    data[at + 2] = to[2]
  }
}

/** One colour, moved in HSL and handed back as bytes. */
function shift(r: number, g: number, b: number, tone: { lightness: number, hue: number }): [number, number, number] {
  const colour = new THREE.Color(r / 255, g / 255, b / 255)
  const hsl = { h: 0, s: 0, l: 0 }
  colour.getHSL(hsl)
  colour.setHSL(
    (hsl.h + tone.hue + 1) % 1,
    Math.min(1, hsl.s * (tone.lightness < 1 ? 1.04 : 0.97)),
    Math.min(0.95, Math.max(0.06, hsl.l * tone.lightness)),
  )
  return [Math.round(colour.r * 255), Math.round(colour.g * 255), Math.round(colour.b * 255)]
}
