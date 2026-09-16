/**
 * Wie lange die Frames gedauert haben, als Zahl statt als Gefühl.
 *
 * Ein Ruckler ist **kein niedriger Durchschnitt**, sondern ein einzelner langer Frame, und ein
 * FPS-Zähler zeigt ihn nie: sechzig Frames zu 1,4 ms und einer zu 87 ms sind zusammen immer noch
 * über hundert Bilder je Sekunde. Gesucht sind also die Ausreißer, und dafür braucht es die
 * Verteilung — Median, p95, p99, längster.
 *
 * Fester Ringpuffer, damit eine lange Sitzung nicht den Speicher füllt, und keine Allokation je
 * Frame: die Werte liegen in einem `Float32Array`, das einmal entsteht. Was während des Messens
 * läuft, darf die Messung nicht verschieben.
 */

/** Ab hier gilt ein Frame als Ruckler. Bei 120 Hz sind 8,3 ms ein Bild, 20 sind also zweieinhalb. */
export const LONG_FRAME_MS = 20

export interface FrameStats {
  frames: number
  median: number
  p95: number
  p99: number
  longest: number
  /** Frames über `LONG_FRAME_MS` — die Zahl, um die es eigentlich geht. */
  long: number
  /** Wie lange davon im Mittel in `renderer.render()` lag. */
  render: number
  /** Und wie lange in allem, was wir selbst rechnen. */
  update: number
}

const EMPTY: FrameStats = { frames: 0, median: 0, p95: 0, p99: 0, longest: 0, long: 0, render: 0, update: 0 }

export class FrameLog {
  private readonly total: Float32Array
  private readonly render: Float32Array
  private written = 0

  constructor(private readonly capacity = 8_192) {
    this.total = new Float32Array(capacity)
    this.render = new Float32Array(capacity)
  }

  /** Einen Frame ablegen. Läuft im Renderpfad, macht also nichts als zwei Zuweisungen. */
  add(total: number, render: number): void {
    const slot = this.written % this.capacity
    this.total[slot] = total
    this.render[slot] = render
    this.written += 1
  }

  reset(): void {
    this.written = 0
  }

  get frames(): number {
    return Math.min(this.written, this.capacity)
  }

  stats(): FrameStats {
    const count = this.frames
    if (count === 0)
      return { ...EMPTY }

    const sorted = Array.from(this.total.subarray(0, count)).sort((a, b) => a - b)
    const at = (share: number): number =>
      round(sorted[Math.min(count - 1, Math.floor(count * share))] ?? 0)

    let renderSum = 0
    let totalSum = 0
    let long = 0
    for (let index = 0; index < count; index += 1) {
      renderSum += this.render[index]!
      totalSum += this.total[index]!
      if (this.total[index]! > LONG_FRAME_MS)
        long += 1
    }

    return {
      frames: count,
      median: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      longest: round(sorted[count - 1] ?? 0),
      long,
      render: round(renderSum / count),
      update: round((totalSum - renderSum) / count),
    }
  }
}

/** Zwei Nachkommastellen. Mehr behauptet eine Zeitmessung im Browser nicht ehrlich. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}
