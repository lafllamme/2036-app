# ADR-0005 — Campaign time, daylight and the in-game clock

- Status: Accepted
- Date: 2026-09-11
- Owners: Game design and rendering

## Problem and constraints

The campaign runs 132 months and the player has no way to read time. The top bar shows a month and a
year, nothing else. A day/night cycle exists in `CityRenderer.updateAtmosphere`, but it is driven by
the render timer on a fixed 1 200-second loop, which means it keeps running while the game is paused,
ignores 2× and 4× entirely, and has no relationship to the calendar. One game month is a quarter of
one visual day, so the sun and the date contradict each other permanently.

Three wishes conflict at this pace. A month lasts five real minutes. If each of its thirty days had
its own sunrise, a full day/night cycle would take ten seconds — a strobe, not daylight. So the
player cannot simultaneously have a day-of-month, a literal time of day, and a visible sun cycle.

## Decision

**Pace stays.** Five real minutes per month, one hour per campaign year, roughly eleven hours for the
full campaign at 1× and under three at 4×. This is the figure the design already assumed and it is
what makes an unattended playthrough land near ten hours.

**A month is a day.** The month opens at dawn and closes at night: one sunrise and one sunset per
month, 132 across the campaign. The displayed time of day is the true position within the month, so
14:32 means "somewhat past halfway". The day-of-month is dropped, which costs nothing because the
simulation has no days — every rule is monthly.

**Daylight hours stay seasonal; the night is made legible rather than short.** The first draft of
this record proposed compressing night to a fifth of the cycle, because literal astronomy leaves a
December month 69 % dark. Holding daylight above 18 hours all year to reach that share would put
sunrise at 03:00 in December, which is worse than the problem. The city keeps its real seasonal
swing — roughly 8 hours of daylight in January against 16 in July — and darkness is solved with
street lighting, lit windows and moonlight instead of with the clock. A lit city at night is
perfectly readable; an unlit one is not.

**Visual time derives from simulation progress, not from the render timer.** It freezes on pause and
follows the speed multiplier.

**The clock is text, not a dial.** Large time, month underneath, and the phase of the day as a word
with a direction — "Nachmittag ↘ Untergang 16:38". Schedule I solves it the same way, and a dial at
the size available in the top bar reads as ornament rather than information.

**The speed controls stay at the bottom.** Grouping them with the clock was explored and rejected:
the top bar cannot carry the clock, the speed buttons, the coalition and the save action without
dropping one of them.

## Alternatives considered

- **A fixed real-time day cycle** (the status quo, polished): rejected because the sun would continue
  to ignore the calendar and keep moving while the game is paused.
- **Season-only lighting with no daily cycle**: always legible, but the city stops feeling alive and
  there is no night, moon or evening light at all.
- **Literal astronomy for 53° N**: most faithful, and it makes winter months mostly unplayable.
- **A shorter month (three minutes)**: raises event density and shortens the campaign to under seven
  hours, but a sunrise every three minutes turns the sky into a metronome. Revisit only if play tests
  show 1× is dead time.
- **Merging the clock with the speed controls**: consolidates cause and effect, but it forced the
  save action out of the bar at 1 400 px and broke below that.

## Consequences

- `SaveGameV1` does not need to change: visual time is derived from month progress, which is already
  reconstructible from the snapshot plus the accumulated milliseconds.
- The renderer can no longer own its own clock; it receives a continuous day phase from the store.
- Anything reading "day of month" in copy or content has to be phrased monthly instead.
- The seasonal curve becomes authored content, not simulation output, so it needs a documented table
  rather than an astronomical formula.
- At 1× a sunrise arrives every five minutes. If that reads as restless once implemented, the fix is
  the transition length and the night's ambient floor, not the pace.
- Because night keeps its real length, night lighting is not a garnish but a requirement: without it
  a December month is unplayable for two thirds of its duration.

## Review condition

Review when play tests show that 1× is dead time between events, when the campaign length is
deliberately changed, or when districts gain their own lighting and a single global sun is no longer
enough.
