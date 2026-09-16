import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { advanceMonths, createInitialState } from '../../app/simulation/model'

/**
 * Der Stadtfunk meldete etwa eine Zeile im Monat — bei fünf realen Minuten je Monat also eine Stadt,
 * die zwölf Minuten schweigt. Hier steht, was die Meldungsschicht daraus macht, und die Grenzen nach
 * beiden Seiten: zu wenig ist Langeweile, zu viel ist Rauschen, das niemand mehr liest.
 */
describe('stadtfunk', () => {
  it('redet regelmäßig, aber nicht ununterbrochen', () => {
    const runs = 6
    const perMonth: number[] = []
    let silent = 0
    let months = 0
    const kinds = new Set<string>()
    let breaking = 0
    let fromBulletin = 0
    let breakingBulletin = 0

    for (let run = 0; run < runs; run += 1) {
      let state = createInitialState(300 + run, 'gruene', [])
      for (let month = 0; month < 132; month += 1) {
        const before = state.news[0]?.id ?? ''
        state = advanceMonths(state, 1)
        const fresh = state.news.filter(item => item.month === state.month)
        months += 1
        perMonth.push(fresh.length)
        if (fresh.length === 0)
          silent += 1
        for (const item of fresh) {
          kinds.add(item.headline.split(':')[0] ?? '')
          const own = item.id.startsWith('bulletin-')
          if (own)
            fromBulletin += 1
          if (item.urgency === 'breaking') {
            breaking += 1
            if (own)
              breakingBulletin += 1
          }
        }
        void before
      }
    }

    const mean = perMonth.reduce((s, v) => s + v, 0) / perMonth.length
    writeFileSync('/tmp/bulletin.txt', [
      `${runs} Kampagnen à 132 Monate`,
      `Meldungen je Monat, Mittel   ${mean.toFixed(2)}`,
      `Stumme Monate                ${silent} von ${months} (${Math.round(100 * silent / months)} %)`,
      `Verschiedene Ressorts         ${kinds.size}`,
      `davon aus der Meldungsschicht ${(fromBulletin / months).toFixed(2)} je Monat`,
      `Eilmeldungen je Kampagne      ${(breaking / runs).toFixed(1)}`,
      `davon aus der Meldungsschicht ${(breakingBulletin / runs).toFixed(1)}`,
      '',
      [...kinds].sort().join(' · '),
    ].join('\n'))

    // Genug, dass zwischen zwei Vorlagen etwas passiert …
    expect(mean).toBeGreaterThan(1.5)
    // … und wenig genug, dass die Leiste lesbar bleibt.
    expect(mean).toBeLessThan(6)
    // Ein Monat, in dem die Stadt nichts zu sagen hat, darf die Ausnahme sein, nicht die Regel.
    expect(silent / months).toBeLessThan(0.1)
    // Und es kommt aus der ganzen Stadt, nicht immer aus demselben Amt.
    expect(kinds.size).toBeGreaterThan(8)
    /*
     * Eine Eilmeldung, die jeden Monat kommt, ist keine. Höchstens eine alle vier Monate — sonst ist
     * es keine Dringlichkeitsstufe mehr, sondern eine Schriftgröße.
     */
    expect(breakingBulletin / runs).toBeLessThan(33)
  })
})
