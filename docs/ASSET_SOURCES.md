# Asset Sources

| Asset | Creator | Source | License | Modification | Repository location |
| --- | --- | --- | --- | --- | --- |
| Procedural city geometry | 2036 project | Generated in repository | Project code | Runtime instancing | `src/rendering` |
| Bricolage Grotesque (display) | Ateliers Brut | [Google Fonts](https://fonts.google.com/specimen/Bricolage+Grotesque) | SIL Open Font License 1.1 | Variable axes `wdth 92`, `wght 400–800` | `index.html` |
| Switzer (body text) | Indian Type Foundry | [Fontshare](https://www.fontshare.com/fonts/switzer) | Fontshare free-for-commercial-use licence | Weights 400–700 | `index.html` |
| Geist Mono (figures) | Vercel | [Google Fonts](https://fonts.google.com/specimen/Geist+Mono) | SIL Open Font License 1.1 | Weights 400–600 | `index.html` |

Typefaces are currently loaded from the Google Fonts and Fontshare CDNs, which means the interface
falls back to system faces without a network connection. Self-hosting the three families is required
before release, both for offline play and to avoid a third-party request on every start.

No other third-party visual assets are included in the vertical slice. Additions require an entry
before merge; assets with unclear licenses are rejected.
