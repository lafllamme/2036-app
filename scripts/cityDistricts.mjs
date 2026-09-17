/**
 * Die Viertel von Lindenhafen, aus echten Ortsteilgrenzen.
 *
 * Bis hierher waren es acht **Rechtecke**, von Hand in ein 3 × 3-Raster gelegt und über einen echten
 * Stadtgrundriss gespannt. Aus der Kartenansicht sah man genau das: eine Stadt aus Kästen. Eine
 * Grenze ist aber nie ein Rechteck — sie läuft am Fluss entlang, an der Bahn, an der Ausfallstraße,
 * und sie hat einen Zipfel dort, wo vor hundert Jahren eine Gemeinde endete.
 *
 * OpenStreetMap führt das als `boundary=administrative` mit `admin_level=11`: die Ortsteile. Im
 * 4 × 4-km-Ausschnitt liegen dreißig davon, und sie decken ihn **lückenlos** ab. Übernommen wird
 * davon nur die Geometrie — die Namen sind erfunden, wie der Rest der Stadt.
 *
 * ## Warum zwanzig und nicht dreißig
 *
 * Zehn der dreißig sind Randsplitter: Hulsberg liegt mit 2,2 % seiner Fläche im Ausschnitt,
 * Habenhausen mit 5,2 ha. Ein Viertel, das zu einem Zwanzigstel im Bild liegt, ist kein Ort, an dem
 * man etwas bauen kann — es ist ein Streifen am Rand mit einem Namen. Alles unter 25 Hektar fällt
 * deshalb weg und geht an den nächsten Nachbarn; zusammen sind das 5 % der Fläche und sie liegen
 * sämtlich in den Ecken.
 *
 * Zwanzig ist auch spielbar: genug, dass die Karte nach Stadt aussieht, wenig genug, dass „wo soll
 * das hin?" eine Entscheidung bleibt und keine Liste.
 */

import { Buffer } from 'node:buffer'

/**
 * Was ein Viertel mindestens im Ausschnitt haben muss, um eins zu sein.
 *
 * 20 Hektar ist ein Quadrat von 450 Metern — ein Ort, an dem etwas stehen kann. Darunter liegen
 * genau die zehn Splitter, von denen keiner mehr als die Hälfte seiner echten Fläche im Bild hat.
 */
const MIN_AREA = 200_000

/**
 * Welcher echte Ortsteil welches Viertel von Lindenhafen wird.
 *
 * Die Zuordnung ist keine Übersetzung, sondern eine Besetzung: der Ortsteil bringt seine Lage, seine
 * Grenze und seinen Zuschnitt mit, Lindenhafen den Namen und alles, was die Simulation daran hängt.
 * Dass die Universität dort steht, wo in der Vorlage tatsächlich Hochschulen stehen, ist Absicht —
 * eine Stadt, deren Nutzungen quer zu ihrem Grundriss liegen, sieht man an jeder Straßenecke an.
 */
