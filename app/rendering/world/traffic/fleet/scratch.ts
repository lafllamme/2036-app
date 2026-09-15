/**
 * Objects reused across every call, so that a pass over fifteen hundred travellers allocates nothing.
 *
 * Shared between the parts of the fleet on purpose. A `Matrix4` per traveller per tick is sixty
 * thousand allocations a second, and the garbage collector's answer to that is a hitch every few
 * seconds — which is the one thing a city that never stops moving cannot have.
 *
 * The rule that comes with them: nothing may hold a reference to one of these past the end of its
 * own call.
 */

import * as THREE from 'three/webgpu'

export const matrix = /* @__PURE__ */ new THREE.Matrix4()
export const quaternion = /* @__PURE__ */ new THREE.Quaternion()
export const position = /* @__PURE__ */ new THREE.Vector3()
export const scale = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)
export const sample = { x: 0, y: 0, z: 0, ux: 0, uz: 1 }

/** A mount is never scaled; the figure on it is. Hoisted so `place` composes without allocating. */
export const MOUNT_SCALE = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

/**
 * How many mounts have been written this pass.
 *
 * An object rather than a `let`, because an ES module export is a read-only binding and this counter
 * is reset by `drive`, raised by `place` and read back by `drive` — three modules, one number.
 */
export const mount = { written: 0 }
