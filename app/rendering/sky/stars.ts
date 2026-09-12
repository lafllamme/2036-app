import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../core/rng'

/**
 * A dome of points far outside the city. Only the upper hemisphere is populated, so the horizon
 * stays clean and no star ever appears below the rooftops.
 */
export function createStars(parent: THREE.Object3D, seed: number): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const rng = createRandomStream(seed, 'stars')
  const count = 900
  const positions = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    const azimuth = rng.next() * Math.PI * 2
    // Biased toward the zenith so the band near the horizon stays sparse.
    const height = 0.12 + rng.next() ** 0.7 * 0.88
    const radius = Math.sqrt(Math.max(0, 1 - height * height)) * 4_200
    positions[index * 3] = Math.cos(azimuth) * radius
    positions[index * 3 + 1] = height * 3_000 + 200
    positions[index * 3 + 2] = Math.sin(azimuth) * radius
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: '#dfe7f2', size: 7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
  const stars = new THREE.Points(geometry, material)
  stars.frustumCulled = false
  parent.add(stars)
  return stars
}

/**
 * The sun: a solid core out to a sixth of the sprite, then light thinning into the sky around it.
 * Painting the bloom into the texture is what makes the sun read as a source rather than a sticker.
 */
