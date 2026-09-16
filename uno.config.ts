import { defineConfig, presetWind4 } from 'unocss'

/*
 * The design system lives here as theme values and shortcuts; see DESIGN.md for the rules.
 *
 * The three typefaces are defined here and nowhere else. UnoCSS emits them as literal
 * `font-family` declarations, which is what lets @nuxt/fonts discover and self-host them — a family
 * name hidden inside a CSS variable is invisible to that scanner.
 *
 * Bespoke pieces — the ticker marquee, the seat bar, container queries, backdrop-filter stacks —
 * stay in app/assets/css/styles.css, because expressing them as utilities would make the templates
 * harder to read without making the system more consistent.
 */
export default defineConfig({
  presets: [presetWind4({ preflights: { reset: false } })],

  theme: {
    colors: {
      ink: '#f6f3ec',
      dim: '#97a09d',
      ground: '#090d10',
      positive: '#74c9ae',
      negative: '#ef7a60',
    },
    font: {
      display: '"Supreme", "Avenir Next", system-ui, sans-serif',
      text: '"Switzer", "Avenir Next", system-ui, sans-serif',
      mono: '"Geist Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    radius: {
      panel: '24px',
      inner: '14px',
    },
  },

  /*
   * Emitted unconditionally so the stylesheet can alias them and @nuxt/fonts always sees all three,
   * even before a component happens to use the utility.
   */
  safelist: ['font-display', 'font-text', 'font-mono'],

  shortcuts: {
    /** The one surface primitive. Nothing may invent its own panel treatment. */
    'ui-panel': 'bg-[rgba(10,14,17,0.58)] rounded-panel backdrop-blur-[42px] shadow-[0_26px_70px_rgba(0,0,0,0.38)]',
    /** Exactly one of these per region — see DESIGN.md, "Surface". */
    'ui-action': 'rounded-full bg-ink text-[#0b0f12] font-mono text-9px font-600 tracking-[0.11em] uppercase cursor-pointer border-0',
    'ui-action-quiet': 'rounded-full bg-transparent text-ink font-mono text-9px tracking-[0.11em] uppercase cursor-pointer border border-[rgba(246,243,236,0.15)]',
    'ui-label': 'text-dim font-mono text-8px tracking-[0.12em] uppercase',
    'ui-figure': 'font-mono text-12px',
  },
})
