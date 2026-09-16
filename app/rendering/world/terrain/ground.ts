import type { AreaKind, CityBlueprint } from '../../../core/contracts'
import type { Relief } from '../../../world/relief'
import * as THREE from 'three/webgpu'
import { GROUND_SPAN } from '../../../world/relief'
import { fieldAt, groundVariation } from '../../../world/terrain'
import { groundNormalTexture, groundTexture } from './groundTexture'

/**
 * The land, and every piece of ground the map calls something.
 *
 * There is one ground mesh and it is a tessellation of `Relief`, vertex for vertex — the same grid
 * that answers when anything asks how high the ground is. That is not tidiness, it is the fix: as
 * long as the mesh and the answer were built separately they were different surfaces, and buildings
 * stood in ground that was somewhere else. See `app/world/relief.ts`.
 *
 * It used to be two meshes, a fine plate over the city and a coarse warped ring around it, drawn
 * over one another in a band a hundred metres wide. In that band they disagreed by up to five
 * metres, which is a step running right round the city, and the hundred and sixty buildings in the
 * corners of the extract that the coarse one was drawn over lost up to three metres of their ground
 * floor. One grid has no band and no seam.
 *
 * On top of it lie the land-use polygons the map actually has — parks, grass, works, rail yards —
 * subdivided until no triangle spans more than about thirty metres, because a flat sheet over a
 * three-hundred-metre park sinks into the hill in the middle of it and the park disappears.
 */

/**
 * Land use sits just above the ground and below the roads.
 *
 * The step between overlapping polygons has to stay tiny. At a sixth of a centimetre each it was
 * four hundred and seventy of them, which lifted the last park three quarters of a metre into the
 * air — above the roads, which then vanished under the grass.
 */
const AREA_Y = 0.02
const AREA_STEP = 0.00008
/** No triangle of land use spans more than this, so the surface follows the ground under it. */
const AREA_SPAN = 30
/** Four splits turn one triangle into two hundred and fifty-six. Nothing needs more. */
const AREA_DEPTH_LIMIT = 4

const AREA_COLOURS: Record<AreaKind, string> = {
  water: '#2d556b',
  park: '#55713f',
  pitch: '#5f8044',
  forest: '#3e5d36',
  grass: '#5c6e40',
  industrial: '#5c5b52',
  commercial: '#605d55',
  construction: '#6d6453',
  /*
   * The land a railway runs on. OpenStreetMap tags it `landuse=railway`, which this city read as
   * industrial — so the corridor through the middle of it was painted the brown of a works, and from
   * the air it was a river of mud. It is ballast: a grey with the dust of a hundred years in it.
   */
  railway: '#63605b',
}

/**
 * The land, and the parks, yards and pitches painted on it.
 *
 * Returns the materials rather than keeping them to itself, because they are what snow settles on:
 * whitening a material that is already in the scene costs nothing at all, and it is the difference
 * between a January you can see from the overview and one you can only read in the thermometer.
 */
export function addGround(scene: THREE.Scene, blueprint: CityBlueprint): THREE.MeshStandardMaterial[] {
  const material = new THREE.MeshStandardMaterial({
    map: groundTexture(),
    normalMap: groundNormalTexture(),
    normalScale: new THREE.Vector2(0.85, 0.85),
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
  })
  material.map!.repeat.set(GROUND_SPAN / 46, GROUND_SPAN / 46)
  material.normalMap!.repeat.set(GROUND_SPAN / 9, GROUND_SPAN / 9)

  scene.add(land(blueprint.relief, material))
  return [material, addAreas(scene, blueprint)]
}

/**
 * The whole of the land, as one mesh.
 *
 * Every vertex sits on a coordinate the relief already knows about and carries the height the relief
 * already answers with, so the mesh is the surface rather than a picture of it. The spacing is the
 * relief field's own across the city and grows outward from there; the texture coordinates stay
 * proportional to the world, so a cell six hundred metres wide at the horizon is not stretched.
 */
