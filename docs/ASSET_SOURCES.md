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

The scanner only reads literal `font-family` declarations. Because the family names live in the
design tokens (`--display: "Supreme", …`), `experimental.processCSSVariables` has to stay enabled —
without it the module finds nothing, emits no `@font-face` at all, and everything silently falls back
to system faces.

No other third-party visual assets are included in the vertical slice. Additions require an entry
before merge; assets with unclear licenses are rejected.