export const DISTRICT_NAMES = {
  'Altstadt': { id: 'altstadt', name: 'Altstadt', short: 'Altstadt', type: 'historic-core' },
  'Bahnhofsvorstadt': { id: 'bahnhofsviertel', name: 'Bahnhofsviertel', short: 'Bahnhof', type: 'mixed-transit' },
  'Alte Neustadt': { id: 'neustadt', name: 'Neustadt', short: 'Neustadt', type: 'dense-residential' },
  'Ostertor': { id: 'lindentor', name: 'Lindentor', short: 'Lindentor', type: 'dense-residential' },
  'Bürgerpark': { id: 'stadtgarten', name: 'Stadtgarten', short: 'Stadtgarten', type: 'civic-green' },
  'Huckelriede': { id: 'kleinfeld', name: 'Kleinfeld', short: 'Kleinfeld', type: 'post-war-estate' },
  'Überseestadt': { id: 'speicherstadt', name: 'Speicherstadt', short: 'Speicher', type: 'regenerated-docks' },
  'Neuenland': { id: 'marschland', name: 'Marschland', short: 'Marsch', type: 'fringe' },
  'Findorff-Bürgerweide': { id: 'messeviertel', name: 'Messeviertel', short: 'Messe', type: 'mixed-fair' },
  'Utbremen': { id: 'westerfeld', name: 'Westerfeld', short: 'Westerfeld', type: 'dense-residential' },
  'Buntentor': { id: 'buntenhorst', name: 'Buntenhorst', short: 'Buntenhorst', type: 'residential' },
  'Steintor': { id: 'steinviertel', name: 'Steinviertel', short: 'Steinviertel', type: 'mixed-quarter' },
  'Neustadt': { id: 'hohenfeld', name: 'Hohenfeld', short: 'Hohenfeld', type: 'residential' },
  'Fesenfeld': { id: 'fesenau', name: 'Fesenau', short: 'Fesenau', type: 'dense-residential' },
  'Gartenstadt Süd': { id: 'gartenstadt', name: 'Gartenstadt', short: 'Gartenstadt', type: 'garden-suburb' },
  'Hohentor': { id: 'hafentor', name: 'Hafentor', short: 'Hafentor', type: 'mixed-quarter' },
  'Barkhof': { id: 'universitaetsviertel', name: 'Universitätsviertel', short: 'Universität', type: 'civic-campus' },
  'Hohentorshafen': { id: 'werfthafen', name: 'Werfthafen', short: 'Werfthafen', type: 'industrial' },
  'Woltmershausen': { id: 'wolterdeich', name: 'Wolterdeich', short: 'Wolterdeich', type: 'industrial' },
  'Südervorstadt': { id: 'suedring', name: 'Südring', short: 'Südring', type: 'residential' },
}

/**
 * Die Wege einer Grenzrelation zu geschlossenen Ringen zusammensetzen.
 *
 * Eine Relation liefert ihre Außengrenze als Haufen einzelner Wege in beliebiger Richtung und
 * beliebiger Reihenfolge — so, wie sie über die Jahre eingetragen wurden. Zusammengehängt wird an
 * den Endpunkten, und zwar in allen vier möglichen Richtungen, sonst bleibt bei jedem zweiten
 * Viertel ein halber Ring übrig.
 */
function ringsOf(relation, project) {
  const open = relation.members
    .filter(member => member.role === 'outer' && member.geometry)
    .map(member => member.geometry.map(point => project(point)))
  const rings = []

  while (open.length > 0) {
    let ring = open.shift()
    for (let joined = true; joined;) {
      joined = false
      for (let i = 0; i < open.length; i += 1) {
        const way = open[i]
        const head = ring[0]
        const tail = ring[ring.length - 1]
        if (near(tail, way[0]))
          ring = ring.concat(way.slice(1))
        else if (near(tail, way[way.length - 1]))
          ring = ring.concat(way.slice(0, -1).reverse())
        else if (near(head, way[way.length - 1]))
          ring = way.slice(0, -1).concat(ring)
        else if (near(head, way[0]))
          ring = way.slice(1).reverse().concat(ring)
        else continue
        open.splice(i, 1)
        joined = true
        break
      }
    }
    rings.push(ring)
  }
  return rings
}

function near(a, b) {
  return Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5
}

/** Der Kasten um einen Ring. Steht einmal hier, weil ihn drei Stellen brauchen. */
function boxOf(ring) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ }
}

function areaOf(ring) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1)
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return Math.abs(sum) / 2
}

