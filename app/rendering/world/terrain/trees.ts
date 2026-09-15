import type { CityBlueprint } from '../../../core/contracts'
import type { CityModels } from '../../cityModels'
import type { StandardInstancedMesh } from '../../shared'
import * as THREE from 'three/webgpu'
import { createRandomStream } from '../../../core/rng'
import { AXIS_Y, WHITE } from '../../shared'

/**
 * Everything that grows, from the nature kit rather than the city kit.
 *
 * The kit has nine trees and two bushes and this used to plant two of them: every park in Lindenhafen
 * was the same tree repeated, which reads as wallpaper however good the model is. A wood is a wood
 * because no two trees in it are the same shape. All eleven are used now, one instanced mesh each,
 * so eleven species across the whole city are eleven draws.
 *
 * They are split into two groups per species for the same reason they always were: the simulation
 * thins the stock as the city spends its green space, and a group has to be thinnable against its own
 * capacity.
 */
export interface CityTrees {
  treeCrowns: StandardInstancedMesh
  treeTrunks: StandardInstancedMesh
  /** Every planting mesh, including the two above, for whatever has to be hidden or counted. */
  planting: StandardInstancedMesh[]
}

/** Roughly how tall a grown tree is, in metres. The kit's own models are about two units. */
const TREE_HEIGHT = 11
/** A bush is not a tree. Anything whose model is this squat is planted at hedge height instead. */
const BUSH_SLENDERNESS = 0.9
const BUSH_HEIGHT = 2.4

export function addTrees(scene: THREE.Scene, blueprint: CityBlueprint, models: CityModels): CityTrees {
  const rng = createRandomStream(blueprint.definition.seed, 'planting')
  /*
   * Its own copy of the material: greenery is tinted as the city spends its green space, and the
   * material is shared with nothing else, so the tint cannot leak into anything but the planting.
   */
  const material = models.natureMaterial.clone()
  material.vertexColors = true

  const pool = models.trees.length > 0 ? models.trees : []
  const planting: StandardInstancedMesh[] = []

  if (pool.length === 0) {
    const empty = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(4.8, 1), material, 1) as StandardInstancedMesh
    empty.count = 0
    scene.add(empty)
    return { treeCrowns: empty, treeTrunks: empty, planting: [empty] }
  }

  /*
   * Deal the stock out between the species, so a wood is mixed rather than a plantation — but not
   * evenly.
   *
   * The kit's trees run from sixty-two triangles to four hundred, and eight thousand of them at the
   * average of an even mix is one and a half million: more than every building in the city, drawn
   * from every camera position, for the thing a player looks at least. Weighting the draw toward the
   * cheaper models keeps all eleven species on screen — which is the whole point of using them — at
   * about half the cost, and the difference between a two-hundred and a four-hundred triangle tree
   * is not something anyone has ever seen from a street.
   *
   * The pick also has to be a *positive* remainder: half the city is west or north of the origin, so
   * the coordinates that go into it are negative, and JavaScript's `%` keeps the sign. Getting that
   * wrong stopped the city loading at all.
   */
  const cost = pool.map(model => Math.max(1, model.geometry.index?.count ?? 600))
  const cheapest = Math.min(...cost)
  const weights = cost.map(triangles => cheapest / triangles)
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  const crews: (typeof blueprint.trees)[] = pool.map(() => [])
  blueprint.trees.forEach((tree, index) => {
    let roll = (((index * 2_654_435_761) >>> 0) / 0x1_0000_0000) * total
    let chosen = 0
    while (chosen < weights.length - 1 && roll > weights[chosen]!) {
      roll -= weights[chosen]!
      chosen += 1
    }
    crews[chosen]!.push(tree)
  })

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  pool.forEach((model, index) => {
    const crew = crews[index]!
    if (crew.length === 0)
      return
    const wanted = model.slenderness < BUSH_SLENDERNESS ? BUSH_HEIGHT : TREE_HEIGHT
    const base = wanted / Math.max(0.001, model.size.y)

    /*
     * One mesh per species for the whole city, and deliberately not tiled.
     *
     * Tiling was tried here and reverted, which is worth recording. It does cull — only the tiles in
     * front of the camera are drawn — but the set is already cut eleven ways by species, so tiling
     * multiplies it rather than dividing it: eleven species across forty tiles is four hundred and
     * forty meshes, and the overview went from ninety draw calls to twelve hundred. A tree is two
     * hundred triangles; the geometry was never the problem here. A parked car is two thousand, and
     * that is where the tiling belongs.
     */
    const mesh = new THREE.InstancedMesh(model.geometry, material, crew.length) as StandardInstancedMesh
    crew.forEach((tree, instance) => {
      const size = base * tree.scale
      matrix.compose(
        position.set(tree.x, blueprint.relief.height(tree.x, tree.z), tree.z),
        quaternion.setFromAxisAngle(AXIS_Y, rng.next() * Math.PI * 2),
        scale.set(size, size * rng.between(0.85, 1.2), size),
      )
      mesh.setMatrixAt(instance, matrix)
      mesh.setColorAt(instance, WHITE)
    })
    mesh.castShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.computeBoundingSphere()
    scene.add(mesh)
    planting.push(mesh)
  })

  /*
   * The simulation thins two of the groups as the city spends its green space. Which two does not
   * matter — what matters is that the stock visibly goes down — so they are the first and the last,
   * which are different species and in different places.
   */
  return {
    treeCrowns: planting[0]!,
    treeTrunks: planting[planting.length - 1]!,
    planting,
  }
}
