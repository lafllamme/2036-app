import * as THREE from 'three/webgpu'

/**
 * The handful of values every part of the scene shares. They are module constants rather than
 * locals because they are read inside placement loops that run tens of thousands of times, and a
 * fresh vector per instance is a fresh object for the collector to sweep.
 */

/** Instanced meshes whose material the renderer animates directly, typed so no cast is needed. */
export type StandardInstancedMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>

/** The axis everything in a city rotates around. */
export const AXIS_Y = /* @__PURE__ */ new THREE.Vector3(0, 1, 0)
/** The neutral instance colour: the texture atlas carries the colour, this only leaves it alone. */
export const WHITE = /* @__PURE__ */ new THREE.Color('#ffffff')
/** Lays a plane flat on the ground. */
export const FLAT = /* @__PURE__ */ new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
