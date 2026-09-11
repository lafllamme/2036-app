# Audio

The prose half of the sound contract. The machine-readable half is
[`app/audio/cues.ts`](../app/audio/cues.ts); the two move together, and the unit tests in
[`tests/unit/audio.test.ts`](../tests/unit/audio.test.ts) keep them honest.

## Position

Sound in 2036 is a second channel on information the interface already shows. It never carries a
fact on its own, per §10.3 of the [cinematic UI/UX specification](superpowers/specs/2026-09-11-cinematic-ui-ux-direction-design.md).
Every cue listed below has a visible counterpart — a number, a label, a panel, a dialog.

Background music is not implemented. This is the interface layer only.

## Library

[UI SFX](https://uisfx.com) (`uisfx`), MIT code and CC0 audio, zero runtime dependencies. On the
web it synthesises its cues locally through Web Audio and fetches nothing, so the interface stays
offline-capable and adds no request at runtime. Roughly 4 kB gzip of the client bundle.

The active pack is `zen` — paper folds, soft brush, warm wood, quiet chimes. Changing the whole
product's sonic personality is a one-line change in `DEFAULT_PACK`, because components emit domain
events and never name a cue.

## Two layers

**Generic interaction**, bound by delegation in [`app/audio/interactionSounds.ts`](../app/audio/interactionSounds.ts):
`hover`, `press` and keyboard `focus` on every control in the product, current and future. Hover
and press are the cues a player hears thousands of times, so they are rate-limited — 110 ms and
45 ms — to keep a pointer dragged across a dense panel a texture rather than a stutter.

**Semantic state**, bound in [`app/audio/storeSounds.ts`](../app/audio/storeSounds.ts): watchers on
the game store rather than on buttons. A motion sheet opens from three call sites and the council
raises motions with no click at all, so one watcher covers every path where three handlers would
eventually miss one.

Components reach for `useSound()` only where they hold context no watcher can see: the price of the
option being voted on, the fourth priority the store drops without a trace, the rail's own toggle.

## What sounds

| Moment | Cue | Note |
| --- | --- | --- |
| Any control hovered, pressed, keyboard-focused | `hover` `press` `focus` | Delegated, rate-limited |
| Entry stage forward / back | `forward` `back` | |
| Party chosen, city entered | `select` `start` | |
| Priority added / removed / third chosen / fourth refused | `toggle-on` `toggle-off` `checkpoint` `blocked` | |
| Month advanced, January, campaign end | `progress-step` `checkpoint` `achievement` | A month is five real minutes at 1× |
| Clock paused, resumed, faster, slower | `pause` `play` `skip-next` `skip-previous` | |
| Saved / save failed | `checkpoint` `error` | |
| Rail expanded / collapsed | `expand` `collapse` | |
| Building selected / dismissed | `select` `deselect` | |
| Headline opened / closed | `open` `close` | |
| Motion raised by the council | `notification` | The clock stops with it |
| Sheet opened / closed | `open` `close` | |
| Negotiation, campaign: sent / registered | `send` `receive` | |
| Vote called | `start` | |
| Vote passed / rejected | `success` `warning` | See below |
| Result contradicted the forecast | `info` | 320 ms after the result, as an accent |
| Vote called on a costed motion; cost committed; income measure active; budget overdrawn | `checkout` `purchase` `refund` `warning` | The city has a budget, so the commerce cues carry real meaning |
| Worker busy longer than 350 ms | `processing` loop → `complete` | Silent when the round trip is fast |
| Simulation stopped / reloaded | `error` `retry` | |

**A rejected motion is `warning`, never `error`.** [`GAME_DESIGN.md`](GAME_DESIGN.md) states that
failing a vote is a legitimate and consequential outcome; an error tone would tell the player the
game broke rather than that the council said no. `error` is reserved for two genuine faults, a
failed save and a stopped worker, and a unit test enforces exactly that pair.

## What stays silent, and why

Ticker rotation and forecast refreshes never stop, so a cue there would never stop either. The
fifteen indicators that move every month are covered by the single month cue. Camera movement is
continuous input, not a state change. `SILENT_BY_DESIGN` in `cues.ts` carries the full list so a
reviewer can tell an omission from a decision.

One entry there is a browser limit rather than a choice: **a `disabled` control cannot be heard.**
Chrome dispatches no pointer or keyboard event for one, to the element or to any ancestor, so no
delegated listener can know it was clicked. Where the product itself knows it refused — the fourth
campaign priority — it plays `blocked` explicitly.

## Levels

Measured at the application's own audio destination in Chrome, not estimated.

`zen` is the quietest of the library's twelve packs, and that restraint is the reason it suits this
interface. At full volume:

| Pack | hover | press | success |
| --- | --- | --- | --- |
| every other pack | −29 dBFS | −22 dBFS | −20 dBFS |
| `zen` | −35 dBFS | −25 dBFS | −24 dBFS |

The product runs at the pack's own balance. A master gain stage of its own was built and reverted:
UI SFX clamps its volume at 1, so reaching past it meant redirecting the library's `destination`
through a `GainNode`, and four times gain — a press at −13 dBFS — sharpened every transient into
something harsh. The volume slider goes down from full scale; nothing goes up.

One earlier calibration is worth remembering, because it silenced the interface while every cue
fired correctly: attenuating hover to 0.3 on top of a 0.6 master put it near −50 dBFS. A unit test
now refuses any cue attenuated below half, and only the `processing` loop is attenuated at all,
because it is the one cue that runs continuously.

If the interface ever seems silent, check the mute before the level. It is stored under
`2036-sound-enabled` and survives every reload, which is correct behaviour that reads exactly like
a bug. The **Einstellungen** sheet is the honest place to look; the cue trace in development shows
`played: false` for every cue while it is off.

The volume preference is stored under `2036-sound-volume-v2`. That key was bumped once, because a
stored preference outranks a changed default and everyone who had opened the earlier build would
otherwise have kept a miscalibrated level permanently.

## Player control

Sound is on by default at 60 % and switchable in **Einstellungen**, reachable from the title screen
and from the HUD. The preference is stored in `localStorage` through
[`app/composables/useSoundSettings.ts`](../app/composables/useSoundSettings.ts) and deliberately
kept out of Pinia: a setup store serialises its refs into the server payload and restores them
during hydration, which overwrote the stored value and un-muted the game on every reload.

`prefers-reduced-motion` does **not** mute the interface. Motion sensitivity and noise sensitivity
are different needs, and the specification's reduced-motion mode is about movement.

## Autoplay

Browsers refuse audio before a trusted gesture. The bus stays locked and silent until the first
pointer or keyboard interaction unlocks it, which means the title screen and the end of the city
build are inaudible by design. Nothing from before that gesture is queued: a backlog firing at once
on the first click is worse than the silence it replaces.

One exception, and it is not a queue. Unlocking is asynchronous, and the click that opens the party
hall raises `stage.forward` a tick before the AudioContext finishes resuming — so the first
navigation of every session was silent. A cue raised while that handshake is in flight now waits
for it, a few milliseconds, because it belongs to the gesture that started the handshake.

## Proof

- Unit — every event maps to a cue the library ships, hover and press are rate-limited, `error` is
  reserved for the two real faults, no cue is dead, and the bus stays silent while locked or muted.
- Architecture — `uisfx` is imported only inside `app/audio/`; `app/simulation` and `app/world`
  reach for no audio at all.
- End-to-end — the campaign setup is driven in a browser and the emitted cue sequence is compared
  against the expected one, muting is proven to stop playback while the interface keeps emitting,
  and the mute is proven to survive a reload. The suite reads the emitted sequence rather than the
  audio device: whether a headless browser has a sound card is not our contract.
