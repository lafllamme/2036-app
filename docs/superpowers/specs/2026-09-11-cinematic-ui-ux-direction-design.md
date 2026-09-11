# 2036 — Cinematic UI/UX Direction

Status: approved visual direction, pending written-spec review

Date: 2026-09-11

Scope: campaign entry, party selection, persistent gameplay HUD, contextual detail surfaces, and their motion/interaction rules

## 1. Decision summary

2036 uses a cinematic political-game interface in which Lindenhafen remains the visual focus. The selected direction combines:

- a hybrid loading transition from controlled key art into the live 3D city;
- a monumental, centered title screen;
- a symmetrical banner hall for party selection;
- a quiet edge HUD with slightly more information density than a purely cinematic overlay;
- one soft, floating context sheet for detailed information;
- restrained gameplay motion and more dramatic entry motion.

The interface must not return to the prototype's rigid dashboard composition. Full-height opaque sidebars, dense rectangular card stacks, table-like HUD layouts, and sharp black panel walls are prohibited.

This specification refines the current `DESIGN.md`. Its soft-surface and shape rules supersede the sentence that describes panels as rectangular. The canonical design document must be reconciled when this specification is approved for implementation.

## 2. Problem and intent

The current vertical slice proves that the 3D city, simulation worker, policies, and HUD can operate together, but its presentation makes the city feel like a background underneath an administrative dashboard. The right policy column and left metric block occupy large continuous areas, use hard-edged dark rectangles, and give every datum similar visual priority.

The redesign must make 2036 feel like a premium political strategy game rather than a generic web dashboard. It must also preserve the legibility required for a deterministic simulation: the city may be cinematic, but dates, city health, coalition state, decisions, costs, delays, and causal consequences cannot become hidden or decorative.

## 3. Goals

1. Make the transition into Lindenhafen feel authored, dramatic, and recognizable as 2036.
2. Keep the live 3D city as the primary visual layer during play.
3. Make the party choice feel comparable to choosing a playable faction or class without presenting unsourced moral statistics.
4. Keep essential campaign information continuously readable while moving detailed information to a second interaction layer.
5. Establish one reusable interaction grammar for buildings, districts, policies, crises, news, and reports.
6. Support keyboard operation, reduced motion, scalable text, and forced-WebGL operation from the start.
7. Preserve existing architecture boundaries and deterministic game behavior.

## 4. Non-goals

This design does not:

- redesign the geometry, lighting, materials, or generation of the 3D city;
- define party policies, political claims, balance values, or election formulas;
- authorize party-ID simulation modifiers;
- add a character avatar, street-level mode, combat, multiplayer, or live news;
- create a mobile layout; v1 remains desktop-browser first;
- replace causal explanations with visual spectacle;
- require artificial loading delays to display the title artwork.

## 5. Experience principles

### 5.1 The city is the hero

Persistent interface elements live near the viewport edges. The central city view remains clear for camera movement, selection, incidents, and visible policy consequences. At a 16:9 desktop viewport, persistent HUD surfaces must leave at least 85% of the viewport area visually unobstructed. World markers are excluded from this area calculation because they are anchored to city objects and remain individually small.

### 5.2 Two information levels

The base HUD answers only:

- When are we?
- Is time moving?
- What is the current city condition?
- What is the coalition condition?
- Is attention required?

The context level answers:

- What is selected or happening?
- Why is it in this state?
- Who or what is affected?
- Which action is available?
- What will the action cost, when will it act, and what uncertainty applies?

Only one context sheet may be open at once. A required decision may replace the current non-blocking sheet after the game has auto-paused.

### 5.3 Politics remains inspectable

Party presentation may be theatrical, but displayed strengths, risks, compatibility, or starting conditions must be derived from sourced party-policy mappings, council state, or explicit scenario conditions. No UI copy may imply a hidden party-name bonus. Removing party labels must leave simulation calculations unchanged.

### 5.4 Shape communicates hierarchy

Soft geometry is functional rather than ornamental:

- persistent controls use compact 14–18 px radii;
- context sheets use 24–34 px radii and one asymmetrical accent edge;
- status rings and world markers use circles;
- primary actions may use short rounded rectangles, not pill-shaped navigation everywhere;
- zero-radius panel stacks and full-height rectangular rails are not allowed.

