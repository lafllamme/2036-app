# ADR-0004 — Semantic interface sound through a single cue contract

- Status: Accepted
- Date: 2026-09-11
- Owners: UI engineering and design

## Problem and constraints

The vertical slice was silent. Sound had to reach the whole product — every control, every council
and city state change — without scattering audio calls across eight components, without breaking
the architecture boundaries in `AGENTS.md`, and without becoming an accessibility problem.

Three constraints shaped the answer. §10.3 of the cinematic UI/UX specification requires that a
required decision never depend on sound alone. `docs/ASSET_PIPELINE.md` governs shipped media, so
an audio-file library would drag every cue through GLB/KTX2-era asset process for no benefit.
And browsers refuse audio before a trusted gesture, so any design has to be silent at startup.

## Decision

`uisfx` (MIT code, CC0 audio) provides the cues, in the `zen` pack. On the web it synthesises
locally through Web Audio and fetches nothing, so no audio file enters the repository or the bundle
and the asset pipeline does not apply.

Sound is addressed by **domain event**, never by cue name. `app/audio/cues.ts` is the single table
mapping every audible moment in the product to a semantic cue plus a written reason, with a
companion list of what stays silent and why. Components and stores emit domain events; only the
bus knows cues. `docs/AUDIO.md` is its prose half.

Two binding layers. Generic interaction — hover, press, keyboard focus — is bound once by
delegation, so a control added later is audible without anyone remembering to wire it. Semantic
state is bound by watchers on the game store rather than on buttons, because the same state change
arrives from several call sites and some, such as a council motion raised by the city, arrive from
no click at all.

The bus is silent until the first trusted gesture unlocks it, and silent whenever the player has
switched sound off. Callers never check either condition. A cue raised inside the unlock handshake
itself waits for it rather than being dropped, because it belongs to the gesture that opened it.

Level is the pack's business, not ours. Measurement at the audio destination showed the `zen` cues
peaking around −35 dBFS for hover and −24 dBFS for an outcome; the master volume is the only gain
the product sets.

Sound preferences live in a `createGlobalState` composable backed by `localStorage`, deliberately
outside Pinia.

## Alternatives

**Howler.js or a hand-rolled player.** Both cost a dependency or a hundred lines for what the
library already does, and neither gives a semantic vocabulary — the part that makes the mapping
reviewable.

**Naming cues at the call site.** Fastest to write, and it makes the audible surface impossible to
review or to re-theme. Rejected; an architecture test now forbids importing `uisfx` outside
`app/audio/`.

**Sound preferences as a Pinia store.** Tried first and reverted. A setup store serialises its refs
into the server payload and restores them during hydration, which overwrote the value read from
`localStorage`: a player who muted the game heard it again on the next load. The Playwright
mute-across-reload test exists because of this.

**A refusal cue on disabled controls.** Verified impossible rather than assumed: Chrome dispatches
no pointer or keyboard event for a `disabled` control, to the element or to any ancestor, so no
delegated listener can hear that click. Where the product itself knows it refused — the fourth
campaign priority — it plays the cue explicitly.

## Consequences

- Changing the product's entire sonic personality is a one-line change to `DEFAULT_PACK`.
- Every audible moment is reviewable in one file, with its justification next to it.
- A rejected council vote sounds as `warning`, not `error`, and a unit test holds `error` to the
  two genuine faults. This follows `docs/GAME_DESIGN.md`: losing a vote is a legitimate outcome.
- The commerce cues carry real meaning here, because the city has a budget. `checkout`, `purchase`
  and `refund` mark committing, spending and earning municipal money.
- The title screen and the end of the city build are inaudible, because they precede the first
  gesture. Accepted rather than worked around; nothing from before the gesture is queued.
- Attenuating a cue on top of the pack's own mix is how the interface was silenced once already,
  at roughly −50 dBFS for hover with every cue firing correctly. A unit test now refuses any cue
  attenuated below half, and `docs/AUDIO.md` records the measured peaks.
- `prefers-reduced-motion` does not mute the interface. Motion sensitivity is not noise sensitivity,
  and the specification's reduced-motion mode is about movement.
- Music is not implemented. The bus owns the master gain so a music layer can join it later without
  the interface layer changing.

## Review condition

Revisit when a music bus lands, when a second pack is offered to players, or if the cue table grows
past roughly forty events — at that size the single table stops being reviewable in one sitting and
should split by domain.
