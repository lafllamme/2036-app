# Asset Sources

| Asset | Creator | Source | License | Modification | Repository location |
| --- | --- | --- | --- | --- | --- |
| Procedural city geometry | 2036 project | Generated in repository | Project code | Runtime instancing | `app/rendering` |
| Supreme (display) | Indian Type Foundry | [Fontshare](https://www.fontshare.com/fonts/supreme) | Fontshare free-for-commercial-use licence | Weights 400–800 | `nuxt.config.ts` |
| Switzer (body text) | Indian Type Foundry | [Fontshare](https://www.fontshare.com/fonts/switzer) | Fontshare free-for-commercial-use licence | Weights 400–700 | `nuxt.config.ts` |
| Geist Mono (figures) | Vercel | [Google Fonts](https://fonts.google.com/specimen/Geist+Mono) | SIL Open Font License 1.1 | Weights 400–600 | `nuxt.config.ts` |

Typefaces are self-hosted via `@nuxt/fonts`: the module downloads all three families at build time
and serves them from `/_fonts/`, together with fallback metrics that prevent layout shift. No font
request reaches a third party at runtime, and the interface keeps its type without a network.

The three stacks are declared once, in `uno.config.ts`, and `app/assets/css/styles.css` aliases them
(`--display: var(--font-display)`). `nuxt.config.ts` names the same families with their provider and
weights, which is what the module acts on — it does not have to infer anything from the stylesheet,
and it rewrites the theme variables to carry the generated fallback families.

An earlier version relied on `experimental.processCSSVariables` so the scanner could see family names
hidden inside CSS variables. Declaring the families explicitly is less fragile: a scan that finds
nothing fails silently, with every face quietly degrading to a system fallback.

On the web UI SFX synthesises its cues locally through Web Audio and fetches nothing, so no audio
file enters the repository or the bundle and `docs/ASSET_PIPELINE.md` does not apply to it. The
package also ships MP3 and Ogg renders for native targets; they are unused here.

No other third-party visual or audio assets are included in the vertical slice. Additions require an
entry before merge; assets with unclear licenses are rejected.