## 6. Campaign entry flow

```text
BOOT
  → ASSET_LOADING
  → TITLE_READY
  → PARTY_HALL
  → PARTY_PROFILE
  → MANIFESTO_PRIORITIES
  → CAMPAIGN_INTRO
  → GAMEPLAY_IDLE
```

The existing requirement to choose three manifesto priorities remains in force. This redesign changes its presentation, not the scoring contract.

### 6.1 Hybrid loading and title transition

During boot, 2036 displays authored key art of Lindenhafen from a camera position that can be reproduced approximately by the runtime camera. The frame contains:

- the two-color `2036` wordmark;
- `LINDENHAFEN`;
- one short campaign line;
- a truthful loading state;
- recovery controls only when required.

The loading view does not show settings, party choices, statistics, or news. Once the minimum playable city state is ready, the still image transitions into the live 3D view using matched composition, exposure, and camera direction. The live view then settles into the title state.

No minimum artificial loading duration is required. If loading finishes almost immediately, the key art may appear for up to 800 ms to avoid a flash, but the player must be able to skip the decorative transition after the first completed campaign start.

### 6.2 Monument title screen

The title state uses a centered composition:

- large two-color `2036` wordmark;
- smaller, widely tracked `LINDENHAFEN` label;
- restrained campaign line;
- one visually dominant primary action;
- secondary actions with materially lower contrast.

For a first run, the primary action is `Neue Kampagne`. If a compatible save exists, it becomes `Kampagne fortsetzen`, while `Neue Kampagne` remains secondary. Settings and credits stay secondary. The title screen must not imitate the gameplay HUD.

The city continues a slow, non-interactive establishing camera move behind the title. Reduced-motion mode uses a stable live view or the final key-art frame.

### 6.3 Banner-hall party selection

Party selection is a symmetrical political stage. Four to six banners are visible at once, each containing only:

- a party color;
- an emblem;
- an abbreviation;
- a full accessible name exposed to assistive technology.

The banners are the selectable objects. Hover or keyboard focus produces a controlled light response and a small depth shift. Selection moves the chosen banner forward and then opens a separate party-profile state. The overview does not open an overlapping profile card.

Decorative audience silhouettes may establish political context at the bottom of the composition. They must remain non-interactive, avoid identifiable real-person likenesses, and become static under reduced motion.

If more than six selectable parties exist, the stage scrolls horizontally in discrete groups while preserving symmetry. It never compresses banners below their readable minimum width.

### 6.4 Party profile and confirmation

The selected party profile is a dedicated confirmation screen, not a tooltip. It retains the chosen banner as the visual anchor and displays:

- full party name and emblem;
- dated political profile;
- current council seats and likely coalition relationships;
- three concise agenda strengths;
- two concise governance risks or trade-offs;
- the source date and access to evidence details;
- `Partei wählen` as the sole primary action;
- `Zurück zur Auswahl` as a secondary action.

Agenda strengths and risks summarize policies and starting political conditions. They are not hidden luck, morality, or outcome modifiers.

After confirmation, the player chooses the three manifesto priorities required by the campaign score. This step reuses the party-profile stage and soft surface language instead of introducing a separate dashboard design.

### 6.5 Campaign intro

The campaign intro is a short, skippable transition from the political stage to the live city. It establishes January 2026, the initial council situation, and the first governing objective. It contains no long exposition and must finish within 20 seconds when watched normally.

## 7. Gameplay HUD

### 7.1 Persistent edge frame

The persistent HUD contains four groups:

1. **Top status surface**
   - compact `2036` mark;
   - current month and year;
   - coalition status;
   - pause state;
   - access to the system menu.
2. **Priority metric cluster**
   - city health;
   - municipal budget headroom;
   - population satisfaction;
   - each value includes a word or icon cue so color is never the only signal.
3. **Time controls**
   - pause, 1×, 2×, and 4×;
   - pending automatic pause state;
   - clear next-tick feedback.
4. **Attention cues**
   - small world markers for selectable buildings, districts, crises, and decisions;
   - an edge accent when required attention exists outside the current camera view.