/** Sutherland–Hodgman gegen das Quadrat des Ausschnitts. Vier Durchgänge, einer je Kante. */
function clipToSquare(ring, extent) {
  const inside = (point, edge) => [point[0] >= -extent, point[0] <= extent, point[1] >= -extent, point[1] <= extent][edge]
  const cut = (a, b, edge) => {
    if (edge < 2) {
      const x = edge === 0 ? -extent : extent
      return [x, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]
    }
    const z = edge === 2 ? -extent : extent
    return [a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), z]
  }

  let out = ring
  for (let edge = 0; edge < 4 && out.length > 0; edge += 1) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i += 1) {
      const previous = input[(i - 1 + input.length) % input.length]
      const current = input[i]
      if (inside(current, edge)) {
        if (!inside(previous, edge))
          out.push(cut(previous, current, edge))
        out.push(current)
      }
      else if (inside(previous, edge)) {
        out.push(cut(previous, current, edge))
      }
    }
  }
  return out
}

/**
 * Punkte wegwerfen, die auf der Geraden zwischen ihren Nachbarn liegen — etwas gröber als bei einem
 * Grundriss, weil eine Bezirksgrenze über Kilometer läuft und auf dem Schirm ein Polygonzug ist.
 *
 * Aber nur etwas. Mit sechs Metern Toleranz verlor das Universitätsviertel 45 % seiner Fläche: was
 * an einer Hauswand eine überflüssige Stützstelle ist, ist an einer Bezirksgrenze eine Ecke, an der
 * zwei Straßenzüge aufeinandertreffen. Zwei Meter lassen die Form stehen und kosten trotzdem nur
 * siebenhundert Punkte für zwanzig Viertel.
 */
function thin(ring, tolerance = 2) {
  const out = []
  for (let i = 0; i < ring.length; i += 1) {
    const previous = ring[(i - 1 + ring.length) % ring.length]
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]
    const cross = Math.abs((current[0] - previous[0]) * (next[1] - previous[1]) - (current[1] - previous[1]) * (next[0] - previous[0]))
    const span = Math.hypot(next[0] - previous[0], next[1] - previous[1])
    if (span < 0.01 || cross / span > tolerance)
      out.push(current)
  }
  return out.length >= 4 ? out : ring
}

/**
 * Der Punkt, an dem der Name steht.
 *
 * Nicht der Flächenschwerpunkt: der liegt bei einem L-förmigen oder um einen Park gebogenen Viertel
 * außerhalb davon, und die Beschriftung stünde im Nachbarbezirk. Genommen wird der Punkt im Inneren,
 * der am weitesten von jeder Grenze entfernt ist — über ein Raster gesucht, weil das in zehn Zeilen
 * geht und einmal beim Bauen läuft.
 */
function poleOfInaccessibility(ring, step = 25) {
  const box = boxOf(ring)
  const { minX, maxX, minZ, maxZ } = box
  let best = [(minX + maxX) / 2, (minZ + maxZ) / 2]
  let bestDistance = -Infinity
  for (let x = minX; x <= maxX; x += step) {
    for (let z = minZ; z <= maxZ; z += step) {
      if (!contains(ring, x, z))
        continue
      const distance = edgeDistance(ring, x, z)
      if (distance > bestDistance) {
        bestDistance = distance
        best = [x, z]
      }
    }
  }
  return best
}

function contains(ring, x, z) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside
  }
  return inside
}

function edgeDistance(ring, x, z) {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    const dx = xj - xi
    const dz = zj - zi
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(x - (xi + t * dx), z - (zi + t * dz)))
  }
  return best
}

/**
 * Und der Index, mit dem das Spiel fragt „in welchem Viertel liegt dieser Punkt?".
 *
 * Gefragt wird das rund fünfzigtausend Mal beim Laden — einmal je Gebäude — und danach bei jedem
 * Einsatz, jedem Standort und jedem Umbau. Punkt-in-Polygon gegen zwanzig Ringe mit zusammen
 * siebenhundert Stützpunkten wäre dafür die falsche Antwort.
 *
 * Also einmal hier ein Raster brennen: 256 × 256 Zellen über den Ausschnitt, ein Byte je Zelle, das
 * ist der Bezirksindex. Fünfzehn Meter Kantenlänge — feiner als jedes Gebäude, und das Ganze ist
 * 64 kB. Die Abfrage im Spiel sind zwei Divisionen und ein Feldzugriff.
 *
 * Zellen, die in keinem der zwanzig liegen — die zehn weggefallenen Splitter und die Ränder —
 * bekommen den nächsten Bezirk, über eine Welle vom belegten Gebiet aus. Damit gibt es im ganzen
 * Quadrat keinen Punkt ohne Viertel, und der Landstrich außerhalb der Stadt bekommt seinen auch.
 */
