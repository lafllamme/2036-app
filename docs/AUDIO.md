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

## What the city plays, and when

Five recordings, listed once in [`citySounds.ts`](../app/audio/citySounds.ts). Nothing else in the
audio layer names a file — everything names an entry in that table, so adding a sound is one entry
and replacing one is one line, and the question "what does the city play?" has an answer you can
read rather than assemble out of five files.

| Sound | Kind | Comes up when | Level |
| --- | --- | --- | --- |
| `traffic` | bed | vehicles are moving within earshot of the camera | 0.50 |
| `crowd` | bed | people are walking within earshot — a much shorter one | 0.34 |
| `park` | bed | there is neither: birds and leaves are what is left | 0.30 |
| `pass` | one-shot | a vehicle goes by; the wait shortens as the street fills | 0.42 |
| `horn` | one-shot | rarely, and only where there is traffic to be annoyed by | 0.30 |

The three beds run continuously from the moment the sound is opened and are faded against each
other rather than switched, each starting at its own random point in its own loop so no two ever
breathe together. The one-shots are jittered on purpose: a sound that arrives on a schedule is a
metronome however good the sample is, and the car pass is played back at a slightly different rate
each time, which is the cheapest way to make one recording of a car sound like several.

The **siren** is not in that table and never will be. It steps between two notes and is placed by
how far the nearest call is from the camera, which is something the game computes rather than
something anyone recorded. Same for the score.

### Why recordings for the bed and synthesis for everything else

This is the one thing synthesis reliably loses at, and the reason is structural rather than a matter
of effort. A real street is thousands of overlapping transients — tyres, footsteps, a door, a distant
voice — and noise through a filter can only ever be a texture. A texture that sits still is heard as
a machine within seconds, so it has to be modulated; every modulation has a period; and anything
periodic in a sound that never stops is the first thing an ear finds and the last thing it lets go
of. Two versions were built and repaired that way before the conclusion was accepted. The last fault
was a resonant band sliding up and down every five seconds for as long as anybody played.

Everything that has to answer to the game stays synthesised, because a recording cannot.

Sources and licences are in [`public/audio/city/LICENSE.md`](../public/audio/city/LICENSE.md). All
CC0, each verified on its own page before download rather than taken on trust from a search filter,
and 1.7 MB for the five together — fetched after the player has opened the sound, so the city is
quiet for a second rather than slow to start.

## Three instruments, one mixer

The game makes sound in three ways, and until the mixer was written none of them knew the others
existed:

| Instrument | What it is | Where |
| --- | --- | --- |
| **cues** | short, discrete, one per thing the player did | [`AudioBus.ts`](../app/audio/AudioBus.ts) |
| **ambience** | the continuous noise the city makes, following what is near the camera | [`cityAmbience.ts`](../app/audio/cityAmbience.ts) |
| **score** | eight unsynchronised voices that never repeat | [`cityScore.ts`](../app/audio/cityScore.ts) |

All three took the player's volume setting and played at it, which is not a mix — it is three things
shouting, and it is loudest exactly where the game is most interesting: down in the street at rush
hour with a siren going past.

[`mixer.ts`](../app/audio/mixer.ts) is the only place that knows there are three. It decides from
where the listener is standing, and the decision is a pure function so it can be reasoned about
rather than tuned by ear in the one place it was tested:

- **at street level the city wins.** Traffic, footsteps and horns are what being down there *is*, so
  the score drops to 42 % and becomes the thing under the noise rather than over it.
- **from the strategic camera the score wins.** The ambience fades its own traffic out with distance;
  without the music the overview is silence.
- **a siren beats everything.** It is the one sound meant to cut through, and that only works if what
  surrounds it gets out of the way — the score drops to 35 % of wherever it already was. A siren
  beyond 200 m is ignored, because it cannot be heard anyway.
- **the interface is never ducked.** A cue is the sound of something the player just did, and a
  confirmation they cannot hear is worse than none.

Nothing is ever silenced, only moved underneath: a mix where something disappears is one the player
notices, and the point of all of it is that they should not. The crossfade is deliberately long — a
balance that switches at a threshold is something you hear happening every time you zoom, and
[`tests/unit/mixer.test.ts`](../tests/unit/mixer.test.ts) walks the camera from the street to the map
and refuses any single step that moves the balance by more than a little.

The player's volume and the game's balance are kept apart on purpose. The slider is theirs and
nothing here touches it; each instrument is told the product, which is the only number it has ever
needed to know.

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

## The loop that could not be stopped

`work.started` is the only looping cue in the game, and the mixer deliberately never ducks the
interface. Both facts are right on their own and together they are a loaded gun: anything that leaves
that loop running leaves a repeating tone playing at full volume, over everything, at every camera
distance, for the rest of the session. It fired, and it took two separate faults to do it.