The top surface is inset from the viewport and uses an 18 px radius. The metric cluster uses separate compact surfaces rather than one tall left panel. Time controls sit near the lower center and must never cover the news ticker when the ticker is visible.

The HUD must fit at 1280 × 720 without overlap and reach its intended composition at 1920 × 1080. Text scaling to 125% must preserve all primary actions and values without clipping.

### 7.2 Metric prioritization

The three persistent metrics are city health, budget headroom, and satisfaction because they jointly communicate systemic condition, capacity to act, and political legitimacy. Employment, housing cost, transit coverage, environment, population, and district values move into the context sheet and report surfaces.

When a persistent metric crosses a configured warning threshold, its surface may show a short status label and an attention accent. It must not grow into a permanent alert card.

### 7.3 News ticker

The news ticker remains a signature element, but it is visually subordinate to required decisions. It occupies a thin bottom edge lane and must not resemble a real broadcaster's branding. Selecting a headline pauses the game, focuses the relevant world target when available, and opens the event variant of the context sheet.

Reduced-motion mode replaces continuous scrolling with one static headline that changes at a readable interval. The underlying deterministic news chronology is unchanged.

## 8. Context sheet

### 8.1 Shared behavior

Buildings, districts, policies, crises, news, and causal explanations use one context-sheet shell. It is a floating surface inset from the right edge rather than a full-height sidebar.

Desktop sizing:

- width: `clamp(360px, 28vw, 480px)`;
- top edge: below the persistent status surface;
- bottom edge: above the ticker or viewport safe area;
- outer radius: 24–34 px;
- one narrow semantic accent on the world-facing edge;
- transparent depth sufficient to retain city context without reducing text contrast.

The sheet opens from the world-facing edge using opacity and horizontal transform. The selected world object keeps a visible outline or marker so the relationship between sheet and city remains clear.

The sheet always contains:

- type and location label;
- primary title;
- current state summary;
- prioritized metrics;
- causal or historical context where available;
- actions;
- close control.

Long content scrolls inside the sheet. The page body and 3D canvas do not move.

### 8.2 Variants

**Building:** condition, utilization, capacity, affected residents/jobs, recent measures, district link, available municipal action.

**District:** health breakdown, trend, current pressures, representative assets, related decisions, focus action.

**Policy:** cost, recurring cost, administrative load, council support probability or known vote state, delay, ramp, min/expected/max effect range, confidence, sources, propose/adopt action.

**Crisis or decision:** urgency, affected scope, deadline, available responses, immediate trade-offs, pause status. Required decisions trap focus within the sheet until resolved or explicitly deferred when deferral is allowed.

**News/event:** headline, originating event, affected district or asset, causal trace, evidence references, focus action.

**Causal explanation:** ordered causal edges from originating decision or event to the selected outcome, with timing and confidence. It must not be reduced to an unexplained positive/negative arrow.

### 8.3 Close and replacement rules

- `Escape` closes a non-required sheet and returns focus to its originating world marker or control.
- Selecting a new non-required target replaces the current sheet without stacking another sheet.
- A required decision auto-pauses time and replaces the current sheet after preserving its return target.
- Closing the system menu returns to the previous context state.
- Clicking empty city space closes a non-required building or district sheet but does not dismiss a required decision.

## 9. Visual language

### 9.1 Identity

The existing two-color `2036` mark is retained. `20` uses warm paper white and `36` uses signal red. `LINDENHAFEN` appears in widely tracked uppercase beneath or beside the mark, depending on context.

### 9.2 Color

Existing semantic colors remain:

- asphalt for deep surfaces;
- paper white for primary type;
- signal red for decisive action, urgent attention, and the `36` mark;
- transit teal for stable or positive system state;
- public amber for selection, pending decisions, and world focus;
- river steel for environmental/system context.

Color is always paired with a label, icon, pattern, or value. UI surfaces use flat translucent tones; decorative interface gradients are prohibited. Atmospheric gradients belong to key art, lighting, or subtle world-facing fades, not to generic cards.

### 9.3 Typography