const GRID = 256

function buildGrid(districts, extent) {
  const cell = (extent * 2) / GRID
  const data = new Uint8Array(GRID * GRID).fill(255)

  districts.forEach((district, index) => {
    const { minX, maxX, minZ, maxZ } = boxOf(district.ring)
    const from = value => Math.max(0, Math.floor((value + extent) / cell))
    const to = value => Math.min(GRID - 1, Math.ceil((value + extent) / cell))
    for (let row = from(minZ); row <= to(maxZ); row += 1) {
      for (let column = from(minX); column <= to(maxX); column += 1) {
        if (data[row * GRID + column] !== 255)
          continue
        const x = -extent + (column + 0.5) * cell
        const z = -extent + (row + 0.5) * cell
        if (contains(district.ring, x, z))
          data[row * GRID + column] = index
      }
    }
  })

  // Die Welle: was noch frei ist, bekommt den Bezirk der nächsten belegten Nachbarzelle.
  let frontier = []
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] !== 255)
      frontier.push(i)
  }
  while (frontier.length > 0) {
    const next = []
    for (const at of frontier) {
      const row = Math.floor(at / GRID)
      const column = at % GRID
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const r = row + dr
        const c = column + dc
        if (r < 0 || r >= GRID || c < 0 || c >= GRID)
          continue
        const to = r * GRID + c
        if (data[to] !== 255)
          continue
        data[to] = data[at]
        next.push(to)
      }
    }
    frontier = next
  }

  return { size: GRID, data: Buffer.from(data).toString('base64') }
}

/**
 * Aus der Grenz-Relation-Datei die Viertel bauen.
 *
 * Gibt zurück, was in `lindenhafen.json` landet: je Viertel sein Polygon in Metern, sein Kasten,
 * sein Beschriftungspunkt und seine Fläche — plus das Raster, mit dem das Spiel Punkte zuordnet.
 */
export function buildDistricts(raw, project, extent) {
  const found = []
  for (const element of raw.elements) {
    if (element.type !== 'relation' || !element.members)
      continue
    const identity = DISTRICT_NAMES[element.tags?.name]
    if (!identity)
      continue
    const rings = ringsOf(element, project)
    if (rings.length === 0)
      continue
    // Ein Ortsteil kann eine Exklave haben; gespielt wird auf der größten Fläche.
    const biggest = rings.reduce((best, ring) => (areaOf(ring) > areaOf(best) ? ring : best))
    const clipped = thin(clipToSquare(biggest, extent))
    const area = areaOf(clipped)
    if (clipped.length < 3 || area < MIN_AREA)
      continue
    found.push({ identity, ring: clipped, area })
  }

  found.sort((a, b) => b.area - a.area)

  const districts = found.map(({ identity, ring, area }) => {
    const { minX, maxX, minZ, maxZ } = boxOf(ring)
    const [labelX, labelZ] = poleOfInaccessibility(ring)
    return {
      ring,
      id: identity.id,
      name: identity.name,
      short: identity.short,
      type: identity.type,
      p: ring.flatMap(([x, z]) => [Math.round(x), Math.round(z)]),
      b: [Math.round(minX), Math.round(maxX), Math.round(minZ), Math.round(maxZ)],
      c: [Math.round(labelX), Math.round(labelZ)],
      /** Hektar, gerundet — die Zahl, aus der die Einwohnerzahl des Viertels folgt. */
      ha: Math.round(area / 10_000),
    }
  })

  const grid = buildGrid(districts, extent)
  return { districts: districts.map(({ ring, ...rest }) => rest), grid }
}
