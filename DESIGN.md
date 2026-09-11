# Design — Civic Signal

## Direction

The city is the hero. The interface resembles a restrained municipal command surface placed over a cinematic miniature, not a dashboard or television clone. Campaign entry is intentionally monumental; gameplay becomes quiet and edge-oriented. The detailed interaction contract lives in [`docs/superpowers/specs/2026-09-11-cinematic-ui-ux-direction-design.md`](docs/superpowers/specs/2026-09-11-cinematic-ui-ux-direction-design.md).

## Tokens

- Asphalt `#11171b`: primary panels and ticker.
- Paper `#f4f0e6`: primary type.
- Signal red `#dc5746`: time, urgent news, and decisive civic action.
- Transit teal `#63b9aa`: stable/positive system health.
- Public amber `#f0c65a`: selectable objects and pending decisions.
- River steel `#315e70`: environmental anchor.

Display type uses condensed system faces (`Arial Narrow`/`Avenir Next Condensed`); body copy uses `Avenir Next`; numerical data uses the system monospace stack. Surfaces use thin borders, controlled translucency, compact 14–18 px radii, and 24–34 px radii for contextual sheets. Full-height hard-edged panel walls and decorative UI gradients are prohibited.

## Composition and signature

The full-viewport 3D city sits beneath a narrow command surface, three compact priority metrics, contextual world markers, and the bottom Stadtfunk ticker. Policies, buildings, news, and crises open one reusable soft context sheet instead of permanent dashboard columns. The ticker turns model events into a continuous civic narrative and opens causal details when selected.

## Motion and accessibility

Camera motion is damped and interruptible. UI motion uses opacity/transform only. Reduced-motion mode stops ticker movement and removes nonessential transitions. Focus rings, scalable text, clear numeric labels, and non-color-only status text are required.

## Avoid

No generic SaaS cards, pill-heavy navigation, neon cyberpunk, excessive glass, random gradients, copied broadcast branding, flat GIS presentation, or fake 3D map extrusion as the primary world.