- Display: condensed, heavy, and tightly spaced for the title and major political moments.
- Interface labels: compact uppercase with controlled tracking.
- Body: neutral sans-serif with generous line height.
- Numeric values: tabular monospace.

All German labels must be natural language, not machine-like abbreviations, except established units and party abbreviations. Body text must not use condensed display type.

### 9.4 Surface treatment

Surfaces use thin borders, modest blur, low-opacity shadow, and clear separation from the city. Blur is optional per quality tier; disabling it must fall back to an opaque-enough asphalt surface with unchanged contrast.

Glassmorphism, neon bloom, deep bevels, and repeated pills are prohibited. Rounded geometry must not turn the interface into a generic consumer-app design.

## 10. Motion and sound

### 10.1 Motion levels

**Cinematic entry:** matched-image transition, slow camera settlement, restrained title reveal, and banner depth movement.

**Gameplay navigation:** 160–240 ms opacity/transform transitions with no bounce.

**Context sheet:** 220–300 ms entrance and 160–220 ms exit. Sheet content may stagger once by no more than 60 ms total.

**Required attention:** one controlled pulse or edge sweep; no continuous flashing.

All UI animation uses opacity and transform where practical. Layout properties must not animate during gameplay.

### 10.2 Reduced motion

Reduced-motion mode:

- replaces the key-art-to-city move with a short crossfade;
- removes camera drift from title and party stages;
- removes banner depth travel;
- opens the context sheet with a short fade;
- replaces the scrolling ticker with a static changing headline;
- preserves all timing and state information textually.

### 10.3 Sound

The visual system supports, but does not require for its first implementation slice, a restrained sonic identity: low civic ambience at title, fabric/room tone in the banner hall, and short non-musical confirmation cues. Required decisions must never rely on sound alone.

## 11. Application architecture

### 11.1 UI state

Pinia stores only serializable view state and projections. The UI shell needs a discriminated presentation state equivalent to:

```text
entry.loading
entry.title
entry.partyHall
entry.partyProfile
entry.manifesto
entry.intro
game.idle
game.context(type, targetId)
game.decision(decisionId)
game.report(reportId)
game.menu
recovery(kind)
```

The exact TypeScript names may follow existing conventions, but the states must remain mutually understandable and testable. Required decisions and recovery states cannot be represented by an incidental collection of booleans.

### 11.2 Component boundaries

The implementation should separate:

- entry experience shell;
- title screen;
- party hall;
- party profile and manifesto setup;
- persistent game HUD;
- top status surface;
- priority metric cluster;
- time controls;
- news ticker;
- world-marker projection layer;
- context-sheet shell;
- typed context variants;
- system/recovery surfaces.

Existing `MetricRail.vue`, `PolicyPanel.vue`, and the HUD portions of `App.vue` should be treated as behavior sources to decompose, not as visual structures to reskin unchanged.

Vue must never own meshes or raycasting state. The renderer exposes selected/focused world IDs and screen projections through renderer-neutral view models. Vue emits typed commands. Simulation and renderer state return as validated snapshots, events, and deltas.

### 11.3 Data flow

```text
Pointer/keyboard action
  → typed GameCommand
  → game runtime or simulation worker
  → validated GameEvent / SimulationSnapshot / world projection
  → serializable Pinia view model
  → HUD, world marker, or context-sheet presentation
```

Opening or closing UI may change presentation state immediately. Adopting policy, advancing time, resolving a crisis, or changing simulation state must still pass through the command/runtime boundary.

## 12. Recovery and failure states

### 12.1 Core asset or startup failure

The loading composition remains visible and replaces the progress line with:

- a concise German failure message;
- retry action;
- reduced-quality restart when applicable;
- save/export recovery link when a save is involved.

The interface must not drop into a browser-style error page.

### 12.2 Optional world-asset failure

The campaign continues with diagnostic proxy geometry. A compact, dismissible system notice appears in the context-sheet language. It does not occupy the crisis/decision urgency channel.

### 12.3 Worker or renderer recovery

Time pauses immediately. A recovery sheet explains that the last committed simulation snapshot is safe. Successful renderer reconstruction returns to the previous view and context target. Failure offers reload without implying that the save was lost.