**The trigger.** `REQUEST_SAVE` raises the store's `pendingCommand` flag like any other command, and
the branch that receives `SAVE_STATE` returned without lowering it again. The campaign saves itself
at the turn of every month — so a few hundred milliseconds after the first month ended, the flag was
stuck, the "still working" timer fired, and the loop started. Nothing was actually still working.

**The reason it could never stop.** `AudioBus.startLoop` kept the handle that `play` returned, and
`play` returns `null` for a cue raised while the unlock handshake is in flight — the deferred case
one section up. The cue still sounds, a few milliseconds later; nothing holds it. `stopLoop` then
found no handle and returned, and there was no longer anything in the process that knew the sound
existed.

Both are fixed, and the bus now tracks *which loops are meant to be running* separately from which
ones it has a handle for: a loop stopped while it is still starting is stopped the moment it arrives.
Three unit tests hold it — stopped mid-handshake, started once however often it is asked, and
restartable after a stop.

The general rule this leaves behind: **a cue that repeats needs an owner that cannot lose it.** A
one-shot that goes missing is a missing sound. A loop that goes missing is the sound of the game.

## Where each sound actually comes from

Worth writing down, because "I thought we built in assets" is the reasonable question to ask when
something synthetic will not stop:

| Heard | Made of | Where |
| --- | --- | --- |
| traffic, crowd, park, a car going past, a horn | recordings, CC0, in `public/audio/city/` | `cityAmbience.ts` |
| the siren | synthesised, two notes stepped at 0.65 s | `cityAmbience.ts` |
| the train | synthesised, pink noise through a narrow band, pulsed at the wheels | `cityAmbience.ts` |
| the score | synthesised — saw pads, a bass drone, one FM bell | `cityScore.ts` |
| every interface cue, including the `processing` loop | the `uisfx` library's `zen` pack | `AudioBus.ts` |

The train is synthesised for the same reason the siren is. What a train sounds like from a distance
is almost entirely *where it is*: a rumble that arrives before you see it, a beat under it at the
speed of the wheels, and nothing at all four streets away. All three are things the game computes and
nothing anybody recorded. It carries much further than a siren — full to 90 m, gone by 620 m against
the siren's 200 — because a train does, and it is deliberately not tied to how close the camera is to
the street: a goods train heard from the hill above the city is exactly the sound of a city with a
railway in it.

Only the first row is recorded. Anything that sounds like an instrument rather than a street is one
of the other three, and the score is the only one of them with no distance gate at all — from the
map it is deliberately the loudest thing there is, because there is nothing else up there.

## Proof

- Unit — every event maps to a cue the library ships, hover and press are rate-limited, `error` is
  reserved for the two real faults, no cue is dead, and the bus stays silent while locked or muted.
- Architecture — `uisfx` is imported only inside `app/audio/`; `app/simulation` and `app/world`
  reach for no audio at all.
- End-to-end — the campaign setup is driven in a browser and the emitted cue sequence is compared
  against the expected one, muting is proven to stop playback while the interface keeps emitting,
  and the mute is proven to survive a reload. The suite reads the emitted sequence rather than the
  audio device: whether a headless browser has a sound card is not our contract.


## Wetter

Vier Aufnahmen, alle CC0 (`public/audio/city/LICENSE.md`), registriert in `citySounds.ts` wie alles
andere auch.

| Datei | Rolle | Pegel | Wofür |
| --- | --- | --- | --- |
| `drizzle.ogg` | Bett | 0,46 | Leichter Regen. Trägt Anfang und Ende jedes Schauers und die meisten ganz. |
| `rain.ogg` | Bett | 0,60 | Starker Regen auf Straßen und Dächern. Blendet über dem Nieselregen auf. |
| `wind.ogg` | Bett | 0,44 | Wind — und das Einzige, was ein Schneefall überhaupt hörbar macht. |
| `thunder.ogg` | Einzelton | 0,58 | Ferner Donner. Nur bei starkem Regen, nie zweimal in einer halben Minute. |

Zwei Regenaufnahmen statt einer, weil leichter Regen nicht leiser starker Regen ist, sondern ein
anderes Geräusch. Wer einen Schauer über einen einzigen Fader hereinbringt, bekommt einen Schauer,
den niemand glaubt.

Schnee bekommt keine eigene Aufnahme. Schnee macht kein Geräusch; was man in ihm hört, ist der Wind
und eine Stadt, die ihre Höhen verliert. Genau das passiert: derselbe Tiefpass, der sonst für
Entfernung steht, schließt bei Schneefall um bis zu 45 %.

Der Regen wird deutlich weniger nach Kameradistanz ausgeblendet als der Verkehr — er fällt auf die
ganze Stadt. Der Verkehr behält aus der Höhe ein Viertel, die Stimmen gar nichts, der Regen 55 %.
Donner gar nicht: der gehört dem Himmel, nicht der Straße.
