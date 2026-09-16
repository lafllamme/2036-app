/**
 * Schalter, die man an die Adresse hängt.
 *
 * Es gab schon einen — `?webgl` zwingt den Renderer auf WebGL statt WebGPU —, aber er stand als
 * `new URLSearchParams(location.search).has(...)` mitten im Konstruktor des Renderers. Der zweite
 * Schalter hätte daneben gestanden, der dritte auch, und ab dann sucht man sie einzeln.
 *
 * Hier stehen sie zusammen, einmal gelesen. Auf dem Server gibt es kein `location`, also ist dort
 * alles aus; das ist richtig so und kein Sonderfall, den jemand behandeln müsste.
 */

export interface DebugFlags {
  /** `?webgl` — WebGL statt WebGPU, zum Vergleichen und für Playwright. */
  webgl: boolean
  /**
   * `?bench` — der Messstand.
   *
   * Die Stadt wird gebaut und angezeigt, aber **die Kampagne läuft nicht**: keine Uhr, keine
   * Monatswechsel, keine Vorlagen, die mitten in eine Messung springen und das Bild zuklappen.
   * Genau daran sind die letzten Messungen gescheitert — eine aufspringende Abstimmung verdeckt die
   * halbe Stadt, und was man dann misst, ist ein anderes Bild als das, das man messen wollte.
   */
  bench: boolean
}

const NONE: DebugFlags = { webgl: false, bench: false }

let cached: DebugFlags | null = null

export function debugFlags(): DebugFlags {
  if (cached)
    return cached
  if (typeof window === 'undefined')
    return NONE
  const query = new URLSearchParams(window.location.search)
  cached = { webgl: query.has('webgl'), bench: query.has('bench') }
  return cached
}