### 12.4 Save failure or incompatible save

Save failures produce a persistent but non-modal status until acknowledged. Incompatible saves open a dedicated recovery state with version information and export options. Neither state hides the reason behind a generic error code.

## 13. Accessibility and input

- Every visible action is reachable by keyboard.
- Focus order follows top status → metric cluster → world/primary content → context sheet → time controls → ticker.
- The party hall supports arrow-key movement, `Enter` to select, and `Escape` to return.
- Visible focus treatment uses shape and contrast, not color alone.
- Interactive targets are at least 40 × 40 CSS px; primary controls target 44 × 44 CSS px.
- The context sheet traps focus only for required decisions, recovery states, and explicit modal confirmations.
- Text remains usable at 125% browser zoom and the supported scalable-HUD setting.
- All decorative audience figures and atmospheric imagery are hidden from assistive technology.
- World markers expose meaningful labels such as `Wohnblock Südring auswählen`, not icon names.
- Subtitles are required for voiced campaign-intro content.

## 14. Performance constraints

- Persistent HUD animation must not trigger canvas resize or camera relayout.
- Backdrop blur is limited to major surfaces and disabled or reduced by quality preset.
- The party hall uses CSS/DOM composition or optimized pre-authored assets; it must not instantiate a second full 3D city.
- Decorative entry assets load after the minimum recovery UI but before optional campaign ambience.
- Context variants share one mounted shell to avoid repeated expensive layout and blur layers.
- Hidden sheets must not retain active observers, timers, or animation loops.

## 15. Verification and acceptance

### 15.1 Automated behavior

Playwright must prove:

1. first-run boot reaches title and offers `Neue Kampagne`;
2. compatible-save boot offers `Kampagne fortsetzen` as primary;
3. keyboard-only party selection reaches profile, manifesto setup, and campaign intro;
4. the base HUD shows month/year, coalition, three priority metrics, and time controls;
5. selecting a building opens the building context variant and `Escape` restores focus;
6. policy/news/crisis selections open the correct context variants;
7. required decisions pause time and cannot be dismissed as ordinary context;
8. reduced motion removes ticker scrolling and nonessential transitions;
9. the HUD remains usable at 1280 × 720 and 125% text scale;
10. December 2036 cannot advance into 2037 and opens the final campaign report path.

### 15.2 Architecture tests

Tests must continue to forbid:

- Vue or Pinia imports in simulation modules;
- Three.js objects in stores, worker messages, or saves;
- direct simulation mutation from context-sheet components;
- party-ID branches in simulation effects;
- `Math.random()` in deterministic content, world, and simulation paths.

### 15.3 Visual review

Record WebGPU-high and forced-WebGL-medium screenshots for:

- loading key art;
- title ready;
- party hall with keyboard focus;
- party profile;
- gameplay idle at overview and street focus;
- building context sheet;
- policy decision sheet;
- urgent crisis sheet;
- reduced-motion ticker;
- startup recovery.

Human review must confirm:

- at least 85% clear city area in the persistent state;
- no full-height opaque side panels;
- no clipped German labels or values;
- selected world objects remain connected visually to their sheets;
- surfaces remain readable over bright day, dark night, fog, and urgent red world effects;
- the title, party stage, and gameplay HUD feel like one product without making gameplay theatrically noisy.

### 15.4 Completion gates

Any implementation change based on this specification must:

1. update the owning rows in `docs/FEATURE_MATRIX.md`;
2. add the smallest behavioral test required by `docs/TESTING.md`;
3. run `pnpm verify`;
4. run `pnpm test:e2e` for entry, HUD, interaction, worker, or renderer integration changes;
5. record manual visual review for both WebGPU and forced WebGL when presentation changes materially.

## 16. Explicitly deferred decisions

The following are outside this specification and do not block its implementation plan:

- final party names, emblems, colors, and evidence packages;
- final key art and whether it is authored, rendered offline, or captured from a future production city build;
- music composition and voice talent;
- the final number of selectable parties;
- post-v1 mobile, street-level, or additional-city adaptations.

The implementation must use content-driven slots so these deferred content decisions do not require structural UI rewrites.