function land(relief: Relief, material: THREE.Material): THREE.Mesh {
  const { axis } = relief
  const across = axis.length
  const position: number[] = []
  const uv: number[] = []
  const colour: number[] = []
  const index: number[] = []

  for (let row = 0; row < across; row += 1) {
    for (let column = 0; column < across; column += 1) {
      const x = axis[column]!
      const z = axis[row]!
      position.push(x, relief.height(x, z), z)
      uv.push((x + GROUND_SPAN / 2) / GROUND_SPAN, (z + GROUND_SPAN / 2) / GROUND_SPAN)
      pushShade(colour, x, z, relief.seed)
    }
  }

  for (let row = 0; row < across - 1; row += 1) {
    for (let column = 0; column < across - 1; column += 1) {
      const a = row * across + column
      /*
       * The diagonal runs from the far-x corner to the far-z one. `Relief.height` splits its cells
       * on exactly this diagonal; if the two ever disagreed the ground would answer for one triangle
       * while drawing the other.
       */
      index.push(a, a + across, a + 1, a + 1, a + across, a + across + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

/**
 * Welche Farbe der Boden hier hat.
 *
 * Eine einzige Fläche über zwanzig Kilometer liest sich als Teppich, wie gut die Textur darauf auch
 * ist — der weiche Verlauf über anderthalb Kilometer, der hier stand, hat daran nichts geändert.
 * Aus zweitausend Metern Höhe fehlte der Landschaft **jeder Maßstab**: keine Kante, nichts, woran
 * das Auge eine Entfernung abschätzen könnte.
 *
 * Also die Feldflur, die es in Wirklichkeit ist. `fieldAt` legt einen verzogenen Schlag von
 * durchschnittlich 240 Metern unter jeden Punkt und sagt, was darauf steht; der große Verlauf bleibt
 * darunter liegen, damit eine Kuppe weiterhin trockener ist als die Senke daneben. Der Feldrand wird
 * abgedunkelt — ein Saum, ein Graben, ein Knick —, denn genau diese Kante ist das, was aus der Höhe
 * überhaupt zu sehen ist.
 *
 * Alles davon steht in der Vertexfarbe, die der Boden ohnehin trägt: **kein Dreieck, kein Draw,
 * keine zweite Textur.**
 */
function pushShade(colour: number[], x: number, z: number, seed: number): void {
  const variation = groundVariation(x, z, seed)
  const dry = 0.82 + variation * 0.36
  const { crop, edge } = fieldAt(x, z, seed)
  /*
   * Der Saum am Feldrand. Zwölf Prozent der halben Schlagbreite, weich auslaufend — hart wäre ein
   * Gitter, und ein Feldrand ist keine Linie, sondern ein Streifen, auf dem nichts geerntet wird.
   */
  const hem = 1 - 0.26 * Math.max(0, 1 - edge / 0.12)
  // Geschrieben wird linear, nicht sRGB — die Fruchtfarben in `terrain.ts` sind es ebenfalls.
  colour.push(
    crop[0] * dry * hem,
    crop[1] * dry * (1.05 - variation * 0.12) * hem,
    crop[2] * dry * hem,
  )
}

/**
 * Every land-use polygon, laid on the ground and merged into one mesh.
 *
 * They are drawn in the order the converter sorted them — largest first — so a park inside a works
 * still reads as a park. Four hundred and seventy polygons, one draw call.
 */
function addAreas(scene: THREE.Scene, blueprint: CityBlueprint): THREE.MeshStandardMaterial {
  const relief = blueprint.relief
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const tint = new THREE.Color()
  const contour: THREE.Vector2[] = []

  blueprint.areas.forEach((area, order) => {
    // Water has its own surface, its own material and its own movement; see `water.ts`.
    if (area.kind === 'water')
      return
    const ring = area.polygon
    if (ring.length < 6)
      return

    contour.length = 0
    for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []) as [number, number, number][]
    if (triangles.length === 0)
      return

    tint.set(AREA_COLOURS[area.kind])
    /*
     * A hair of height per polygon in draw order. They overlap constantly in real data — a pitch
     * inside a park inside a grass field — and coplanar overlapping polygons is the one thing a
     * depth buffer cannot resolve at any precision.
     */
    const lift = AREA_Y + order * AREA_STEP

    for (const triangle of triangles) {
      // Flipped for the same reason the roofs are: a ring wound counter-clockwise on a map faces
      // away from a camera looking down on it once its y and z change places.
      const a = contour[triangle[2]]!
      const b = contour[triangle[1]]!
      const c = contour[triangle[0]]!
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
      const depth = Math.min(AREA_DEPTH_LIMIT, Math.max(0, Math.ceil(Math.log2(longest / AREA_SPAN))))
      split(a, b, c, depth, (px, pz) => {
        const at = position.length / 3
        position.push(px, lift + relief.height(px, pz), pz)
        normal.push(0, 1, 0)
        uv.push(px / 22, pz / 22)
        colour.push(tint.r, tint.g, tint.b)
        index.push(at)
      })
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()

  const texture = groundTexture()
  texture.repeat.set(1, 1)
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  scene.add(mesh)
  return material
}

/**
 * Cut a triangle into four, `depth` times over, and hand every corner to `emit`.
 *
 * Every edge is split at its midpoint, so two triangles that shared an edge before the split share
 * both halves of it afterwards — there is no crack between them as long as they were cut the same
 * number of times, which is why the depth is worked out from the triangle and not from the piece.
 */
function split(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth: number, emit: (x: number, z: number) => void): void {
  if (depth <= 0) {
    emit(a.x, a.y)
    emit(b.x, b.y)
    emit(c.x, c.y)
    return
  }
  const ab = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5)
  const bc = new THREE.Vector2().addVectors(b, c).multiplyScalar(0.5)
  const ca = new THREE.Vector2().addVectors(c, a).multiplyScalar(0.5)
  split(a, ab, ca, depth - 1, emit)
  split(ab, b, bc, depth - 1, emit)
  split(ca, bc, c, depth - 1, emit)
  split(ab, bc, ca, depth - 1, emit)
}
