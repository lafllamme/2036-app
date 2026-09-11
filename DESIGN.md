# Design — Civic Signal

## Direction

The city is the hero. The interface resembles a restrained municipal command surface placed over a cinematic miniature, not a dashboard or television clone. Campaign entry is intentionally monumental; gameplay becomes quiet and edge-oriented. The detailed interaction contract lives in [`docs/superpowers/specs/2026-09-11-cinematic-ui-ux-direction-design.md`](docs/superpowers/specs/2026-09-11-cinematic-ui-ux-direction-design.md).

## Type

| Role | Family | Source | Notes |
| --- | --- | --- | --- |
| Display | Supreme | Fontshare | Weight 700, tight tracking. Headlines, the wordmark, key figures. |
| Text | Switzer | Fontshare | Body copy, labels, briefings. |
| Figures | Geist Mono | Google Fonts | Every number the player compares: money, seats, rates, dates. |

Numbers are always set in the monospace face and always formatted for German — `13,61 €/m²`, not
`13.61`. A figure that a player might compare against another figure never sits in the text face.

## Colour roles

Colour carries meaning, so exactly two of them do and everything else is paper, grey and depth. A
player never needs a legend.

| Role | Token | Means |
| --- | --- | --- |
| Positive | `--positive` `#74c9ae` | approval, a gain, an indicator moving the way the city wants |
| Negative | `--negative` `#ef7a60` | rejection, a loss, a risk, an indicator moving the wrong way |
| Paper | `--ink` `#f6f3ec` | type, and the single filled action per region |
| Grey | `--dim` `#97a09d` | labels, units, context that carries no judgement |

Three rules follow. **Cost is never painted in the rejection colour** — "this is expensive" and
"this will fail" are different facts a player acts on differently, so money is set in paper and mono.
**Composition indicators the model deliberately does not judge** — `internationalShare` above all —
are rendered grey, never positive or negative. And **party colours are identity, not judgement**:
in the HUD they appear only as small round markers beside an abbreviation, never as a surface fill,
because otherwise red would mean "SPD", "rejection" and "urgent" at the same time.

An earlier amber accent was removed entirely. It was carrying "pending", "selectable" and "FDP" at
once, and the bordered amber button was the single most dated element in the interface.

## Surface

One panel primitive, used everywhere: `rgba(10, 14, 17, 0.58)`, **no border**, 24 px radius, 42 px
backdrop blur with light saturation, and a soft shadow for separation. Panels stand through depth and
space rather than through lines. Inside a panel, structure comes from hairline rules
(`rgba(246, 243, 236, 0.08)`) and generous spacing, not from nested boxes.

**Exactly one filled action per region.** The filled action is paper on dark, fully rounded. Every
other control is text inside a hairline pill. A screen full of solid buttons destroys the air the
rest of the system is built on.

## Motion and accessibility

Camera motion is damped and interruptible. UI motion uses opacity/transform only. Reduced-motion mode stops ticker movement and removes nonessential transitions. Focus rings, scalable text, clear numeric labels, and non-color-only status text are required.

## Avoid

No generic SaaS cards, neon cyberpunk, random gradients, copied broadcast branding, flat GIS presentation, or fake 3D map extrusion as the primary world. Blur is deliberate and load-bearing here, but it stays on a dark ground: a translucent panel light enough for the city to wash out its body copy is a defect, not a style.
