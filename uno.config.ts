import { defineConfig, presetWind4 } from 'unocss'

/*
 * Das Designsystem lebt als Theme-Werte hier; die Regeln dazu stehen in DESIGN.md.
 *
 * Die drei Schriften sind hier definiert und nirgends sonst. UnoCSS gibt sie als echte
 * `font-family`-Deklarationen aus, und genau das lässt @nuxt/fonts sie finden und selbst hosten —
 * ein Familienname, der in einer CSS-Variablen steckt, ist für diesen Scanner unsichtbar.
 *
 * Shortcuts gibt es hier keine mehr. Das eine Flächen-Primitiv und die Bedienelemente stehen als
 * echte Klassen in `app/assets/css/styles.css`, weil sie aus mehrlagigen Schatten und Verläufen
 * bestehen: als Utility-Kette geschrieben wären sie 200 Zeichen im Template und niemand könnte
 * mehr lesen, was da steht. Alles andere CSS liegt im `<style scoped>` seiner Komponente.
 */
export default defineConfig({
  presets: [presetWind4({ preflights: { reset: false } })],

  theme: {
    colors: {
      ink: '#f4f2ec',
      dim: 'rgba(244,242,236,0.66)',
      faint: 'rgba(244,242,236,0.40)',
      ground: '#04070a',
      positive: '#86d8b8',
      negative: '#ff8f6b',
    },
    font: {
      display: '"Supreme", "Avenir Next", system-ui, sans-serif',
      text: '"Switzer", "Avenir Next", system-ui, sans-serif',
      mono: '"Geist Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    radius: {
      pod: '26px',
      card: '30px',
      inner: '16px',
    },
  },

  /*
   * Unbedingt ausgegeben, damit das Stylesheet sie benennen kann und @nuxt/fonts immer alle drei
   * sieht — auch bevor eine Komponente die Utility zufällig benutzt.
   */
  safelist: ['font-display', 'font-text', 'font-mono'],
})
