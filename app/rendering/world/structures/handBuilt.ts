import * as THREE from 'three/webgpu'

/**
 * Was kein Kit hergibt, von Hand.
 *
 * Ein Kahn, ein Windrad, ein Kühlturm — für die drei gibt es in keinem der CC0-Packs ein Modell, und
 * sie sind auch alle zu einfach, um eines zu verdienen. Ein Kühlturm ist eine gedrehte Kurve, ein
 * Windradflügel ein verjüngter Kasten. Was sie brauchen, ist nicht ein Modell, sondern **zwei
 * Handgriffe**, und die stehen hier, weil sie sonst in jeder dieser Dateien noch einmal stünden.
 *
 * `paint` schreibt eine Farbe in die Ecken, damit ein zusammengesetztes Ding aus **einem** Material
 * zeichnet statt aus einem je Teil — das ist der Unterschied zwischen einem Draw und acht. `merge`
 * zieht die Teile danach zu einer Geometrie zusammen.
 */

/** Eine Farbe in alle Ecken schreiben und die Abwicklung wegwerfen, die niemand mehr braucht. */
export function paint(geometry: THREE.BufferGeometry, colour: string): THREE.BufferGeometry {
  const tint = new THREE.Color(colour)
  const count = geometry.attributes.position!.count
  const colours = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    colours[index * 3] = tint.r
    colours[index * 3 + 1] = tint.g
    colours[index * 3 + 2] = tint.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geometry.deleteAttribute('uv')
  return geometry
}

/**
 * Mehrere bemalte Teile zu einer Geometrie zusammenziehen.
 *
 * Von Hand statt mit `BufferGeometryUtils`, weil die Teile hier garantiert dieselben drei Attribute
 * in derselben Reihenfolge haben und der Import sonst der einzige Grund wäre, das Paket zu laden.
 * Unindizierte Teile bekommen ihren Index dabei nachgereicht, damit das Ergebnis einheitlich ist.
 */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = parts.reduce((sum, part) => sum + part.attributes.position!.count, 0)
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const colour = new Float32Array(total * 3)
  const index: number[] = []

  let written = 0
  for (const part of parts) {
    const source = part.attributes.position as THREE.BufferAttribute
    position.set(source.array as Float32Array, written * 3)
    normal.set((part.attributes.normal as THREE.BufferAttribute).array as Float32Array, written * 3)
    colour.set((part.attributes.color as THREE.BufferAttribute).array as Float32Array, written * 3)
    const parent = part.getIndex()
    if (parent) {
      for (let i = 0; i < parent.count; i += 1)
        index.push(parent.getX(i) + written)
    }
    else {
      for (let i = 0; i < source.count; i += 1)
        index.push(i + written)
    }
    written += source.count
    part.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  merged.setAttribute('color', new THREE.BufferAttribute(colour, 3))
  merged.setIndex(index)
  return merged
}
